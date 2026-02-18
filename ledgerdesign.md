# Portsie Ledger Design

Design decisions for extracting, labeling, and storing financial data.

---

## Architecture Overview

A 3-stage pipeline processes uploaded documents into portfolio data:

```
Upload → [Stage 1: LLM Extraction] → [Stage 2: Validation] → [Stage 2.5: Account Matching] → [Stage 3: DB Write]
```

Each stage has a single responsibility and its output is stored for auditability.

---

## Stage 1: LLM Extraction

**Goal:** Convert an uploaded file (PDF, CSV, XLSX, image, OFX) into a structured `PortsieExtraction` JSON object.

### Prompt Design

A single static system prompt (`EXTRACTION_SYSTEM_PROMPT`, ~176 lines) instructs Claude to produce a v1 schema JSON. The prompt is **extraction-only** — it has no knowledge of the user's existing accounts, IDs, or any application state.

**Rationale:** Separation of concerns. The LLM's job is to faithfully extract what's in the document. Account matching is a business-logic decision handled deterministically in Stage 2.5, where it can be audited and overridden by the user.

### Target Schema: PortsieExtraction v1

```
{
  schema_version: 1,
  document: {
    institution_name, document_type, statement_start_date, statement_end_date
  },
  accounts: [
    {
      account_info: { account_number, account_type, institution_name, account_nickname, account_group },
      transactions: [...],
      positions: [...],
      balances: [...]
    }
  ],
  unallocated_positions: [],
  confidence: "high" | "medium" | "low",
  notes: []
}
```

### Closed Enums

Every categorical field uses a closed enum to prevent hallucination:

| Field | Values |
|-------|--------|
| `action` (18) | `buy`, `sell`, `buy_to_cover`, `sell_short`, `dividend`, `capital_gain_long`, `capital_gain_short`, `interest`, `transfer_in`, `transfer_out`, `fee`, `commission`, `stock_split`, `merger`, `spinoff`, `reinvestment`, `journal`, `other` |
| `asset_type` (12) | `EQUITY`, `OPTION`, `MUTUAL_FUND`, `FIXED_INCOME`, `ETF`, `CASH_EQUIVALENT`, `REAL_ESTATE`, `PRECIOUS_METAL`, `VEHICLE`, `JEWELRY`, `COLLECTIBLE`, `OTHER_ASSET` |
| `account_type` (25) | Investment: `individual`, `ira`, `roth_ira`, `joint`, `trust`, `401k`, `403b`, `529`, `custodial`, `margin`, `sep_ira`, `simple_ira`, `rollover_ira`, `inherited_ira`, `education`, `hsa` / Banking: `checking`, `savings` / Debt: `credit_card`, `mortgage`, `heloc`, `auto_loan` / Other: `real_estate`, `view_only`, `other` |
| `document_type` (5) | `portfolio_summary`, `transaction_export`, `tax_1099`, `statement`, `csv_export` |
| `confidence` (3) | `high`, `medium`, `low` |

### Required Fields

- `total_amount` on transactions is **never null** (default 0 if uncomputable).
- `snapshot_date` and `symbol` on positions are **never null**.
- Every account that shows a value gets a `balances[]` entry.
- Multi-account documents produce one `accounts[]` entry per account.

### Unallocated Positions

When a document has a cross-account summary section (e.g., Schwab's "Positions" view that lists holdings by symbol across all accounts), the LLM places those positions in `unallocated_positions[]` rather than guessing which account they belong to. The data writer creates an aggregate account for them.

### LLM Backend

Two pluggable backends, selected per-user via the `llm_settings` table:

| Mode | Backend | Cost | Default |
|------|---------|------|---------|
| CLI | Claude Code Max plan via HTTP wrapper on DO droplet | Free (included in Max) | Yes |
| API | `@anthropic-ai/sdk` with per-user encrypted key | Per-token | No |

**Model:** `claude-opus-4-6`, temperature `0`, max tokens `4096`.

### File Pre-Processing

| File Type | Processing | Sent to LLM as |
|-----------|-----------|-----------------|
| PDF | Base64 encode | Native document content block |
| PNG/JPG | Base64 encode | Native image content block |
| XLSX | SheetJS `sheet_to_csv()` per sheet | Text with `=== Sheet: Name ===` headers |
| CSV | Raw text + parse first 5 rows to JSON | Text + structured sample |
| OFX/QFX | UTF-8 decode | Text |
| TXT/JSON | UTF-8 decode | Text |

For CSV files, the first 5 rows are pre-parsed to JSON and appended to the prompt to help the LLM understand column structure.

---

## Stage 2: Validation

**Goal:** Validate and coerce the LLM's JSON output into a clean `PortsieExtraction` object.

### Validator Design

A hand-written validator (not AJV/Zod) walks the object tree and applies per-field coercions.

**Rationale:** Financial data needs intelligent coercions that schema validators can't express — e.g., stripping `$` and `,` from numbers, converting `($1,234.56)` to `-1234.56`, normalizing date formats, mapping action aliases.

### Type Coercions

| Field | Coercion |
|-------|----------|
| Dates | `MM/DD/YYYY` → `YYYY-MM-DD`; handles "as of" prefixes |
| Numbers | Strips `$`, `,`; parens to negative: `($1,234.56)` → `-1234.56` |
| `action` | 40+ aliases: `"purchase"` → `"buy"`, `"div"` → `"dividend"`, etc. |
| `asset_type` | Case-normalize + aliases: `"stock"` → `"EQUITY"`, `"bond"` → `"FIXED_INCOME"` |
| `account_type` | Case-normalize + aliases: `"brokerage"` → `"individual"`, `"solo_401k"` → `"401k"` |
| `total_amount` | If null, compute from `quantity * price_per_share` or default to `0` |

### Filtering Strategy

Invalid items are **dropped** (not fatal). Each drop is recorded as a warning. The extraction only fails if the `accounts[]` array is empty after filtering.

### Backward Compatibility

If the LLM returns a flat structure (no `accounts[]` array but top-level `transactions`/`positions`/`balances`), the validator wraps it into a single-account structure automatically.

### Markdown Fence Stripping

The validator strips ` ```json ... ``` ` fences and extracts the outermost `{ ... }` if JSON is embedded in surrounding text.

---

## Stage 2.5: Account Matching

**Goal:** Map each extracted account to an existing user account (or flag for creation).

### Matching Algorithm

Fully deterministic — no LLM involved. Priority order (first match wins):

| Priority | Method | Confidence |
|----------|--------|------------|
| 1 | Exact account number match (after stripping `...`/`.` prefixes) | HIGH |
| 2 | Last-4-digit account number overlap | HIGH |
| 3 | Last-3-digit match + same institution | HIGH |
| 4 | Last-3-digit match, different institution | MEDIUM |
| 5 | Institution + account type match (only if unambiguous — exactly 1 candidate) | MEDIUM |
| 6 | Institution + nickname substring match | MEDIUM |
| 7 | No match → create new account | HIGH |

**Rationale:** Deterministic matching is reproducible, auditable, and costs nothing. The user can review and override any match before confirming. An LLM-based matcher would be non-deterministic and expensive for a low-stakes decision.

### Institution Normalization

```
"Charles Schwab & Co., Inc." → "charles schwab"
"Bank of America"            → "bank of america"
```

Strips: `&`, `,`, `.`, `inc`, `llc`, `corp`, `co` (word boundary).

### Aggregate Account Handling

`unallocated_positions` are assigned to an aggregate account (searched by institution, created if not found). Aggregate accounts are flagged `is_aggregate = true` and excluded from regular matching candidates.

### User Override

The confirm endpoint accepts optional `accountMapOverrides` to let the user correct any mapping before data is written.

---

## Stage 3: DB Write

**Goal:** Write validated, matched data into canonical tables.

### Tables Written

| Table | Purpose | Mutability |
|-------|---------|------------|
| `accounts` | Account metadata + summary columns | Mutable (upsert) |
| `holdings` | Current active holdings per account-symbol | Mutable (reconciled) |
| `position_snapshots` | Historical point-in-time positions | Immutable (append-only) |
| `balance_snapshots` | Historical account balances | Immutable (append-only) |
| `transactions` | Buy/sell/dividend history | Append-only |

### Holdings Reconciliation

The `holdings` table is the **current state** of what a user owns. On each extraction:

1. Fetch current holdings for the account.
2. Deduplicate incoming positions by symbol (sum quantities if duplicated).
3. For each incoming position:
   - **New symbol** → insert.
   - **Existing, quantity changed** → update.
   - **Existing, same quantity, value changed** → update value.
4. For each existing holding **not in incoming** (if extraction is a full snapshot):
   - Set `quantity = 0` (marks as closed, not deleted).

Change types tracked: `new_position`, `closed_position`, `quantity_change`, `value_update`.

### Position Deduplication

Key: `(snapshot_date, symbol)`. If the same symbol appears twice for the same date (common in aggregate sections), quantities and values are summed. This happens **before** writing to either `holdings` or `position_snapshots`.

### Balance Deduplication

Key: `snapshot_date`. If multiple balance entries exist for the same date, non-null fields are merged (keep most complete).

### Account Summary Recomputation

After writing holdings, the `accounts` row is recomputed:

```
equity_value   = sum(holdings.market_value) where quantity > 0
total_market_value = liquidation_value  (if available from balance)
                   | equity_value + cash_balance  (fallback)
holdings_count = count(holdings) where quantity > 0
```

**Decision:** Prefer `liquidation_value` from the statement over computed `equity + cash`, because the statement's stated total is more trustworthy than a recomputation.

### Liability Representation

Liabilities (credit cards, mortgages, HELOCs, auto loans) are stored as **negative `liquidation_value`** in the same `accounts` table.

**Rationale:** Net worth = assets - liabilities. A single table with positive/negative values makes aggregation intuitive and avoids a separate liability table.

---

## Portfolio Classification

**Goal:** Classify all holdings into asset classes for dashboard display.

### 8 Asset Classes

| ID | Label | Examples |
|----|-------|---------|
| `tech_equities` | Tech Equities | TSLA, NVDA, AAPL, GOOGL, META, AMD, PLTR |
| `tech_options` | Tech Options | TSLA calls/puts, NVDA options |
| `non_tech_equities` | Non-Tech Equities | BRK/B, KO, SPY, VOO, mutual funds |
| `crypto` | Crypto | Bitcoin ETFs (IBIT, ARKB), Ethereum ETFs (ETHA, EZET), crypto stocks (MSTR, BMNR) |
| `gold_metals` | Gold & Metals | GLDM, GLD, IAU, gold miners |
| `real_estate` | Real Estate | VNQ, REITs, BREFX |
| `debt` | Debt | Bonds, fixed income |
| `cash` | Cash | SNOXX, money market, cash balances |

### Classification Algorithm

```
1. If instrument is OPTION → check if underlying is tech → tech_options (else tech_options default)
2. Exact symbol lookup against hardcoded sets (TECH_SYMBOLS, CRYPTO_SYMBOLS, etc.)
3. Description heuristics ("ETHEREUM" → crypto, "GOLD" → gold_metals, etc.)
4. Instrument type fallback (MUTUAL_FUND → non_tech_equities)
5. Default → non_tech_equities
```

**Design decision: hardcoded symbol sets** (~130 tickers across all categories). Deterministic, fast, version-controlled. New/unknown tickers fall back to description heuristics. The set covers the user's actual portfolio holdings.

### Crypto Sub-Aggregates

Crypto positions are further grouped: Bitcoin ETFs, Ethereum ETFs, Crypto Stocks, Other Crypto.

### Portfolio Metrics

| Metric | Formula |
|--------|---------|
| Total Market Value | `sum(positions.marketValue) + sum(accounts.cashBalance)` |
| Day Change % | `totalDayChange / (totalMV - totalDayChange) * 100` |
| HHI | `sum(position.allocationPct²)` — range 0-10,000 |
| Diversification Score | `max(1, min(10, round(10 - (HHI / 10000) * 9)))` — 1-10 scale |
| Safe Withdrawal | `totalMV * 0.04` (4% rule) |

---

## Dashboard Data Flow

The `/api/portfolio/positions` route unifies data from two sources:

1. **Schwab API** (live, if connected) — real-time positions and balances.
2. **Holdings table** (stored truth from uploads) — split into regular and aggregate.

### Aggregate Merge Logic

When individual accounts have no holdings but an aggregate account does (common with uploaded statements where positions are unallocated), aggregate positions are merged into the primary array:

```typescript
if (aggregatePositions.length > 0 && positions.length === 0) {
  positions.push(...aggregatePositions);
}
```

This prevents the dashboard from showing only cash when the real equity data exists in the aggregate.

### What the Dashboard Computes

```
totalMarketValue = sum(position.marketValue) + sum(account.cashBalance)
holdingCount     = count(positions)
cashValue        = sum(account.cashBalance)
```

Positions drive the asset allocation chart, holdings count, and per-class breakdowns. Account cash balances contribute to the cash class.

---

## Database Schema

### Core Tables

**`accounts`** — User portfolio accounts.
- `user_id` → `auth.users(id)` with `ON DELETE CASCADE`
- `data_source`: `'schwab_api' | 'manual_upload' | 'manual_entry'`
- `is_aggregate`: true for cross-account aggregate containers
- Summary columns: `total_market_value`, `equity_value`, `cash_balance`, `holdings_count`
- RLS: users only see their own accounts

**`holdings`** — Current active holdings (mutable, reconciled on each upload).
- Unique on: `(account_id, COALESCE(symbol, ''))`
- `quantity = 0` means closed (filtered out of dashboard queries)
- `last_updated_from`: traces to source upload ID (`upload:{uuid}`)
- `valuation_source`: `'statement' | 'api'`

**`position_snapshots`** — Immutable historical positions.
- Upsert on: `(account_id, snapshot_date, symbol, snapshot_type)`
- `snapshot_type`: `'manual' | 'api'`
- Never deleted; append-only record of what was held at each point in time

**`balance_snapshots`** — Immutable historical account balances.
- Upsert on: `(account_id, snapshot_date, snapshot_type)`
- Stores: `liquidation_value`, `cash_balance`, `equity`, `buying_power`

**`transactions`** — Buy/sell/dividend/fee history.
- Upsert on: `(account_id, external_transaction_id)`
- `external_transaction_id` synthesized from transaction fields for dedup

**`uploaded_statements`** — Upload metadata and extraction results.
- Lifecycle: `pending` → `processing` → `extracted` → `completed` | `partial` | `failed`
- Stores `extracted_data` (validated JSON), `raw_llm_response` (audit), `account_mappings`
- File hash (SHA-256) for deduplication — re-uploads skip extraction

**`extraction_failures`** — Logs failed extractions for pattern analysis.
- `attempt_number`, `error_message`, `llm_mode`, `file_type`, `file_size_bytes`

### Key Schema Patterns

- **RLS everywhere:** All user-scoped tables enforce `auth.uid() = user_id`.
- **Encryption:** Sensitive data (tokens, API keys) encrypted with AES-256-GCM via `SCHWAB_TOKEN_ENCRYPTION_KEY`.
- **`updated_at` triggers:** Auto-maintained on all mutable tables.
- **Idempotent migrations:** All use `IF NOT EXISTS` / `CREATE OR REPLACE`.

---

## Upload Deduplication

Files are SHA-256 hashed on upload. If a duplicate is found for the same user:
- If already processed: carry over `extracted_data`, `raw_llm_response`, `parsed_at`, etc.
- Prevents redundant LLM calls for identical re-uploads.

Max file size: 50MB. Storage path: `{user_id}/{timestamp}_{filename}` in `statements` bucket.

---

## Audit Trail

Every stage's output is preserved:

| Stage | Stored In | Field |
|-------|-----------|-------|
| Raw LLM output | `uploaded_statements` | `raw_llm_response` |
| Validated extraction | `uploaded_statements` | `extracted_data` |
| Account mappings | `uploaded_statements` | `account_mappings` |
| Write results | `uploaded_statements` | `confirmed_at` + canonical tables |
| Holding provenance | `holdings` | `last_updated_from` (e.g., `upload:abc123`) |
| Failed extractions | `extraction_failures` | Full error context |

---

## Key Design Decisions Summary

| Decision | Choice | Why |
|----------|--------|-----|
| LLM sees no user context | Extraction-only prompt | Separation of concerns; matching is auditable business logic |
| Hand-written validator | Not AJV/Zod | Need intelligent financial coercions ($, commas, parens, date formats) |
| Deterministic account matching | No LLM in Stage 2.5 | Reproducible, free, auditable, user can override |
| Hardcoded symbol sets | ~130 tickers | Deterministic classification, covers real portfolio, unknown tickers fall through to heuristics |
| Negative values for liabilities | Same table as assets | Net worth = assets - liabilities in one query |
| `quantity = 0` for closed positions | Not deleted | Preserves history; filtered out of active queries |
| Prefer `liquidation_value` over computed total | Statement is source of truth | Avoids rounding errors from recomputing equity + cash |
| Schema version in extraction | `schema_version: 1` | Future-proof for safe schema evolution |
| File hash deduplication | SHA-256 | Skip extraction for identical re-uploads |
| Aggregate account for unallocated positions | `is_aggregate = true` | Handles cross-account summaries without guessing account assignment |
