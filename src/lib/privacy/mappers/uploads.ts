/**
 * Upload/extraction data sanitization mappers.
 *
 * Sanitizes extracted financial data before storage:
 * - Replaces full account numbers with masked hints
 * - Builds debug context from extraction metadata
 */

import type { PortsieExtraction } from "@/lib/extraction/schema";
import type { PrivacyConfig, DebugContext } from "../types";

/**
 * Sanitize a PortsieExtraction for DB storage.
 *
 * In strict mode: replaces account_number with masked hint (last 4 digits).
 * In standard mode: returns extraction as-is.
 */
export function sanitizeExtractionForStorage(
  extraction: PortsieExtraction,
  config: PrivacyConfig
): PortsieExtraction {
  if (config.mode === "standard") return extraction;

  // Deep-clone to avoid mutating the original
  const sanitized: PortsieExtraction = JSON.parse(JSON.stringify(extraction));

  for (const account of sanitized.accounts) {
    if (account.account_info.account_number) {
      const digits = account.account_info.account_number.replace(/\D/g, "");
      const last4 = digits.length >= 4 ? digits.slice(-4) : digits;
      account.account_info.account_number = `...${last4}`;
    }
  }

  return sanitized;
}

/**
 * Build a minimal debug context for storage (replaces raw_llm_response).
 */
export function buildDebugContext(opts: {
  backend: string;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  preset?: string;
}): DebugContext {
  return {
    backend: opts.backend,
    model: opts.model,
    durationMs: opts.durationMs,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    extractedAt: new Date().toISOString(),
    preset: opts.preset,
  };
}
