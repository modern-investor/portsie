import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedBalance } from "@/lib/upload/types";

export interface UpdateAccountSummaryOptions {
  /**
   * When true, always use the balance's liquidation_value as total_market_value
   * (skip the inflation guard). Set this when positions are known to be stored
   * in an aggregate account rather than in this individual account — the account
   * legitimately has value but no holdings rows.
   */
  trustLiquidationValue?: boolean;
}

/**
 * Recompute and store account-level summary columns.
 *
 * Sums active holdings for equity_value, merges with balance data
 * for cash/buying_power, and writes to the accounts table.
 */
export async function updateAccountSummary(
  supabase: SupabaseClient,
  accountId: string,
  balanceData?: ExtractedBalance,
  options?: UpdateAccountSummaryOptions
): Promise<void> {
  const trustLiquidationValue = options?.trustLiquidationValue ?? false;

  // Fetch account category to determine if this is a position-backed account.
  // Non-position-backed accounts (banking, credit, loan, real estate) legitimately
  // have value without holdings, so the inflation guard should not apply to them.
  const { data: acctData } = await supabase
    .from("accounts")
    .select("account_category")
    .eq("id", accountId)
    .single();
  const accountCategory = acctData?.account_category ?? "brokerage";
  const NON_POSITION_CATEGORIES = new Set(["banking", "credit", "loan", "real_estate"]);

  // Sum market value of active holdings
  const { data: holdings } = await supabase
    .from("holdings")
    .select("market_value")
    .eq("account_id", accountId)
    .gt("quantity", 0);

  const equityValue = (holdings ?? []).reduce(
    (sum, h) => sum + (Number(h.market_value) || 0),
    0
  );

  const holdingsCount = (holdings ?? []).length;

  const cashBalance = balanceData?.cash_balance ?? null;
  const buyingPower = balanceData?.buying_power ?? null;

  // Total = liquidation_value from balance if available,
  // otherwise equity + cash.
  //
  // Safety: if the balance claims a large liquidation_value but there are
  // zero holdings and the equity computed from positions is 0, prefer the
  // computed value (equity + cash) instead. This prevents an LLM-extracted
  // statement total from inflating an account that has no position data.
  //
  // Exceptions that skip the guard:
  // - trustLiquidationValue=true: positions are in an aggregate account
  // - Non-position-backed categories (real estate, banking, credit, loan)
  let totalMarketValue: number;
  if (balanceData?.liquidation_value != null) {
    const liqVal = balanceData.liquidation_value;
    const computed = equityValue + (cashBalance ?? 0);
    const hasPositions = holdingsCount > 0;
    const skipGuard =
      trustLiquidationValue ||
      NON_POSITION_CATEGORIES.has(accountCategory);
    const largeMismatch =
      !hasPositions &&
      !skipGuard &&
      Math.abs(liqVal) > 1000 &&
      Math.abs(liqVal - computed) > Math.max(Math.abs(computed) * 0.5, 1000);

    if (largeMismatch) {
      // Don't trust a multi-thousand-dollar liquidation_value when there
      // are no positions to back it up — fall back to computed total.
      totalMarketValue = computed;
    } else {
      totalMarketValue = liqVal;
    }
  } else {
    totalMarketValue = equityValue + (cashBalance ?? 0);
  }

  await supabase
    .from("accounts")
    .update({
      total_market_value: totalMarketValue,
      equity_value: equityValue,
      cash_balance: cashBalance,
      buying_power: buyingPower,
      holdings_count: holdingsCount,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", accountId);
}
