import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import type { PortsieExtraction } from "../extraction/schema";
import { getLLMSettings, getLLMApiKey, getLLMCliEndpoint } from "./settings";
import { extractViaAPI } from "./llm-api";
import { extractViaCLI } from "./llm-cli";
import { extractViaGemini } from "./llm-gemini";

/**
 * Dispatch document extraction to the configured LLM backend.
 *
 * Default pipeline (no user settings):
 *   1. Try Gemini 3 Flash (fast, cheap, high quality)
 *   2. On failure, fall back to Claude Sonnet 4.6 via CLI wrapper
 *
 * Users can override to:
 *   - "cli" — force Claude via CLI wrapper (Max plan, no per-token cost)
 *   - "api" — Anthropic API with their own key (per-token billing)
 *   - "gemini" — Gemini 3 Flash only (no fallback)
 *
 * Returns a validated PortsieExtraction (Stage 1+2) and the raw LLM response
 * for debugging/audit purposes.
 */
export async function extractFinancialData(
  supabase: SupabaseClient,
  userId: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string
): Promise<{ extraction: PortsieExtraction; rawResponse: unknown }> {
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
      filename
    );
  } catch (geminiError) {
    const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
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
