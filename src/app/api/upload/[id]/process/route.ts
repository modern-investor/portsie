import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { extractFinancialData } from "@/lib/llm/dispatcher";
import { autoLinkOrCreateAccount } from "@/lib/upload/account-matcher";
import { writeExtractedData } from "@/lib/upload/data-writer";
import { getLLMSettings } from "@/lib/llm/settings";
import type { UploadFileType } from "@/lib/upload/types";
import type { AutoLinkResult } from "@/lib/upload/account-matcher";

// LLM extraction can take several minutes for large PDF/CSV files
export const maxDuration = 300; // 5 minutes

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

  // Track processing attempt count
  const newProcessCount = (statement.process_count ?? 0) + 1;

  // Mark as processing, increment attempt counter, and clear previous confirmation state
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

    // Determine if extraction produced data
    const hasData =
      extractionResult.transactions.length > 0 ||
      extractionResult.positions.length > 0 ||
      extractionResult.balances.length > 0;

    const parseStatus = hasData ? "completed" : "partial";

    // Auto-link/create account and auto-confirm
    let autoLinkResult: AutoLinkResult | null = null;
    let autoConfirmed = false;
    let autoConfirmError: string | null = null;
    let transactionsCreated = 0;
    let positionsCreated = 0;

    if (hasData) {
      try {
        // If re-processing an already-confirmed upload, reuse the existing account
        let accountId: string | null = null;

        if (statement.account_id && statement.confirmed_at) {
          const { data: existingAccount } = await supabase
            .from("accounts")
            .select("id")
            .eq("id", statement.account_id)
            .eq("is_active", true)
            .single();

          if (existingAccount) {
            const existingId: string = existingAccount.id;
            accountId = existingId;
            autoLinkResult = {
              accountId: existingId,
              action: "matched",
              matchReason: "Previously linked account",
            };
          }
        }

        // No existing link — auto-match or create
        if (!accountId) {
          // Use detected account info, or fall back to filename-based info
          const accountInfo = extractionResult.account_info ?? {
            institution_name: "Unknown",
            account_type: null,
            account_number: null,
            account_nickname: statement.filename,
          };
          autoLinkResult = await autoLinkOrCreateAccount(
            supabase,
            user.id,
            accountInfo
          );
          accountId = autoLinkResult.accountId;
        }

        // Write data to canonical tables
        const writeResult = await writeExtractedData(
          supabase,
          user.id,
          accountId,
          id,
          extractionResult
        );
        transactionsCreated = writeResult.transactionsCreated;
        positionsCreated = writeResult.snapshotsWritten;
        autoConfirmed = true;
      } catch (linkErr) {
        // Auto-link/confirm failed — save extraction results anyway
        autoConfirmError =
          linkErr instanceof Error ? linkErr.message : "Unknown auto-confirm error";
        console.error("Auto-link/confirm failed:", linkErr);
      }
    }

    // Save extraction results to the database
    // Note: writeExtractedData already sets confirmed_at, account_id, and
    // parse_status if auto-confirm succeeded. This update ensures extraction
    // metadata is saved regardless.
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: parseStatus,
        parsed_at: new Date().toISOString(),
        extracted_data: extractionResult,
        raw_llm_response: rawResponse,
        detected_account_info: extractionResult.account_info,
        account_id: autoLinkResult?.accountId ?? null,
        statement_start_date: extractionResult.statement_start_date,
        statement_end_date: extractionResult.statement_end_date,
        parse_error: autoConfirmError,
      })
      .eq("id", id);

    return NextResponse.json({
      extraction: extractionResult,
      autoLinkedAccountId: autoLinkResult?.accountId ?? null,
      autoLinkAction: autoLinkResult?.action ?? null,
      autoLinkReason: autoLinkResult?.matchReason ?? null,
      autoConfirmed,
      autoConfirmError,
      transactionsCreated,
      positionsCreated,
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

    // Auto-log extraction failure on 2nd+ attempt for diagnostic review
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
          llm_mode: settings?.llmMode ?? "cli",
          file_size_bytes: statement.file_size_bytes,
        });
      } catch (logErr) {
        console.error("Failed to log extraction failure:", logErr);
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
