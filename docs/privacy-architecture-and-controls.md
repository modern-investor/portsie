# Privacy Architecture and Controls

Internal technical documentation for the Portsie privacy implementation.

---

## Threat Model

### Trust Boundaries

```
┌─────────────────────────────────────────────────────┐
│  Browser (User Agent)                                │
│  - Session token (httpOnly cookie)                   │
│  - No sensitive data in localStorage/cookies         │
└──────────────┬──────────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────────┐
│  Next.js App (Vercel Edge/Node)                      │
│  - Server-side encryption/decryption                 │
│  - Env vars: encryption keys, API keys               │
│  - safeLog() redaction on all sensitive paths         │
└──────────────┬──────────────────────────────────────┘
               │ Supabase SDK (HTTPS + JWT)
┌──────────────▼──────────────────────────────────────┐
│  Supabase (PostgreSQL + Auth + Storage)              │
│  - RLS: auth.uid() = user_id on all tables           │
│  - Encrypted fields stored as ciphertext             │
│  - Storage: per-user folder ACL                      │
└─────────────────────────────────────────────────────┘

               │ HTTPS API calls
┌──────────────▼──────────────────────────────────────┐
│  External AI Providers                               │
│  - Google Gemini (default extraction)                │
│  - Anthropic Claude (fallback / user override)       │
│  - Document content sent, not stored for training    │
└─────────────────────────────────────────────────────┘
```

### Threat Categories

| Threat | Mitigation |
|--------|-----------|
| SQL injection | Supabase SDK parameterized queries; no raw SQL from user input |
| Cross-user data access | RLS policies on every table; enforced at DB level |
| Leaked encryption key | Versioned ciphertext format (`v1.`) enables key rotation |
| Leaked database dump | Sensitive fields encrypted; account numbers tokenized |
| AI provider data retention | API-only access; no training on API data per provider ToS |
| Admin endpoint abuse | Admin role check + email redaction + field-scoped SELECTs |
| Log exfiltration | safeLog() auto-redacts 20+ sensitive field patterns |
| MITM | HTTPS everywhere; Supabase enforces TLS |

---

## Encryption Scheme

### Field-Level Encryption (AES-256-GCM)

**Format:** `v1.{iv_base64}.{authTag_base64}.{ciphertext_base64}`

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key:** 256-bit key from `SCHWAB_TOKEN_ENCRYPTION_KEY` env var
- **IV:** 16 random bytes per encryption (unique per ciphertext)
- **Auth tag:** 16 bytes (128-bit) for integrity verification
- **Version prefix:** `v1.` enables future key rotation without re-encrypting all data

**Implementation:** `src/lib/privacy/crypto.ts` — `encryptField()` / `decryptField()`

**Backward compatibility:** The system detects legacy (unversioned) ciphertext from the older `schwab/tokens.ts` encrypt/decrypt functions and handles both formats.

### Deterministic Tokenization (HMAC-SHA256)

**Purpose:** Enable exact-match lookups on encrypted fields without decryption.

- **Algorithm:** HMAC-SHA256
- **Key:** Separate `PRIVACY_HMAC_KEY` env var (must differ from encryption key)
- **Domain separation:** Each field type uses a unique prefix (e.g., `account_number:`) to prevent cross-field token collisions

**Implementation:** `src/lib/privacy/crypto.ts` — `tokenize()` / `tokenizeAccountNumber()`

**Usage:** Account number matching during upload uses `account_number_token` for lookups instead of decrypting all account numbers for comparison.

---

## Encrypted Fields Inventory

| Table | Field | Encryption | Token | Hint |
|-------|-------|-----------|-------|------|
| `accounts` | `account_number_encrypted` | AES-256-GCM | `account_number_token` (HMAC) | `account_number_hint` (last 4 digits) |
| `schwab_tokens` | `access_token_encrypted` | AES-256-GCM | — | — |
| `schwab_tokens` | `refresh_token_encrypted` | AES-256-GCM | — | — |
| `schwab_credentials` | `app_key_encrypted` | AES-256-GCM | — | — |
| `schwab_credentials` | `app_secret_encrypted` | AES-256-GCM | — | — |
| `llm_settings` | `api_key_encrypted` | AES-256-GCM | — | — |

---

## Privacy Mode System

**Config source:** `PRIVACY_MODE` env var → `src/lib/privacy/config.ts`

| Behavior | `strict` (default) | `standard` (dev) |
|----------|-------------------|------------------|
| Retain raw LLM response | No | Yes |
| Retain verification data | No | Yes |
| Source file retention | 30 days | Indefinite |
| Log verbosity | Minimal | Normal |

The privacy config is read once per request via `getPrivacyConfig()` and passed to sanitization functions.

---

## Data Flow: Upload Pipeline

```
User uploads file
  │
  ▼
POST /api/upload
  → File stored in Supabase Storage (per-user folder)
  → Metadata row in uploaded_statements
  │
  ▼
POST /api/upload/[id]/extract
  → File downloaded from storage
  → Pre-processed (PDF→base64, XLSX→CSV, etc.)
  → Sent to AI provider (Gemini/Claude)
  → Response parsed into PortsieExtraction
  │
  ├── extracted_data = sanitizeExtractionForStorage(extraction, config)
  │   └── In strict mode: account numbers masked in stored JSON
  │
  ├── debug_context = buildDebugContext({backend, model, duration, tokens})
  │   └── Replaces raw_llm_response — only stores diagnostics
  │
  ├── Account matching via account_number_token (no decryption needed)
  │
  └── Accounts created with:
      ├── account_number_encrypted (AES-256-GCM)
      ├── account_number_token (HMAC-SHA256)
      └── account_number_hint (last 4 digits for display)
```

---

## Dropped Columns (Privacy Hardening Migration)

These columns were removed to eliminate unnecessary sensitive data retention:

| Table | Dropped Column | Reason |
|-------|---------------|--------|
| `uploaded_statements` | `raw_llm_response` | No product need; contained full document content |
| `uploaded_statements` | `verification_raw_response` | Same as above |
| `uploaded_statements` | `detected_account_info` | Redundant with `extracted_data.accounts` |
| `extraction_failures` | `raw_llm_response` | Error diagnostics don't need full response |
| `accounts` | `schwab_account_number` | Replaced by encrypted + tokenized fields |

---

## Logging Redaction

**Implementation:** `src/lib/privacy/redaction.ts`

### safeLog()

All sensitive code paths use `safeLog(level, tag, message, data?)` instead of `console.log/error/warn`. This function:

1. Deep-clones the data object
2. Replaces values for any key in the deny list with `"[REDACTED]"`
3. Outputs with consistent `[tag]` prefix

### Redacted Field Patterns

The deny list includes: `password`, `token`, `secret`, `api_key`, `access_token`, `refresh_token`, `encrypted`, `account_number`, `ssn`, `raw_llm_response`, `extracted_data`, `authorization`, and more.

### Where safeLog is Used

- `src/app/api/upload/[id]/extract/route.ts`
- `src/lib/extraction/db-writer.ts`
- `src/lib/llm/dispatcher.ts`
- `src/lib/upload/data-writer.ts`
- `src/app/api/admin/quality-checks/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/settings/failures/route.ts`

---

## Admin Endpoint Hardening

Admin endpoints (`/api/admin/*`) apply additional controls:

1. **Role check:** Only users with `role = 'admin'` in `user_profiles` can access
2. **Email redaction:** User emails shown as `r***@e***.com` via `redactEmail()`
3. **Field scoping:** Queries select only necessary columns (e.g., no `checks` JSONB in quality-checks list)
4. **No sensitive data:** Admin views never return encrypted fields, tokens, or full extraction data

---

## Residual Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Server-side encryption key compromise | High | Keys stored as env vars on Vercel/hosting; standard for managed cloud. BYOB mode eliminates this. |
| AI provider retains document data | Low | Both Google and Anthropic state API data is not used for training. No long-term retention per ToS. |
| Supabase platform breach | Medium | Data encrypted at rest by AWS + our field-level encryption. RLS prevents horizontal access. |
| Account number hint (last 4 digits) in plaintext | Low | Necessary for UX (display in account matching). Cannot be used to reconstruct full account number. |
