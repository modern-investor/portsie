-- Reclassify real_estate accounts to brokerage.
-- Real estate is an asset type (position-level), not an account type.
-- Brokerage accounts that hold real estate assets should be categorized as 'brokerage'.

-- 1. Update existing real_estate accounts → brokerage
UPDATE accounts SET account_category = 'brokerage' WHERE account_category = 'real_estate';

-- 2. Also reclassify account_type from 'real_estate' to 'other' for any existing rows
UPDATE accounts SET account_type = 'other' WHERE account_type = 'real_estate';

-- 3. Tighten the CHECK constraint (remove 'real_estate')
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_category_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_category_check
  CHECK (account_category IN ('brokerage', 'offline', 'banking', 'credit', 'loan'));
