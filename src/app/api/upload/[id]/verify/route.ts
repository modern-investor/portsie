import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { getLLMSettings } from "@/lib/llm/settings";
import { extractViaCLI } from "@/lib/llm/llm-cli";
import { extractViaGemini } from "@/lib/llm/llm-gemini";
import type { UploadFileType } from "@/lib/upload/types";
import {
  getPrivacyConfig,
  sanitizeExtractionForStorage,
  safeLog,
} from "@/lib/privacy";
import {
  completeIngestionRun,
  failIngestionRun,
  startIngestionRun,
} from "@/lib/extraction/ingestion-runs";

// Verification extraction is a standalone LLM call
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/upload/[id]/verify
 *
 * Standalone verification extraction — runs a second LLM backend against
 * the same document and stores the result for comparison.
 *
 * Non-critical: failures here do NOT affect the primary extraction.
 * The client calls this after extract+confirm are done.
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

  if (!statement.extracted_data) {
    return NextResponse.json(
      { error: "No extraction data found. Extract the file first." },
      { status: 400 }
    );
  }

  // Check user's verification settings
  const userSettings = await getLLMSettings(supabase, user.id);
  const verificationEnabled = userSettings?.verificationEnabled ?? true;
  const verBackend = userSettings?.verificationBackend ?? "cli";
  const verModel = userSettings?.verificationModel ?? "claude-sonnet-4-6";
  const runId = await startIngestionRun(supabase, {
    userId: user.id,
    sourceKey: "upload_document",
    runKind: "verify",
    uploadedStatementId: id,
    backend: verBackend,
    model: verModel,
  });

  if (!verificationEnabled) {
    if (runId) {
      await completeIngestionRun(supabase, {
        runId,
        status: "partial",
        diagnostics: { skipped: true, reason: "Verification disabled in settings" },
      });
    }
    return NextResponse.json({ skipped: true, reason: "Verification disabled in settings" });
  }

  const privacyConfig = getPrivacyConfig();

  try {
    // Download and preprocess the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("statements")
      .download(statement.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message ?? "No data"}`);
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const fileType = statement.file_type as UploadFileType;
    const processedFile = processFileForLLM(buffer, fileType, fileData.type);

    // Run verification extraction
    let verificationResult;

    if (verBackend === "gemini") {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) throw new Error("GEMINI_API_KEY not set for verification");
      verificationResult = await extractViaGemini(
        geminiApiKey, processedFile, fileType, statement.filename, verModel
      );
    } else {
      const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
      verificationResult = await extractViaCLI(
        processedFile, fileType, statement.filename, cliEndpoint, verModel
      );
    }

    // Privacy: sanitize verification data, do not persist raw response
    const sanitizedVerification = sanitizeExtractionForStorage(
      verificationResult.extraction, privacyConfig
    );

    const verificationUpdate: Record<string, unknown> = {
      verification_data: privacyConfig.retainVerificationData ? sanitizedVerification : null,
      verification_settings: { backend: verBackend, model: verModel },
      verification_error: null,
    };

    await supabase
      .from("uploaded_statements")
      .update(verificationUpdate)
      .eq("id", id);

    if (runId) {
      await completeIngestionRun(supabase, {
        runId,
        diagnostics: { success: true, backend: verBackend, model: verModel },
      });
    }

    return NextResponse.json({
      success: true,
      backend: verBackend,
      model: verModel,
    });
  } catch (verErr) {
    const verErrMsg = verErr instanceof Error ? verErr.message : "Unknown verification error";
    safeLog("error", "Verification", "Extraction failed", { error: verErrMsg });

    await supabase
      .from("uploaded_statements")
      .update({
        verification_error: verErrMsg,
        verification_settings: { backend: verBackend, model: verModel },
      })
      .eq("id", id);

    if (runId) {
      await failIngestionRun(supabase, {
        runId,
        errorCategory: "verify_failed",
        errorMessage: verErrMsg,
        diagnostics: { backend: verBackend, model: verModel },
      });
    }

    // Return 200 — verification failure is non-critical
    return NextResponse.json({
      success: false,
      error: verErrMsg,
      backend: verBackend,
      model: verModel,
    });
  }
}
