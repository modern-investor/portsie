-- Add is_aggregate flag to accounts and expand account_category CHECK constraint.
--
-- is_aggregate = true means the account holds aggregate/combined positions
-- that span multiple real accounts (e.g. Schwab summary "Positions" section).
-- These should NOT be double-counted in portfolio totals when real per-account
-- data is also available.

-- ── 1. Add is_aggregate column ──
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_aggregate BOOLEAN NOT NULL DEFAULT false;

-- Index for fast filtering of aggregate vs real accounts
CREATE INDEX IF NOT EXISTS idx_accounts_is_aggregate ON accounts(user_id, is_aggregate);

-- ── 2. Expand account_category CHECK constraint ──
-- Current constraint only allows ('brokerage', 'offline').
-- The accountTypeToCategory() function in account-matcher.ts already returns
-- 'banking', 'credit', 'loan', 'real_estate' but they fail the DB constraint.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_category_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_category_check
  CHECK (account_category IN ('brokerage', 'offline', 'banking', 'credit', 'loan', 'real_estate'));
