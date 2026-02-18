/**
 * Quality Check — Pure comparison logic.
 *
 * Compares what the extraction claimed (balances, positions, transactions)
 * against what actually landed in the database after auto-confirm.
 *
 * Hard checks (trigger fix cycle if failed):
 *   - total_value: extraction balance total vs DB account total (5% threshold)
 *   - position_count: extraction positions vs DB holdings (exact match)
 *
 * Soft checks (warnings only):
 *   - transaction_count: extraction vs DB count
 *   - balance_sanity: cash + equity ≈ total within extraction
 *   - position_sum: sum of market_value ≈ equity from balance
 */

import type { PortsieExtraction } from "../extraction/schema";
import type { QualityCheckInput, CheckResult, ValueCheck, CountCheck } from "./types";

/** Tolerance for total value comparison */
const TOTAL_VALUE_THRESHOLD = 0.05; // 5%
/** Tolerance for balance sanity check (cash + equity ≈ total) */
const BALANCE_SANITY_THRESHOLD = 0.02; // 2%
/** Tolerance for position sum vs equity */
const POSITION_SUM_THRESHOLD = 0.10; // 10%

function formatDollar(n: number): string {
  return "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Compute expected total value from extraction balances.
 * Sums liquidation_value across all accounts.
 */
function getExpectedTotalValue(extraction: PortsieExtraction): number {
  let total = 0;
  for (const account of extraction.accounts) {
    for (const balance of account.balances) {
      if (balance.liquidation_value != null) {
        total += balance.liquidation_value;
      }
    }
  }
  return total;
}

/**
 * Count total positions in extraction (across all accounts + unallocated).
 */
function getExpectedPositionCount(extraction: PortsieExtraction): number {
  let count = extraction.unallocated_positions.length;
  for (const account of extraction.accounts) {
    count += account.positions.length;
  }
  return count;
}

/**
 * Count total transactions in extraction.
 */
function getExpectedTransactionCount(extraction: PortsieExtraction): number {
  let count = 0;
  for (const account of extraction.accounts) {
    count += account.transactions.length;
  }
  return count;
}

/**
 * Get cash and equity from extraction balances (latest/most complete).
 */
function getExtractionBalanceSummary(extraction: PortsieExtraction): {
  cash: number;
  equity: number;
  total: number;
} {
  let cash = 0;
  let equity = 0;
  let total = 0;

  for (const account of extraction.accounts) {
    if (account.balances.length === 0) continue;
    // Use the last (most recent) balance
    const bal = account.balances[account.balances.length - 1];
    cash += bal.cash_balance ?? bal.total_cash ?? 0;
    equity += bal.equity ?? bal.long_market_value ?? 0;
    total += bal.liquidation_value ?? 0;
  }

  return { cash, equity, total };
}

/**
 * Sum of position market_value across extraction.
 */
function getPositionMarketValueSum(extraction: PortsieExtraction): number {
  let sum = 0;
  for (const account of extraction.accounts) {
    for (const pos of account.positions) {
      if (pos.market_value != null) {
        sum += pos.market_value;
      }
    }
  }
  for (const pos of extraction.unallocated_positions) {
    if (pos.market_value != null) {
      sum += pos.market_value;
    }
  }
  return sum;
}

/**
 * Run quality checks comparing extraction data against DB state.
 * Returns structured results with pass/fail for each check.
 */
export function runQualityCheck(input: QualityCheckInput): CheckResult {
  const { extraction, dbAccounts, dbHoldingsCount, dbTransactionCount } = input;

  // ── Total Value Check (hard) ──
  const expectedTotal = getExpectedTotalValue(extraction);
  const actualTotal = dbAccounts.reduce(
    (sum, a) => sum + (a.total_market_value ?? 0),
    0
  );
  const totalDiff = actualTotal - expectedTotal;
  const totalDiffPct = expectedTotal !== 0 ? totalDiff / expectedTotal : 0;
  const totalValueCheck: ValueCheck = {
    expected: expectedTotal,
    actual: actualTotal,
    diff: totalDiff,
    diff_pct: totalDiffPct,
    passed: expectedTotal === 0 || Math.abs(totalDiffPct) < TOTAL_VALUE_THRESHOLD,
  };

  // ── Position Count Check (hard) ──
  const expectedPositions = getExpectedPositionCount(extraction);
  const positionCountCheck: CountCheck = {
    expected: expectedPositions,
    actual: dbHoldingsCount,
    passed: expectedPositions === dbHoldingsCount,
  };

  // ── Transaction Count Check (soft) ──
  const expectedTransactions = getExpectedTransactionCount(extraction);
  const transactionCountCheck: CountCheck = {
    expected: expectedTransactions,
    actual: dbTransactionCount,
    passed: expectedTransactions === dbTransactionCount,
  };

  // ── Balance Sanity Check (soft) ──
  const balSummary = getExtractionBalanceSummary(extraction);
  const expectedSanityTotal = balSummary.cash + balSummary.equity;
  const sanityCashEquityMatch =
    balSummary.total === 0 ||
    Math.abs(expectedSanityTotal - balSummary.total) / balSummary.total <
      BALANCE_SANITY_THRESHOLD;
  const balanceSanityCheck = {
    cash: balSummary.cash,
    equity: balSummary.equity,
    total: balSummary.total,
    expected_total: expectedSanityTotal,
    passed: sanityCashEquityMatch,
  };

  // ── Position Sum Check (soft) ──
  const posMarketSum = getPositionMarketValueSum(extraction);
  const posEquityFromBalance = balSummary.equity;
  const posDiff = posMarketSum - posEquityFromBalance;
  const posDiffPct = posEquityFromBalance !== 0 ? posDiff / posEquityFromBalance : 0;
  const positionSumCheck: ValueCheck = {
    expected: posEquityFromBalance,
    actual: posMarketSum,
    diff: posDiff,
    diff_pct: posDiffPct,
    passed:
      posEquityFromBalance === 0 ||
      Math.abs(posDiffPct) < POSITION_SUM_THRESHOLD,
  };

  // ── Overall ──
  // Only hard checks determine overall pass/fail
  const overallPassed = totalValueCheck.passed && positionCountCheck.passed;

  // ── Summary ──
  const issues: string[] = [];
  if (!totalValueCheck.passed) {
    issues.push(
      `Dashboard shows ${formatDollar(actualTotal)} but statement claims ${formatDollar(expectedTotal)} (${(totalDiffPct * 100).toFixed(1)}% off)`
    );
  }
  if (!positionCountCheck.passed) {
    issues.push(
      `Expected ${expectedPositions} positions but found ${dbHoldingsCount} in DB`
    );
  }
  if (!transactionCountCheck.passed) {
    issues.push(
      `Expected ${expectedTransactions} transactions but found ${dbTransactionCount} in DB`
    );
  }
  if (!balanceSanityCheck.passed) {
    issues.push(
      `Balance sanity: cash (${formatDollar(balSummary.cash)}) + equity (${formatDollar(balSummary.equity)}) doesn't match total (${formatDollar(balSummary.total)})`
    );
  }
  if (!positionSumCheck.passed) {
    issues.push(
      `Position market values sum to ${formatDollar(posMarketSum)} but equity is ${formatDollar(posEquityFromBalance)}`
    );
  }

  const summary = overallPassed
    ? "All quality checks passed"
    : `Quality issues found: ${issues.join("; ")}`;

  return {
    total_value: totalValueCheck,
    position_count: positionCountCheck,
    transaction_count: transactionCountCheck,
    balance_sanity: balanceSanityCheck,
    position_sum: positionSumCheck,
    overall_passed: overallPassed,
    summary,
  };
}
