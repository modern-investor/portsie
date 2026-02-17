-- Extend position_snapshots with offline-asset-aware columns.
-- Historical snapshots should capture the same richness as the holdings table
-- so users can build arbitrary charts from any point in time.

ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS asset_category TEXT DEFAULT 'tradeable';
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS quantity_unit TEXT DEFAULT 'shares';
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(18, 6);
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS valuation_source TEXT;
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Backfill name from symbol for all existing rows
UPDATE position_snapshots SET name = symbol WHERE name IS NULL AND symbol IS NOT NULL;

-- Make name NOT NULL going forward (after backfill)
ALTER TABLE position_snapshots ALTER COLUMN name SET NOT NULL;
