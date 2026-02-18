import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { extractFinancialData } from "@/lib/llm/dispatcher";
import {
  loadExistingAccountsForMatching,
  matchAccounts,
} from "@/lib/extraction/account-matcher";
import { writeExtraction } from "@/lib/extraction/db-writer";
import { getLLMSettings } from "@/lib/llm/settings";
import type { UploadFileType } from "@/lib/upload/types";

// LLM extraction can take several minutes for large PDF/CSV files
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/upload/[id]/process
 *
 * DEPRECATED: Use /api/upload/[id]/extract?auto_confirm=true instead.
 *
 * This route is kept for backward compatibility. It runs the full
 * 3-stage pipeline (extract → match → write) in one call.
 */
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

  const newProcessCount = (statement.process_count ?? 0) + 1;

  await supabase
    .from("uploaded_statements")
    .update({
      parse_status: "processing",
      parse_error: null,
      process_count: newProcessCount,
      confirmed_at: null,
    })
    .eq("id", id);

  try {
    // Download file
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
    const processedFile = processFileForLLM(buffer, fileType, fileData.type);

    // Stage 1+2: Extract + validate
    const { extraction, rawResponse } = await extractFinancialData(
      supabase,
      user.id,
      processedFile,
      fileType,
      statement.filename
    );

    // Check if extraction produced data
    const totalPositions =
      extraction.accounts.reduce((sum, a) => sum + a.positions.length, 0) +
      extraction.unallocated_positions.length;
    const totalTransactions = extraction.accounts.reduce(
      (sum, a) => sum + a.transactions.length,
      0
    );
    const totalBalances = extraction.accounts.reduce(
      (sum, a) => sum + a.balances.length,
      0
    );
    const hasData = totalPositions > 0 || totalTransactions > 0 || totalBalances > 0;
    const parseStatus = hasData ? "extracted" : "partial";

    // Save extraction
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: parseStatus,
        parsed_at: new Date().toISOString(),
        extracted_data: extraction,
        raw_llm_response: rawResponse,
        detected_account_info: extraction.accounts[0]?.account_info ?? null,
        extraction_schema_version: extraction.schema_version,
        statement_start_date: extraction.document.statement_start_date,
        statement_end_date: extraction.document.statement_end_date,
      })
      .eq("id", id);

    // Stage 2.5+3: Auto-confirm
    let autoConfirmed = false;
    let autoConfirmError: string | null = null;

    if (hasData) {
      try {
        const existingAccounts = await loadExistingAccountsForMatching(
          supabase,
          user.id
        );
        const accountMap = matchAccounts(extraction, existingAccounts);
        await writeExtraction(supabase, user.id, id, extraction, accountMap);
        autoConfirmed = true;
      } catch (err) {
        autoConfirmError =
          err instanceof Error ? err.message : "Unknown auto-confirm error";
        console.error("Auto-confirm failed:", err);
      }
    }

    return NextResponse.json({
      extraction,
      autoConfirmed,
      autoConfirmError,
      parseStatus: autoConfirmed ? "completed" : parseStatus,
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

    if (newProcessCount >= 2) {
      try {
        const settings = await getLLMSettings(supabase, user.id);
        await supabase.from("extraction_failures").insert({
          user_id: user.id,
          upload_id: id,
          filename: statement.filename,
          file_type: statement.file_type,
          file_path: statement.file_path,
          attempt_number: newProcessCount,
          error_message: errorMessage,
          llm_mode: settings?.llmMode ?? "gemini",
          file_size_bytes: statement.file_size_bytes,
        });
      } catch (logErr) {
        console.error("Failed to log extraction failure:", logErr);
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
