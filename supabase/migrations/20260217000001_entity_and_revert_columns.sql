-- Add entity_id to accounts (nullable for backward compat with existing rows)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX idx_accounts_entity_id ON accounts(entity_id);

-- Add uploaded_statement_id to position_snapshots (enables revert of confirmed uploads)
ALTER TABLE position_snapshots
  ADD COLUMN IF NOT EXISTS uploaded_statement_id UUID
    REFERENCES uploaded_statements(id) ON DELETE SET NULL;

CREATE INDEX idx_position_snapshots_statement
  ON position_snapshots(uploaded_statement_id);

-- Add uploaded_statement_id to balance_snapshots (enables revert of confirmed uploads)
ALTER TABLE balance_snapshots
  ADD COLUMN IF NOT EXISTS uploaded_statement_id UUID
    REFERENCES uploaded_statements(id) ON DELETE SET NULL;

CREATE INDEX idx_balance_snapshots_statement
  ON balance_snapshots(uploaded_statement_id);
