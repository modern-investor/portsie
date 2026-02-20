import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { extractFinancialData } from "@/lib/llm/dispatcher";
import { getLLMSettings } from "@/lib/llm/settings";
import {
  loadExistingAccountsForMatching,
  matchAccounts,
} from "@/lib/extraction/account-matcher";
import { writeExtraction } from "@/lib/extraction/db-writer";
import type { UploadFileType } from "@/lib/upload/types";
import type { PortsieExtraction } from "@/lib/extraction/schema";
import { PROCESSING_PRESETS, DEFAULT_PRESET } from "@/lib/llm/types";
import type { ProcessingPreset, ProcessingSettings } from "@/lib/llm/types";

// LLM extraction can take several minutes for large PDF/CSV files
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/upload/[id]/extract
 *
 * Stage 1+2: LLM extraction → schema validation.
 * Stores the validated PortsieExtraction in extracted_data.
 * Sets parse_status to "extracted".
 *
 * Query params:
 *   ?auto_confirm=true — Chains all stages (extract → match → write) in one call.
 *                         This is the fire-and-forget mode for batch processing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const autoConfirm =
    request.nextUrl.searchParams.get("auto_confirm") === "true";
  const presetParam = request.nextUrl.searchParams.get("preset") as ProcessingPreset | null;
  const processingSettings: ProcessingSettings =
    presetParam && PROCESSING_PRESETS[presetParam]
      ? PROCESSING_PRESETS[presetParam]
      : PROCESSING_PRESETS[DEFAULT_PRESET];

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

  // Mark as processing
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

    // ── Stage 1+2: LLM extraction + validation ──
    const { extraction, rawResponse } = await extractFinancialData(
      supabase,
      user.id,
      processedFile,
      fileType,
      statement.filename,
      processingSettings
    );

    // Determine if extraction produced data
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

    // Save extraction results — parse_status = "extracted"
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: hasData ? "extracted" : "partial",
        parsed_at: new Date().toISOString(),
        extracted_data: extraction,
        raw_llm_response: rawResponse,
        detected_account_info: extraction.accounts[0]?.account_info ?? null,
        extraction_schema_version: extraction.schema_version,
        statement_start_date: extraction.document.statement_start_date,
        statement_end_date: extraction.document.statement_end_date,
        parse_error: null,
        processing_settings: processingSettings,
      })
      .eq("id", id);

    // ── Auto-confirm mode: chain into Stage 2.5+3 ──
    if (autoConfirm && hasData) {
      try {
        const existingAccounts = await loadExistingAccountsForMatching(
          supabase,
          user.id
        );
        const accountMap = matchAccounts(extraction, existingAccounts);
        const writeReport = await writeExtraction(
          supabase,
          user.id,
          id,
          extraction,
          accountMap
        );

        return NextResponse.json({
          extraction,
          autoConfirmed: true,
          writeReport,
          parseStatus: "completed",
        });
      } catch (confirmErr) {
        // Auto-confirm failed — extraction is still saved
        const errMsg =
          confirmErr instanceof Error
            ? confirmErr.message
            : "Unknown auto-confirm error";
        console.error("Auto-confirm failed:", confirmErr);

        await supabase
          .from("uploaded_statements")
          .update({ parse_error: `Auto-confirm failed: ${errMsg}` })
          .eq("id", id);

        return NextResponse.json({
          extraction,
          autoConfirmed: false,
          autoConfirmError: errMsg,
          parseStatus: "extracted",
        });
      }
    }

    return NextResponse.json({
      extraction,
      autoConfirmed: false,
      parseStatus: hasData ? "extracted" : "partial",
      summary: {
        accounts: extraction.accounts.length,
        totalPositions,
        totalTransactions,
        totalBalances,
        unallocatedPositions: extraction.unallocated_positions.length,
        confidence: extraction.confidence,
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown processing error";
    console.error("LLM extraction failed:", err);

    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: "failed",
        parse_error: errorMessage,
      })
      .eq("id", id);

    // Log extraction failure on 2nd+ attempt
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
