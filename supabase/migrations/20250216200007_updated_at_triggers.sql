-- Auto-update updated_at timestamps
-- Reusable trigger function for all tables with updated_at column

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- New tables
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_uploaded_statements_updated_at
  BEFORE UPDATE ON uploaded_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill triggers on existing tables (they have updated_at but no auto-update trigger)
CREATE TRIGGER update_schwab_tokens_updated_at
  BEFORE UPDATE ON schwab_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schwab_credentials_updated_at
  BEFORE UPDATE ON schwab_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
