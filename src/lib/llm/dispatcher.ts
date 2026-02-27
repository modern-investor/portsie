import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import { getLLMSettings, getLLMApiKey } from "./settings";
import { safeLog } from "@/lib/privacy";
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
 *   1. Try Gemini 3 Flash (fast, cheap, high quality)
 *   2. On failure, fall back to Claude Sonnet 4.6 via CLI wrapper
 *      — but ONLY if enough time remains before the deadline
 *
 * Users can override to:
 *   - "cli" — force Claude via CLI wrapper (Max plan, no per-token cost)
 *   - "api" — Anthropic API with their own key (per-token billing)
 *   - "gemini" — Gemini 3 Flash only (no fallback)
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
    if (processingSettings.backend === "cli") {
      const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
      return extractViaCLI(
        processedFile, fileType, filename, cliEndpoint,
        processingSettings.model
      );
    }

    // Large file auto-routing: files >5 MB base64 (~3.75 MB raw) go directly
    // to CLI backend, which runs on a persistent DO server without Vercel's
    // 300s timeout constraint. This prevents deterministic timeouts from
    // File API upload overhead + Gemini processing on large PDFs.
    const base64Size = processedFile.base64Data?.length ?? 0;
    const LARGE_FILE_THRESHOLD = 5_000_000; // 5 MB base64
    const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;

    if (base64Size > LARGE_FILE_THRESHOLD && cliEndpoint) {
      safeLog("info", "Dispatcher",
        `Large file (${(base64Size / 1_048_576).toFixed(1)} MB base64) — routing directly to CLI to avoid Vercel timeout`,
        { filename, fileType, base64Size }
      );
      return extractViaCLI(
        processedFile, fileType, filename, cliEndpoint,
        processingSettings.model || "claude-sonnet-4-6"
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      safeLog("warn", "Dispatcher", "GEMINI_API_KEY not set, falling back to CLI");
      return extractViaCLI(processedFile, fileType, filename, cliEndpoint);
    }
    try {
      return await extractViaGemini(
        geminiApiKey, processedFile, fileType, filename,
        processingSettings.model,
        processingSettings.thinkingLevel,
        processingSettings.mediaResolution,
        deadlineMs
      );
    } catch (geminiError) {
      const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);

      // Check if we have enough time budget for a CLI fallback
      if (deadlineMs && Date.now() + MIN_FALLBACK_BUDGET_MS > deadlineMs) {
        const remainingSec = Math.round((deadlineMs - Date.now()) / 1000);
        safeLog("error", "Dispatcher", `Gemini failed and only ${remainingSec}s remain — skipping CLI fallback`, { error: errorMsg });
        throw new Error(
          `Gemini extraction failed and not enough time for fallback (${remainingSec}s remaining). ` +
          `Original error: ${errorMsg}`
        );
      }

      safeLog("error", "Dispatcher", "Gemini extraction failed, falling back to CLI", { error: errorMsg });
      const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
      return extractViaCLI(processedFile, fileType, filename, cliEndpoint, "claude-sonnet-4-6");
    }
  }

  // ── Legacy routing: user LLM settings ──
  const settings = await getLLMSettings(supabase, userId);
  const mode = settings?.llmMode ?? "gemini";

  // ── User explicitly chose Anthropic API mode ──
  if (mode === "api") {
    const apiKey = await getLLMApiKey(supabase, userId);
    if (!apiKey) {
      throw new Error(
        "API mode selected but no API key configured. Add your Anthropic API key in Settings → LLM."
      );
    }
    return extractViaAPI(apiKey, processedFile, fileType, filename);
  }

  // ── User explicitly chose CLI mode ──
  if (mode === "cli") {
    const cliEndpoint =
      settings?.cliEndpoint ?? process.env.PORTSIE_CLI_ENDPOINT ?? null;
    return extractViaCLI(processedFile, fileType, filename, cliEndpoint);
  }

  // ── Default: Gemini 3 Flash with Sonnet 4.6 CLI fallback ──
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    // No Gemini key configured — fall through to CLI
    console.warn("[Dispatcher] GEMINI_API_KEY not set, falling back to CLI");
    const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
    return extractViaCLI(processedFile, fileType, filename, cliEndpoint);
  }

  try {
    return await extractViaGemini(
      geminiApiKey,
      processedFile,
      fileType,
      filename,
      undefined, // model
      undefined, // thinkingLevel
      undefined, // mediaResolution
      deadlineMs
    );
  } catch (geminiError) {
    const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);

    // Check if we have enough time budget for a CLI fallback
    if (deadlineMs && Date.now() + MIN_FALLBACK_BUDGET_MS > deadlineMs) {
      const remainingSec = Math.round((deadlineMs - Date.now()) / 1000);
      safeLog("error", "Dispatcher", `Gemini failed and only ${remainingSec}s remain — skipping CLI fallback`, { error: errorMsg });
      throw new Error(
        `Gemini extraction failed and not enough time for fallback (${remainingSec}s remaining). ` +
        `Original error: ${errorMsg}`
      );
    }

    console.error(`[Dispatcher] Gemini extraction failed, falling back to CLI: ${errorMsg}`);

    // Fall back to Claude Sonnet 4.6 via CLI wrapper
    const cliEndpoint = process.env.PORTSIE_CLI_ENDPOINT ?? null;
    return extractViaCLI(
      processedFile,
      fileType,
      filename,
      cliEndpoint,
      "claude-sonnet-4-6"
    );
  }
}
