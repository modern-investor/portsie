/** Display categories for the positions table grouped view. */
export const DISPLAY_CATEGORIES = [
  { id: "equity", label: "Equity", order: 1 },
  { id: "etf", label: "ETF", order: 2 },
  { id: "closed_end", label: "Closed End", order: 3 },
  { id: "options", label: "Options", order: 4 },
  { id: "mutual_fund", label: "Mutual Fund", order: 5 },
  { id: "cash", label: "Cash", order: 6 },
  { id: "fixed_income", label: "Fixed Income", order: 7 },
  { id: "other", label: "Other", order: 8 },
] as const;

export type DisplayCategoryId = (typeof DISPLAY_CATEGORIES)[number]["id"];

const ASSET_TYPE_TO_CATEGORY: Record<string, DisplayCategoryId> = {
  EQUITY: "equity",
  ETF: "etf",
  OPTION: "options",
  MUTUAL_FUND: "mutual_fund",
  CASH_EQUIVALENT: "cash",
  FIXED_INCOME: "fixed_income",
  REAL_ESTATE: "other",
  PRECIOUS_METAL: "other",
  VEHICLE: "other",
  JEWELRY: "other",
  COLLECTIBLE: "other",
  OTHER_ASSET: "other",
};

/** Closed-end fund detection keywords in description. */
const CLOSED_END_KEYWORDS = ["CLOSED END", "CLOSED-END", "CEF"];

/**
 * Map an assetType + description to a display category.
 * Closed-end funds are detected by description keywords since Schwab
 * reports them as assetType "ETF".
 */
export function getDisplayCategory(
  assetType: string,
  description?: string
): DisplayCategoryId {
  // Check for closed-end funds (reported as ETF by Schwab)
  if (assetType === "ETF" && description) {
    const upper = description.toUpperCase();
    if (CLOSED_END_KEYWORDS.some((kw) => upper.includes(kw))) {
      return "closed_end";
    }
  }
  return ASSET_TYPE_TO_CATEGORY[assetType] ?? "other";
}

export function getDisplayCategoryLabel(id: DisplayCategoryId): string {
  return DISPLAY_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}
