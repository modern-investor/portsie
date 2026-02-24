/**
 * Serialize portfolio data into a structured text summary for LLM consumption.
 * This is the context passed to Gemini/Sonnet for view suggestions and to
 * Opus for code generation.
 */

import type { PortfolioData, UnifiedPosition, UnifiedAccount } from "@/app/api/portfolio/positions/route";
import type { ClassifiedPortfolio } from "./types";

export function serializePortfolioForLLM(
  data: PortfolioData,
  classified: ClassifiedPortfolio
): string {
  const lines: string[] = [];

  // ── Portfolio Overview ──
  lines.push("=== PORTFOLIO OVERVIEW ===");
  lines.push(`Total Market Value: $${fmt(classified.totalMarketValue)}`);
  lines.push(`Total Day Change: $${fmt(classified.totalDayChange)} (${classified.totalDayChangePct.toFixed(2)}%)`);
  lines.push(`Total Holdings: ${classified.holdingCount}`);
  lines.push(`Cash Value: $${fmt(classified.cashValue)} (${classified.cashPct.toFixed(1)}%)`);
  if (classified.liabilityValue !== 0) {
    lines.push(`Liabilities: $${fmt(classified.liabilityValue)} (${classified.liabilityPct.toFixed(1)}%)`);
  }
  lines.push(`HHI (Herfindahl Index): ${classified.hhi}`);
  lines.push(`Diversification Score: ${classified.diversificationScore}/10`);
  lines.push(`Safe Withdrawal (4% rule): $${fmt(classified.safeWithdrawalAnnual)}/year`);
  lines.push("");

  // ── Asset Class Breakdown ──
  lines.push("=== ASSET CLASS BREAKDOWN ===");
  for (const ac of classified.assetClasses) {
    if (ac.holdingCount === 0) continue;
    lines.push(`\n--- ${ac.def.label} ---`);
    lines.push(`  Market Value: $${fmt(ac.marketValue)} | Allocation: ${ac.allocationPct.toFixed(1)}% | Day Change: $${fmt(ac.dayChange)} | Holdings: ${ac.holdingCount}`);

    // Top positions in this class
    const sorted = [...ac.positions].sort((a, b) => b.marketValue - a.marketValue);
    const top = sorted.slice(0, 8);
    for (const p of top) {
      lines.push(`  ${p.symbol}: $${fmt(p.marketValue)} (${p.allocationPct.toFixed(1)}% of portfolio) | Type: ${p.instrumentType}${p.subCategory ? ` [${p.subCategory}]` : ""}`);
    }
    if (sorted.length > 8) {
      lines.push(`  ... and ${sorted.length - 8} more positions`);
    }
  }
  lines.push("");

  // ── Account Summary ──
  lines.push("=== ACCOUNTS ===");
  const allAccounts = [...data.accounts, ...data.aggregateAccounts];
  for (const acct of allAccounts) {
    const label = acct.isAggregate ? "[Aggregate] " : "";
    lines.push(`${label}${acct.name} (${acct.institution}) | Type: ${acct.type} | Category: ${acct.accountCategory} | Value: $${fmt(acct.liquidationValue)} | Cash: $${fmt(acct.cashBalance)} | Holdings: ${acct.holdingsCount} | Source: ${acct.source}${acct.accountGroup ? ` | Group: ${acct.accountGroup}` : ""}`);
  }
  lines.push("");

  // ── Full Position List ──
  lines.push("=== ALL POSITIONS ===");
  lines.push("Symbol | Description | Asset Type | Quantity | Market Value | Allocation % | Day P/L | Day P/L % | Account");
  lines.push("-".repeat(120));

  const allPositions = [...data.positions, ...data.aggregatePositions];
  const sorted = [...allPositions].sort((a, b) => b.marketValue - a.marketValue);
  for (const p of sorted) {
    const alloc = classified.totalMarketValue > 0
      ? ((p.marketValue / classified.totalMarketValue) * 100).toFixed(2)
      : "0.00";
    lines.push(
      `${p.symbol} | ${truncate(p.description, 40)} | ${p.assetType} | ${p.quantity} | $${fmt(p.marketValue)} | ${alloc}% | $${fmt(p.currentDayProfitLoss)} | ${p.currentDayProfitLossPercentage.toFixed(2)}% | ${p.accountName ?? "N/A"}`
    );
  }

  return lines.join("\n");
}

/**
 * Compute a SHA-256 hash of the portfolio summary for cache invalidation.
 */
export async function computePortfolioHash(summary: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(summary);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 3) + "..." : s;
}
