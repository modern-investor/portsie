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
  // otherwise equity + cash
  let totalMarketValue: number;
  if (balanceData?.liquidation_value != null) {
    totalMarketValue = balanceData.liquidation_value;
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
