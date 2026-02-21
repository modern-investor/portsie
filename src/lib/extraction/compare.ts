/**
 * Dual-model verification — compare two independent PortsieExtraction results.
 *
 * Produces a structured list of discrepancies so the review UI can show
 * where the primary and verification models disagree.
 */

import type {
  PortsieExtraction,
  ExtractionAccount,
  ExtractionPosition,
  ExtractionBalance,
  ExtractionTransaction,
} from "./schema";

// ── Types ──

export interface Discrepancy {
  severity: "info" | "warning" | "error";
  category: "account" | "position" | "transaction" | "balance" | "metadata";
  description: string;
  primaryValue: string | number | null;
  verificationValue: string | number | null;
}

export interface ComparisonResult {
  discrepancies: Discrepancy[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  agreement: "full" | "minor_differences" | "significant_differences";
}

// ── Helpers ──

/** Normalize institution name for comparison (strip common prefixes like "Charles") */
function normalizeInstitution(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/^charles\s+/, "")   // "Charles Schwab" → "schwab"
    .replace(/^the\s+/, "");
}

/** Normalize account identifiers for strict matching between models */
function accountKey(acct: ExtractionAccount): string {
  const num = acct.account_info.account_number?.replace(/^\.+/, "").slice(-4) ?? "";
  const inst = normalizeInstitution(acct.account_info.institution_name);
  const type = acct.account_info.account_type ?? "";
  return `${inst}|${type}|${num}`;
}

/**
 * Fuzzy-match two accounts when strict keys differ.
 * Returns true if the accounts are likely the same despite minor LLM differences.
 */
function accountsFuzzyMatch(a: ExtractionAccount, b: ExtractionAccount): boolean {
  const aInfo = a.account_info;
  const bInfo = b.account_info;

  // 1. Nickname match — if both have the same non-empty nickname, it's a match
  const aNick = (aInfo.account_nickname ?? "").toLowerCase().trim();
  const bNick = (bInfo.account_nickname ?? "").toLowerCase().trim();
  if (aNick && bNick && aNick === bNick) return true;

  // 2. One nickname contains the other's type + institution (e.g. "Schwab Checking")
  const aInst = normalizeInstitution(aInfo.institution_name);
  const bInst = normalizeInstitution(bInfo.institution_name);
  const aType = (aInfo.account_type ?? "").toLowerCase();
  const bType = (bInfo.account_type ?? "").toLowerCase();

  if (aNick && (aNick.includes(bInst) || aNick.includes(bType))) {
    if (bNick && (bNick.includes(aInst) || bNick.includes(aType))) return true;
    // One has a nickname that references the other's institution/type
    if (aType === bType || aInst === bInst) return true;
  }
  if (bNick && (bNick.includes(aInst) || bNick.includes(aType))) {
    if (aType === bType || aInst === bInst) return true;
  }

  // 3. Same account number last-4 + (same type OR same institution)
  const aNum = aInfo.account_number?.replace(/^\.+/, "").slice(-4) ?? "";
  const bNum = bInfo.account_number?.replace(/^\.+/, "").slice(-4) ?? "";
  if (aNum && bNum && aNum === bNum) {
    if (aType === bType || (aInst && bInst && aInst === bInst)) return true;
  }

  // 4. Same type + similar institution (one contains the other)
  if (aType && bType && aType === bType && aInst && bInst) {
    if (aInst.includes(bInst) || bInst.includes(aInst)) return true;
  }

  return false;
}

/** Check if two numbers differ beyond threshold */
function numDiffers(a: number | null | undefined, b: number | null | undefined, threshold = 0.01): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Math.abs(a - b) > threshold;
}

/** Format a number for display in discrepancy output */
function fmtNum(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Severity based on dollar difference */
function valueSeverity(a: number | null | undefined, b: number | null | undefined): "info" | "warning" | "error" {
  if (a == null || b == null) return "warning";
  const diff = Math.abs(a - b);
  if (diff > 5000) return "error";
  if (diff > 500) return "warning";
  return "info";
}

// ── Core comparison ──

export function compareExtractions(
  primary: PortsieExtraction,
  verification: PortsieExtraction
): ComparisonResult {
  const discrepancies: Discrepancy[] = [];

  // ── 1. Metadata comparison ──
  if (primary.confidence !== verification.confidence) {
    discrepancies.push({
      severity: "info",
      category: "metadata",
      description: "Confidence level differs",
      primaryValue: primary.confidence,
      verificationValue: verification.confidence,
    });
  }

  if (primary.document.document_type !== verification.document.document_type) {
    discrepancies.push({
      severity: "warning",
      category: "metadata",
      description: "Document type differs",
      primaryValue: primary.document.document_type,
      verificationValue: verification.document.document_type,
    });
  }

  if (primary.accounts.length !== verification.accounts.length) {
    discrepancies.push({
      severity: primary.accounts.length === 0 || verification.accounts.length === 0 ? "error" : "warning",
      category: "account",
      description: "Account count differs",
      primaryValue: primary.accounts.length,
      verificationValue: verification.accounts.length,
    });
  }

  // ── 2. Match accounts between the two extractions ──
  const primaryKeys = primary.accounts.map(accountKey);
  const verificationKeys = verification.accounts.map(accountKey);

  // Build a mapping: primary index → verification index
  const matched = new Map<number, number>();
  const usedVerification = new Set<number>();

  // Pass 1: strict key match
  for (let pi = 0; pi < primary.accounts.length; pi++) {
    const pk = primaryKeys[pi];
    for (let vi = 0; vi < verification.accounts.length; vi++) {
      if (usedVerification.has(vi)) continue;
      if (pk === verificationKeys[vi]) {
        matched.set(pi, vi);
        usedVerification.add(vi);
        break;
      }
    }
  }

  // Pass 2: fuzzy match for any accounts not matched in pass 1
  for (let pi = 0; pi < primary.accounts.length; pi++) {
    if (matched.has(pi)) continue;
    for (let vi = 0; vi < verification.accounts.length; vi++) {
      if (usedVerification.has(vi)) continue;
      if (accountsFuzzyMatch(primary.accounts[pi], verification.accounts[vi])) {
        matched.set(pi, vi);
        usedVerification.add(vi);
        break;
      }
    }
  }

  // Report unmatched accounts
  for (let pi = 0; pi < primary.accounts.length; pi++) {
    if (!matched.has(pi)) {
      const name = primary.accounts[pi].account_info.account_nickname
        ?? primary.accounts[pi].account_info.account_number
        ?? `Account #${pi + 1}`;
      discrepancies.push({
        severity: "warning",
        category: "account",
        description: `Account "${name}" in primary but not matched in verification`,
        primaryValue: name,
        verificationValue: null,
      });
    }
  }
  for (let vi = 0; vi < verification.accounts.length; vi++) {
    if (!usedVerification.has(vi)) {
      const name = verification.accounts[vi].account_info.account_nickname
        ?? verification.accounts[vi].account_info.account_number
        ?? `Account #${vi + 1}`;
      discrepancies.push({
        severity: "warning",
        category: "account",
        description: `Account "${name}" in verification but not matched in primary`,
        primaryValue: null,
        verificationValue: name,
      });
    }
  }

  // ── 3. Compare matched accounts ──
  for (const [pi, vi] of matched) {
    const pAcct = primary.accounts[pi];
    const vAcct = verification.accounts[vi];
    const acctLabel = pAcct.account_info.account_nickname
      ?? pAcct.account_info.account_number
      ?? `Account #${pi + 1}`;

    // Compare positions
    comparePositions(pAcct.positions, vAcct.positions, acctLabel, discrepancies);

    // Compare transactions
    compareTransactions(pAcct.transactions, vAcct.transactions, acctLabel, discrepancies);

    // Compare balances
    compareBalances(pAcct.balances, vAcct.balances, acctLabel, discrepancies);
  }

  // ── 4. Compare unallocated positions ──
  if (primary.unallocated_positions.length > 0 || verification.unallocated_positions.length > 0) {
    comparePositions(
      primary.unallocated_positions,
      verification.unallocated_positions,
      "Aggregate",
      discrepancies
    );
  }

  // ── 5. Compare document totals ──
  const pTotal = primary.document_totals?.total_value;
  const vTotal = verification.document_totals?.total_value;
  if (numDiffers(pTotal, vTotal, 1)) {
    discrepancies.push({
      severity: valueSeverity(pTotal, vTotal),
      category: "metadata",
      description: "Document total value differs",
      primaryValue: fmtNum(pTotal),
      verificationValue: fmtNum(vTotal),
    });
  }

  // ── Build summary ──
  const errors = discrepancies.filter((d) => d.severity === "error").length;
  const warnings = discrepancies.filter((d) => d.severity === "warning").length;
  const infos = discrepancies.filter((d) => d.severity === "info").length;

  let agreement: ComparisonResult["agreement"] = "full";
  if (errors > 0) agreement = "significant_differences";
  else if (warnings > 0 || infos > 0) agreement = "minor_differences";

  return {
    discrepancies,
    summary: { total: discrepancies.length, errors, warnings, infos },
    agreement,
  };
}

// ── Per-data-type comparisons ──

function comparePositions(
  primary: ExtractionPosition[],
  verification: ExtractionPosition[],
  acctLabel: string,
  out: Discrepancy[]
) {
  if (primary.length !== verification.length) {
    out.push({
      severity: "warning",
      category: "position",
      description: `${acctLabel}: position count differs`,
      primaryValue: primary.length,
      verificationValue: verification.length,
    });
  }

  // Match by (symbol, snapshot_date)
  const vMap = new Map<string, ExtractionPosition>();
  for (const p of verification) {
    vMap.set(`${p.symbol}|${p.snapshot_date}`, p);
  }

  const matchedSymbols = new Set<string>();

  for (const pp of primary) {
    const key = `${pp.symbol}|${pp.snapshot_date}`;
    const vp = vMap.get(key);

    if (!vp) {
      out.push({
        severity: "warning",
        category: "position",
        description: `${acctLabel}: ${pp.symbol} in primary but missing in verification`,
        primaryValue: `${pp.quantity} shares`,
        verificationValue: null,
      });
      continue;
    }

    matchedSymbols.add(key);

    // Compare quantity
    if (numDiffers(pp.quantity, vp.quantity, 0.001)) {
      out.push({
        severity: "error",
        category: "position",
        description: `${acctLabel}: ${pp.symbol} quantity differs`,
        primaryValue: pp.quantity,
        verificationValue: vp.quantity,
      });
    }

    // Compare market value
    if (numDiffers(pp.market_value, vp.market_value, 1)) {
      out.push({
        severity: valueSeverity(pp.market_value, vp.market_value),
        category: "position",
        description: `${acctLabel}: ${pp.symbol} market value differs`,
        primaryValue: fmtNum(pp.market_value),
        verificationValue: fmtNum(vp.market_value),
      });
    }
  }

  // Report positions only in verification
  for (const vp of verification) {
    const key = `${vp.symbol}|${vp.snapshot_date}`;
    if (!matchedSymbols.has(key) && !primary.some((pp) => `${pp.symbol}|${pp.snapshot_date}` === key)) {
      out.push({
        severity: "warning",
        category: "position",
        description: `${acctLabel}: ${vp.symbol} in verification but missing in primary`,
        primaryValue: null,
        verificationValue: `${vp.quantity} shares`,
      });
    }
  }
}

function compareTransactions(
  primary: ExtractionTransaction[],
  verification: ExtractionTransaction[],
  acctLabel: string,
  out: Discrepancy[]
) {
  if (primary.length !== verification.length) {
    out.push({
      severity: Math.abs(primary.length - verification.length) > 5 ? "error" : "warning",
      category: "transaction",
      description: `${acctLabel}: transaction count differs`,
      primaryValue: primary.length,
      verificationValue: verification.length,
    });
  }

  // Match by (date, symbol, action, amount)
  const vUsed = new Set<number>();

  for (const pt of primary) {
    const matchIdx = verification.findIndex((vt, vi) => {
      if (vUsed.has(vi)) return false;
      return (
        vt.transaction_date === pt.transaction_date &&
        vt.symbol === pt.symbol &&
        vt.action === pt.action &&
        !numDiffers(vt.total_amount, pt.total_amount, 0.01)
      );
    });

    if (matchIdx === -1) {
      // Try looser match (just date + symbol + action)
      const looseIdx = verification.findIndex((vt, vi) => {
        if (vUsed.has(vi)) return false;
        return (
          vt.transaction_date === pt.transaction_date &&
          vt.symbol === pt.symbol &&
          vt.action === pt.action
        );
      });

      if (looseIdx !== -1) {
        vUsed.add(looseIdx);
        const vt = verification[looseIdx];
        out.push({
          severity: valueSeverity(pt.total_amount, vt.total_amount),
          category: "transaction",
          description: `${acctLabel}: ${pt.action} ${pt.symbol ?? ""} ${pt.transaction_date} — amount differs`,
          primaryValue: fmtNum(pt.total_amount),
          verificationValue: fmtNum(vt.total_amount),
        });
      }
      // If totally unmatched, we already reported the count difference
    } else {
      vUsed.add(matchIdx);
    }
  }
}

function compareBalances(
  primary: ExtractionBalance[],
  verification: ExtractionBalance[],
  acctLabel: string,
  out: Discrepancy[]
) {
  // Match by snapshot_date
  const vMap = new Map<string, ExtractionBalance>();
  for (const b of verification) vMap.set(b.snapshot_date, b);

  for (const pb of primary) {
    const vb = vMap.get(pb.snapshot_date);
    if (!vb) {
      if (verification.length > 0) {
        out.push({
          severity: "info",
          category: "balance",
          description: `${acctLabel}: balance snapshot ${pb.snapshot_date} missing in verification`,
          primaryValue: fmtNum(pb.liquidation_value),
          verificationValue: null,
        });
      }
      continue;
    }

    if (numDiffers(pb.liquidation_value, vb.liquidation_value, 1)) {
      out.push({
        severity: valueSeverity(pb.liquidation_value, vb.liquidation_value),
        category: "balance",
        description: `${acctLabel}: liquidation value differs (${pb.snapshot_date})`,
        primaryValue: fmtNum(pb.liquidation_value),
        verificationValue: fmtNum(vb.liquidation_value),
      });
    }

    if (numDiffers(pb.cash_balance, vb.cash_balance, 1)) {
      out.push({
        severity: valueSeverity(pb.cash_balance, vb.cash_balance),
        category: "balance",
        description: `${acctLabel}: cash balance differs (${pb.snapshot_date})`,
        primaryValue: fmtNum(pb.cash_balance),
        verificationValue: fmtNum(vb.cash_balance),
      });
    }
  }
}
