import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import { getLLMSettings, getLLMApiKey } from "./settings";
import { safeLog } from "@/lib/privacy";
import { sendLlmOpsAlert } from "@/lib/email/ops-alerts";
import { extractViaAPI } from "./llm-api";
import { extractViaCLI } from "./llm-cli";
import { extractViaGemini } from "./llm-gemini";
import type { ExtractionResult, ProcessingSettings } from "./types";

/** Minimum remaining time (ms) needed to attempt a fallback extraction. */
const MIN_FALLBACK_BUDGET_MS = 60_000; // 60 seconds

/**
 * Dispatch document extraction to the configured LLM backend.
 *
 * Default pipeline (no user settings):
 *   1. Try Claude Sonnet 4.6 via CLI wrapper (reliable, no Vercel timeout)
 *   2. On failure, fall back to Gemini 3 Flash
 *      — but ONLY if enough time remains before the deadline
 *
 * Users can override to:
 *   - "gemini" — force Gemini 3 Flash (via preset dropdown)
 *   - "api"    — Anthropic API with their own key (per-token billing)
 *
 * The `deadlineMs` parameter is an epoch timestamp. If set, the dispatcher
 * will check remaining time before attempting a fallback to avoid starting
 * extractions that will be killed by the Vercel timeout.
 */
export async function extractFinancialData(
  supabase: SupabaseClient,
  userId: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  processingSettings?: ProcessingSettings,
  deadlineMs?: number
): Promise<ExtractionResult> {
  // ── Preset-based routing (from upload page dropdown) ──
  if (processingSettings) {
    // If preset explicitly selects Gemini, route there directly
    if (processingSettings.backend === "gemini") {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        safeLog("warn", "Dispatcher", "GEMINI_API_KEY not set, falling back to CLI");
        const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
        return extractViaCLI(processedFile, fileType, filename, cliEndpoint, "claude-sonnet-4-6", deadlineMs);
      }
      return extractViaGemini(
        geminiApiKey, processedFile, fileType, filename,
        processingSettings.model,
        processingSettings.thinkingLevel,
        processingSettings.mediaResolution,
        deadlineMs
      );
    }

    // Default: CLI (Claude Sonnet 4.6) with Gemini fallback
    const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
    try {
      return await extractViaCLI(
        processedFile, fileType, filename, cliEndpoint,
        processingSettings.model || "claude-sonnet-4-6",
        deadlineMs
      );
    } catch (cliError) {
      const errorMsg = cliError instanceof Error ? cliError.message : String(cliError);

      // Check if we have enough time budget for a Gemini fallback
      if (deadlineMs && Date.now() + MIN_FALLBACK_BUDGET_MS > deadlineMs) {
        const remainingSec = Math.round((deadlineMs - Date.now()) / 1000);
        safeLog("error", "Dispatcher", `CLI failed and only ${remainingSec}s remain — skipping Gemini fallback`, { error: errorMsg });
        throw new Error(
          `CLI extraction failed and not enough time for fallback (${remainingSec}s remaining). ` +
          `Original error: ${errorMsg}`
        );
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        safeLog("error", "Dispatcher", "CLI failed and GEMINI_API_KEY not set — no fallback available", { error: errorMsg });
        throw cliError;
      }

      safeLog("error", "Dispatcher", "CLI extraction failed, falling back to Gemini", { error: errorMsg });
      return extractViaGemini(
        geminiApiKey, processedFile, fileType, filename,
        "gemini-3-flash-preview",
        processingSettings.thinkingLevel,
        processingSettings.mediaResolution,
        deadlineMs
      );
    }
  }

  // ── Legacy routing: user LLM settings ──
  const settings = await getLLMSettings(supabase, userId);
  const mode = settings?.llmMode ?? "cli";

  // ── User explicitly chose Anthropic API mode ──
  if (mode === "api") {
    await sendLlmOpsAlert({
      reason: "anthropic_api_override",
      message: "Anthropic API override mode was selected for extraction.",
      details: { userId, filename, fileType },
    });

    const apiKey = await getLLMApiKey(supabase, userId);
    if (!apiKey) {
      throw new Error(
        "API mode selected but no API key configured. Add your Anthropic API key in Settings → LLM."
      );
    }
    return extractViaAPI(apiKey, processedFile, fileType, filename);
  }

  // ── User explicitly chose Gemini mode ──
  if (mode === "gemini") {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      safeLog("warn", "Dispatcher", "GEMINI_API_KEY not set, falling back to CLI");
      const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
      return extractViaCLI(processedFile, fileType, filename, cliEndpoint, undefined, deadlineMs);
    }
    return extractViaGemini(
      geminiApiKey, processedFile, fileType, filename,
      undefined, undefined, undefined, deadlineMs
    );
  }

  // ── Default: Claude Sonnet 4.6 CLI with Gemini fallback ──
  const cliEndpoint =
    settings?.cliEndpoint ?? process.env.PORTSIE_CLI_ENDPOINT ?? null;

  try {
    return await extractViaCLI(
      processedFile,
      fileType,
      filename,
      cliEndpoint,
      "claude-sonnet-4-6",
      deadlineMs
    );
  } catch (cliError) {
    const errorMsg = cliError instanceof Error ? cliError.message : String(cliError);

    // Check if we have enough time budget for a Gemini fallback
    if (deadlineMs && Date.now() + MIN_FALLBACK_BUDGET_MS > deadlineMs) {
      const remainingSec = Math.round((deadlineMs - Date.now()) / 1000);
      safeLog("error", "Dispatcher", `CLI failed and only ${remainingSec}s remain — skipping Gemini fallback`, { error: errorMsg });
      throw new Error(
        `CLI extraction failed and not enough time for fallback (${remainingSec}s remaining). ` +
        `Original error: ${errorMsg}`
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      safeLog("error", "Dispatcher", "CLI failed and GEMINI_API_KEY not set — no fallback available", { error: errorMsg });
      throw cliError;
    }

    console.error(`[Dispatcher] CLI extraction failed, falling back to Gemini: ${errorMsg}`);

    return extractViaGemini(
      geminiApiKey,
      processedFile,
      fileType,
      filename,
      undefined, // model
      undefined, // thinkingLevel
      undefined, // mediaResolution
      deadlineMs
    );
  }
}
