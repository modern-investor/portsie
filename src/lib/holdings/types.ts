/** A current holding — one row per (account, asset) in the holdings table. */
export interface Holding {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string | null;
  name: string;
  cusip: string | null;
  asset_type: string;
  asset_category: "tradeable" | "offline";
  description: string | null;
  quantity: number;
  quantity_unit: string;
  short_quantity: number;
  purchase_date: string | null;
  purchase_price: number | null;
  cost_basis_total: number | null;
  current_price: number | null;
  market_value: number | null;
  valuation_date: string | null;
  valuation_source: string | null;
  day_profit_loss: number | null;
  day_profit_loss_pct: number | null;
  unrealized_profit_loss: number | null;
  unrealized_profit_loss_pct: number | null;
  metadata: Record<string, unknown>;
  data_source: string;
  last_updated_from: string | null;
  created_at: string;
  updated_at: string;
}

/** A change detected during reconciliation of incoming data vs. existing holdings. */
export interface ReconciliationChange {
  type:
    | "new_position"
    | "closed_position"
    | "quantity_change"
    | "value_update";
  symbol: string | null;
  name: string;
  accountId: string;
  previous?: { quantity: number; market_value: number | null };
  current?: { quantity: number; market_value: number | null };
}

/** Result of a full reconciliation + write cycle. */
export interface ReconciliationResult {
  changes: ReconciliationChange[];
  holdingsUpdated: number;
  holdingsCreated: number;
  holdingsClosed: number;
  snapshotsWritten: number;
  transactionsCreated: number;
}
