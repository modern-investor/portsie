import type { AssetClassDef, AssetClassId } from "./types";

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
