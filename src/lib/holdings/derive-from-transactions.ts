import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedPosition } from "@/lib/upload/types";

/**
 * Derive net holdings from the complete transaction history for an account.
 *
 * Queries ALL transactions for the given account_id, groups by symbol, and
 * computes net quantity and simple average cost basis. Returns
 * ExtractedPosition[] suitable for passing to reconcileHoldings().
 *
 * Only returns positions for symbols with net quantity > 0.0001 (dust filter).
 */

const QUANTITY_ADDING = new Set([
  "buy",
  "reinvestment",
  "buy_to_cover",
]);

const QUANTITY_SUBTRACTING = new Set([
  "sell",
  "sell_short",
]);

// transfer_in/transfer_out handled separately (need symbol + quantity check)

interface SymbolAccumulator {
  symbol: string;
  netQuantity: number;
  totalBuyQuantity: number;
  totalBuyAmount: number;
  latestTransactionDate: string;
  asset_type: string | null;
  asset_subtype: string | null;
  cusip: string | null;
  description: string | null;
}

export interface DeriveHoldingsResult {
  derivedPositions: ExtractedPosition[];
  symbolCount: number;
  totalTransactionsProcessed: number;
}

const DUST_THRESHOLD = 0.0001;

export async function deriveHoldingsFromTransactions(
  supabase: SupabaseClient,
  accountId: string,
  snapshotDate?: string,
): Promise<DeriveHoldingsResult> {
  // Query all transactions with a symbol for this account
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select(
      "symbol, action, quantity, price_per_share, total_amount, transaction_date, asset_type, asset_subtype, cusip, description"
    )
    .eq("account_id", accountId)
    .not("symbol", "is", null)
    .order("transaction_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to query transactions: ${error.message}`);
  }

  if (!transactions || transactions.length === 0) {
    return { derivedPositions: [], symbolCount: 0, totalTransactionsProcessed: 0 };
  }

  // Aggregate per symbol
  const accumulators = new Map<string, SymbolAccumulator>();

  for (const tx of transactions) {
    const symbol = (tx.symbol as string).trim().toUpperCase();
    if (!symbol) continue;

    const action = (tx.action as string).toLowerCase();
    const qty = Number(tx.quantity) || 0;

    let acc = accumulators.get(symbol);
    if (!acc) {
      acc = {
        symbol,
        netQuantity: 0,
        totalBuyQuantity: 0,
        totalBuyAmount: 0,
        latestTransactionDate: tx.transaction_date as string,
        asset_type: tx.asset_type as string | null,
        asset_subtype: tx.asset_subtype as string | null,
        cusip: tx.cusip as string | null,
        description: tx.description as string | null,
      };
      accumulators.set(symbol, acc);
    }

    // Track latest metadata
    if ((tx.transaction_date as string) > acc.latestTransactionDate) {
      acc.latestTransactionDate = tx.transaction_date as string;
    }
    if (tx.asset_type) acc.asset_type = tx.asset_type as string;
    if (tx.asset_subtype) acc.asset_subtype = tx.asset_subtype as string;
    if (tx.cusip) acc.cusip = tx.cusip as string;
    if (tx.description) acc.description = tx.description as string;

    if (qty <= 0) continue; // Skip zero-quantity transactions

    if (QUANTITY_ADDING.has(action)) {
      acc.netQuantity += qty;
      acc.totalBuyQuantity += qty;
      acc.totalBuyAmount += Math.abs(Number(tx.total_amount) || 0);
    } else if (QUANTITY_SUBTRACTING.has(action)) {
      acc.netQuantity -= qty;
    } else if (action === "transfer_in") {
      acc.netQuantity += qty;
      acc.totalBuyQuantity += qty;
      acc.totalBuyAmount += Math.abs(Number(tx.total_amount) || 0);
    } else if (action === "transfer_out") {
      acc.netQuantity -= qty;
    }
    // stock_split, dividend, interest, fee, etc. — skip quantity impact
  }

  // Determine effective snapshot date
  let effectiveDate = snapshotDate;
  if (!effectiveDate) {
    effectiveDate = transactions[0].transaction_date as string;
    for (const tx of transactions) {
      if ((tx.transaction_date as string) > effectiveDate) {
        effectiveDate = tx.transaction_date as string;
      }
    }
  }

  // Convert to ExtractedPosition[], filtering dust and negatives
  const derivedPositions: ExtractedPosition[] = [];

  for (const acc of accumulators.values()) {
    if (acc.netQuantity < DUST_THRESHOLD) continue;

    const averageCostBasis =
      acc.totalBuyQuantity > 0
        ? +(acc.totalBuyAmount / acc.totalBuyQuantity).toFixed(6)
        : null;

    const costBasisTotal =
      averageCostBasis != null
        ? +(averageCostBasis * acc.netQuantity).toFixed(2)
        : null;

    derivedPositions.push({
      snapshot_date: effectiveDate!,
      symbol: acc.symbol,
      cusip: acc.cusip,
      asset_type: acc.asset_type,
      asset_subtype: acc.asset_subtype,
      description: acc.description,
      quantity: +acc.netQuantity.toFixed(6),
      short_quantity: null,
      average_cost_basis: averageCostBasis,
      market_price_per_share: null,
      market_value: null,
      cost_basis_total: costBasisTotal,
      unrealized_profit_loss: null,
      unrealized_profit_loss_pct: null,
    });
  }

  return {
    derivedPositions,
    symbolCount: derivedPositions.length,
    totalTransactionsProcessed: transactions.length,
  };
}
