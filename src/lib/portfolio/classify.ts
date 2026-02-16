import type { SchwabPosition, SchwabAccount, SchwabBalances } from "@/lib/schwab/types";
import type {
  AssetClassId,
  ClassifiedPosition,
  AssetClassSummary,
  ClassifiedPortfolio,
  SubAggregate,
} from "./types";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LIST,
  TECH_SYMBOLS,
  NON_TECH_SYMBOLS,
  CRYPTO_SYMBOLS,
  BITCOIN_ETF_SYMBOLS,
  ETHEREUM_ETF_SYMBOLS,
  CRYPTO_STOCK_SYMBOLS,
  GOLD_SYMBOLS,
  REAL_ESTATE_SYMBOLS,
  CASH_SYMBOLS,
} from "./asset-class-config";

// ─── Symbol classification ──────────────────────────────────────────────────

/**
 * Classify a single position by symbol and instrument metadata.
 * Hierarchy: explicit symbol lookup → description heuristics → instrument type fallback.
 */
function classifySymbol(
  symbol: string,
  instrumentType: string,
  description?: string
): { assetClassId: AssetClassId; subCategory?: string } {
  const sym = symbol.toUpperCase();
  const desc = (description ?? "").toUpperCase();

  // Options → check if underlying is tech
  if (instrumentType === "OPTION") {
    // Schwab option symbols embed the underlying at the start (e.g. "TSLA  250321C00250000")
    const underlying = sym.replace(/\s.*$/, "").replace(/\d{6}[CP]\d+$/, "");
    if (TECH_SYMBOLS.has(underlying) || TECH_SYMBOLS.has(sym.split(" ")[0])) {
      return { assetClassId: "tech_options", subCategory: `${underlying} Option` };
    }
    // Non-tech or unresolved options — still classify as tech_options if we can't tell
    return { assetClassId: "tech_options" };
  }

  // Explicit symbol lookups (highest priority)
  if (CASH_SYMBOLS.has(sym)) return { assetClassId: "cash" };
  if (BITCOIN_ETF_SYMBOLS.has(sym)) return { assetClassId: "crypto", subCategory: "Bitcoin ETF" };
  if (ETHEREUM_ETF_SYMBOLS.has(sym)) return { assetClassId: "crypto", subCategory: "Ethereum ETF" };
  if (CRYPTO_STOCK_SYMBOLS.has(sym)) return { assetClassId: "crypto", subCategory: "Crypto Stock" };
  if (CRYPTO_SYMBOLS.has(sym)) return { assetClassId: "crypto" };
  if (GOLD_SYMBOLS.has(sym)) return { assetClassId: "gold_metals" };
  if (REAL_ESTATE_SYMBOLS.has(sym)) return { assetClassId: "real_estate" };
  if (TECH_SYMBOLS.has(sym)) return { assetClassId: "tech_equities" };
  if (NON_TECH_SYMBOLS.has(sym)) return { assetClassId: "non_tech_equities" };

  // Description-based heuristics for ETFs/funds not in our explicit lists
  if (desc.includes("ETHEREUM") || desc.includes("ETHER ETF")) {
    return { assetClassId: "crypto", subCategory: "Ethereum ETF" };
  }
  if (desc.includes("BITCOIN") || desc.includes("BTC")) {
    return { assetClassId: "crypto", subCategory: "Bitcoin ETF" };
  }
  if (desc.includes("CRYPTO") || desc.includes("BLOCKCHAIN")) {
    return { assetClassId: "crypto" };
  }
  if (desc.includes("GOLD") || desc.includes("PRECIOUS METAL") || desc.includes("SILVER")) {
    return { assetClassId: "gold_metals" };
  }
  if (desc.includes("REAL ESTATE") || desc.includes("REIT") || desc.includes("PROPERTY")) {
    return { assetClassId: "real_estate" };
  }
  if (
    desc.includes("MONEY MARKET") ||
    desc.includes("TREASURY BILL") ||
    desc.includes("CASH RESERVE")
  ) {
    return { assetClassId: "cash" };
  }
  if (
    desc.includes("TECHNOLOGY") ||
    desc.includes("INNOVATION") ||
    desc.includes("SEMICONDUCTOR") ||
    desc.includes("SOFTWARE") ||
    desc.includes("GENOMIC") ||
    desc.includes("FINTECH") ||
    desc.includes("INTERNET") ||
    desc.includes("AI ") ||
    desc.includes("ARTIFICIAL INTELLIGENCE")
  ) {
    return { assetClassId: "tech_equities" };
  }

  // Instrument-type fallback
  if (instrumentType === "MUTUAL_FUND" || instrumentType === "COLLECTIVE_INVESTMENT") {
    // Unknown funds → non-tech by default
    return { assetClassId: "non_tech_equities" };
  }

  // Default: equity → non-tech
  return { assetClassId: "non_tech_equities" };
}

// ─── Portfolio classification ───────────────────────────────────────────────

/**
 * Classify all positions and account cash into a full portfolio breakdown.
 */
export function classifyPortfolio(
  positions: SchwabPosition[],
  accounts: SchwabAccount[]
): ClassifiedPortfolio {
  // 1. Calculate total market value (positions + cash)
  const positionsMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);

  let totalCash = 0;
  for (const acct of accounts) {
    const bal: SchwabBalances | undefined = acct.securitiesAccount.currentBalances;
    if (bal) {
      // Use cashBalance, not moneyMarketFund (that's a position)
      totalCash += bal.cashBalance ?? 0;
    }
  }

  const totalMarketValue = positionsMarketValue + totalCash;
  const totalDayChange = positions.reduce((s, p) => s + p.currentDayProfitLoss, 0);
  const totalDayChangePct =
    totalMarketValue > 0 ? (totalDayChange / (totalMarketValue - totalDayChange)) * 100 : 0;

  // 2. Classify each position
  const classified: ClassifiedPosition[] = positions.map((pos) => {
    const { assetClassId, subCategory } = classifySymbol(
      pos.instrument.symbol,
      pos.instrument.assetType,
      pos.instrument.description
    );
    return {
      symbol: pos.instrument.symbol,
      description: pos.instrument.description ?? "",
      assetClassId,
      quantity: pos.longQuantity - pos.shortQuantity,
      averagePrice: pos.averagePrice,
      marketValue: pos.marketValue,
      currentDayProfitLoss: pos.currentDayProfitLoss,
      currentDayProfitLossPercentage: pos.currentDayProfitLossPercentage,
      allocationPct: totalMarketValue > 0 ? (pos.marketValue / totalMarketValue) * 100 : 0,
      instrumentType: pos.instrument.assetType,
      subCategory,
    };
  });

  // 3. Build asset class summaries
  const byClass = new Map<AssetClassId, ClassifiedPosition[]>();
  for (const pos of classified) {
    const existing = byClass.get(pos.assetClassId) ?? [];
    existing.push(pos);
    byClass.set(pos.assetClassId, existing);
  }

  const assetClasses: AssetClassSummary[] = ASSET_CLASS_LIST.map((def) => {
    let positions = byClass.get(def.id) ?? [];
    let extraMV = 0;

    // Inject cash as a synthetic entry in the "cash" class
    if (def.id === "cash" && totalCash > 0) {
      extraMV = totalCash;
    }

    // Sort positions by market value descending
    positions = [...positions].sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));

    const marketValue = positions.reduce((s, p) => s + p.marketValue, 0) + extraMV;
    const dayChange = positions.reduce((s, p) => s + p.currentDayProfitLoss, 0);

    return {
      def,
      marketValue,
      dayChange,
      allocationPct: totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0,
      holdingCount: positions.length + (extraMV > 0 ? 1 : 0),
      positions,
    };
  }).filter((ac) => ac.marketValue !== 0 || ac.holdingCount > 0);

  // 4. Calculate HHI (Herfindahl-Hirschman Index) on position-level allocations
  // HHI = sum of squared allocation percentages (0-10000 scale)
  const hhi = classified.reduce((sum, pos) => sum + pos.allocationPct ** 2, 0);

  // Map HHI to a 1-10 diversification score (inverse: higher = more diversified)
  // HHI 10000 (single holding) → 1, HHI < 500 (very diversified) → 10
  const diversificationScore = Math.max(1, Math.min(10, Math.round(10 - (hhi / 10000) * 9)));

  const cashPct = totalMarketValue > 0 ? (totalCash / totalMarketValue) * 100 : 0;

  return {
    totalMarketValue,
    totalDayChange,
    totalDayChangePct,
    holdingCount: classified.length,
    cashValue: totalCash,
    cashPct,
    assetClasses,
    hhi,
    diversificationScore,
    safeWithdrawalAnnual: totalMarketValue * 0.04,
  };
}

// ─── Sub-aggregation helpers ────────────────────────────────────────────────

/**
 * Get sub-aggregates for the Crypto asset class.
 */
export function getCryptoSubAggregates(
  positions: ClassifiedPosition[],
  totalMarketValue: number
): SubAggregate[] {
  const groups: Record<string, ClassifiedPosition[]> = {
    "Bitcoin ETF Aggregate": [],
    "Ethereum ETF Aggregate": [],
    "Crypto Stocks": [],
    "Other Crypto": [],
  };

  for (const pos of positions) {
    if (pos.subCategory === "Bitcoin ETF") {
      groups["Bitcoin ETF Aggregate"].push(pos);
    } else if (pos.subCategory === "Ethereum ETF") {
      groups["Ethereum ETF Aggregate"].push(pos);
    } else if (pos.subCategory === "Crypto Stock") {
      groups["Crypto Stocks"].push(pos);
    } else {
      groups["Other Crypto"].push(pos);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({
      label,
      marketValue: items.reduce((s, p) => s + p.marketValue, 0),
      allocationPct:
        totalMarketValue > 0
          ? (items.reduce((s, p) => s + p.marketValue, 0) / totalMarketValue) * 100
          : 0,
      positions: items.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue)),
    }));
}

/**
 * Get sub-aggregates for Tech Equities (main holdings + options sub if combined).
 */
export function getTechSubAggregates(
  techPositions: ClassifiedPosition[],
  optionPositions: ClassifiedPosition[],
  totalMarketValue: number
): SubAggregate[] {
  const subs: SubAggregate[] = [];

  if (techPositions.length > 0) {
    const mv = techPositions.reduce((s, p) => s + p.marketValue, 0);
    subs.push({
      label: "Main Holdings",
      marketValue: mv,
      allocationPct: totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0,
      positions: techPositions.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue)),
    });
  }

  if (optionPositions.length > 0) {
    const mv = optionPositions.reduce((s, p) => s + p.marketValue, 0);
    subs.push({
      label: "Tech Options",
      marketValue: mv,
      allocationPct: totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0,
      positions: optionPositions.sort(
        (a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue)
      ),
    });
  }

  return subs;
}
