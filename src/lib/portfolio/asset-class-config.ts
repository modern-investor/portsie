import type { AssetClassDef, AssetClassId, SubAssetClassDef, SubAssetClassId } from "./types";

// ─── Asset class definitions ────────────────────────────────────────────────

export const ASSET_CLASSES: Record<AssetClassId, AssetClassDef> = {
  tech_equities: {
    id: "tech_equities",
    label: "Tech Equities",
    color: "indigo",
    chartColor: "#6366f1",
    order: 1,
  },
  tech_options: {
    id: "tech_options",
    label: "Tech Options",
    color: "violet",
    chartColor: "#8b5cf6",
    order: 2,
  },
  non_tech_equities: {
    id: "non_tech_equities",
    label: "Non-Tech Equities",
    color: "cyan",
    chartColor: "#06b6d4",
    order: 3,
  },
  crypto: {
    id: "crypto",
    label: "Crypto",
    color: "amber",
    chartColor: "#f59e0b",
    order: 4,
  },
  gold_metals: {
    id: "gold_metals",
    label: "Gold & Metals",
    color: "yellow",
    chartColor: "#eab308",
    order: 5,
  },
  real_estate: {
    id: "real_estate",
    label: "Real Estate",
    color: "emerald",
    chartColor: "#10b981",
    order: 6,
  },
  debt: {
    id: "debt",
    label: "Debt",
    color: "red",
    chartColor: "#ef4444",
    order: 7,
  },
  cash: {
    id: "cash",
    label: "Cash",
    color: "slate",
    chartColor: "#64748b",
    order: 8,
  },
};

/** Sorted list for iteration. */
export const ASSET_CLASS_LIST: AssetClassDef[] = Object.values(ASSET_CLASSES).sort(
  (a, b) => a.order - b.order
);

// ─── Sub-asset class definitions ─────────────────────────────────────────────

export const SUB_ASSET_CLASSES: Record<SubAssetClassId, SubAssetClassDef> = {
  // Tech Equities
  tech_individual:    { id: "tech_individual",    parentId: "tech_equities",     label: "Individual Stocks", chartColor: "#4f46e5", order: 1 },
  tech_etfs:          { id: "tech_etfs",          parentId: "tech_equities",     label: "Tech ETFs",         chartColor: "#818cf8", order: 2 },
  tech_funds:         { id: "tech_funds",         parentId: "tech_equities",     label: "Tech Funds",        chartColor: "#a5b4fc", order: 3 },
  // Tech Options
  tech_options_calls: { id: "tech_options_calls", parentId: "tech_options",      label: "Calls",             chartColor: "#7c3aed", order: 1 },
  tech_options_puts:  { id: "tech_options_puts",  parentId: "tech_options",      label: "Puts",              chartColor: "#a78bfa", order: 2 },
  // Non-Tech Equities
  broad_market_etfs:  { id: "broad_market_etfs",  parentId: "non_tech_equities", label: "Broad Market ETFs", chartColor: "#0891b2", order: 1 },
  large_cap:          { id: "large_cap",          parentId: "non_tech_equities", label: "Large Cap",         chartColor: "#06b6d4", order: 2 },
  consumer_staples:   { id: "consumer_staples",   parentId: "non_tech_equities", label: "Consumer Staples",  chartColor: "#22d3ee", order: 3 },
  financials:         { id: "financials",         parentId: "non_tech_equities", label: "Financials",        chartColor: "#67e8f9", order: 4 },
  healthcare:         { id: "healthcare",         parentId: "non_tech_equities", label: "Healthcare",        chartColor: "#a5f3fc", order: 5 },
  non_tech_other:     { id: "non_tech_other",     parentId: "non_tech_equities", label: "Other Equities",    chartColor: "#cffafe", order: 6 },
  // Crypto
  bitcoin_etf:        { id: "bitcoin_etf",        parentId: "crypto",            label: "Bitcoin ETFs",      chartColor: "#d97706", order: 1 },
  ethereum_etf:       { id: "ethereum_etf",       parentId: "crypto",            label: "Ethereum ETFs",     chartColor: "#f59e0b", order: 2 },
  crypto_stocks:      { id: "crypto_stocks",      parentId: "crypto",            label: "Crypto Stocks",     chartColor: "#fbbf24", order: 3 },
  crypto_other:       { id: "crypto_other",       parentId: "crypto",            label: "Other Crypto",      chartColor: "#fcd34d", order: 4 },
  // Gold & Metals
  gold_etfs:          { id: "gold_etfs",          parentId: "gold_metals",       label: "Gold ETFs",         chartColor: "#ca8a04", order: 1 },
  gold_miners:        { id: "gold_miners",        parentId: "gold_metals",       label: "Gold Miners",       chartColor: "#eab308", order: 2 },
  other_metals:       { id: "other_metals",       parentId: "gold_metals",       label: "Other Metals",      chartColor: "#facc15", order: 3 },
  // Real Estate
  reit_etfs:          { id: "reit_etfs",          parentId: "real_estate",       label: "REIT ETFs",         chartColor: "#059669", order: 1 },
  individual_reits:   { id: "individual_reits",   parentId: "real_estate",       label: "Individual REITs",  chartColor: "#10b981", order: 2 },
  re_funds:           { id: "re_funds",           parentId: "real_estate",       label: "RE Funds",          chartColor: "#34d399", order: 3 },
  // Debt
  mortgage:           { id: "mortgage",           parentId: "debt",              label: "Mortgage",          chartColor: "#dc2626", order: 1 },
  credit_card:        { id: "credit_card",        parentId: "debt",              label: "Credit Card",       chartColor: "#ef4444", order: 2 },
  other_loans:        { id: "other_loans",        parentId: "debt",              label: "Other Loans",       chartColor: "#f87171", order: 3 },
  // Cash
  money_market:       { id: "money_market",       parentId: "cash",              label: "Money Market",      chartColor: "#475569", order: 1 },
  cash_balance:       { id: "cash_balance",       parentId: "cash",              label: "Cash Balance",      chartColor: "#94a3b8", order: 2 },
};

/** Sub-asset classes for a given parent, sorted by order. */
export function getSubClassesForParent(parentId: AssetClassId): SubAssetClassDef[] {
  return Object.values(SUB_ASSET_CLASSES)
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

// ─── Symbol → sub-asset class mappings ──────────────────────────────────────

/** Tech ETF symbols (subset of TECH_SYMBOLS that are ETFs/funds). */
const TECH_ETF_SYMBOLS = new Set([
  "ARKG", "ARKF", "ARKK", "ARKW", "ARKQ",
  "QQQ", "QQQM", "VGT", "XLK", "SMH", "SOXX",
]);

/** Tech mutual fund symbols. */
const TECH_FUND_SYMBOLS = new Set([
  "BPTRX", "BWBFX", "FCNTX", "FFND", "BCFN",
]);

/** Broad market ETFs (subset of NON_TECH_SYMBOLS). */
const BROAD_MARKET_ETF_SYMBOLS = new Set([
  "SPY", "VOO", "VTI", "IVV", "DIA", "IWM", "SPYG",
]);

/** Consumer staples / goods stocks. */
const CONSUMER_SYMBOLS = new Set(["KO", "PEP", "PG", "COST", "MCD", "WMT", "HD", "DIS", "NKE"]);

/** Financial sector stocks. */
const FINANCIAL_SYMBOLS = new Set(["JPM", "BAC", "GS", "V", "MA", "BRK/B", "BRK.B", "BRKB"]);

/** Healthcare stocks. */
const HEALTHCARE_SYMBOLS = new Set(["JNJ", "UNH", "LLY", "NVO", "PFE", "MRNA"]);

/** Gold ETF symbols (physical gold). */
const GOLD_ETF_SYMBOLS = new Set(["GLDM", "GLD", "IAU", "SGOL", "OUNZ", "BAR"]);

/** Gold miner symbols. */
const GOLD_MINER_SYMBOLS = new Set(["GDX", "GDXJ", "NEM", "GOLD", "AEM", "FNV", "WPM"]);

/** REIT ETF symbols. */
const REIT_ETF_SYMBOLS = new Set(["VNQ", "VNQI", "IYR", "SCHH", "XLRE", "RWR"]);

/** Individual REIT symbols. */
const INDIVIDUAL_REIT_SYMBOLS = new Set(["O", "AMT", "PLD", "CCI", "EQIX", "SPG"]);

/** Classify a symbol into a sub-asset class. Returns undefined if no match. */
export function classifySubAssetClass(
  symbol: string,
  assetClassId: AssetClassId,
  instrumentType: string,
  description?: string
): SubAssetClassId | undefined {
  const sym = symbol.toUpperCase();
  const desc = (description ?? "").toUpperCase();

  switch (assetClassId) {
    case "tech_equities":
      if (TECH_ETF_SYMBOLS.has(sym)) return "tech_etfs";
      if (TECH_FUND_SYMBOLS.has(sym)) return "tech_funds";
      if (instrumentType === "MUTUAL_FUND" || instrumentType === "COLLECTIVE_INVESTMENT") return "tech_funds";
      if (instrumentType === "ETF") return "tech_etfs";
      return "tech_individual";

    case "tech_options":
      if (desc.includes("PUT") || sym.includes("P")) return "tech_options_puts";
      return "tech_options_calls";

    case "non_tech_equities":
      if (BROAD_MARKET_ETF_SYMBOLS.has(sym)) return "broad_market_etfs";
      if (CONSUMER_SYMBOLS.has(sym)) return "consumer_staples";
      if (FINANCIAL_SYMBOLS.has(sym)) return "financials";
      if (HEALTHCARE_SYMBOLS.has(sym)) return "healthcare";
      if (instrumentType === "ETF" || instrumentType === "MUTUAL_FUND") return "broad_market_etfs";
      return "large_cap";

    case "crypto":
      if (BITCOIN_ETF_SYMBOLS.has(sym)) return "bitcoin_etf";
      if (ETHEREUM_ETF_SYMBOLS.has(sym)) return "ethereum_etf";
      if (CRYPTO_STOCK_SYMBOLS.has(sym)) return "crypto_stocks";
      return "crypto_other";

    case "gold_metals":
      if (GOLD_ETF_SYMBOLS.has(sym)) return "gold_etfs";
      if (GOLD_MINER_SYMBOLS.has(sym)) return "gold_miners";
      return "other_metals";

    case "real_estate":
      if (REIT_ETF_SYMBOLS.has(sym)) return "reit_etfs";
      if (INDIVIDUAL_REIT_SYMBOLS.has(sym)) return "individual_reits";
      if (sym === "BREFX" || instrumentType === "MUTUAL_FUND") return "re_funds";
      return "reit_etfs";

    case "cash":
      if (CASH_SYMBOLS.has(sym)) return "money_market";
      return "cash_balance";

    case "debt":
      if (desc.includes("MORTGAGE") || desc.includes("HOME LOAN")) return "mortgage";
      if (desc.includes("CREDIT CARD") || desc.includes("CREDIT")) return "credit_card";
      return "other_loans";

    default:
      return undefined;
  }
}

// ─── Symbol → asset class mappings ─────────────────────────────────────────
// Symbols are uppercased for matching. When a symbol isn't found here,
// the classifier falls back to heuristics (instrument type, description, etc.)

export const TECH_SYMBOLS = new Set([
  // Individual tech/growth stocks
  "TSLA", "NVDA", "PLTR", "HOOD", "AAPL", "GOOGL", "GOOG", "AMZN",
  "META", "AMD", "CLH", "ISRG", "APP", "NET", "MSFT", "CRM", "ADBE",
  "SNOW", "UBER", "ABNB", "SQ", "SHOP", "DDOG", "ZS", "CRWD",
  "MDB", "PANW", "COIN", "RKLB", "IONQ", "RGTI", "QUBT", "SMCI",
  "MRVL", "AVGO", "TSM", "INTC", "QCOM", "MU", "ANET", "NOW",
  // Tech-focused ETFs/Funds
  "ARKG", "ARKF", "ARKK", "ARKW", "ARKQ",
  "BPTRX", "BWBFX", "FCNTX", "FFND", "BCFN",
  "QQQ", "QQQM", "VGT", "XLK", "SMH", "SOXX",
]);

export const NON_TECH_SYMBOLS = new Set([
  "BRK/B", "BRK.B", "BRKB", "KO", "DIS", "SPHR", "LMND", "RBLX", "SE",
  "SPYG", "CPER", "SPY", "VOO", "VTI", "IVV", "DIA", "IWM",
  "JNJ", "PG", "UNH", "V", "MA", "JPM", "BAC", "WMT", "HD",
  "PEP", "COST", "MCD", "LLY", "NVO",
]);

/** Crypto-exposed: Bitcoin ETFs, Ethereum ETFs, crypto stocks. */
export const CRYPTO_SYMBOLS = new Set([
  // Bitcoin ETFs
  "IBIT", "ARKB", "GBTC", "BITO", "BITB", "HODL", "BTCW", "BTCO",
  // Ethereum ETFs
  "EZET", "ETHA", "FETH",
  // Crypto-exposed stocks
  "MSTR", "BMNR", "CIFR", "IREN", "MARA", "RIOT", "CLSK", "HUT",
]);

/** Bitcoin ETF symbols (for sub-aggregation). */
export const BITCOIN_ETF_SYMBOLS = new Set([
  "IBIT", "ARKB", "GBTC", "BITO", "BITB", "HODL", "BTCW", "BTCO",
]);

/** Ethereum ETF symbols (for sub-aggregation). */
export const ETHEREUM_ETF_SYMBOLS = new Set([
  "EZET", "ETHA", "FETH",
]);

/** Crypto-exposed stocks (MSTR as BTC proxy, BMNR, miners). */
export const CRYPTO_STOCK_SYMBOLS = new Set([
  "MSTR", "BMNR", "CIFR", "IREN", "MARA", "RIOT", "CLSK", "HUT",
]);

export const GOLD_SYMBOLS = new Set([
  "GLDM", "GLD", "IAU", "SGOL", "OUNZ", "BAR",
  // Gold miners
  "GDX", "GDXJ", "NEM", "GOLD", "AEM", "FNV", "WPM",
  // Other metals
  "MP", "SLV", "PSLV", "PPLT",
]);

export const REAL_ESTATE_SYMBOLS = new Set([
  "BREFX",
  // Common RE ETFs/funds
  "VNQ", "VNQI", "IYR", "SCHH", "XLRE", "RWR",
  "O", "AMT", "PLD", "CCI", "EQIX", "SPG",
]);

/** Money market / cash-equivalent symbols. */
export const CASH_SYMBOLS = new Set([
  "SNOXX", "SWVXX", "SNAXX", "SNVXX", "VMFXX",
  "FDRXX", "SPRXX", "TTTXX",
]);
