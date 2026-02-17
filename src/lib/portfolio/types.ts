/** Asset class IDs used throughout the portfolio classification system. */
export type AssetClassId =
  | "tech_equities"
  | "tech_options"
  | "non_tech_equities"
  | "crypto"
  | "gold_metals"
  | "real_estate"
  | "debt"
  | "cash";

/** Configuration for a single asset class. */
export interface AssetClassDef {
  id: AssetClassId;
  label: string;
  /** Tailwind color token used for charts & badges (e.g. "indigo", "amber"). */
  color: string;
  /** hex color for Recharts (needs explicit hex, not Tailwind classes). */
  chartColor: string;
  /** Sort order in the UI (lower = first). */
  order: number;
}

/** A position that has been classified into an asset class. */
export interface ClassifiedPosition {
  symbol: string;
  description: string;
  assetClassId: AssetClassId;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  /** % of total portfolio market value. */
  allocationPct: number;
  /** Original Schwab asset type (EQUITY, MUTUAL_FUND, OPTION, etc.) */
  instrumentType: string;
  /** For look-through classification — e.g. "Bitcoin ETF" for ARKB. */
  subCategory?: string;
}

/** Aggregated totals for one asset class. */
export interface AssetClassSummary {
  def: AssetClassDef;
  marketValue: number;
  dayChange: number;
  allocationPct: number;
  holdingCount: number;
  positions: ClassifiedPosition[];
}

/** Sub-aggregation within an asset class (e.g. Bitcoin ETF Aggregate). */
export interface SubAggregate {
  label: string;
  marketValue: number;
  allocationPct: number;
  positions: ClassifiedPosition[];
}

// ─── Input types (source-agnostic) ──────────────────────────────────────────

/** Normalized position input — works with Schwab API, uploads, or manual entry. */
export interface PortfolioInputPosition {
  symbol: string;
  description?: string;
  assetType: string;
  quantity: number;
  shortQuantity: number;
  averagePrice: number;
  marketValue: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
}

/** Normalized account input — works with any data source. */
export interface PortfolioInputAccount {
  id: string;
  cashBalance: number;
}

// ─── Output types ───────────────────────────────────────────────────────────

/** Full classified portfolio. */
export interface ClassifiedPortfolio {
  totalMarketValue: number;
  totalDayChange: number;
  totalDayChangePct: number;
  holdingCount: number;
  cashValue: number;
  cashPct: number;
  assetClasses: AssetClassSummary[];
  /** HHI score (0-10000; lower = more diversified). */
  hhi: number;
  /** HHI mapped to 1-10 scale for display. */
  diversificationScore: number;
  /** Simple 4% rule annual withdrawal estimate. */
  safeWithdrawalAnnual: number;
}
