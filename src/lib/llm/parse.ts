import type { LLMExtractionResult } from "../upload/types";

/**
 * Parse raw text from Claude (API or CLI) into a validated LLMExtractionResult.
 * Handles markdown fence stripping and structural validation.
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

  // Structural validation with defaults
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

  return result;
}
