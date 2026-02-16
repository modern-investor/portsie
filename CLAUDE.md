# Portsie — Claude Project Context

## What is Portsie?
Portfolio investment tracker built with Next.js 16, Supabase, and Tailwind CSS 4. Integrates with Charles Schwab for brokerage data and supports manual document uploads processed by Claude for financial data extraction.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Auth & DB**: Supabase (project ref: `kkpciydknhdeoqyaceti`, region: ap-northeast-2)
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **Brokerage**: Charles Schwab API (per-user OAuth)
- **LLM**: Anthropic Claude — via CLI (`claude -p`, Max plan) or API (`@anthropic-ai/sdk`, per-user key)
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
| `20250217100000_llm_settings.sql` | `llm_settings` | Per-user LLM backend config (cli/api mode, encrypted API key) |
| `20250217100000_user_profiles.sql` | `user_profiles` | User profile data and admin roles |

### Key patterns
- All user-scoped tables use `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`
- Row-level security (RLS) enabled on all tables — users can only access own data
- Sensitive data (tokens, API keys) encrypted with AES-256-GCM via `SCHWAB_TOKEN_ENCRYPTION_KEY`
- `data_source` column on accounts/transactions/snapshots: `'schwab_api' | 'manual_upload' | 'manual_entry'`

## Document Upload & LLM Processing

Users upload financial documents (PDF, CSV, Excel, images, OFX/QFX, text) which are processed by Claude to extract structured data.

### Pipeline
1. **Upload**: File → Supabase Storage (`statements` bucket, `{user_id}/` folder) + `uploaded_statements` metadata row
2. **Process**: File downloaded → pre-processed by type → sent to Claude (CLI or API) → structured JSON extracted
3. **Review**: User reviews extracted transactions/positions/balances in dashboard
4. **Confirm**: User links to an account (existing or new) → data written to `transactions`, `position_snapshots`, `balance_snapshots`

### LLM Backend Toggle
Configurable per-user in Settings → LLM tab:
- **CLI mode** (default): `claude -p` via subprocess or remote HTTP endpoint. Uses Max plan, no per-token cost.
- **API mode**: `@anthropic-ai/sdk` with per-user encrypted API key. Per-token billing.

Settings stored in `llm_settings` table. The dispatcher (`src/lib/llm/dispatcher.ts`) reads user settings and routes to the correct backend.

### Key files
- `src/lib/upload/file-processor.ts` — pre-processes files by type (PDF/images as base64, XLSX→CSV, etc.)
- `src/lib/llm/dispatcher.ts` — reads user's LLM settings, routes to API or CLI backend
- `src/lib/llm/llm-api.ts` — Anthropic SDK backend (per-user API key)
- `src/lib/llm/llm-cli.ts` — Claude Code CLI backend (local subprocess or remote HTTP)
- `src/lib/llm/prompts.ts` — shared extraction system prompt
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
        llm-settings.tsx       — LLM backend toggle UI
        account-overview.tsx   — Portfolio summary
        positions-table.tsx    — Holdings table
    login/             — Login page
    signup/            — Signup page
    setup/schwab/      — Schwab credential setup wizard
  components/          — Shared React components
    ui/                — Reusable UI primitives (button, dialog, card, etc.)
  lib/
    llm/               — LLM integration (dispatcher, API backend, CLI backend, settings)
    schwab/            — Schwab client, token management, credentials, types
    upload/            — Upload pipeline (file processor, account matcher, data writer, types)
    supabase/          — Supabase client (server, client, middleware, admin)
    version-info.ts    — Version metadata types and helpers
scripts/               — Shell scripts (bump-version, push-main)
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
