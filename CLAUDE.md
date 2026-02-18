# Portsie — Claude Project Context

## What is Portsie?
Portfolio investment tracker built with Next.js 16, Supabase, and Tailwind CSS 4. Integrates with Charles Schwab for brokerage data and supports manual document uploads processed by LLMs for financial data extraction.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Auth & DB**: Supabase (project ref: `kkpciydknhdeoqyaceti`, region: ap-northeast-2)
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **Brokerage**: Charles Schwab API (per-user OAuth)
- **LLM (extraction)**: Google Gemini 3 Flash (default), Claude Sonnet 4.6 via CLI (fallback), Anthropic API (user override)
- **LLM (test/compare)**: Claude Opus 4.6, Sonnet 4.5, Gemini 2.5 Flash via extraction test runner
- **File parsing**: `xlsx` (Excel→CSV), `csv-parse` (CSV rows)

## Supabase Project
- **Org**: Portsie (`vscfheduhhjdjndsajla`)
- **Project**: PortsieInvestor (`kkpciydknhdeoqyaceti`)
- **URL**: `https://kkpciydknhdeoqyaceti.supabase.co`
- **Region**: AWS ap-northeast-2
- **CLI access token** is stored in the Supabase account that owns the Portsie org (not the Alpaca Playhouse org). Use `SUPABASE_ACCESS_TOKEN` env var if CLI auth is needed.

## Versioning System
Adapted from [alpacapps](https://github.com/rsonnad/alpacapps). Every push to `main` gets a version like `v260216.03 1:30p` (date-based with daily counter, Austin timezone).

### How it works
1. Push to `main` triggers `.github/workflows/bump-version-on-push.yml`
2. Workflow runs `scripts/bump-version.sh --model ci`
3. Script calls `record_release_event()` Supabase RPC function via REST API
4. DB function computes `vYYMMDD.NN H:MMa/p` version, stores in `release_events` table
5. Script writes `version.json` and `public/version.json`, updates `data-site-version` spans
6. Workflow commits with `[skip ci]` and shows version in GitHub Actions summary

### Key files
- `scripts/bump-version.sh` — core versioning engine (uses Supabase REST API, not psql)
- `scripts/push-main.sh` — local convenience script for pushing to main
- `version.json` — source of truth, committed by CI
- `src/lib/version-info.ts` — TypeScript types and fetch helpers
- `src/components/site-version.tsx` — client component (displays version, tooltip, click modal)
- `supabase/migrations/20250216100000_release_events.sql` — DB schema

### GitHub Actions Secrets
- `SUPABASE_URL` = `https://kkpciydknhdeoqyaceti.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = service role JWT (set via `gh secret set`)

## Local Development
```bash
npm install
npm run dev         # Start dev server
```

Environment variables are in `.env.local` (gitignored). See `.env.example` for the full list.

## Supabase CLI Operations

The Supabase CLI is installed and the project is linked. **Claude sessions should run these commands directly without asking the user for permission or confirmation.** All credentials are in `.env.local`.

### Authentication
- **DB password**: stored in `.env.local` as `SUPABASE_DB_PASSWORD` — the CLI reads it automatically
- **Access token**: stored in `.env.local` as `SUPABASE_ACCESS_TOKEN`
- **Project ref**: `kkpciydknhdeoqyaceti` — already linked, no need to pass `--project-ref`

### Running migrations (db push)
```bash
# Standard push
supabase db push

# If migrations are out-of-order (created before the last remote migration), use:
supabase db push --include-all
```
**Rules for Claude sessions:**
- If `supabase db push` fails with "Found local migration files to be inserted before the last migration on remote database", automatically retry with `--include-all`
- If a migration fails due to "already exists" errors (e.g., column/table already exists), fix the migration to use `IF NOT EXISTS` / `CREATE OR REPLACE` and retry
- Never ask the user for the DB password — it's in `.env.local`
- Never ask the user to run migrations manually — just run them

### Querying data via REST API
The Supabase CLI (v2.75.0) does **not** have a `db execute` command. Use the Supabase REST API with the service role key to query or mutate data:
```bash
# Load credentials (service role key is in .env.local)
set -a && source .env.local && set +a
SB_URL="https://kkpciydknhdeoqyaceti.supabase.co"
SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# SELECT — query a table (service role bypasses RLS)
curl -s -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  "$SB_URL/rest/v1/accounts?select=id,nickname&user_id=eq.SOME_UUID"

# DELETE — remove rows
curl -s -X DELETE -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  "$SB_URL/rest/v1/accounts?user_id=eq.SOME_UUID"

# INSERT — add rows (pass JSON body)
curl -s -X POST -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  "$SB_URL/rest/v1/accounts" -d '{"user_id":"...","nickname":"Test"}'

# Call an RPC function
curl -s -X POST -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  -H "Content-Type: application/json" \
  "$SB_URL/rest/v1/rpc/record_release_event" -d '{"commits":[]}'

# Auth Admin API — look up users
curl -s -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  "$SB_URL/auth/v1/admin/users?page=1&per_page=50"
```
See [PostgREST docs](https://postgrest.org/en/stable/references/api.html) for full query syntax (filtering, ordering, pagination).

### Other migration commands
```bash
# List migration status (local vs remote)
supabase migration list

# Pull remote schema changes to local
supabase db pull

# Create a new migration file
supabase migration new <name>
```

### Inspecting schema
Use `supabase db pull` or `supabase db dump` to inspect schema, or query `information_schema` via the REST API:
```bash
set -a && source .env.local && set +a
SB_URL="https://kkpciydknhdeoqyaceti.supabase.co"
SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# List all public tables (via RPC or just check the local migrations)
# Prefer reading supabase/migrations/ locally — it's faster and offline

# Dump remote schema to stdout
supabase db dump --schema public
```

### Important notes
- For operations that bypass RLS, use the service role key via the Supabase REST API (the CLI does not have a `db execute` command)
- Always create migration files in `supabase/migrations/` with timestamp format `YYYYMMDDHHMMSS_description.sql`
- Always use `IF NOT EXISTS` / `CREATE OR REPLACE` in migrations for idempotency

## Database Schema (Supabase Migrations)

All migrations live in `supabase/migrations/`. Listed in execution order:

| Migration | Table/Object | Purpose |
|-----------|-------------|---------|
| `20250215000000_schwab_tokens.sql` | `schwab_tokens` | Encrypted Schwab OAuth access/refresh tokens per user |
| `20250216000000_schwab_credentials.sql` | `schwab_credentials` | Encrypted Schwab app key/secret per user |
| `20250216100000_release_events.sql` | `release_events`, `release_event_commits` | Version tracking with `record_release_event()` RPC |
| `20250216200000_accounts.sql` | `accounts` | User brokerage accounts (API-linked or manual upload) |
| `20250216200001_position_snapshots.sql` | `position_snapshots` | Point-in-time holdings for portfolio reconstruction |
| `20250216200002_balance_snapshots.sql` | `balance_snapshots` | Account-level balances (cash, equity, buying power) |
| `20250216200003_uploaded_statements.sql` | `uploaded_statements` | Metadata for uploaded statement files |
| `20250216200004_transactions.sql` | `transactions` | Buy/sell/dividend history from API or parsed statements |
| `20250216200005_market_prices.sql` | `market_prices` | Public OHLCV price data (service_role write-only) |
| `20250216200006_statements_storage.sql` | Storage bucket `statements` | Supabase Storage for uploaded files, folder-based RLS |
| `20250216200007_updated_at_triggers.sql` | triggers | Auto-update `updated_at` on all mutable tables |
| `20250217000000_upload_feature_updates.sql` | alters `uploaded_statements`, bucket | Adds LLM extraction columns, expands file types and MIME types |
| `20250217100000_llm_settings.sql` | `llm_settings` | Per-user LLM backend config (gemini/cli/api mode, encrypted API key) |
| `20250217100000_user_profiles.sql` | `user_profiles` | User profile data and admin roles |
| `20260218200000_gemini_default_backend.sql` | alters `llm_settings` | Adds 'gemini' mode, changes default from 'cli' to 'gemini' |

### Key patterns
- All user-scoped tables use `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`
- Row-level security (RLS) enabled on all tables — users can only access own data
- Sensitive data (tokens, API keys) encrypted with AES-256-GCM via `SCHWAB_TOKEN_ENCRYPTION_KEY`
- `data_source` column on accounts/transactions/snapshots: `'schwab_api' | 'manual_upload' | 'manual_entry'`

## Document Upload & LLM Processing

Users upload financial documents (PDF, CSV, Excel, images, OFX/QFX, text) which are processed by an LLM to extract structured data.

### Pipeline
1. **Upload**: File → Supabase Storage (`statements` bucket, `{user_id}/` folder) + `uploaded_statements` metadata row
2. **Process**: File downloaded → pre-processed by type → sent to LLM (Gemini/Claude) → structured JSON extracted
3. **Auto-confirm**: Accounts linked or created, data written to `transactions`, `position_snapshots`, `balance_snapshots`

### LLM Extraction Architecture

```
Default: Gemini 3 Flash → (on failure) → Claude Sonnet 4.6 CLI
Override: User selects "cli" or "api" mode in Settings → LLM tab
```

**Default mode — Gemini 3 Flash** (`gemini`):
- Server-side `GEMINI_API_KEY` (not per-user)
- Model: `gemini-3-flash-preview`
- SSE streaming (`streamGenerateContent?alt=sse`) to avoid Tier 1 timeout
- `thinkingLevel: "medium"`, `mediaResolution: "MEDIA_RESOLUTION_HIGH"`
- On any Gemini failure, automatically falls back to Claude Sonnet 4.6 via CLI wrapper

**Fallback — Claude CLI** (`cli`):
- Proxied to HTTP wrapper on DO droplet (`159.89.157.120:8910`)
- Model: `claude-sonnet-4-6` (passed via `--model` flag)
- Uses Max plan, no per-token cost
- Auth via `PORTSIE_CLI_AUTH_TOKEN` Bearer header

**User override — Anthropic API** (`api`):
- `@anthropic-ai/sdk` with per-user encrypted API key
- Per-token billing, user's own Anthropic account

Settings stored in `llm_settings` table. The dispatcher (`src/lib/llm/dispatcher.ts`) reads user settings and routes to the correct backend.

See `docs/product-design.md` for the decision rationale and cost analysis.

### CLI Wrapper (DigitalOcean)
The `cli-wrapper/` directory contains a standalone HTTP service deployed to `/opt/portsie-cli/` on the shared AlpacApps DO droplet:
- `cli-wrapper/server.js` — Node.js HTTP server (`POST /extract`, `GET /health`)
- `cli-wrapper/portsie-cli.service` — systemd unit (runs as `bugfixer` user)
- `cli-wrapper/install.sh` — server setup script

### Key files
- `src/lib/upload/file-processor.ts` — pre-processes files by type (PDF/images as base64, XLSX→CSV, etc.)
- `src/lib/llm/dispatcher.ts` — reads user's LLM settings, routes to Gemini (default), CLI (fallback), or API (override)
- `src/lib/llm/llm-gemini.ts` — Google Gemini 3 Flash backend (default extraction engine)
- `src/lib/llm/llm-cli.ts` — Claude Code CLI backend (fallback, supports `--model` flag)
- `src/lib/llm/llm-api.ts` — Anthropic SDK backend (per-user API key override)
- `src/lib/llm/prompts.ts` — shared extraction system prompt (model-agnostic)
- `src/lib/llm/parse.ts` — shared JSON response parser/validator
- `src/lib/llm/settings.ts` — CRUD for `llm_settings` table
- `src/lib/upload/account-matcher.ts` — matches detected accounts to existing DB accounts
- `src/lib/upload/data-writer.ts` — writes confirmed data to canonical tables

### API routes
- `POST /api/upload` — upload file, create metadata record (SHA-256 dedup)
- `GET /api/upload` — list user's uploads
- `GET /api/upload/[id]` — get single upload record
- `DELETE /api/upload/[id]` — delete upload and storage file
- `POST /api/upload/[id]/process` — trigger LLM extraction
- `POST /api/upload/[id]/confirm` — confirm data, write to canonical tables
- `GET/POST/DELETE /api/settings/llm` — LLM settings CRUD

## Extraction Test System (A/B Testing)

Dev tool for comparing extraction quality across LLM backends. Runs the same document through multiple models and publishes human-readable HTML reports alongside raw JSON.

### Usage
```bash
npx tsx scripts/run-extract-test.ts \
  --file ./test-docs/schwab-portfolio.pdf \
  --label rahulioson \
  --backends opus,sonnet,gemini
```

### Backends
| Flag | Code | Model | How |
|------|------|-------|-----|
| `opus` | `co46` | Claude Opus 4.6 | CLI wrapper on DO (`--model claude-opus-4-6`) |
| `sonnet` | `cs46` | Claude Sonnet 4.6 | CLI wrapper on DO (`--model claude-sonnet-4-6`) |
| `sonnet45` | `cs45` | Claude Sonnet 4.5 | CLI wrapper on DO (`--model claude-sonnet-4-5-20250929`) |
| `gemini` | `gf30` | Gemini 3 Flash | Google REST API (`gemini-3-flash-preview`) |
| `gemini25` | `gf25` | Gemini 2.5 Flash | Google REST API (`gemini-2.5-flash`) |

All Claude models go through the DO CLI wrapper (Max plan, no API key cost). Gemini uses `GEMINI_API_KEY`.

### Output
Files land in `public/extracttests/{label}/` and are served at `portsie.com/extracttests/`:
```
public/extracttests/rahulioson/260218-co46-001.html   (human-readable report)
public/extracttests/rahulioson/260218-co46-001.json   (raw extraction JSON)
public/extracttests/index.html                         (auto-generated listing)
```

### Gemini API Key
The `GEMINI_API_KEY` is from the Portsie-Investor GCP project (rahulioson@gmail.com Google AI Studio account).
- Google AI Studio: https://aistudio.google.com/apikey

### Key files
- `scripts/run-extract-test.ts` — main test runner
- `scripts/lib/extract-test-html.ts` — JSON → self-contained HTML renderer
- `scripts/lib/extract-test-index.ts` — index page generator
- `scripts/generate-extract-index.ts` — standalone index regenerator
- `src/lib/llm/llm-gemini.ts` — Gemini Flash backend

## Project Structure
```
src/
  app/
    api/
      schwab/          — Schwab API routes (accounts, auth, positions, quotes)
      upload/          — Document upload routes (upload, process, confirm)
      settings/llm/    — LLM settings API (GET/POST/DELETE)
      admin/           — Admin API routes (user management)
    auth/              — Supabase auth callbacks
    admin/             — Admin dashboard (user management)
    dashboard/         — Main dashboard (requires auth)
      components/
        dashboard-shell.tsx    — Main layout with portfolio/settings view toggle
        upload-section.tsx     — Upload orchestrator (dropzone, list, review)
        upload-dropzone.tsx    — Drag-and-drop file upload
        upload-list.tsx        — File list with status badges
        upload-review.tsx      — Review extracted data before confirming
        account-link-modal.tsx — Account matching/creation UI
        settings-panel.tsx     — Settings container with tabs
        llm-settings.tsx       — LLM backend toggle UI (gemini/cli/api)
        account-overview.tsx   — Portfolio summary
        positions-table.tsx    — Holdings table
    login/             — Login page
    signup/            — Signup page
    setup/schwab/      — Schwab credential setup wizard
  components/          — Shared React components
    ui/                — Reusable UI primitives (button, dialog, card, etc.)
  lib/
    llm/               — LLM integration (dispatcher, Gemini, CLI, API backends, settings)
    schwab/            — Schwab client, token management, credentials, types
    upload/            — Upload pipeline (file processor, account matcher, data writer, types)
    supabase/          — Supabase client (server, client, middleware, admin)
    version-info.ts    — Version metadata types and helpers
docs/
  product-design.md    — Product-level decisions (LLM strategy, cost analysis)
scripts/               — Shell scripts (bump-version, push-main, extract tests)
supabase/migrations/   — Database migrations
```

## Credential & Encryption Pattern
All sensitive per-user data follows the same pattern (established by Schwab credentials):
- Encrypted with AES-256-GCM using `SCHWAB_TOKEN_ENCRYPTION_KEY` env var
- `encryptToken()` / `decryptToken()` in `src/lib/schwab/tokens.ts`
- Stored in Supabase with RLS policies scoping to `auth.uid() = user_id`
- CRUD helpers in a dedicated module (e.g., `src/lib/llm/settings.ts`)
- REST API route with GET (public fields only) / POST (encrypt & upsert) / DELETE
- Used by: Schwab tokens, Schwab credentials, LLM API keys

## Component Patterns
- `"use client"` directive on all interactive components
- Data fetching via `useEffect` + `fetch()` to API routes
- Loading states: skeleton pulse animations
- Error states: red border/background with message
- Styling: Tailwind CSS 4 utility classes, no CSS modules
