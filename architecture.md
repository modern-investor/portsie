# Portsie Architecture

## Overview

Portsie is a portfolio investment tracker. Users authenticate via Google OAuth or email/password, link their Charles Schwab brokerage accounts via OAuth, and upload financial documents (statements, trade confirmations, CSV exports) that are processed by Claude to extract structured data into the database.

```
Browser (React 19)
    |
    v
Next.js 16 App Router (Vercel)
    |
    +--- Supabase Auth (Google OAuth, email/password)
    +--- Supabase Postgres (RLS-protected tables)
    +--- Supabase Storage (uploaded statements)
    +--- Charles Schwab API (per-user OAuth)
    +--- Claude LLM (CLI or API, per-user config)
```

---

## Deployment

### Vercel

The app deploys to Vercel on every push to `main`. No `vercel.json` is needed; Next.js 16 App Router is auto-detected.

- **Project ID**: `prj_7gjI7YekWPYe2tdBRcssI55qVuyr`
- **Org**: `team_sTavqzWai5Mb21p0bD5Fg0or`
- **Build**: `next build` (default)
- **Framework**: Next.js 16 (auto-detected)
- **Node.js**: Latest LTS (Vercel default)

### DNS

No custom domain is currently configured. The app is served from Vercel's default domain. When a custom domain is added, configure it in Vercel project settings and point DNS A/CNAME records accordingly.

### Environment Variables (Vercel)

These must be set in Vercel project settings (Settings > Environment Variables):

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anonymous key (safe for browser) |
| `SUPABASE_URL` | Server only | Supabase URL (for admin/service-role operations) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role JWT (bypasses RLS) |
| `SCHWAB_TOKEN_ENCRYPTION_KEY` | Server only | 64-char hex key for AES-256-GCM encryption |
| `PORTSIE_CLI_AUTH_TOKEN` | Server only | Shared secret for authenticating with the DO CLI wrapper |

**Not needed as env vars** (stored per-user in DB instead):
- Anthropic API keys (encrypted in `llm_settings` table)
- Schwab app key/secret (encrypted in `schwab_credentials` table)

---

## Versioning System

Every push to `main` triggers an automatic version bump via GitHub Actions.

### Flow

```
git push origin main
    |
    v
GitHub Actions: bump-version-on-push.yml
    |
    v
scripts/bump-version.sh --model ci
    |
    v
Supabase RPC: record_release_event()
    |
    v
DB computes version: vYYMMDD.NN H:MMa/p (Austin timezone)
    |
    v
Writes version.json + public/version.json
    |
    v
Commits with [skip ci] to prevent loop
```

### Version Format

`v260216.03 1:30p` = Year 26, Feb 16, 3rd release of the day, at 1:30 PM Austin time.

### GitHub Actions Secrets

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://kkpciydknhdeoqyaceti.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role JWT |

The workflow uses concurrency group `version-main-sequence` with `cancel-in-progress: false` to ensure strict ordering of version bumps.

---

## Authentication

### Google OAuth (Primary)

Configured through Supabase Auth with Google as an OAuth provider.

**Flow:**
1. User clicks "Sign in with Google" on `/login` or `/signup`
2. `GoogleSignIn` component calls `supabase.auth.signInWithOAuth({ provider: "google" })`
3. Supabase redirects to Google consent screen
4. Google redirects back to `/auth/callback` with an authorization code
5. Callback route exchanges code for session via `supabase.auth.exchangeCodeForSession(code)`
6. User is redirected to `/dashboard`

**Google Cloud Console setup required:**
- Create OAuth 2.0 credentials (Client ID + Secret)
- Add authorized redirect URI: `https://kkpciydknhdeoqyaceti.supabase.co/auth/v1/callback`
- Enable Google OAuth provider in Supabase Dashboard > Auth > Providers > Google
- Paste Client ID and Secret into Supabase config

**Current status:** Google OAuth is configured and working. The consent screen and credentials are managed in the Google Cloud Console project associated with Portsie.

### Email/Password (Secondary)

Standard Supabase email/password auth. Users can sign up with email on `/signup`, which triggers a confirmation email via Supabase. After confirming, they can log in on `/login`.

### Session Management

- **Middleware** (`src/middleware.ts`): Runs on every request (except static assets). Calls `updateSession()` which refreshes the Supabase auth cookie.
- **Protected routes**: Any path except `/`, `/login`, `/signup`, `/auth/*` requires authentication. Unauthenticated users are redirected to `/login`.
- **Cookie-based**: Sessions use `@supabase/ssr` with httpOnly cookies managed by the middleware.

### User Profiles & Admin Roles

On signup, a database trigger (`on_auth_user_created`) auto-creates a `user_profiles` row with `role: 'user'`. Admin roles are seeded for specific emails (`rahulioson@gmail.com`, `hrsonnad@gmail.com`).

Admin users can access `/admin` to manage users and roles. RLS policies on `user_profiles` allow admins to read all profiles and update roles, while regular users can only read their own.

---

## Database (Supabase Postgres)

### Project

- **Org**: Portsie (`vscfheduhhjdjndsajla`)
- **Project**: PortsieInvestor (`kkpciydknhdeoqyaceti`)
- **URL**: `https://kkpciydknhdeoqyaceti.supabase.co`
- **Region**: AWS ap-northeast-2 (Seoul)

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `schwab_tokens` | Encrypted Schwab OAuth access/refresh tokens | `access_token_encrypted`, `refresh_token_encrypted`, expiry timestamps |
| `schwab_credentials` | Encrypted Schwab app key/secret per user | `app_key_encrypted`, `app_secret_encrypted` |
| `release_events` | Version tracking | `version_label`, `sha`, `pushed_at` |
| `release_event_commits` | Commits per release | `release_event_id`, `sha`, `message` |
| `accounts` | User brokerage accounts (API-linked or manual) | `account_number`, `institution`, `data_source` |
| `position_snapshots` | Point-in-time holdings | `symbol`, `quantity`, `market_value`, `snapshot_date` |
| `balance_snapshots` | Account-level balances | `cash_balance`, `equity`, `buying_power`, `snapshot_date` |
| `uploaded_statements` | Uploaded file metadata + extraction state | `file_type`, `parse_status`, `extracted_data`, `raw_llm_response` |
| `transactions` | Buy/sell/dividend history | `action`, `symbol`, `total_amount`, `transaction_date` |
| `market_prices` | Public OHLCV data (service-role write-only) | `symbol`, `price_date`, `open`, `high`, `low`, `close`, `volume` |
| `llm_settings` | Per-user LLM backend config | `llm_mode` (cli/api), `api_key_encrypted`, `cli_endpoint` |
| `user_profiles` | User roles (admin/user) | `user_id`, `role` |

### Storage

- **Bucket**: `statements` (50 MB limit, non-public)
- **Structure**: `{user_id}/{timestamp}_{filename}`
- **RLS**: Folder-based policies scope access to `{user_id}/` prefix
- **MIME types**: PDF, CSV, Excel, plain text, PNG, JPEG, OFX, QFX

### Security Patterns

- **RLS on all tables**: Every user-scoped table has `auth.uid() = user_id` policies
- **AES-256-GCM encryption**: All sensitive per-user data (tokens, API keys, credentials) encrypted at rest using `SCHWAB_TOKEN_ENCRYPTION_KEY`
- **Encryption format**: `{base64_iv}.{base64_authTag}.{base64_ciphertext}`
- **Helpers**: `encryptToken()` / `decryptToken()` in `src/lib/schwab/tokens.ts` — reused for all encryption (Schwab tokens, Schwab credentials, LLM API keys)

---

## LLM Document Processing

### Overview

Users upload financial documents which are processed by Claude to extract structured data (transactions, positions, balances). The system supports two backends, configurable per-user.

### Pipeline

```
Upload file
    |
    v
POST /api/upload (store in Supabase Storage + metadata row)
    |
    v
POST /api/upload/[id]/process
    |
    +--- file-processor.ts (pre-process by type)
    |       PDF -> base64 document block
    |       PNG/JPG -> base64 image block
    |       XLSX -> CSV text (via SheetJS)
    |       CSV -> text + pre-parsed row samples
    |       OFX/QFX/TXT -> plain text
    |
    +--- dispatcher.ts (read user's llm_settings)
    |       |
    |       +--- CLI mode (default) -> llm-cli.ts
    |       |       Local: execFile("claude", ["-p", prompt, "--output-format", "json"])
    |       |       Remote: POST to DO server endpoint
    |       |
    |       +--- API mode -> llm-api.ts
    |               new Anthropic({ apiKey }) per-request
    |               Model: claude-sonnet-4-20250514
    |
    +--- parse.ts (validate JSON, strip markdown fences)
    +--- account-matcher.ts (match to existing accounts)
    |
    v
User reviews extracted data in dashboard
    |
    v
POST /api/upload/[id]/confirm (write to canonical tables)
```

### LLM Backend Toggle

Users configure their preferred backend in Dashboard > Settings > LLM tab.

**CLI Mode (default):**
- Uses `claude -p` (Claude Code CLI in print mode)
- Can run as a local subprocess on the server or as a remote HTTP endpoint on a DigitalOcean droplet
- Uses the Max subscription plan — no per-token cost
- Binary files (PDF, images) are written to a temp directory and referenced by path in the prompt
- Output parsed from `claude --output-format json` response structure
- 120-second timeout, 10 MB buffer

**API Mode:**
- Uses `@anthropic-ai/sdk` with the user's own Anthropic API key
- API key encrypted with AES-256-GCM and stored in `llm_settings` table
- Supports native document/image content blocks for PDF and images
- Per-token billing on the user's Anthropic account

**Settings storage**: `llm_settings` table with `llm_mode` (cli/api), `api_key_encrypted`, and `cli_endpoint` columns.

### Headless Claude on DigitalOcean

Since Portsie runs on Vercel (serverless), `claude` CLI cannot be installed there. For CLI mode, extraction requests are proxied to a lightweight HTTP wrapper service running on the shared AlpacApps DigitalOcean droplet (`159.89.157.120` / `openclawzcloudrunner`), where Claude Code is already installed and authenticated.

**Architecture:**

```
Vercel (Next.js API route)
    |
    | POST /extract  { prompt, file? }
    | Authorization: Bearer <shared-secret>
    |
    v
DO Droplet (159.89.157.120:8910)
    |
    | cli-wrapper/server.js (Node.js HTTP server)
    |   - Writes binary files to temp dir
    |   - Spawns: claude -p <prompt> --output-format json --dangerously-skip-permissions
    |   - Concurrency guard (one-at-a-time)
    |   - Returns { result: "..." } JSON
    |
    v
Claude Code CLI (Max plan, no per-token cost)
```

**Service files** (in `cli-wrapper/`):

| File | Purpose |
|------|---------|
| `server.js` | Node.js HTTP server — `POST /extract` and `GET /health` |
| `portsie-cli.service` | systemd unit (runs as `bugfixer` user, same as AlpacApps workers) |
| `install.sh` | Server setup script (copies files to `/opt/portsie-cli/`, installs systemd service) |

**Deployment:**
1. Claude Code CLI is already installed globally on the droplet (`npm install -g @anthropic-ai/claude-code`) and authenticated via the `bugfixer` user's Max plan
2. Run `install.sh` on the droplet as root to set up `/opt/portsie-cli/`
3. Set `AUTH_TOKEN` in `/opt/portsie-cli/.env` (shared secret)
4. Set the same token as `PORTSIE_CLI_AUTH_TOKEN` in Vercel env vars
5. Set `cli_endpoint` to `http://159.89.157.120:8910/extract` in the user's `llm_settings` (via Dashboard > Settings > LLM > CLI Endpoint)
6. `systemctl enable portsie-cli && systemctl start portsie-cli`

**Request format** (sent by `extractViaCLIRemote` in `llm-cli.ts`):
```json
{
  "prompt": "<system prompt + file content or instructions>",
  "file": {
    "content": "<base64-encoded file data>",
    "filename": "statement.pdf",
    "mimeType": "application/pdf"
  }
}
```

The `file` field is only included for binary files (PDF, images). Text files (CSV, OFX, TXT) have their content inlined directly in the prompt.

**Response format** (from `claude --output-format json`):
```json
{ "type": "result", "subtype": "success", "result": "<extracted JSON string>" }
```

The wrapper returns this directly. The Portsie client extracts the `result` field and passes it to `parseAndValidateExtraction()` — the same parser used by the API backend.

**Key considerations:**
- Port 8910 is used to avoid conflicts with other services on the droplet (8901 = PTZ proxy, 8902 = talkback relay, 8055 = Sonos proxy)
- `--dangerously-skip-permissions` is required for non-interactive execution (same pattern as AlpacApps bug-fixer and feature-builder services)
- Concurrency is limited to one extraction at a time via an `isProcessing` flag — additional requests get HTTP 429
- The `CLAUDECODE` nesting guard env var is not set on the DO server, so `claude -p` runs normally

---

## Charles Schwab Integration

### OAuth Flow

Per-user Schwab OAuth — each user stores their own Schwab Developer app credentials.

```
1. User enters Schwab app key/secret in /setup/schwab
       |
       v
2. POST /api/schwab/credentials (encrypt + store)
       |
       v
3. GET /api/schwab/auth (generate authorization URL with CSRF state)
       |
       v
4. User redirects to Schwab consent screen
       |
       v
5. Schwab redirects to POST /api/schwab/callback with auth code
       |
       v
6. Exchange code for access/refresh tokens, encrypt + store
       |
       v
7. User is connected — dashboard shows positions + balances
```

### Token Lifecycle

- **Access token**: 30 minutes (auto-refreshed with 2-minute buffer)
- **Refresh token**: 7 days (after expiry, user must re-authorize)
- **Storage**: Encrypted in `schwab_tokens` table with expiry timestamps
- **Client**: `src/lib/schwab/client.ts` handles token refresh automatically before API calls

### API Endpoints

| Schwab API | Internal Route | Purpose |
|------------|---------------|---------|
| `/trader/v1/accounts` | `GET /api/schwab/accounts` | Account numbers and details |
| `/trader/v1/accounts/{id}/positions` | `GET /api/schwab/positions` | Current holdings |
| `/marketdata/v1/quotes` | `GET /api/schwab/quotes` | Real-time market data |

---

## Application Architecture

### Request Flow

```
Browser Request
    |
    v
Next.js Middleware (src/middleware.ts)
    |-- Refreshes Supabase auth cookie
    |-- Redirects to /login if unauthenticated (except public routes)
    |
    v
App Router
    |-- /api/* routes: Server-side API handlers (route.ts)
    |-- Page routes: Server Components -> Client Components
    |
    v
Supabase Client
    |-- Server: createClient() from @supabase/ssr (cookie-based)
    |-- Browser: createClient() from @supabase/ssr (auto-cookie)
    |-- Admin: createClient() with service role key (bypasses RLS)
```

### Directory Structure

```
src/
  app/
    api/
      schwab/           Schwab API routes (auth, callback, accounts, positions, quotes, credentials, disconnect)
      upload/            Upload routes (POST/GET list, [id] detail/delete, [id]/process, [id]/confirm)
      settings/llm/      LLM settings CRUD (GET/POST/DELETE)
      admin/             Admin routes (user list, role update)
    auth/                Supabase auth callbacks (OAuth callback, email confirm)
    admin/               Admin dashboard page
    dashboard/           Main dashboard page
      components/
        dashboard-shell.tsx      Main layout (portfolio/settings view toggle)
        upload-section.tsx       Upload orchestrator
        upload-dropzone.tsx      Drag-and-drop file input
        upload-list.tsx          File list with status badges
        upload-review.tsx        Review extracted data
        account-link-modal.tsx   Match/create accounts for uploads
        settings-panel.tsx       Settings tabs container
        llm-settings.tsx         LLM backend toggle UI
        account-overview.tsx     Portfolio summary cards
        positions-table.tsx      Holdings data table
        schwab-connect.tsx       Schwab connection status
        hide-values-toggle.tsx   Privacy toggle for dollar values
    login/               Login page
    signup/              Signup page
    setup/schwab/        Schwab credential setup wizard
  components/
    ui/                  Reusable UI primitives (button, card, dialog, input, etc.)
    google-sign-in.tsx   Google OAuth button
    login-form.tsx       Email/password login form
    signup-form.tsx      Email/password signup form
    logout-button.tsx    Sign out button
    site-version.tsx     Version display component
  lib/
    llm/
      dispatcher.ts      Routes extraction to CLI or API backend
      llm-api.ts         Anthropic SDK backend (per-user API key)
      llm-cli.ts         Claude Code CLI backend (local or remote)
      prompts.ts         Extraction system prompt (JSON schema instructions)
      parse.ts           Response parser/validator
      settings.ts        llm_settings table CRUD
      types.ts           LLMMode, LLMSettings types
    schwab/
      client.ts          Schwab API client with auto-refresh
      config.ts          API URLs, token lifetimes
      credentials.ts     Schwab app key/secret CRUD
      tokens.ts          Token encrypt/decrypt/store/get + AES-256-GCM helpers
      types.ts           Schwab API response types
    upload/
      file-processor.ts  Pre-process files by type for Claude
      account-matcher.ts Match extracted accounts to DB accounts
      data-writer.ts     Write confirmed data to canonical tables
      config.ts          Upload limits, MIME types, Claude model config
      types.ts           Upload and extraction types
    supabase/
      client.ts          Browser Supabase client
      server.ts          Server Supabase client (cookie-based)
      middleware.ts       Session refresh middleware
      admin.ts           Admin Supabase client (service role) + isAdmin()
    version-info.ts      Version metadata types and fetch helpers
scripts/
  bump-version.sh        Version bump engine (Supabase REST API)
  push-main.sh           Local convenience script for pushing to main
supabase/
  migrations/            All database migrations (14 files)
```

### Component Patterns

- `"use client"` directive on all interactive components
- Data fetching: `useEffect` + `fetch()` to API routes (no server actions)
- Loading states: Skeleton pulse animations
- Error states: Red border/background with message text
- Styling: Tailwind CSS 4 utility classes only (no CSS modules, no styled-components)
- Icons: Inline SVGs (gear icon, Google logo) and lucide-react

### Data Source Tracking

All accounts, transactions, and snapshots track their origin via `data_source`:
- `'schwab_api'` — synced from Schwab API
- `'manual_upload'` — extracted from uploaded documents via LLM
- `'manual_entry'` — entered by user directly (future)

---

## Migrations Reference

Listed in execution order:

| # | Migration File | Creates |
|---|---------------|---------|
| 1 | `20250215000000_schwab_tokens.sql` | `schwab_tokens` table + RLS |
| 2 | `20250216000000_schwab_credentials.sql` | `schwab_credentials` table + RLS |
| 3 | `20250216100000_release_events.sql` | `release_events`, `release_event_commits`, `record_release_event()` RPC |
| 4 | `20250216200000_accounts.sql` | `accounts` table + RLS |
| 5 | `20250216200001_position_snapshots.sql` | `position_snapshots` table + RLS |
| 6 | `20250216200002_balance_snapshots.sql` | `balance_snapshots` table + RLS |
| 7 | `20250216200003_uploaded_statements.sql` | `uploaded_statements` table + RLS |
| 8 | `20250216200004_transactions.sql` | `transactions` table + RLS |
| 9 | `20250216200005_market_prices.sql` | `market_prices` table (service-role write) |
| 10 | `20250216200006_statements_storage.sql` | `statements` Storage bucket + RLS |
| 11 | `20250216200007_updated_at_triggers.sql` | `updated_at` triggers on all mutable tables |
| 12 | `20250217000000_upload_feature_updates.sql` | Alters `uploaded_statements` + bucket for LLM extraction |
| 13 | `20250217100000_llm_settings.sql` | `llm_settings` table + RLS |
| 14 | `20250217100000_user_profiles.sql` | `user_profiles` table + trigger + admin seeding |
