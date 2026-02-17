-- Prevent duplicate manual-upload accounts with the same account number per user.
-- Uses the existing schwab_account_number column (generic text field, not Schwab-specific).
-- Only applies when schwab_account_number IS NOT NULL so it does not conflict
-- with Schwab API accounts that use schwab_account_hash for uniqueness.

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_manual_account_number
  ON accounts (user_id, schwab_account_number)
  WHERE schwab_account_number IS NOT NULL
    AND data_source = 'manual_upload';
