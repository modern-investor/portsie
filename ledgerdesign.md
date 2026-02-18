# Portsie Ledger Design

Design decisions for extracting, labeling, and storing financial data.

---

## Architecture Overview

A 3-stage pipeline processes uploaded documents into portfolio data:

```
Upload → [Stage 1: LLM Extraction] → [Stage 2: Validation] → [Stage 2.5: Account Matching] → [Stage 3: DB Write]
```

Each stage has a single responsibility and its output is stored for auditability. Stages are decoupled so that any one can be re-run independently — e.g., a failed write can be retried without re-extracting, or a new validator can be applied to existing raw LLM output.

---

## Stage 1: LLM Extraction

**Goal:** Convert an uploaded file (PDF, CSV, XLSX, image, OFX) into a structured `PortsieExtraction` JSON object.

### Prompt Design

The extraction prompt has two layers:

1. **Base prompt** (~176 lines) — instructs the LLM to produce a PortsieExtraction v1 JSON. This is the extraction-only core: faithfully transcribe what's in the document.
2. **Dynamic account-matching section** — appended at runtime by `buildExtractionPrompt()`. Injects the user's existing accounts (up to 100) and instructs the LLM to return an `account_link` decision per extracted account: `match_existing` (with the existing account's UUID) or `create_new`.

The LLM returns both extraction data and account matching decisions in a single response, at zero extra cost.

**Design evolution.** We originally kept the prompt extraction-only with no user context, arguing that injecting account state would couple extraction to matching, make results non-reproducible, and make debugging harder. We reversed this after observing that:
- LLM semantic matching (institution abbreviations, account renames, partial number overlap) consistently outperforms heuristic fuzzy matching.
- Extraction quality is unaffected — the `account_link` field is orthogonal to the data fields. The LLM still faithfully extracts; it just also returns a matching opinion.
- A deterministic heuristic validator catches the cases where the LLM might hallucinate (see Stage 2.5 below).
- The user can still override any match via the confirm UI before data is written.
- As models improve, matching accuracy improves automatically — no code changes needed.

**Prompt injection defense.** Account data injected into the prompt is sanitized: nicknames and institution names are truncated to 50 characters with newlines stripped. The account list is wrapped in structured JSON between `--- USER'S EXISTING ACCOUNTS ---` / `--- END ACCOUNTS ---` delimiters. UUIDs returned by the LLM are validated against the injected list (regex + DB ownership check).

### Target Schema: PortsieExtraction v1

```
{
  schema_version: 1,
  document: {
    institution_name, document_type, statement_start_date, statement_end_date
  },
  accounts: [
    {
      account_link: {
        action: "match_existing" | "create_new",
        existing_account_id: uuid | null,
        match_confidence: "high" | "medium" | "low",
        match_reason: string
      },
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

**Why closed enums instead of free text?** LLMs hallucinate creative category names (`"Long-Term Equity Investment"` instead of `"EQUITY"`). Closed enums force the output into known values that downstream code can switch on without string-matching heuristics. The validator maps common synonyms back to canonical values (40+ aliases for `action` alone), so the LLM doesn't need to guess the exact token.

### Required Fields

- `total_amount` on transactions is **never null** (default 0 if uncomputable).
- `snapshot_date` and `symbol` on positions are **never null**.
- Every account that shows a value gets a `balances[]` entry.
- Multi-account documents produce one `accounts[]` entry per account.

**Why require `total_amount`?** Transactions with null amounts are useless for portfolio accounting. By forcing the LLM to always provide a value (even 0), we avoid downstream null-handling complexity. The validator computes `quantity * price_per_share` as a fallback if the LLM omits it.

### Unallocated Positions

When a document has a cross-account summary section (e.g., Schwab's "Positions" view that lists holdings by symbol across all accounts), the LLM places those positions in `unallocated_positions[]` rather than guessing which account they belong to.

**Why not force the LLM to assign positions to accounts?** The Schwab expanded positions view shows holdings grouped by ticker, then broken down by sub-account. But the summary section lists accounts separately from positions, and the LLM would need to cross-reference account numbers between sections — a fragile heuristic that's wrong more often than it's right. Instead, we let the LLM honestly report what it sees (positions with no clear account assignment) and handle the mapping deterministically in the data writer via aggregate accounts.

### LLM Backend

Three pluggable backends, selected per-user via the `llm_settings` table:

| Mode | Backend | Cost | Default |
|------|---------|------|---------|
| Gemini | Google Gemini 3 Flash via REST API | Server-side API key (free tier) | Yes |
| CLI | Claude Sonnet 4.6 via HTTP wrapper on DO droplet | Free (Max plan) | Fallback |
| API | Anthropic SDK with per-user encrypted key | Per-token | User override |

**Why Gemini as default?** Gemini 3 Flash has a generous free tier, handles large PDFs well via SSE streaming (avoids Vercel timeout on large files), and its extraction quality is comparable to Claude for structured data. Claude CLI is the automatic fallback if Gemini fails. The API mode exists for users who want to use their own Anthropic key for maximum quality control.

**Why temperature 0?** Financial extraction must be deterministic. The same document should always produce the same output. Temperature > 0 introduces randomness that could cause a $10,000 position to become $1,000 on a re-run. Note: the Anthropic API backend uses `temperature: 0`, but Gemini 3 Flash omits it because `temperature: 0` causes response looping in that model — Gemini 2.5 Flash still uses `temperature: 0`.

### Prompt Management

The base extraction prompt is stored in the `prompts` database table (name: `'extract_financial_data'`), not hardcoded in source. This enables prompt iteration without code deploys.

| Component | Details |
|-----------|---------|
| DB table | `prompts` — versioned rows with `name`, `version`, `content`, `is_active`, `metadata` |
| Versioning | `create_prompt_version()` RPC creates a new version and deactivates the previous one |
| Fetch | `get_prompt(name)` RPC returns the active version's content |
| Cache | 5-minute in-memory TTL cache (module-level `Map`). Each serverless cold start gets a fresh cache. |
| Fallback | Hardcoded `EXTRACTION_SYSTEM_PROMPT` constant in `prompts.ts` — used if DB is unreachable or returns no row |
| Dynamic section | `buildExtractionPrompt()` fetches the base from DB, then appends the account-matching context at runtime |
| Metadata | `metadata` jsonb stores: `model_hint`, `estimated_tokens`, `schema_version`, `dynamic_sections` |

**Why DB-backed instead of hardcoded?** The extraction prompt is the highest-leverage piece of the pipeline — a single word change can fix a class of extraction errors across all documents. Deploying code to change a prompt is unnecessarily slow. The DB approach lets us iterate in minutes via the Supabase dashboard while keeping a hardcoded fallback for resilience. Versioning preserves history so we can roll back or A/B test prompts.

**Why cache?** The prompt is ~2KB and changes rarely. Hitting the DB on every extraction is wasteful. A 5-minute TTL balances freshness (prompt changes take effect within minutes) against performance (one DB call per 5 minutes per serverless instance).

### File Pre-Processing

| File Type | Processing | Sent to LLM as |
|-----------|-----------|-----------------|
| PDF | Base64 encode | Native document content block |
| PNG/JPG | Base64 encode | Native image content block |
| XLSX | SheetJS `sheet_to_csv()` per sheet | Text with `=== Sheet: Name ===` headers |
| CSV | Raw text + parse first 5 rows to JSON | Text + structured sample |
| OFX/QFX | UTF-8 decode | Text |
| TXT/JSON | UTF-8 decode | Text |

**Why convert XLSX to CSV before sending?** LLMs can't read binary Excel files natively. Converting to CSV preserves all data while making it text-readable. Multi-sheet workbooks are concatenated with `=== Sheet: Name ===` separators so the LLM knows which data came from which sheet.

**Why pre-parse CSV rows?** Sending the first 5 rows as parsed JSON alongside raw CSV text gives the LLM a structural hint — it sees both the raw format and the parsed interpretation, reducing column-mapping errors.

---

## Stage 2: Validation

**Goal:** Validate and coerce the LLM's JSON output into a clean `PortsieExtraction` object.

### Validator Design

A hand-written validator (not AJV/Zod) walks the object tree and applies per-field coercions.

**Why not use AJV or Zod?** We evaluated both:
- **AJV:** Can validate structure but can't express coercions like "strip $ and , from numbers" or "convert `($1,234.56)` to `-1234.56`." Custom keywords exist but are clunky for financial data.
- **Zod:** Better for TypeScript integration but `z.transform()` chains get unwieldy for 40+ action aliases, date format normalization, and conditional defaults.
- **Hand-written:** More code to maintain, but each field gets exactly the coercion it needs. Error messages are specific ("Transaction 3: invalid action 'purchase', coerced to 'buy'" vs. AJV's generic "enum mismatch"). The validator also tracks coercions separately from errors, so we know when the LLM output was "close but not exact" vs. "completely wrong."

### Type Coercions

| Field | Coercion |
|-------|----------|
| Dates | `MM/DD/YYYY` → `YYYY-MM-DD`; handles "as of" prefixes |
| Numbers | Strips `$`, `,`; parens to negative: `($1,234.56)` → `-1234.56` |
| `action` | 40+ aliases: `"purchase"` → `"buy"`, `"div"` → `"dividend"`, etc. |
| `asset_type` | Case-normalize + aliases: `"stock"` → `"EQUITY"`, `"bond"` → `"FIXED_INCOME"` |
| `account_type` | Case-normalize + aliases: `"brokerage"` → `"individual"`, `"solo_401k"` → `"401k"` |
| `total_amount` | If null, compute from `quantity * price_per_share` or default to `0` |

**Why coerce instead of reject?** LLMs are close-but-not-exact. Claude might return `"purchase"` instead of `"buy"`, or `"$1,234.56"` instead of `1234.56`. Rejecting these would throw away valid data over cosmetic differences. Coercion recovers the intent while logging what was changed. Only truly invalid data (wrong types, impossible dates) causes rejection.

### Filtering Strategy

Invalid items are **dropped** (not fatal). Each drop is recorded as a warning. The extraction only fails if the `accounts[]` array is empty after filtering.

**Why drop instead of fail?** A 12-page PDF might extract 50 accounts and 73 positions perfectly but have one malformed transaction. Failing the entire extraction over one bad row wastes the user's time and LLM cost. Dropping the bad row and recording a warning lets the user see 99% of their data while knowing about the 1% that needs attention.

### Backward Compatibility

If the LLM returns a flat structure (no `accounts[]` array but top-level `transactions`/`positions`/`balances`), the validator wraps it into a single-account structure automatically.

**Why?** Early prompt iterations didn't require the `accounts[]` wrapper. Some cached extractions or edge-case LLM outputs still produce flat structures. Auto-wrapping handles this gracefully without breaking.

### Markdown Fence Stripping

The validator strips ` ```json ... ``` ` fences and extracts the outermost `{ ... }` if JSON is embedded in surrounding text.

**Why?** Claude naturally wraps JSON in markdown fences. Gemini sometimes adds explanatory text before/after the JSON. Rather than fighting this tendency in the prompt, we handle it in the validator — simple, reliable, and works across all LLM backends.

---

## Stage 2.5: Account Matching

**Goal:** Map each extracted account to an existing user account (or flag for creation).

### Hybrid Approach: LLM Decides, Heuristic Validates

Account matching uses a two-layer system:

1. **LLM decision (primary):** During extraction, the LLM receives the user's existing accounts and returns an `account_link` per detected account — either `match_existing` (with the existing account's UUID) or `create_new`, along with confidence and reasoning.
2. **Heuristic validator (safety net):** A deterministic heuristic checks the LLM's decision against number-based matching. When the heuristic has an exact or partial number match that points to a *different* account than the LLM chose, the heuristic wins. When only semantic matching is available (institution + type, no numbers), the LLM wins.
3. **Fallback (backward compat):** Old stored extractions without `account_link` (pre-dating this feature) fall through to full heuristic matching.

The entry point is `resolveAccountLinks()`, which handles all three paths in a single function.

### Heuristic Validation Rules

| LLM says | Heuristic says | Winner | Why |
|----------|---------------|--------|-----|
| match_existing (UUID A) | Number match → UUID A | LLM | Agreement — proceed |
| match_existing (UUID A) | Number match → UUID B | Heuristic | Numbers don't lie — the LLM hallucinated a UUID |
| match_existing (UUID A) | No number match | LLM | Semantic matching (institution, type, nickname) is the LLM's strength |
| create_new | Number match → UUID B | Heuristic | The LLM missed an obvious match |
| create_new | No match | LLM | Agreement — create new account |

### Safety Checks

- **UUID regex validation** in the parser — malformed UUIDs are downgraded to `create_new`
- **DB ownership verification** — every `existing_account_id` is verified against the user's actual accounts
- **Hallucination protection** — if the UUID doesn't exist or belongs to another user, falls back to heuristic matching or `create_new`

### Heuristic Matching Priority (Fallback)

When the LLM doesn't provide `account_link` (old extractions) or fails validation, the full heuristic runs:

| Priority | Method | Confidence |
|----------|--------|------------|
| 1 | Exact account number match (after stripping `...`/`.` prefixes) | HIGH |
| 2 | Last-4-digit account number overlap | HIGH |
| 3 | Last-3-digit match + same institution | HIGH |
| 4 | Last-3-digit match, different institution | MEDIUM |
| 5 | Institution + account type match (only if unambiguous — exactly 1 candidate) | MEDIUM |
| 6 | Institution + nickname substring match | MEDIUM |
| 7 | No match → create new account | HIGH |

**Why hybrid instead of pure heuristic or pure LLM?** Pure heuristic fails on semantic reasoning — "Schwab" vs "Charles Schwab & Co., Inc." requires normalization heuristics, and account renames defeat nickname matching entirely. The LLM handles these naturally. But pure LLM matching risks hallucinated UUIDs or missed obvious digit matches. The hybrid approach gives us the LLM's semantic intelligence with deterministic safety rails on the cases where numbers provide certainty.

### Institution Normalization

```
"Charles Schwab & Co., Inc." → "charles schwab"
"Bank of America"            → "bank of america"
```

Strips: `&`, `,`, `.`, `inc`, `llc`, `corp`, `co` (word boundary).

**Why?** The same institution appears as "Charles Schwab", "Charles Schwab & Co., Inc.", "Schwab", etc. across different documents. Stripping legal suffixes and punctuation makes fuzzy matching work without a lookup table of institution aliases.

### Aggregate Account Handling

`unallocated_positions` are assigned to an aggregate account (searched by institution, created if not found). Aggregate accounts are flagged `is_aggregate = true` and excluded from regular matching candidates.

**Why a separate aggregate account?** When a Schwab PDF lists positions by ticker across all sub-accounts, we can't reliably split them back into individual accounts. Instead of guessing wrong (and corrupting per-account data), we put them in a clearly-labeled aggregate. The dashboard knows to merge aggregate positions into the display when individual accounts don't have their own holdings (see Dashboard Data Flow below).

### User Override

The confirm endpoint accepts optional `accountMapOverrides` to let the user correct any mapping before data is written.

**Why?** No matcher is perfect with partial account numbers. The user knows their own accounts — letting them correct a wrong match before it hits the DB is cheaper than fixing bad data after the fact.

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

**Why two tables for positions (`holdings` vs `position_snapshots`)?** They serve different purposes:
- `holdings` = "what do I own right now?" — mutable, reconciled on every upload, drives the dashboard. One row per account-symbol pair.
- `position_snapshots` = "what did I own on Feb 17, 2026?" — immutable, append-only, used for historical portfolio reconstruction and performance tracking. Multiple rows per symbol over time.

Without this split, you'd either lose history (mutable only) or have expensive queries to reconstruct current state from snapshots (immutable only).

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

**Why set `quantity = 0` instead of deleting?** Deletion loses provenance. A holding with `quantity = 0` still shows when it was last seen, what upload closed it, and what its final value was. Dashboard queries filter on `quantity > 0` for current state, so closed holdings are invisible to the user but preserved for debugging and historical analysis.

### Position Deduplication

Key: `(snapshot_date, symbol)`. If the same symbol appears twice for the same date (common in aggregate sections), quantities and values are summed. This happens **before** writing to either `holdings` or `position_snapshots`.

**Why sum instead of reject duplicates?** Aggregate positions in Schwab PDFs list the same ticker multiple times (once per sub-account holding). When these land in `unallocated_positions`, we need to combine them into a single aggregate holding. Summing is the financially correct operation — if you hold 100 shares of TSLA in IRA A and 200 in IRA B, your aggregate position is 300 shares.

### Balance Deduplication

Key: `snapshot_date`. If multiple balance entries exist for the same date, non-null fields are merged (keep most complete).

**Why merge instead of overwrite?** Different sections of a statement may provide different balance fields. The summary might show `liquidation_value` while a detail section shows `cash_balance` and `buying_power`. Merging non-null fields produces the most complete picture.

### Account Summary Recomputation

After writing holdings, the `accounts` row is recomputed:

```
equity_value       = sum(holdings.market_value) where quantity > 0
total_market_value = liquidation_value  (if available from balance)
                   | equity_value + cash_balance  (fallback)
holdings_count     = count(holdings) where quantity > 0
```

**Why prefer `liquidation_value` over computed total?** The statement says an account is worth $549,993.84. We compute equity ($549,099.34) + cash ($894.50) = $549,993.84. They agree here, but rounding differences across 73 positions can cause disagreement. The statement's stated total is the source of truth — it's what the brokerage reports and what the user sees on their brokerage website. We only fall back to the computed sum when the statement doesn't provide a total.

### Liability Representation

Liabilities (credit cards, mortgages, HELOCs, auto loans) are stored as **negative `liquidation_value`** in the same `accounts` table.

**Why not a separate liability table?** Net worth = assets - liabilities. A single `accounts` table with signed values means `SELECT SUM(total_market_value) FROM accounts WHERE user_id = ?` gives net worth in one query. A separate table would require a join or union. Since liabilities use the same fields (institution, balance, type), a separate table would duplicate the schema for no benefit.

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

**Why hardcoded symbol sets instead of a classification API or LLM call?** We considered:
- **LLM classification:** Too slow (one API call per position) and non-deterministic. TSLA might be "tech" on one call and "automotive" on the next.
- **External API (e.g., Morningstar sector data):** Adds a dependency, latency, and cost. Sectors don't map cleanly to our 8 classes (is BRK/B "financials" or "non-tech equities"?).
- **Hardcoded sets (~130 tickers):** Deterministic, fast (O(1) lookup), version-controlled, and covers 95%+ of the user's actual portfolio. Unknown tickers fall through to description heuristics which catch most ETFs and funds. The long tail of truly unclassifiable positions defaults to `non_tech_equities`, which is safe.

The sets are maintained as the user's portfolio evolves — adding a new ticker takes one line of code.

### Crypto Sub-Aggregates

Crypto positions are further grouped: Bitcoin ETFs, Ethereum ETFs, Crypto Stocks, Other Crypto.

**Why sub-aggregate crypto?** The user holds Bitcoin exposure through 4 different ETFs (IBIT, ARKB, GBTC, BITO) and Ethereum through 3 (EZET, ETHA, FETH). Showing each as a separate line hides the total crypto allocation. Sub-aggregates let the dashboard say "Bitcoin ETFs: $461K, Ethereum ETFs: $132K" while still drilling into individual positions.

### Portfolio Metrics

| Metric | Formula | Why |
|--------|---------|-----|
| Total Market Value | `sum(positions.marketValue) + sum(accounts.cashBalance)` | Cash sits in accounts, not as positions. Both contribute to total. |
| Day Change % | `totalDayChange / (totalMV - totalDayChange) * 100` | Standard percentage change formula using previous day's value as denominator. |
| HHI | `sum(position.allocationPct²)` — range 0-10,000 | Herfindahl-Hirschman Index, a standard concentration metric. 10,000 = single stock, 0 = perfect diversification. |
| Diversification Score | `max(1, min(10, round(10 - (HHI / 10000) * 9)))` — 1-10 scale | Inverted and scaled HHI for user-friendly display. 10 = well diversified, 1 = extremely concentrated. |
| Safe Withdrawal | `totalMV * 0.04` (4% rule) | Standard retirement planning heuristic. Conservative, well-studied. |

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

**Why this condition?** The separation between regular and aggregate exists to prevent double-counting when the user has both per-account holdings (from individual account statements) and aggregate holdings (from a summary statement). If individual accounts already have positions, aggregate data should stay separate. But when individual accounts have only cash/balance data and no holdings, the aggregate IS the position data — not showing it means showing an empty portfolio. This condition handles the common Schwab expanded-view PDF case where all positions are unallocated.

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

- **RLS everywhere:** All user-scoped tables enforce `auth.uid() = user_id`. No data leaks between users, even if application code has a bug.
- **Encryption:** Sensitive data (tokens, API keys) encrypted with AES-256-GCM via `SCHWAB_TOKEN_ENCRYPTION_KEY`. Encrypted at rest in the column, decrypted only in application memory.
- **`updated_at` triggers:** Auto-maintained on all mutable tables. Provides cheap change detection without application-level bookkeeping.
- **Idempotent migrations:** All use `IF NOT EXISTS` / `CREATE OR REPLACE`. Re-running a migration is safe, which simplifies deployment and development.
- **`ON DELETE CASCADE`:** All user-scoped tables cascade from `auth.users(id)`. Deleting a user cleanly removes all their data without orphaned rows.

---

## Upload Deduplication

Files are SHA-256 hashed on upload. If a duplicate is found for the same user:
- If already processed: carry over `extracted_data`, `raw_llm_response`, `parsed_at`, etc.
- Prevents redundant LLM calls for identical re-uploads.

**Why hash-based instead of filename-based?** Users rename files. Two files named "statement.pdf" might be completely different. Two files named "Schwab_Feb2026.pdf" and "schwab-feb.pdf" might be identical. SHA-256 of the file content is the only reliable dedup key.

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

**Why store raw LLM output separately from validated extraction?** Debugging. When an extraction is wrong, you need to know: did the LLM produce bad JSON (raw output is wrong) or did the validator misparse it (raw is fine, validated is wrong)? Storing both lets you answer that question without re-running the extraction.

---

## Key Design Decisions Summary

| Decision | Choice | Why |
|----------|--------|-----|
| LLM-driven account matching | Inject user accounts into prompt | LLM returns `account_link` decisions alongside extraction data in a single call — zero extra cost. Semantic matching (institution abbreviations, account renames) outperforms heuristics. Heuristic validator catches number-based mismatches. User can still override via confirm UI. |
| Hand-written validator | Not AJV/Zod | Financial data needs per-field coercions ($ stripping, parens-to-negative, date normalization, 40+ action aliases) that schema validators can't express cleanly. Custom validator tracks coercions separately from errors. |
| Hybrid account matching | LLM + heuristic validation | LLM handles semantic reasoning (abbreviations, renames, type matching). Heuristic validates on number-based matches where digits provide certainty. Fallback to pure heuristic for old extractions without `account_link`. |
| DB-backed versioned prompts | `prompts` table with `get_prompt()` RPC | Iterate on prompts via Supabase dashboard without code deploys. 5-minute cache, hardcoded fallback for resilience. Versioning preserves history for rollback and A/B testing. |
| Hardcoded symbol sets | ~130 tickers | O(1) classification, deterministic, version-controlled. Covers the actual portfolio. Unknown tickers fall through to description heuristics then default to non_tech_equities. Avoids external API dependency. |
| Negative values for liabilities | Same `accounts` table | `SUM(total_market_value)` gives net worth in one query. Liabilities use the same schema fields as assets. Separate table would duplicate schema for no benefit. |
| `quantity = 0` for closed positions | Soft-close, not delete | Preserves provenance (when closed, by which upload). Dashboard filters on `quantity > 0`. History preserved for debugging and future features (portfolio history timeline). |
| Prefer `liquidation_value` | Statement total over computed sum | Statement is the source of truth — it's what the brokerage reports. Computed `equity + cash` can diverge due to rounding across many positions. Fallback to computed sum when statement doesn't provide total. |
| Schema version in extraction | `schema_version: 1` | Future-proof. When the extraction schema changes, old extractions still validate against their declared version. Allows gradual migration without re-extracting historical uploads. |
| SHA-256 file deduplication | Hash content, not filename | Users rename files. Content hash is the only reliable dedup key. Prevents wasting LLM calls on identical re-uploads. Carries over extraction results from the duplicate. |
| Aggregate account for unallocated | `is_aggregate = true` | Schwab summary PDFs list positions by ticker across accounts. Guessing account assignment is fragile. Aggregate account honestly represents "total holdings, account assignment unknown." Dashboard merges aggregate into display when individual accounts lack holdings. |
| Two position tables | `holdings` (mutable) + `position_snapshots` (immutable) | Different access patterns. Holdings = "what do I own now?" (fast, current). Snapshots = "what did I own on date X?" (historical, append-only). Single table can't serve both without expensive queries. |
| Drop invalid items, don't fail | Soft filtering with warnings | A 12-page PDF shouldn't fail over one malformed transaction. 99% of data is preserved. Dropped items logged as warnings for review. Only fail if entire extraction is empty. |
