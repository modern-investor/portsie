/**
 * Post-extraction integrity validation.
 *
 * Compares extracted data totals against document-reported totals
 * to catch discrepancies before they reach the dashboard.
 */

import type { PortsieExtraction } from "./schema";

const LIABILITY_ACCOUNT_TYPES = new Set([
  "mortgage",
  "heloc",
  "credit_card",
  "auto_loan",
]);

// ── Types ──

export interface IntegrityDiscrepancy {
  /** What was compared */
  check: string;
  /** Expected value (from document total or balance) */
  expected: number;
  /** Computed value (from summing positions/balances) */
  computed: number;
  /** Absolute difference */
  difference: number;
  /** Percentage difference */
  differencePct: number;
  /** Severity based on thresholds */
  severity: "info" | "warning" | "error";
}

export interface IntegrityReport {
  /** Overall pass/fail (true if no errors) */
  passed: boolean;
  /** Individual check results */
  discrepancies: IntegrityDiscrepancy[];
  /** Summary stats */
  summary: {
    documentReportedTotal: number | null;
    computedTotal: number;
    totalAccountBalances: number;
    totalPositionValues: number;
    liabilityTotal: number;
    accountCount: number;
    positionCount: number;
  };
}

// ── Helpers ──

function severity(
  absDiff: number,
  pctDiff: number
): IntegrityDiscrepancy["severity"] {
  if (absDiff > 5000 || pctDiff > 5) return "error";
  if (absDiff > 500 || pctDiff > 1) return "warning";
  return "info";
}

// ── Main ──

/**
 * Run integrity checks on a validated extraction.
 * Compares extracted totals against document-reported totals.
 */
export function checkExtractionIntegrity(
  extraction: PortsieExtraction
): IntegrityReport {
  const discrepancies: IntegrityDiscrepancy[] = [];

  let totalAccountBalances = 0;
  let totalPositionValues = 0;
  let liabilityTotal = 0;
  let positionCount = 0;

  // ── 1. Per-account checks ──
  for (const account of extraction.accounts) {
    const info = account.account_info;
    const label =
      info.account_nickname ?? info.institution_name ?? "Unknown Account";

    // Sum position market values for this account
    const positionSum = account.positions.reduce(
      (sum, p) => sum + (p.market_value ?? 0),
      0
    );
    positionCount += account.positions.length;

    // Get latest balance
    const balance =
      account.balances.length > 0
        ? account.balances[account.balances.length - 1]
        : null;

    const balanceLiquidation = balance?.liquidation_value ?? null;

    if (balanceLiquidation != null) {
      totalAccountBalances += balanceLiquidation;
    }
    totalPositionValues += positionSum;

    // Track liabilities
    if (
      info.account_type &&
      LIABILITY_ACCOUNT_TYPES.has(info.account_type)
    ) {
      liabilityTotal += balanceLiquidation ?? 0;
    }

    // Check: account has large balance but zero positions (likely extraction error)
    if (
      balanceLiquidation != null &&
      Math.abs(balanceLiquidation) > 1000 &&
      account.positions.length === 0 &&
      !LIABILITY_ACCOUNT_TYPES.has(info.account_type ?? "")
    ) {
      discrepancies.push({
        check: `Account "${label}": claims ${balanceLiquidation >= 0 ? "$" : "-$"}${Math.abs(balanceLiquidation).toLocaleString()} but has 0 positions`,
        expected: 0,
        computed: balanceLiquidation,
        difference: balanceLiquidation,
        differencePct: 100,
        severity: "error",
      });
    }

    // Check: account balance vs sum of positions + cash
    if (balanceLiquidation != null && account.positions.length > 0) {
      const cashBalance = balance?.cash_balance ?? 0;
      const computedTotal = positionSum + cashBalance;
      const diff = balanceLiquidation - computedTotal;
      const absDiff = Math.abs(diff);
      const pctDiff =
        balanceLiquidation !== 0
          ? (absDiff / Math.abs(balanceLiquidation)) * 100
          : 0;

      if (absDiff > 1) {
        discrepancies.push({
          check: `Account "${label}": balance vs positions+cash`,
          expected: balanceLiquidation,
          computed: computedTotal,
          difference: diff,
          differencePct: pctDiff,
          severity: severity(absDiff, pctDiff),
        });
      }
    }

    // Check: liability sign
    if (
      info.account_type &&
      LIABILITY_ACCOUNT_TYPES.has(info.account_type) &&
      balanceLiquidation != null &&
      balanceLiquidation > 0
    ) {
      discrepancies.push({
        check: `Account "${label}" (${info.account_type}): expected negative liquidation_value for liability`,
        expected: -Math.abs(balanceLiquidation),
        computed: balanceLiquidation,
        difference: balanceLiquidation * 2,
        differencePct: 200,
        severity: "warning",
      });
    }
  }

  // Add unallocated positions to total
  const unallocatedSum = extraction.unallocated_positions.reduce(
    (sum, p) => sum + (p.market_value ?? 0),
    0
  );
  totalPositionValues += unallocatedSum;
  positionCount += extraction.unallocated_positions.length;

  // ── 2. Cross-account check: sum of balances vs document total ──
  const docTotal = extraction.document_totals?.total_value ?? null;
  if (docTotal != null && totalAccountBalances !== 0) {
    const diff = docTotal - totalAccountBalances;
    const absDiff = Math.abs(diff);
    const pctDiff =
      docTotal !== 0 ? (absDiff / Math.abs(docTotal)) * 100 : 0;

    if (absDiff > 1) {
      discrepancies.push({
        check: "Document total vs sum of account balances",
        expected: docTotal,
        computed: totalAccountBalances,
        difference: diff,
        differencePct: pctDiff,
        severity: severity(absDiff, pctDiff),
      });
    }
  }

  // ── 3. Day change consistency ──
  const docDayChange = extraction.document_totals?.total_day_change ?? null;
  if (docDayChange != null) {
    let computedDayChange = 0;
    for (const account of extraction.accounts) {
      for (const pos of account.positions) {
        computedDayChange += pos.day_change_amount ?? 0;
      }
    }
    for (const pos of extraction.unallocated_positions) {
      computedDayChange += pos.day_change_amount ?? 0;
    }

    const diff = docDayChange - computedDayChange;
    const absDiff = Math.abs(diff);
    const pctDiff =
      docDayChange !== 0 ? (absDiff / Math.abs(docDayChange)) * 100 : 0;

    // Higher tolerance for day change (rounding across many positions)
    if (absDiff > 100 && pctDiff > 5) {
      discrepancies.push({
        check: "Document day change vs sum of position day changes",
        expected: docDayChange,
        computed: computedDayChange,
        difference: diff,
        differencePct: pctDiff,
        severity: severity(absDiff, pctDiff),
      });
    }
  }

  const computedTotal = totalPositionValues + liabilityTotal;
  const hasErrors = discrepancies.some((d) => d.severity === "error");

  return {
    passed: !hasErrors,
    discrepancies,
    summary: {
      documentReportedTotal: docTotal,
      computedTotal,
      totalAccountBalances,
      totalPositionValues,
      liabilityTotal,
      accountCount: extraction.accounts.length,
      positionCount,
    },
  };
}
