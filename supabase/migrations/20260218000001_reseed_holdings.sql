-- Re-seed holdings from position_snapshots.
-- The original seed (20260217200003) ran before any data was uploaded,
-- so the holdings table remained empty. This migration populates it.

-- ── 1. Seed holdings from latest position snapshots ──
INSERT INTO holdings (
  user_id, account_id, symbol, name, cusip, asset_type, asset_category,
  description, quantity, quantity_unit, short_quantity,
  purchase_price, cost_basis_total,
  current_price, market_value, valuation_date, valuation_source,
  day_profit_loss, day_profit_loss_pct,
  unrealized_profit_loss, unrealized_profit_loss_pct,
  data_source, last_updated_from
)
SELECT
  ps.user_id,
  ps.account_id,
  ps.symbol,
  COALESCE(ps.name, ps.symbol),
  ps.cusip,
  COALESCE(ps.asset_type, 'EQUITY'),
  'tradeable',
  ps.description,
  ps.quantity,
  'shares',
  COALESCE(ps.short_quantity, 0),
  ps.average_cost_basis,
  ps.cost_basis_total,
  ps.market_price_per_share,
  ps.market_value,
  ps.snapshot_date,
  'statement',
  ps.day_profit_loss,
  ps.day_profit_loss_pct,
  ps.unrealized_profit_loss,
  ps.unrealized_profit_loss_pct,
  ps.data_source,
  'reseed_from_snapshots'
FROM position_snapshots ps
INNER JOIN (
  SELECT account_id, MAX(snapshot_date) AS max_date
  FROM position_snapshots
  GROUP BY account_id
) latest ON ps.account_id = latest.account_id AND ps.snapshot_date = latest.max_date
WHERE ps.quantity > 0
ON CONFLICT (account_id, COALESCE(symbol, ''), name) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  current_price = EXCLUDED.current_price,
  market_value = EXCLUDED.market_value,
  valuation_date = EXCLUDED.valuation_date,
  cost_basis_total = EXCLUDED.cost_basis_total,
  purchase_price = EXCLUDED.purchase_price,
  unrealized_profit_loss = EXCLUDED.unrealized_profit_loss,
  unrealized_profit_loss_pct = EXCLUDED.unrealized_profit_loss_pct,
  last_updated_from = EXCLUDED.last_updated_from;

-- ── 2. Recompute account summaries from holdings ──
UPDATE accounts a
SET
  holdings_count = sub.cnt,
  total_market_value = COALESCE(sub.total_mv, a.total_market_value),
  equity_value = COALESCE(sub.total_mv, a.equity_value),
  last_synced_at = now()
FROM (
  SELECT account_id, COUNT(*) AS cnt, SUM(COALESCE(market_value, 0)) AS total_mv
  FROM holdings
  WHERE quantity > 0
  GROUP BY account_id
) sub
WHERE a.id = sub.account_id;

-- ── 3. Also apply latest balance snapshot data to accounts ──
UPDATE accounts a
SET
  total_market_value = COALESCE(sub.liquidation_value, a.total_market_value),
  cash_balance = COALESCE(sub.cash_balance, a.cash_balance),
  equity_value = COALESCE(sub.equity, a.equity_value),
  buying_power = COALESCE(sub.buying_power, a.buying_power),
  last_synced_at = COALESCE(sub.created_at, a.last_synced_at)
FROM (
  SELECT DISTINCT ON (account_id)
    account_id,
    liquidation_value,
    cash_balance,
    equity,
    buying_power,
    created_at
  FROM balance_snapshots
  ORDER BY account_id, snapshot_date DESC, created_at DESC
) sub
WHERE a.id = sub.account_id;
