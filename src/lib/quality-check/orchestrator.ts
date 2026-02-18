/**
 * Quality Check Orchestrator
 *
 * Coordinates the quality check lifecycle:
 *   1. Run quality check (compare extraction vs DB)
 *   2. If failed, trigger Phase 1 fix (re-extract with QC feedback)
 *   3. If Phase 1 fails, mark as unresolved (Phase 2 deferred)
 *
 * Updates uploaded_statements.parse_status and qc_status_message
 * throughout so the frontend can poll and display progress.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortsieExtraction } from "../extraction/schema";
import type { CheckResult, FixAttempt, QualityCheckInput } from "./types";
import { runQualityCheck } from "./checker";
import { clearUploadData } from "./cleanup";
import { buildQualityFixPrompt } from "./prompts";
import { processFileForLLM } from "../upload/file-processor";
import { extractFinancialData } from "../llm/dispatcher";
import {
  loadExistingAccountsForMatching,
  matchAccounts,
} from "../extraction/account-matcher";
import { writeExtraction } from "../extraction/db-writer";
import type { UploadFileType } from "../upload/types";
import type { ProcessedFile } from "../upload/file-processor";

// ── Helpers ──

async function updateUploadStatus(
  supabase: SupabaseClient,
  uploadId: string,
  parseStatus: string,
  qcStatusMessage: string | null,
  qualityCheckId?: string
) {
  const update: Record<string, unknown> = {
    parse_status: parseStatus,
    qc_status_message: qcStatusMessage,
  };
  if (qualityCheckId) {
    update.quality_check_id = qualityCheckId;
  }
  await supabase.from("uploaded_statements").update(update).eq("id", uploadId);
}

async function updateCheckStatus(
  supabase: SupabaseClient,
  checkId: string,
  status: string,
  updates?: Record<string, unknown>
) {
  await supabase
    .from("quality_checks")
    .update({ check_status: status, ...updates })
    .eq("id", checkId);
}

// ── Main orchestrator ──

/**
 * Run a quality check for an upload that has been auto-confirmed.
 * Returns the check result and quality_check row ID.
 */
export async function runQualityCheckForUpload(
  supabase: SupabaseClient,
  userId: string,
  uploadId: string
): Promise<{ checkId: string; checkResult: CheckResult }> {
  // 1. Load upload record
  const { data: upload, error: uploadErr } = await supabase
    .from("uploaded_statements")
    .select(
      "id, extracted_data, linked_account_ids, parse_status"
    )
    .eq("id", uploadId)
    .eq("user_id", userId)
    .single();

  if (uploadErr || !upload) {
    throw new Error(`Upload not found: ${uploadErr?.message ?? "no data"}`);
  }

  const extraction = upload.extracted_data as PortsieExtraction;
  if (!extraction) {
    throw new Error("No extracted data found for upload");
  }

  const linkedAccountIds: string[] = upload.linked_account_ids ?? [];
  if (linkedAccountIds.length === 0) {
    throw new Error("No linked accounts — nothing to check");
  }

  // 2. Query DB state for linked accounts
  const { data: dbAccounts } = await supabase
    .from("accounts")
    .select("id, total_market_value, equity_value, cash_balance, holdings_count")
    .in("id", linkedAccountIds);

  // Count active holdings across linked accounts
  const { count: dbHoldingsCount } = await supabase
    .from("holdings")
    .select("id", { count: "exact", head: true })
    .in("account_id", linkedAccountIds)
    .gt("quantity", 0);

  // Count transactions for this upload
  const { count: dbTransactionCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_statement_id", uploadId);

  // 3. Run quality check
  const input: QualityCheckInput = {
    extraction,
    linkedAccountIds,
    dbAccounts: dbAccounts ?? [],
    dbHoldingsCount: dbHoldingsCount ?? 0,
    dbTransactionCount: dbTransactionCount ?? 0,
  };

  const checkResult = runQualityCheck(input);

  // 4. Create quality_checks row
  const { data: qcRow, error: insertErr } = await supabase
    .from("quality_checks")
    .insert({
      user_id: userId,
      upload_id: uploadId,
      extraction_data: extraction,
      linked_account_ids: linkedAccountIds,
      check_status: checkResult.overall_passed ? "passed" : "failed",
      checks: checkResult,
    })
    .select("id")
    .single();

  if (insertErr || !qcRow) {
    throw new Error(
      `Failed to create quality check: ${insertErr?.message ?? "no data"}`
    );
  }

  const checkId = qcRow.id;

  // 5. Update upload status
  if (checkResult.overall_passed) {
    await updateUploadStatus(supabase, uploadId, "completed", null, checkId);
  } else {
    const failMessage = `Quality issue: ${checkResult.summary}`;
    await updateUploadStatus(
      supabase,
      uploadId,
      "qc_failed",
      failMessage,
      checkId
    );
  }

  return { checkId, checkResult };
}

/**
 * Phase 1 fix: Re-extract with QC feedback appended to the prompt.
 * Uses the same dispatcher pipeline (Gemini → CLI fallback).
 *
 * Returns true if the fix succeeded and data was re-written.
 */
export async function triggerPhase1Fix(
  supabase: SupabaseClient,
  userId: string,
  qualityCheckId: string
): Promise<boolean> {
  // 1. Load quality check + upload
  const { data: qc } = await supabase
    .from("quality_checks")
    .select("*, upload:uploaded_statements(*)")
    .eq("id", qualityCheckId)
    .single();

  if (!qc || !qc.upload) {
    throw new Error("Quality check or upload not found");
  }

  const upload = qc.upload;
  const originalExtraction = qc.extraction_data as PortsieExtraction;
  const checkResult = qc.checks as CheckResult;
  const linkedAccountIds: string[] = qc.linked_account_ids ?? [];

  // 2. Update statuses
  await updateCheckStatus(supabase, qualityCheckId, "fixing_prompt");
  await updateUploadStatus(
    supabase,
    upload.id,
    "qc_fixing",
    "Attempting improved extraction..."
  );

  // Create fix attempt entry
  const fixAttempt: FixAttempt = {
    phase: 1,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: "running",
  };

  const fixAttempts: FixAttempt[] = [...(qc.fix_attempts ?? []), fixAttempt];
  await supabase
    .from("quality_checks")
    .update({ fix_attempts: fixAttempts, fix_count: fixAttempts.length })
    .eq("id", qualityCheckId);

  try {
    // 3. Download file and re-process
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("statements")
      .download(upload.file_path);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download file: ${downloadError?.message ?? "No data"}`
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const fileType = upload.file_type as UploadFileType;
    const processedFile = processFileForLLM(buffer, fileType, fileData.type);

    // 4. Inject QC feedback into the processed file
    const qcFeedback = buildQualityFixPrompt(checkResult, originalExtraction);
    const modifiedFile = injectQCFeedback(processedFile, qcFeedback);

    // 5. Re-extract through the dispatcher
    await updateUploadStatus(
      supabase,
      upload.id,
      "qc_fixing",
      "Re-extracting with targeted prompt..."
    );

    const { extraction: newExtraction } = await extractFinancialData(
      supabase,
      userId,
      modifiedFile,
      fileType,
      upload.filename
    );

    // 6. Run in-memory quality check on new extraction
    // Use the expected values from the original extraction for comparison
    const { data: dbAccounts } = await supabase
      .from("accounts")
      .select(
        "id, total_market_value, equity_value, cash_balance, holdings_count"
      )
      .in("id", linkedAccountIds);

    // For re-check, we compare the NEW extraction's expected values
    // against what the DB currently has (which is the old data).
    // But actually, we want to check internal consistency of the new extraction
    // and then write it to see if it produces correct DB values.
    // Simplest approach: clear old data, write new, then re-check.

    await updateUploadStatus(
      supabase,
      upload.id,
      "qc_fixing",
      "Verifying improved extraction..."
    );

    // 7. Clear old data and re-write
    await clearUploadData(supabase, userId, upload.id, linkedAccountIds);

    const existingAccounts = await loadExistingAccountsForMatching(
      supabase,
      userId
    );
    const accountMap = matchAccounts(newExtraction, existingAccounts);
    const writeReport = await writeExtraction(
      supabase,
      userId,
      upload.id,
      newExtraction,
      accountMap
    );

    // 8. Re-run quality check on the new data
    const newLinkedIds: string[] =
      writeReport.account_results.map((r) => r.account_id);
    if (writeReport.aggregate_result) {
      newLinkedIds.push(writeReport.aggregate_result.account_id);
    }

    const { data: newDbAccounts } = await supabase
      .from("accounts")
      .select(
        "id, total_market_value, equity_value, cash_balance, holdings_count"
      )
      .in("id", newLinkedIds);

    const { count: newHoldingsCount } = await supabase
      .from("holdings")
      .select("id", { count: "exact", head: true })
      .in("account_id", newLinkedIds)
      .gt("quantity", 0);

    const { count: newTransactionCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_statement_id", upload.id);

    const reCheckResult = runQualityCheck({
      extraction: newExtraction,
      linkedAccountIds: newLinkedIds,
      dbAccounts: newDbAccounts ?? [],
      dbHoldingsCount: newHoldingsCount ?? 0,
      dbTransactionCount: newTransactionCount ?? 0,
    });

    // 9. Update fix attempt
    fixAttempt.completed_at = new Date().toISOString();
    fixAttempt.re_check = reCheckResult;

    if (reCheckResult.overall_passed) {
      fixAttempt.status = "succeeded";
      fixAttempts[fixAttempts.length - 1] = fixAttempt;

      await updateCheckStatus(supabase, qualityCheckId, "fixed", {
        fix_attempts: fixAttempts,
        checks: reCheckResult,
        resolved_at: new Date().toISOString(),
      });
      await updateUploadStatus(supabase, upload.id, "completed", null);

      // Update extraction data on the upload record
      await supabase
        .from("uploaded_statements")
        .update({ extracted_data: newExtraction })
        .eq("id", upload.id);

      return true;
    } else {
      // Fix didn't fully resolve — mark as failed
      fixAttempt.status = "failed";
      fixAttempt.error = reCheckResult.summary;
      fixAttempts[fixAttempts.length - 1] = fixAttempt;

      await updateCheckStatus(supabase, qualityCheckId, "unresolved", {
        fix_attempts: fixAttempts,
      });
      await updateUploadStatus(
        supabase,
        upload.id,
        "qc_failed",
        "Document structure not yet supported — adding support for your document type..."
      );

      return false;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    fixAttempt.completed_at = new Date().toISOString();
    fixAttempt.status = "failed";
    fixAttempt.error = errorMsg;
    fixAttempts[fixAttempts.length - 1] = fixAttempt;

    await updateCheckStatus(supabase, qualityCheckId, "unresolved", {
      fix_attempts: fixAttempts,
    });
    await updateUploadStatus(
      supabase,
      upload.id,
      "qc_failed",
      `Auto-fix failed: ${errorMsg}`
    );

    return false;
  }
}

/**
 * Inject QC feedback into a ProcessedFile.
 * For text files: appends to textContent.
 * For binary files: adds feedback as additional text alongside the binary.
 */
function injectQCFeedback(
  original: ProcessedFile,
  feedback: string
): ProcessedFile {
  if (original.contentType === "text") {
    return {
      ...original,
      textContent: (original.textContent ?? "") + feedback,
    };
  }

  // For binary files (PDF, images), we can't modify the binary.
  // Instead, we wrap it in a text+binary combo by adding the feedback
  // as textContent. The Gemini backend and CLI backend both support
  // multi-part content blocks, but the simplest approach is to use
  // textContent as an auxiliary instruction.
  return {
    ...original,
    textContent: feedback,
  };
}
