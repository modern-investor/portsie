-- Multi-account extraction support:
-- 1. Account grouping (e.g., "Non Retirement", "SubTrust", "Other People's Money")
-- 2. Track all accounts linked from a single upload
-- 3. Expand account categories beyond brokerage/offline

-- ── 1. Account group column ──
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_group TEXT;

-- ── 2. Track multi-account uploads ──
ALTER TABLE uploaded_statements ADD COLUMN IF NOT EXISTS linked_account_ids UUID[] DEFAULT '{}';

-- ── 3. Expand account_category to cover banking, credit, and loan account types ──
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_category_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_category_check
  CHECK (account_category IN ('brokerage', 'offline', 'banking', 'credit', 'loan', 'real_estate'));
