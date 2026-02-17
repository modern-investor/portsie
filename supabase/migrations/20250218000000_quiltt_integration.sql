-- Quiltt Open Banking integration
-- Adds Quiltt as a data source, creates quiltt_profiles table, extends accounts table

-- ============================================================================
-- 1. Extend data_source CHECK constraints to include 'quiltt'
-- ============================================================================

-- accounts
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_data_source_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_data_source_check
  CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry', 'quiltt'));

-- position_snapshots
ALTER TABLE position_snapshots DROP CONSTRAINT IF EXISTS position_snapshots_data_source_check;
ALTER TABLE position_snapshots ADD CONSTRAINT position_snapshots_data_source_check
  CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry', 'quiltt'));

-- balance_snapshots
ALTER TABLE balance_snapshots DROP CONSTRAINT IF EXISTS balance_snapshots_data_source_check;
ALTER TABLE balance_snapshots ADD CONSTRAINT balance_snapshots_data_source_check
  CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry', 'quiltt'));

-- transactions
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_data_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_data_source_check
  CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry', 'quiltt'));

-- ============================================================================
-- 2. Extend snapshot_type CHECK constraints to include 'quiltt_sync'
-- ============================================================================

-- position_snapshots
ALTER TABLE position_snapshots DROP CONSTRAINT IF EXISTS position_snapshots_snapshot_type_check;
ALTER TABLE position_snapshots ADD CONSTRAINT position_snapshots_snapshot_type_check
  CHECK (snapshot_type IN ('daily_auto', 'manual', 'on_login', 'api_sync', 'quiltt_sync'));

-- balance_snapshots
ALTER TABLE balance_snapshots DROP CONSTRAINT IF EXISTS balance_snapshots_snapshot_type_check;
ALTER TABLE balance_snapshots ADD CONSTRAINT balance_snapshots_snapshot_type_check
  CHECK (snapshot_type IN ('daily_auto', 'manual', 'on_login', 'api_sync', 'quiltt_sync'));

-- ============================================================================
-- 3. Add Quiltt-specific columns to accounts table
-- ============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS quiltt_account_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS quiltt_connection_id TEXT;

-- A user can only link a given Quiltt account once
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_quiltt_account
  ON accounts(user_id, quiltt_account_id)
  WHERE quiltt_account_id IS NOT NULL;

-- Look up accounts by Quiltt connection ID (for webhook handling)
CREATE INDEX IF NOT EXISTS idx_accounts_quiltt_connection
  ON accounts(quiltt_connection_id)
  WHERE quiltt_connection_id IS NOT NULL;

-- ============================================================================
-- 4. Create quiltt_profiles table (maps Portsie users to Quiltt profiles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiltt_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  quiltt_profile_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiltt_profiles_user_id ON quiltt_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_quiltt_profiles_profile_id ON quiltt_profiles(quiltt_profile_id);

ALTER TABLE quiltt_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own Quiltt profile' AND tablename = 'quiltt_profiles') THEN
    CREATE POLICY "Users can view own Quiltt profile"
      ON quiltt_profiles FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own Quiltt profile' AND tablename = 'quiltt_profiles') THEN
    CREATE POLICY "Users can insert own Quiltt profile"
      ON quiltt_profiles FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own Quiltt profile' AND tablename = 'quiltt_profiles') THEN
    CREATE POLICY "Users can update own Quiltt profile"
      ON quiltt_profiles FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own Quiltt profile' AND tablename = 'quiltt_profiles') THEN
    CREATE POLICY "Users can delete own Quiltt profile"
      ON quiltt_profiles FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on quiltt_profiles' AND tablename = 'quiltt_profiles') THEN
    CREATE POLICY "Service role full access on quiltt_profiles"
      ON quiltt_profiles FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
