import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedBalance } from "@/lib/upload/types";

/**
 * Recompute and store account-level summary columns.
 *
 * Sums active holdings for equity_value, merges with balance data
 * for cash/buying_power, and writes to the accounts table.
 */
export async function updateAccountSummary(
  supabase: SupabaseClient,
  accountId: string,
  balanceData?: ExtractedBalance
): Promise<void> {
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
  let totalMarketValue: number;
  if (balanceData?.liquidation_value != null) {
    const liqVal = balanceData.liquidation_value;
    const computed = equityValue + (cashBalance ?? 0);
    const hasPositions = holdingsCount > 0;
    const largeMismatch =
      !hasPositions &&
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
