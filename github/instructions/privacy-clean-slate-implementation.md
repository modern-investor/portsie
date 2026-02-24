# Clean-Slate Privacy-First Implementation Prompt

You are Claude Opus 4.6 acting as a staff-level security + platform engineer in the Portsie repository.

## Objective

Implement a **clean-slate, privacy-first architecture** in one implementation wave.

Important context:
- This app has no irreplaceable production data yet.
- Current data is disposable/reproducible via re-upload.
- Prioritize security/correctness and long-term architecture over backward compatibility.
- It is acceptable to perform breaking schema changes if they improve the final design.

---

## High-Level Goals

1. Reduce breach impact by preventing direct identity linkage in stored data.
2. Minimize retained sensitive payloads (especially raw model output and source files).
3. Build a robust privacy foundation that supports:
   - Managed Cloud (hardened)
   - Future Private Deployment / BYO backend
4. Ensure operational controls exist (key lifecycle, retention, incident response, access control).

---

## Existing Repo Context (inspect first)

Immediately inspect these files and surrounding modules:
- `src/lib/schwab/tokens.ts`
- `src/lib/llm/settings.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/upload/[id]/extract/route.ts`
- `src/app/api/upload/[id]/process/route.ts`
- `src/lib/supabase/admin.ts`
- `src/lib/upload/*`
- `src/lib/extraction/*`
- `src/app/api/admin/*`
- `supabase/migrations/*`
- `docs/product-design.md`

Assume current behavior includes:
- Uploading source files to Supabase storage
- Persisting extracted JSON and raw LLM responses
- Admin routes with service-role capabilities

---

## Non-Negotiable Design Decisions

### 1) Privacy-by-default mode
Set default system behavior to **strict privacy**:
- No raw LLM payload retention by default
- Minimal source-file retention
- Minimal sensitive metadata retention
- Redacted logging everywhere

### 2) App-layer crypto primitives
Implement centralized privacy crypto utilities:
- AES-256-GCM field encryption (versioned ciphertext format)
- HMAC-SHA256 deterministic tokenization for exact-match lookups
- Key ID / version support for rotation
- Strict validation + typed helpers

### 3) Break-first schema cleanup
Because data is disposable:
- Remove or deprecate plaintext direct-identifier columns aggressively
- Add encrypted + tokenized replacements
- Avoid long-lived dual-write compatibility unless required for rollout safety
- Prefer clean target schema over transitional complexity

### 4) Data minimization
Store only what is necessary for product function.
If a field is not required for UX, matching, or compliance, do not store it.

### 5) Decrypt-on-need only
- Decrypt only in authorized server paths
- Never return encrypted blobs to client
- Never log plaintext sensitive values

---

## Concrete Deliverables

### A) New docs

#### 1. `docs/privacy-architecture-and-controls.md`
Include:
- Updated data flow + trust boundaries
- Threat model (DB leak, DB+storage leak, runtime compromise, key leak)
- Which controls mitigate what
- Residual risks and assumptions
- Managed Cloud vs Private Deployment trust differences

#### 2. `docs/privacy-data-classification-matrix.md`
For each relevant table/object:
- Field classification: direct identifier / quasi identifier / financial core / operational
- Storage treatment: plaintext / encrypted / tokenized / dropped
- Search strategy
- Retention policy
- Justification per field

#### 3. `docs/privacy-operations-runbook.md`
Operational requirements:
- Key generation, storage, rotation, and re-encryption process
- Access control and break-glass policy
- Redaction/logging standards
- Retention/deletion schedules and jobs
- Incident response checklist
- Quarterly audit checklist
- Third-party provider review cadence
- Private deployment checklist

#### 4. `docs/privacy-copy-drafts.md`
Product/legal-safe copy for:
- Privacy mode descriptions
- “What we can/cannot access” statements
- Managed vs Private deployment positioning

---

### B) Privacy crypto + mapping layer

Create:
- `src/lib/privacy/crypto.ts`
- `src/lib/privacy/types.ts`
- `src/lib/privacy/redaction.ts`
- `src/lib/privacy/mappers/*`

Requirements:
- Single source of truth for encryption/tokenization/redaction
- Domain-separated tokenization (e.g., account number token != email token)
- Helper functions for safe logging and safe API serialization
- No ad hoc crypto in route handlers

---

### C) Schema and migration overhaul

Create new Supabase migrations (idempotent where possible) that:

1. Introduce encrypted/token columns for direct identifiers.
2. Remove/deprecate plaintext columns no longer acceptable.
3. Add narrow indexes for token lookups only.
4. Add retention-support columns if needed (e.g., purge markers/timestamps).

Because this is clean-slate:
- Keep migration history coherent and production-safe.
- Prefer a clean destination schema over preserving old shapes.
- If dropping old columns is risky in one migration, do two-step migration in same implementation wave.

---

### D) Upload/extraction privacy hardening

Refactor upload + extraction flows so that:

1. `raw_llm_response` is not persisted by default.
   - If debug mode exists, keep strict gated + redacted/trimmed storage only.
2. `extracted_data` is minimized for identity-bearing fields.
3. Source files have configurable retention with strict default.
4. Logging and error paths redact sensitive fields systematically.
5. Admin/debug endpoints cannot accidentally exfiltrate sensitive payloads.

---

### E) Privacy mode config

Implement explicit privacy config:
- `strict` (default)
- optionally `standard` for development fallback

Define behavior matrix in code + docs:
- Raw response retention
- Source file retention
- Debug verbosity
- Admin visibility constraints

---

### F) Admin/service-role hardening

Audit all service-role usages and tighten:
- minimum selected columns
- explicit response allowlists
- never return decrypted sensitive data unless absolutely necessary
- defensive authorization checks

---

### G) Testing

Add robust tests:

1. Unit tests: encryption/decryption/tokenization + failure cases.
2. Unit tests: redaction helpers and mapper behavior.
3. Integration tests: upload/extract routes under strict privacy defaults.
4. Regression tests: ensure no plaintext sensitive data is logged or returned.
5. Migration smoke checks.

If full coverage is not possible in one pass, add highest-value tests and document gaps clearly.

---

## Operational Measures You Must Encode in Deliverables

Your implementation and docs must define concrete ongoing measures:

1. **Key management lifecycle**
   - key IDs
   - storage in secret manager/KMS path
   - rotation cadence and re-encryption runbook
2. **Data retention**
   - short retention for source files/debug artifacts
   - explicit purge jobs and verification process
3. **Access governance**
   - least privilege
   - MFA requirement for admin/infrastructure
   - break-glass with audit trail
4. **Observability without leakage**
   - structured logging with field denylist
   - alerting on unsafe log patterns if feasible
5. **Incident readiness**
   - breach triage and containment checklist
   - customer comms triggers
6. **Third-party privacy posture**
   - periodic review of LLM/provider data handling terms
   - data egress inventory maintenance

---

## Implementation Style Constraints

- TypeScript-first, strict types.
- Keep code readable and centralized.
- Avoid duplicate privacy logic.
- Prefer explicitness over “magic.”
- Include succinct comments only where logic is non-obvious.

---

## Execution Protocol

1. Start by producing a concise implementation plan based on real repo inspection.
2. Implement all changes end-to-end.
3. Run lint/tests and fix issues introduced by your changes.
4. Provide a final report:
   - files changed
   - migrations added
   - behavior changes
   - test results
   - residual risks and follow-ups

---

## Acceptance Criteria (must pass)

- Direct identifiers are encrypted/tokenized across relevant write paths.
- Plaintext sensitive fields are removed/minimized in storage schema.
- Raw model responses are not retained by default.
- Logs are redacted in sensitive paths.
- Admin/service-role endpoints are narrowed and safer.
- Operational runbook is concrete and actionable.
- Docs clearly explain trust model and limits.
- Core upload/extract UX still functions under strict privacy defaults.

If any criterion cannot be fully met in one pass, implement the safest possible partial and list exact remaining work with prioritized next steps.
