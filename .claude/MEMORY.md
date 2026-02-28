# Session Memory

## 2026-02-28: Audit & fix upload diagnostics pipeline to DO CLI wrapper

- **Verified working**: Extract route → DO `/diagnostics` → JSONL + Claude analysis → `failure_analyses` table. 3 real analyses already in DB with quality root-cause analysis.
- **Fixed gap**: Confirm and verify routes had NO diagnostics reporting. Added `ProcessingLogger` + `sendDiagnostics()` to both, with step tracking (matching/writing/verifying).
- **Extracted shared utility**: Moved `sendDiagnostics()` from extract route into `src/lib/extraction/processing-log.ts`. All 3 routes now import from shared module.
- **Added userId/stage context**: CLI wrapper now receives `userId` and `stage` in payload so failure analyses for confirm/verify stages get proper user attribution (since they don't create `extraction_failures` rows).

## 2026-02-28: Fix dashboard empty state after transaction-only CSV upload

- **Problem**: Robinhood CSV upload processed successfully (49 transactions) but dashboard showed "No portfolio data" because the CSV had no positions/balances — only transaction history.
- **Fix**: Created `src/lib/holdings/derive-from-transactions.ts` — derives net holdings from ALL transactions for an account (buys add, sells subtract), then feeds `ExtractedPosition[]` into existing `reconcileHoldings`. Integrated into both `db-writer.ts` (primary) and `data-writer.ts` (legacy).
- **Backfill**: Ran one-off script to derive holdings for existing Robinhood account → 3 holdings created (CLOV 45 shares, TSLA 211.5 shares, HOOD 23.78 shares). Market values are null until "Refresh Prices" is clicked.
- **Note**: TSLA shows `asset_type: "OPTION"` because latest TSLA transaction was an options buy — could improve asset_type inference to prefer EQUITY when mixed. The diagnostics tab (Settings > Diagnostics) shows processing logs and is admin-only for the detailed view.
