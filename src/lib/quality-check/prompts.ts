/**
 * Quality Check — Phase 1 Fix Prompt Builder
 *
 * Builds a targeted re-extraction prompt that includes quality check
 * feedback so the LLM can correct its extraction on retry.
 */

import type { PortsieExtraction } from "../extraction/schema";
import type { CheckResult } from "./types";

function formatDollar(n: number): string {
  return "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Build a quality-fix prompt that will be prepended to the file content
 * when re-extracting through the dispatcher.
 */
export function buildQualityFixPrompt(
  checkResult: CheckResult,
  originalExtraction: PortsieExtraction
): string {
  const issues: string[] = [];

  if (!checkResult.total_value.passed) {
    issues.push(
      `TOTAL VALUE MISMATCH: The extraction produced a total value of ${formatDollar(checkResult.total_value.expected)} ` +
        `but the sum written to the database was ${formatDollar(checkResult.total_value.actual)} ` +
        `(${(checkResult.total_value.diff_pct * 100).toFixed(1)}% difference). ` +
        `Ensure that balance liquidation_value matches the document's stated total account value.`
    );
  }

  if (!checkResult.position_count.passed) {
    issues.push(
      `POSITION COUNT MISMATCH: Expected ${checkResult.position_count.expected} positions ` +
        `but only ${checkResult.position_count.actual} were written to the database. ` +
        `Ensure ALL positions visible in the document are extracted, including those in summary sections.`
    );
  }

  if (!checkResult.transaction_count.passed) {
    issues.push(
      `TRANSACTION COUNT: Expected ${checkResult.transaction_count.expected} transactions ` +
        `but ${checkResult.transaction_count.actual} were written.`
    );
  }

  if (!checkResult.balance_sanity.passed) {
    issues.push(
      `BALANCE SANITY: cash (${formatDollar(checkResult.balance_sanity.cash)}) + ` +
        `equity (${formatDollar(checkResult.balance_sanity.equity)}) does not equal ` +
        `total (${formatDollar(checkResult.balance_sanity.total)}).`
    );
  }

  if (!checkResult.position_sum.passed) {
    issues.push(
      `POSITION VALUES: Sum of position market_value (${formatDollar(checkResult.position_sum.actual)}) ` +
        `does not match equity from balance (${formatDollar(checkResult.position_sum.expected)}). ` +
        `Ensure ALL positions have accurate market_value fields.`
    );
  }

  const accountSummary = originalExtraction.accounts
    .map(
      (a, i) =>
        `  Account ${i}: ${a.account_info.institution_name ?? "Unknown"} ` +
        `(${a.account_info.account_type ?? "unknown type"}) — ` +
        `${a.positions.length} positions, ${a.transactions.length} transactions, ${a.balances.length} balances`
    )
    .join("\n");

  return (
    `\n\n=== QUALITY CHECK FEEDBACK ===\n\n` +
    `A previous extraction of this document had quality issues. Please re-extract more carefully.\n\n` +
    `Issues found:\n${issues.map((i) => `- ${i}`).join("\n")}\n\n` +
    `Previous extraction summary:\n` +
    `- ${originalExtraction.accounts.length} accounts detected\n` +
    `- ${originalExtraction.unallocated_positions.length} unallocated positions\n` +
    `- Confidence: ${originalExtraction.confidence}\n` +
    `- Notes: ${originalExtraction.notes.length > 0 ? originalExtraction.notes.join("; ") : "(none)"}\n` +
    `- Account breakdown:\n${accountSummary}\n\n` +
    `Pay special attention to:\n` +
    `1. Extract EVERY position with accurate market_value\n` +
    `2. Balance liquidation_value must match the document's stated total\n` +
    `3. Include ALL accounts — do not merge or skip any\n` +
    `4. If positions span multiple accounts, use unallocated_positions\n\n` +
    `Respond ONLY with the corrected JSON object.`
  );
}
