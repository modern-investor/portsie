# Privacy Operations Runbook

Operational procedures for key generation, rotation, data retention, incident response, and auditing.

---

## 1. Key Generation

### Encryption Key (SCHWAB_TOKEN_ENCRYPTION_KEY)

Used for AES-256-GCM field encryption across all sensitive fields.

```bash
# Generate a 256-bit (32-byte) hex key
openssl rand -hex 32
```

Store as `SCHWAB_TOKEN_ENCRYPTION_KEY` in environment variables (Vercel, `.env.local`).

### HMAC Key (PRIVACY_HMAC_KEY)

Used for deterministic tokenization of account numbers.

```bash
# Generate a 256-bit hex key (MUST be different from encryption key)
openssl rand -hex 32
```

Store as `PRIVACY_HMAC_KEY` in environment variables.

### Requirements
- Both keys must be exactly 64 hex characters (256 bits)
- Keys must be different from each other
- Keys must never be committed to source control
- Keys must be set in all environments (production, staging, local dev)

---

## 2. Key Rotation

The versioned ciphertext format (`v1.{iv}.{tag}.{ct}`) enables key rotation.

### Rotation Procedure

1. **Generate new key** (see Key Generation above)
2. **Update environment variable** with the new key
3. **Run re-encryption migration:**
   - Read all encrypted fields
   - Decrypt with old key
   - Re-encrypt with new key
   - Update rows in a transaction
4. **Verify** by spot-checking decryption of random rows
5. **Destroy old key** after confirming all data is re-encrypted

### Re-encryption Script (template)

```typescript
// scripts/rotate-encryption-key.ts
// 1. Set OLD_KEY and NEW_KEY env vars
// 2. Query all rows with encrypted fields
// 3. For each: decrypt(old) → encrypt(new) → update
// 4. Run in batches of 100 with transaction per batch
```

> **Note:** A full re-encryption script is not yet implemented. Build it before performing the first key rotation.

### HMAC Key Rotation

HMAC tokens are deterministic — rotating the HMAC key requires:
1. Re-tokenizing all account numbers with the new key
2. Updating all `account_number_token` values
3. This is more disruptive than encryption key rotation (no backward-compatible format)

---

## 3. Data Retention & Deletion

### Source File Retention

Files uploaded by users have a retention period tracked by `source_file_expires_at` in `uploaded_statements`.

**Strict mode:** 30 days after processing
**Standard mode:** Indefinite (no expiry set)

#### Purge Procedure (manual or scheduled)

```sql
-- Find expired files
SELECT id, file_path, source_file_expires_at
FROM uploaded_statements
WHERE source_file_expires_at < NOW()
  AND source_file_purged_at IS NULL;
```

For each expired file:
1. Delete from Supabase Storage: `supabase.storage.from('statements').remove([filePath])`
2. Update record: `SET source_file_purged_at = NOW()`
3. Optionally clear `file_path`

> **Note:** An automated purge job is not yet implemented. Run manually or set up a Supabase Edge Function cron.

### User Account Deletion

When a user deletes their account, Supabase `ON DELETE CASCADE` handles cleanup:
- All user-scoped tables cascade from `auth.users(id)`
- Storage files must be manually cleaned (cascade doesn't cover storage)

#### Full deletion checklist:
1. Delete auth user via Supabase Admin API
2. Verify cascade deleted all table rows
3. Delete storage folder: `statements/{user_id}/`
4. Verify no orphaned data remains

---

## 4. Incident Response

### Suspected Data Breach

1. **Contain:** Rotate all encryption keys immediately (see Key Rotation)
2. **Assess:** Determine which data was potentially exposed
3. **Classify:** Check the Data Classification Matrix for severity
4. **Notify:** If Restricted or Confidential data was exposed, notify affected users
5. **Remediate:** Patch the vulnerability, re-encrypt if needed
6. **Document:** Record the incident, timeline, and response

### Leaked Encryption Key

1. Generate new key immediately
2. Update environment variable in all deployments
3. Run re-encryption migration
4. Audit access logs for unauthorized decryption attempts
5. Rotate HMAC key if it was also compromised

### AI Provider Incident

If an AI provider reports a data breach:
1. Review which documents were sent during the affected period
2. Notify affected users
3. Consider switching to alternative provider
4. Document the incident

---

## 5. Audit Checklist

### Monthly

- [ ] Verify RLS policies are enabled on all user-scoped tables
- [ ] Check that no new columns store plaintext sensitive data
- [ ] Review admin endpoint access logs
- [ ] Verify encryption keys are set in all environments
- [ ] Check source file retention — run purge if needed

### Quarterly

- [ ] Review Data Classification Matrix for accuracy
- [ ] Audit new code paths for `console.log/error` (should use `safeLog`)
- [ ] Test encryption/decryption round-trip
- [ ] Verify HMAC tokenization determinism
- [ ] Review AI provider data handling policies for changes

### Annually

- [ ] Consider encryption key rotation
- [ ] Review privacy policy for accuracy
- [ ] Assess new threat vectors
- [ ] Test full user deletion flow

---

## 6. Environment Variables Reference

| Variable | Purpose | Format | Required |
|----------|---------|--------|----------|
| `SCHWAB_TOKEN_ENCRYPTION_KEY` | AES-256-GCM encryption for all sensitive fields | 64 hex chars | Yes |
| `PRIVACY_HMAC_KEY` | HMAC-SHA256 tokenization for account numbers | 64 hex chars | Yes |
| `PRIVACY_MODE` | Privacy behavior mode | `strict` or `standard` | No (default: `strict`) |
| `GEMINI_API_KEY` | Google Gemini API access | API key string | Yes (for default extraction) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin operations | JWT string | Yes |

---

## 7. Testing Procedures

### Encryption Round-Trip

```bash
npx vitest run src/lib/privacy/__tests__/crypto.test.ts
```

Verifies:
- Encrypt → decrypt produces original plaintext
- Different plaintexts produce different ciphertexts
- Same plaintext produces different ciphertexts (random IV)
- Tampered ciphertext fails authentication
- Versioned format is correct (`v1.` prefix)

### Tokenization Determinism

```bash
npx vitest run src/lib/privacy/__tests__/crypto.test.ts
```

Verifies:
- Same input + same domain = same token
- Same input + different domain = different token
- Token is not reversible

### Redaction Coverage

```bash
npx vitest run src/lib/privacy/__tests__/redaction.test.ts
```

Verifies:
- All deny-listed fields are redacted
- Nested objects are redacted
- Account numbers are masked correctly
- Emails are masked correctly
