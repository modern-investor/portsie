-- Fix accounts with inflated total_market_value.
-- These accounts have a large total_market_value from LLM-extracted
-- liquidation_value but zero holdings to back them up. Reset their
-- total_market_value to equity_value + cash_balance (which is the
-- computed total from actual position data).

UPDATE accounts
SET total_market_value = COALESCE(equity_value, 0) + COALESCE(cash_balance, 0),
    updated_at = now()
WHERE holdings_count = 0
  AND ABS(total_market_value) > 1000
  AND ABS(COALESCE(equity_value, 0)) < ABS(total_market_value) * 0.5;
