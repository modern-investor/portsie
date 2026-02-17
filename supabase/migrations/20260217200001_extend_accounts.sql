-- Extend accounts table with stored summary columns and offline asset support.
-- Summary columns are recomputed on each data ingestion so the dashboard
-- reads stored values instead of summing position rows on the fly.

-- ── Summary columns ──
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS total_market_value NUMERIC(18, 2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cash_balance NUMERIC(18, 2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS equity_value NUMERIC(18, 2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS buying_power NUMERIC(18, 2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS holdings_count INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- ── Expand data_source to include offline assets ──
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_data_source_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_data_source_check
  CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry', 'quiltt', 'offline'));

-- ── Account category: brokerage vs offline ──
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_category TEXT NOT NULL DEFAULT 'brokerage';

-- Add check constraint only if not exists (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_account_category_check'
  ) THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_account_category_check
      CHECK (account_category IN ('brokerage', 'offline'));
  END IF;
END $$;
