import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMExtractionResult } from "./types";

/**
 * Writes confirmed extraction results to the canonical database tables:
 * - transactions
 * - position_snapshots
 * - balance_snapshots
 *
 * Uses upsert to prevent duplicate imports.
 */
export async function writeExtractedData(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  statementId: string,
  extractedData: LLMExtractionResult
): Promise<{ transactionsCreated: number; positionsCreated: number }> {
  let transactionsCreated = 0;
  let positionsCreated = 0;

  // ── Write transactions ──
  if (extractedData.transactions.length > 0) {
    const transactionRows = extractedData.transactions.map((t, index) => ({
      user_id: userId,
      account_id: accountId,
      data_source: "manual_upload",
      external_transaction_id: `upload_${statementId}_${index}`,
      transaction_date: t.transaction_date,
      settlement_date: t.settlement_date ?? null,
      symbol: t.symbol ?? null,
      cusip: t.cusip ?? null,
      asset_type: t.asset_type ?? null,
      description: t.description,
      action: t.action,
      quantity: t.quantity ?? null,
      price_per_share: t.price_per_share ?? null,
      total_amount: t.total_amount,
      fees: t.fees ?? 0,
      commission: t.commission ?? 0,
      uploaded_statement_id: statementId,
    }));

    const { data, error } = await supabase
      .from("transactions")
      .upsert(transactionRows, {
        onConflict: "account_id,external_transaction_id",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write transactions: ${error.message}`);
    }
    transactionsCreated = data?.length ?? 0;
  }

  // ── Write position snapshots ──
  if (extractedData.positions.length > 0) {
    const positionRows = extractedData.positions.map((p) => ({
      user_id: userId,
      account_id: accountId,
      snapshot_date: p.snapshot_date,
      snapshot_type: "manual",
      data_source: "manual_upload",
      symbol: p.symbol,
      cusip: p.cusip ?? null,
      asset_type: p.asset_type ?? null,
      description: p.description ?? null,
      quantity: p.quantity,
      short_quantity: p.short_quantity ?? 0,
      average_cost_basis: p.average_cost_basis ?? null,
      market_price_per_share: p.market_price_per_share ?? null,
      market_value: p.market_value ?? null,
      cost_basis_total: p.cost_basis_total ?? null,
      unrealized_profit_loss: p.unrealized_profit_loss ?? null,
      unrealized_profit_loss_pct: p.unrealized_profit_loss_pct ?? null,
      uploaded_statement_id: statementId,
    }));

    const { data, error } = await supabase
      .from("position_snapshots")
      .upsert(positionRows, {
        onConflict: "account_id,snapshot_date,symbol,snapshot_type",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write position snapshots: ${error.message}`);
    }
    positionsCreated = data?.length ?? 0;
  }

  // ── Write balance snapshots ──
  if (extractedData.balances.length > 0) {
    const balanceRows = extractedData.balances.map((b) => ({
      user_id: userId,
      account_id: accountId,
      snapshot_date: b.snapshot_date,
      snapshot_type: "manual",
      data_source: "manual_upload",
      liquidation_value: b.liquidation_value ?? null,
      cash_balance: b.cash_balance ?? null,
      available_funds: b.available_funds ?? null,
      total_cash: b.total_cash ?? null,
      equity: b.equity ?? null,
      long_market_value: b.long_market_value ?? null,
      buying_power: b.buying_power ?? null,
      uploaded_statement_id: statementId,
    }));

    const { error } = await supabase
      .from("balance_snapshots")
      .upsert(balanceRows, {
        onConflict: "account_id,snapshot_date,snapshot_type",
      });

    if (error) {
      throw new Error(`Failed to write balance snapshots: ${error.message}`);
    }
  }

  // ── Update the uploaded_statements record ──
  await supabase
    .from("uploaded_statements")
    .update({
      account_id: accountId,
      parse_status: "completed",
      confirmed_at: new Date().toISOString(),
      transactions_created: transactionsCreated,
      positions_created: positionsCreated,
      statement_start_date: extractedData.statement_start_date ?? null,
      statement_end_date: extractedData.statement_end_date ?? null,
    })
    .eq("id", statementId);

  return { transactionsCreated, positionsCreated };
}
