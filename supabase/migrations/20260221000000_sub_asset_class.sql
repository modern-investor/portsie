-- Add sub_asset_class column to holdings for second-level asset classification.
-- Computed at ingestion time. Used by the treemap visualization.
-- Values match the SubAssetClassId type in the frontend.

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS sub_asset_class TEXT;

-- Also add asset_subtype if not already present (for display grouping in positions table)
-- (already added in 20260218600000_asset_subtype.sql, but IF NOT EXISTS is safe)
ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS asset_subtype TEXT;

COMMENT ON COLUMN holdings.sub_asset_class IS
  'Second-level asset class (e.g. tech_individual, bitcoin_etf, broad_market_etfs). Computed during ingestion.';
