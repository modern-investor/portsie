import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { extractFinancialData } from "@/lib/llm/dispatcher";
import type { UploadFileType } from "@/lib/upload/types";
import { PROCESSING_PRESETS, DEFAULT_PRESET } from "@/lib/llm/types";
import type { ProcessingPreset, ProcessingSettings } from "@/lib/llm/types";
import {
  getPrivacyConfig,
  sanitizeExtractionForStorage,
  buildDebugContext,
  safeLog,
} from "@/lib/privacy";
import { ProcessingLogger, sendDiagnostics } from "@/lib/extraction/processing-log";
import { classifyError } from "@/lib/extraction/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectUploadSource } from "@/lib/upload/source-detector";
import {
  completeIngestionRun,
  failIngestionRun,
  startIngestionRun,
} from "@/lib/extraction/ingestion-runs";
import { persistObservations, recordStructureSignature } from "@/lib/extraction/governance";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateExtraction } from "@/lib/extraction/validate";

// LLM extraction can take several minutes for large PDF/CSV files
export const maxDuration = 300; // 5 minutes

// Self-imposed deadline: 290s (10s before Vercel kills at 300s)
// This ensures we always write a failure record instead of silent death.
const DEADLINE_MS = 290_000;

/**
 * POST /api/upload/[id]/extract
 *
 * Stage 1+2: LLM extraction + schema validation ONLY.
 * Stores the validated PortsieExtraction in extracted_data.
 * Sets parse_status to "extracted" or "partial".
 *
 * Auto-confirm and verification have been moved to separate endpoints:
 *   - POST /api/upload/[id]/confirm  — account matching + DB writes
 *   - POST /api/upload/[id]/verify   — verification extraction
 *
 * The client orchestrates calling these 3 endpoints sequentially,
 * giving each its own 300s budget.
 *
 * Privacy: raw_llm_response is NOT persisted (strict mode default).
 * A minimal debug_context is stored instead for diagnostics.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const routeStartMs = Date.now();
  const presetParam = request.nextUrl.searchParams.get("preset") as ProcessingPreset | null;
  const processingSettings: ProcessingSettings =
    presetParam && PROCESSING_PRESETS[presetParam]
      ? PROCESSING_PRESETS[presetParam]
      : PROCESSING_PRESETS[DEFAULT_PRESET];
  let ingestionRunId: string | null = null;

  const privacyConfig = getPrivacyConfig();

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

  ingestionRunId = await startIngestionRun(supabase, {
    userId: user.id,
    sourceKey: "upload_document",
    runKind: "extract",
    uploadedStatementId: id,
    backend: processingSettings.backend,
    model: processingSettings.model,
    diagnostics: {
      filename: statement.filename,
      fileType: statement.file_type,
      preset: presetParam ?? processingSettings.preset,
    },
  });

  // Track processing attempt count
  const newProcessCount = (statement.process_count ?? 0) + 1;

  // Initialize processing log
  const log = new ProcessingLogger(id, newProcessCount, {
    filename: statement.filename,
    fileType: statement.file_type,
    sizeBytes: statement.file_size_bytes ?? 0,
  });
  log.setBackendInfo(
    processingSettings.backend,
    processingSettings.model,
    presetParam ?? processingSettings.preset
  );

  // Atomic CAS lock: transition to "processing" only from allowed prior states.
  const lockId = crypto.randomUUID();
  const { data: lockRow } = await supabase
    .from("uploaded_statements")
    .update({
      parse_status: "processing",
      parse_error: null,
      process_count: newProcessCount,
      confirmed_at: null,
      processing_lock_id: lockId,
      processing_started_at: new Date().toISOString(),
      processing_step: "downloading",
      processing_log: log.toJSON(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("parse_status", ["pending", "failed", "partial", "extracted"])
    .select("id, processing_lock_id")
    .maybeSingle();

  if (!lockRow) {
    if (ingestionRunId) {
      await failIngestionRun(supabase, {
        runId: ingestionRunId,
        errorCategory: "already_processing",
        errorMessage: "This file is already being processed",
      });
    }
    return NextResponse.json(
      { error: "This file is already being processed" },
      { status: 409 }
    );
  }

  try {
    // ── Step 1: Download file from Supabase Storage ──
    log.startStep("downloading", "Downloading file from storage");
    await flushLog(supabase, id, log);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("statements")
      .download(statement.file_path);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download file: ${downloadError?.message ?? "No data"}`
      );
    }
    log.completeStep("downloading");

    // ── Deadline check ──
    checkDeadline(routeStartMs);

    // ── Step 2: Pre-process the file ──
    log.startStep("preprocessing", "Preparing file for AI");
    await flushLog(supabase, id, log);

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const fileType = statement.file_type as UploadFileType;
    const detection = detectUploadSource(statement.filename, fileData.type, buffer);
    await recordStructureSignature(
      supabase,
      "upload_document",
      detection.structureSignature,
      1,
      {
        kind: detection.kind,
        confidence: detection.confidence,
        reasons: detection.reasons,
      }
    );
    const processedFile = processFileForLLM(buffer, fileType, fileData.type);
    log.completeStep("preprocessing");

    // ── Deadline check ──
    checkDeadline(routeStartMs);

    // ── Step 3: LLM extraction + validation ──
    // First, check if a previous CLI run cached a result (survives Vercel timeouts)
    let extraction: Awaited<ReturnType<typeof extractFinancialData>>["extraction"] | null = null;
    let validationObservations: Awaited<ReturnType<typeof extractFinancialData>>["observations"] = [];
    const cachedResult = await checkExtractionCache(id);
    if (cachedResult) {
      log.startStep("extracting", "Using cached result from previous run", "CLI cache hit");
      await flushLog(supabase, id, log);

      // Validate the cached result through the same schema validation.
      // The CLI wrapper stores the full claude response object which has a `result` field,
      // or it could be a direct JSON string.
      const rawResult = cachedResult.result as Record<string, unknown> | string;
      const resultText = typeof rawResult === "string"
        ? rawResult
        : typeof rawResult?.result === "string"
          ? rawResult.result
          : JSON.stringify(rawResult?.result ?? rawResult);
      const validationResult = validateExtraction(resultText);
      if (validationResult.valid && validationResult.extraction) {
        extraction = validationResult.extraction;
        validationObservations = validationResult.observations;

        // Persist coercions/warnings in extraction notes
        if (validationResult.coercions.length > 0 || validationResult.warnings.length > 0) {
          const validationNotes = [
            ...validationResult.coercions.map((c) => `[Coercion] ${c}`),
            ...validationResult.warnings.map((w) => `[Warning] ${w.path}: ${w.message}`),
          ];
          extraction = {
            ...extraction,
            notes: [...(extraction.notes || []), ...validationNotes],
          };
        }

        safeLog("info", "Extract", "Using cached CLI extraction result", {
          uploadId: id,
          cachedDurationMs: cachedResult.duration_ms,
        });
        log.completeStep("extracting");
      } else {
        safeLog("warn", "Extract", "Cached result failed validation, proceeding with fresh extraction", {
          uploadId: id,
          errors: validationResult.errors.map((e) => `${e.path}: ${e.message}`),
        });
        // Delete invalid cache entry
        await deleteExtractionCache(id);
      }
    }

    // If no valid cached result, run the LLM extraction
    if (!extraction) {
      log.startStep(
        "extracting",
        "AI is reading your document",
        `${processingSettings.label} — ${processingSettings.model}`
      );
      await flushLog(supabase, id, log);

      // Pass deadline and uploadId to dispatcher so CLI wrapper can cache the result
      const deadlineMs = routeStartMs + DEADLINE_MS;
      const result = await extractFinancialData(
        supabase,
        user.id,
        processedFile,
        fileType,
        statement.filename,
        processingSettings,
        deadlineMs,
        id
      );
      extraction = result.extraction;
      validationObservations = result.observations;
      log.completeStep("extracting");
    }

    // ── Step 4: Validate & count results ──
    log.startStep("validating", "Checking extracted data");
    await flushLog(supabase, id, log);

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

    // Privacy: sanitize extraction and build debug context
    const sanitizedExtraction = sanitizeExtractionForStorage(extraction, privacyConfig);
    const debugContext = buildDebugContext({
      backend: processingSettings.backend,
      model: processingSettings.model,
      durationMs: log.elapsedMs(),
      preset: presetParam ?? undefined,
    });

    // Compute source file expiry if retention is configured
    const sourceFileExpiresAt = privacyConfig.sourceFileRetentionDays > 0
      ? new Date(Date.now() + privacyConfig.sourceFileRetentionDays * 86400_000).toISOString()
      : null;

    log.completeStep("validating");

    // ── Finalize: save extraction results ──
    log.finalize("success");

    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: hasData ? "extracted" : "partial",
        parsed_at: new Date().toISOString(),
        extracted_data: sanitizedExtraction,
        debug_context: debugContext,
        extraction_schema_version: extraction.schema_version,
        statement_start_date: extraction.document.statement_start_date,
        statement_end_date: extraction.document.statement_end_date,
        parse_error: null,
        processing_settings: processingSettings,
        source_file_expires_at: sourceFileExpiresAt,
        verification_data: null,
        verification_settings: null,
        verification_error: null,
        processing_step: null,
        processing_log: log.toJSON(),
      })
      .eq("id", id);

    await persistObservations(supabase, {
      ingestionRunId,
      userId: user.id,
      sourceKey: "upload_document",
      observations: validationObservations,
      maxRows: 100,
    });

    if (ingestionRunId) {
      await completeIngestionRun(supabase, {
        runId: ingestionRunId,
        diagnostics: {
          accounts: extraction.accounts.length,
          totalPositions,
          totalTransactions,
          totalBalances,
          detection,
          observationCount: validationObservations.length,
        },
      });
    }

    // Fire-and-forget: send diagnostics to DO server
    sendDiagnostics(log, { userId: user.id, stage: "extract" });

    // Clean up any cache entries for this upload
    deleteExtractionCache(id).catch(() => {});

    // ── Build response ──
    return NextResponse.json({
      extraction: extraction,
      parseStatus: hasData ? "extracted" : "partial",
      summary: {
        accounts: extraction.accounts.length,
        totalPositions,
        totalTransactions,
        totalBalances,
        unallocatedPositions: extraction.unallocated_positions.length,
        confidence: extraction.confidence,
      },
      processingLog: log.toJSON(),
    });
  } catch (err) {
    // Classify the error for user-facing messages and diagnostics
    const classified = classifyError(err, log.currentStep());

    // Update the processing log
    log.failStep(log.currentStep(), classified.technicalDetail);
    log.finalize(
      classified.category === "timeout" ? "timeout" : "failed",
      classified.category,
      classified.userMessage
    );

    safeLog("error", "Extract", "LLM extraction failed", {
      error: classified.technicalDetail,
      category: classified.category,
      retryable: classified.retryable,
      uploadId: id,
      step: log.currentStep(),
    });

    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: "failed",
        parse_error: classified.userMessage,
        processing_step: null,
        processing_log: log.toJSON(),
      })
      .eq("id", id);

    if (ingestionRunId) {
      await failIngestionRun(supabase, {
        runId: ingestionRunId,
        errorCategory: classified.category,
        errorMessage: classified.userMessage,
        diagnostics: {
          processingStep: log.currentStep(),
          retryable: classified.retryable,
        },
      });
    }

    // Log extraction failure on EVERY attempt (not just 2nd+)
    let extractionFailureId: string | null = null;
    try {
      const { data: failureRow } = await supabase.from("extraction_failures").insert({
        user_id: user.id,
        upload_id: id,
        filename: statement.filename,
        file_type: statement.file_type,
        file_path: statement.file_path,
        attempt_number: newProcessCount,
        error_message: classified.technicalDetail,
        llm_mode: processingSettings.backend,
        file_size_bytes: statement.file_size_bytes,
        error_category: classified.category,
        processing_step: log.currentStep(),
        backend_used: processingSettings.backend,
        model_used: processingSettings.model,
        duration_ms: log.elapsedMs(),
        processing_log: log.toJSON(),
        processing_settings: processingSettings,
      }).select("id").single();
      extractionFailureId = failureRow?.id ?? null;
    } catch (logErr) {
      safeLog("error", "Extract", "Failed to log extraction failure", { error: logErr });
    }

    // Fire-and-forget: send diagnostics to DO server (includes failure ID for analysis linkage)
    sendDiagnostics(log, { extractionFailureId, userId: user.id, stage: "extract" });

    return NextResponse.json(
      {
        error: classified.userMessage,
        errorCategory: classified.category,
        retryable: classified.retryable,
        processingLog: log.toJSON(),
      },
      { status: 500 }
    );
  }
}

// ── Helpers ──

/** Flush processing log to DB so polling clients can see current step. */
async function flushLog(
  supabase: SupabaseClient,
  uploadId: string,
  log: ProcessingLogger
): Promise<void> {
  await supabase
    .from("uploaded_statements")
    .update({
      processing_step: log.currentStepString(),
      processing_log: log.toJSON(),
    })
    .eq("id", uploadId);
}

/** Check if we're approaching the Vercel deadline and throw if so. */
function checkDeadline(routeStartMs: number): void {
  const elapsed = Date.now() - routeStartMs;
  if (elapsed > DEADLINE_MS) {
    throw new Error(
      `Approaching Vercel 300s limit after ${Math.round(elapsed / 1000)}s`
    );
  }
}

/**
 * Check cli_extraction_cache for a result from a previous CLI run that
 * survived a Vercel timeout. Uses the admin client (service role) since
 * the cache table has no RLS.
 */
async function checkExtractionCache(
  uploadId: string
): Promise<{ result: unknown; duration_ms: number | null } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cli_extraction_cache")
      .select("id, result, duration_ms, created_at")
      .eq("upload_id", uploadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Only use cache entries less than 30 minutes old
    const ageMs = Date.now() - new Date(data.created_at).getTime();
    if (ageMs > 30 * 60 * 1000) {
      await admin.from("cli_extraction_cache").delete().eq("id", data.id);
      return null;
    }

    return { result: data.result, duration_ms: data.duration_ms };
  } catch {
    return null;
  }
}

/**
 * Delete cache entries for an upload (after consuming or on invalid data).
 */
async function deleteExtractionCache(uploadId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("cli_extraction_cache").delete().eq("upload_id", uploadId);
  } catch {
    // Non-critical — stale entries will be ignored by age check
  }
}

