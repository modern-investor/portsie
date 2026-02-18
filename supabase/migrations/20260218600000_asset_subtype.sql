-- Add asset_subtype column to holdings, position_snapshots, and transactions.
-- Free-text field for subcategory labels (e.g., "Jewelry", "Art" for COLLECTIBLE;
-- "Classic Car", "Cryptocurrency" for OTHER_ASSET).

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS asset_subtype TEXT;
ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS asset_subtype TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asset_subtype TEXT;
