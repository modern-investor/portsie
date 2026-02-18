-- Migration: Add uploaded_statement_id FK to snapshot tables
-- Enables precise cleanup of snapshot data when a quality check fix
-- needs to clear and re-write data for a specific upload.

ALTER TABLE position_snapshots
  ADD COLUMN IF NOT EXISTS uploaded_statement_id UUID REFERENCES uploaded_statements(id) ON DELETE SET NULL;

ALTER TABLE balance_snapshots
  ADD COLUMN IF NOT EXISTS uploaded_statement_id UUID REFERENCES uploaded_statements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_position_snapshots_statement
  ON position_snapshots(uploaded_statement_id) WHERE uploaded_statement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_balance_snapshots_statement
  ON balance_snapshots(uploaded_statement_id) WHERE uploaded_statement_id IS NOT NULL;
