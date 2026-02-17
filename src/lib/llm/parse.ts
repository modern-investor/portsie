import type { LLMExtractionResult, ExtractedAccount, AccountLink } from "../upload/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and normalize an account_link object from Claude's response.
 * Returns the validated link or null if invalid/missing.
 */
function validateAccountLink(raw: unknown): AccountLink | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const link = raw as Record<string, unknown>;
  const action = link.action;

  if (action !== "match_existing" && action !== "create_new") return undefined;

  const confidence = ["high", "medium", "low"].includes(link.match_confidence as string)
    ? (link.match_confidence as AccountLink["match_confidence"])
    : "low";

  const reason = typeof link.match_reason === "string" ? link.match_reason : "";

  if (action === "match_existing") {
    const id = link.existing_account_id;
    if (typeof id !== "string" || !UUID_REGEX.test(id)) {
      // Invalid UUID — downgrade to create_new
      return {
        action: "create_new",
        match_confidence: "low",
        match_reason: `Invalid existing_account_id from LLM: ${String(id)}`,
      };
    }
    return { action: "match_existing", existing_account_id: id, match_confidence: confidence, match_reason: reason };
  }

  return { action: "create_new", match_confidence: confidence, match_reason: reason };
}

/**
 * Check if all accounts in the extraction result have valid account_link data.
 * Returns true only when every account has a well-formed account_link.
 */
export function hasAccountLinks(result: LLMExtractionResult): boolean {
  if (!result.accounts || result.accounts.length === 0) return false;
  return result.accounts.every((a) => a.account_link != null);
}

/**
 * Parse raw text from Claude (API or CLI) into a validated LLMExtractionResult.
 * Handles markdown fence stripping, structural validation, multi-account normalization,
 * and account_link validation.
 * Shared by both llm-api.ts and llm-cli.ts.
 */
export function parseAndValidateExtraction(rawText: string): LLMExtractionResult {
  let jsonText = rawText.trim();

  // Strip markdown fences if present
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
  }

  // Try to extract JSON object if surrounded by other text
  if (!jsonText.startsWith("{")) {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      jsonText = match[0];
    }
  }

  let result: LLMExtractionResult;
  try {
    result = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw response: ${jsonText.slice(0, 500)}`
    );
  }

  // ── Multi-account normalization ──
  // If the LLM returned an accounts array, validate each entry and synthesize
  // top-level fields for backward compatibility with single-account code paths.
  if (Array.isArray(result.accounts) && result.accounts.length > 0) {
    for (const acct of result.accounts as ExtractedAccount[]) {
      if (!acct.account_info) {
        acct.account_info = {};
      }
      if (!Array.isArray(acct.transactions)) {
        acct.transactions = [];
      }
      if (!Array.isArray(acct.positions)) {
        acct.positions = [];
      }
      if (!Array.isArray(acct.balances)) {
        acct.balances = [];
      }
      // Validate account_link if present
      acct.account_link = validateAccountLink(acct.account_link);
    }

    // Synthesize top-level account_info from the first account if missing
    if (!result.account_info) {
      result.account_info = result.accounts[0].account_info;
    }

    // Synthesize top-level flat arrays by merging all per-account data
    if (!Array.isArray(result.transactions) || result.transactions.length === 0) {
      result.transactions = result.accounts.flatMap(a => a.transactions);
    }
    if (!Array.isArray(result.positions) || result.positions.length === 0) {
      result.positions = result.accounts.flatMap(a => a.positions);
    }
    if (!Array.isArray(result.balances) || result.balances.length === 0) {
      result.balances = result.accounts.flatMap(a => a.balances);
    }
  }

  // Default unallocated_positions
  if (!Array.isArray(result.unallocated_positions)) {
    result.unallocated_positions = [];
  }

  // ── Structural validation with defaults (single-account or synthesized) ──
  if (!result.account_info) {
    throw new Error("Invalid extraction result: missing account_info");
  }
  if (!Array.isArray(result.transactions)) {
    result.transactions = [];
  }
  if (!Array.isArray(result.positions)) {
    result.positions = [];
  }
  if (!Array.isArray(result.balances)) {
    result.balances = [];
  }
  if (!Array.isArray(result.notes)) {
    result.notes = [];
  }
  if (!["high", "medium", "low"].includes(result.confidence)) {
    result.confidence = "low";
  }

  // Per-transaction field validation: ensure total_amount is never null
  result.transactions = result.transactions.map((t) => ({
    ...t,
    total_amount: t.total_amount ?? (
      (t.quantity != null && t.price_per_share != null)
        ? +(t.quantity * t.price_per_share).toFixed(2)
        : 0
    ),
  }));

  return result;
}
