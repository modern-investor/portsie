-- Seed holdings table from the latest position_snapshots per account.
-- Also populate account summary columns from latest balance_snapshots.
-- This is a one-time migration to bootstrap the holdings-as-truth model.

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
  COALESCE(ps.name, ps.symbol),          -- name (backfilled from symbol)
  ps.cusip,
  COALESCE(ps.asset_type, 'EQUITY'),
  'tradeable',                            -- all existing snapshots are tradeable
  ps.description,
  ps.quantity,
  'shares',
  COALESCE(ps.short_quantity, 0),
  ps.average_cost_basis,                  -- purchase_price = average_cost_basis
  ps.cost_basis_total,
  ps.market_price_per_share,              -- current_price = market_price_per_share
  ps.market_value,
  ps.snapshot_date,                       -- valuation_date = snapshot_date
  'statement',                            -- valuation_source
  ps.day_profit_loss,
  ps.day_profit_loss_pct,
  ps.unrealized_profit_loss,
  ps.unrealized_profit_loss_pct,
  ps.data_source,
  'seed_from_snapshots'
FROM position_snapshots ps
INNER JOIN (
  -- Get the latest snapshot_date per account
  SELECT account_id, MAX(snapshot_date) AS max_date
  FROM position_snapshots
  GROUP BY account_id
) latest ON ps.account_id = latest.account_id AND ps.snapshot_date = latest.max_date
WHERE ps.quantity > 0
ON CONFLICT (account_id, COALESCE(symbol, ''), name) DO NOTHING;

-- ── 2. Seed account summary columns from latest balance snapshots ──
UPDATE accounts a
SET
  total_market_value = sub.liquidation_value,
  cash_balance = sub.cash_balance,
  equity_value = sub.equity,
  buying_power = sub.buying_power,
  last_synced_at = sub.created_at
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

-- ── 3. Compute holdings_count per account from the seeded holdings ──
UPDATE accounts a
SET holdings_count = sub.cnt
FROM (
  SELECT account_id, COUNT(*) AS cnt
  FROM holdings
  WHERE quantity > 0
  GROUP BY account_id
) sub
WHERE a.id = sub.account_id;

-- ── 4. For accounts without balance snapshots, compute total_market_value from holdings ──
UPDATE accounts a
SET
  total_market_value = sub.total_mv,
  equity_value = sub.total_mv,
  last_synced_at = now()
FROM (
  SELECT account_id, SUM(COALESCE(market_value, 0)) AS total_mv
  FROM holdings
  WHERE quantity > 0
  GROUP BY account_id
) sub
WHERE a.id = sub.account_id
  AND a.total_market_value IS NULL;
