import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { extractFinancialData } from "@/lib/llm/dispatcher";
import { findMatchingAccounts } from "@/lib/upload/account-matcher";
import type { UploadFileType } from "@/lib/upload/types";

/** POST /api/upload/[id]/process — Trigger LLM extraction for an upload */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the upload record
  const { data: statement, error } = await supabase
    .from("uploaded_statements")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !statement) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (statement.parse_status === "processing") {
    return NextResponse.json(
      { error: "This file is already being processed" },
      { status: 409 }
    );
  }

  // Mark as processing
  await supabase
    .from("uploaded_statements")
    .update({
      parse_status: "processing",
      parse_error: null,
    })
    .eq("id", id);

  try {
    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("statements")
      .download(statement.file_path);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download file: ${downloadError?.message ?? "No data"}`
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const fileType = statement.file_type as UploadFileType;

    // Pre-process the file for Claude
    const processedFile = processFileForLLM(buffer, fileType, fileData.type);

    // Extract data via configured LLM backend (CLI or API)
    const { result: extractionResult, rawResponse } =
      await extractFinancialData(supabase, user.id, processedFile, fileType, statement.filename);

    // Find matching existing accounts
    const accountMatches = extractionResult.account_info
      ? await findMatchingAccounts(supabase, user.id, extractionResult.account_info)
      : [];

    // Auto-link if there's exactly one exact match
    let autoLinkedAccountId: string | null = null;
    if (
      accountMatches.length === 1 &&
      accountMatches[0].match_reason.includes("Exact")
    ) {
      autoLinkedAccountId = accountMatches[0].id;
    }

    // Determine parse status
    const hasData =
      extractionResult.transactions.length > 0 ||
      extractionResult.positions.length > 0 ||
      extractionResult.balances.length > 0;

    const parseStatus = hasData ? "completed" : "partial";

    // Save extraction results to the database
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: parseStatus,
        parsed_at: new Date().toISOString(),
        extracted_data: extractionResult,
        raw_llm_response: rawResponse,
        detected_account_info: extractionResult.account_info,
        account_id: autoLinkedAccountId,
        statement_start_date: extractionResult.statement_start_date,
        statement_end_date: extractionResult.statement_end_date,
      })
      .eq("id", id);

    return NextResponse.json({
      extraction: extractionResult,
      accountMatches,
      autoLinkedAccountId,
      parseStatus,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown processing error";
    console.error("LLM processing failed:", err);

    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: "failed",
        parse_error: errorMessage,
      })
      .eq("id", id);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
