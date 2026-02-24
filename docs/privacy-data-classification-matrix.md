# Privacy Data Classification Matrix

Per-table field classification, storage treatment, and retention policy.

---

## Classification Levels

| Level | Description | Storage Treatment |
|-------|------------|-------------------|
| **Public** | Non-sensitive, can appear in logs and admin views | Plaintext |
| **Internal** | Operational data, not user-facing sensitive | Plaintext, excluded from verbose logs |
| **Confidential** | User financial or identity data | Encrypted at rest, redacted in logs |
| **Restricted** | Credentials, tokens, secrets | AES-256-GCM encrypted, never logged |

---

## accounts

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `id` | Public | Plaintext UUID | |
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `data_source` | Public | Plaintext enum | `schwab_api`, `manual_upload`, `manual_entry` |
| `account_number_encrypted` | Restricted | AES-256-GCM | Full account number |
| `account_number_token` | Confidential | HMAC-SHA256 | Deterministic lookup token |
| `account_number_hint` | Confidential | Plaintext (last 4 digits) | Display-only |
| `account_type` | Public | Plaintext | `brokerage`, `checking`, etc. |
| `account_category` | Public | Plaintext | `brokerage`, `banking`, `credit`, etc. |
| `account_nickname` | Internal | Plaintext | User-assigned label |
| `institution_name` | Internal | Plaintext | |
| `account_group` | Internal | Plaintext | |
| `is_active` | Public | Boolean | |
| `is_aggregate` | Public | Boolean | |

---

## schwab_tokens

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `id` | Public | Plaintext UUID | |
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `access_token_encrypted` | Restricted | AES-256-GCM | Short-lived OAuth token |
| `refresh_token_encrypted` | Restricted | AES-256-GCM | Long-lived refresh token |
| `access_token_expires_at` | Internal | Plaintext timestamp | |
| `refresh_token_expires_at` | Internal | Plaintext timestamp | |

---

## schwab_credentials

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `app_key_encrypted` | Restricted | AES-256-GCM | Schwab API app key |
| `app_secret_encrypted` | Restricted | AES-256-GCM | Schwab API app secret |
| `callback_url` | Internal | Plaintext | OAuth redirect URL |

---

## llm_settings

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `llm_mode` | Public | Plaintext enum | `gemini`, `cli`, `api` |
| `api_key_encrypted` | Restricted | AES-256-GCM | User's Anthropic API key |
| `cli_endpoint` | Internal | Plaintext URL | Custom CLI wrapper URL |

---

## uploaded_statements

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `id` | Public | Plaintext UUID | |
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `filename` | Internal | Plaintext | Original filename |
| `file_type` | Public | Plaintext | `pdf`, `csv`, `image`, etc. |
| `file_path` | Internal | Plaintext | Supabase Storage path |
| `file_size_bytes` | Public | Integer | |
| `sha256_hash` | Internal | Plaintext | Deduplication hash |
| `parse_status` | Public | Plaintext enum | |
| `extracted_data` | Confidential | JSONB (sanitized) | Account numbers masked in strict mode |
| `debug_context` | Internal | JSONB | Model, timing, token counts only |
| `source_file_expires_at` | Internal | Timestamp | Retention tracking |
| `source_file_purged_at` | Internal | Timestamp | Purge audit |
| `confirmed_at` | Public | Timestamp | |

**Dropped fields:** `raw_llm_response`, `verification_raw_response`, `detected_account_info`

---

## position_snapshots

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `account_id` | Internal | Plaintext UUID | |
| `symbol` | Internal | Plaintext | Ticker symbol |
| `quantity` | Confidential | Numeric | Holdings quantity |
| `market_value` | Confidential | Numeric | Dollar value |
| `cost_basis_total` | Confidential | Numeric | |
| `snapshot_date` | Internal | Date | |

---

## balance_snapshots

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `account_id` | Internal | Plaintext UUID | |
| `liquidation_value` | Confidential | Numeric | Total account value |
| `cash_balance` | Confidential | Numeric | |
| `equity` | Confidential | Numeric | |
| `snapshot_date` | Internal | Date | |

---

## transactions

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `user_id` | Internal | Plaintext UUID | RLS-enforced |
| `account_id` | Internal | Plaintext UUID | |
| `symbol` | Internal | Plaintext | |
| `action` | Internal | Plaintext | `buy`, `sell`, `dividend`, etc. |
| `quantity` | Confidential | Numeric | |
| `total_amount` | Confidential | Numeric | |
| `transaction_date` | Internal | Date | |

---

## extraction_failures

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `id` | Public | Plaintext UUID | |
| `upload_id` | Internal | Plaintext UUID | |
| `error_message` | Internal | Plaintext | Redacted in logs |
| `attempt_number` | Public | Integer | |
| `llm_mode` | Public | Plaintext | |

**Dropped fields:** `raw_llm_response`

---

## quality_checks

| Field | Classification | Storage | Notes |
|-------|---------------|---------|-------|
| `id` | Public | Plaintext UUID | |
| `user_id` | Internal | Plaintext UUID | |
| `upload_id` | Internal | Plaintext UUID | |
| `check_status` | Public | Plaintext enum | |
| `checks` | Confidential | JSONB | Contains extraction data; excluded from admin list view |
| `extraction_data` | Confidential | JSONB (nullable) | |

---

## Retention Policy

| Data Category | Default Retention | Configurable |
|--------------|-------------------|-------------|
| User account | Until deletion | No |
| Financial data (positions, balances, transactions) | Until user deletion | No |
| Uploaded source files | 30 days (strict) / Indefinite (standard) | Via PRIVACY_MODE |
| Raw AI responses | **Not retained** | No |
| Debug context | With upload metadata | No |
| Brokerage tokens | Until disconnect or expiry | No |
| Extraction failures | Indefinite (for debugging) | No |
