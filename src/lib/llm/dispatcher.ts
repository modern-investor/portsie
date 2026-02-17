import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import type { PortsieExtraction } from "../extraction/schema";
import { getLLMSettings, getLLMApiKey, getLLMCliEndpoint } from "./settings";
import { extractViaAPI } from "./llm-api";
import { extractViaCLI } from "./llm-cli";

/**
 * Dispatch document extraction to the user's configured LLM backend.
 * Reads llm_settings from DB, routes to API or CLI backend accordingly.
 * Default: CLI mode when no settings exist.
 *
 * This is the single entry point for the extract route — same return type
 * regardless of which backend is used.
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
  const mode = settings?.llmMode ?? "cli";

  if (mode === "api") {
    const apiKey = await getLLMApiKey(supabase, userId);
    if (!apiKey) {
      throw new Error(
        "API mode selected but no API key configured. Add your Anthropic API key in Settings → LLM."
      );
    }
    return extractViaAPI(apiKey, processedFile, fileType, filename);
  }

  // CLI mode (default)
  // Fall back to PORTSIE_CLI_ENDPOINT env var if no per-user endpoint is configured.
  // This ensures remote CLI works on Vercel where local `claude` isn't available.
  const cliEndpoint =
    settings?.cliEndpoint ?? process.env.PORTSIE_CLI_ENDPOINT ?? null;
  return extractViaCLI(processedFile, fileType, filename, cliEndpoint);
}
