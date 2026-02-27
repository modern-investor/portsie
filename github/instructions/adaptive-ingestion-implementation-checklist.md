# Adaptive Ingestion Implementation Checklist (Claude 4.6)

## Purpose

This is the execution playbook for implementing the architecture in:
- `github/instructions/adaptive-ingestion-architecture-review.md`

Use this checklist as an ordered, no-guesswork implementation sequence.

---

## Non-Negotiable Guardrails

1. Do not mutate canonical financial tables for source-specific quirks.
2. Do not auto-apply schema changes from runtime observations.
3. Do not store raw LLM responses or unredacted sensitive payloads.
4. Every migration must be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, safe `DROP CONSTRAINT IF EXISTS`).
5. Every phase must pass its exit criteria before moving forward.

---

## Phase 0 - Preconditions

### Inputs to read first
- `github/instructions/adaptive-ingestion-architecture-review.md`
- `src/app/api/upload/[id]/extract/route.ts`
- `src/app/api/upload/[id]/confirm/route.ts`
- `src/app/api/upload/[id]/verify/route.ts`
- `src/app/api/quiltt/sync/route.ts`
- `src/lib/extraction/validate.ts`
- `src/lib/extraction/db-writer.ts`
- `src/lib/extraction/processing-log.ts`
- `supabase/migrations/`

### Entry criteria
- Architecture review understood and accepted as source of truth.
- Current migration pattern and status confirmed.

### Exit criteria
- Implementation branch created (if needed).
- Work plan split into PR-sized commits (recommended: 1 phase per commit).

---

## Phase 1 - Schema Foundation (Additive Only)

### Goal
Create governance and observability tables without changing existing canonical behavior.

### Files to add
- `supabase/migrations/<timestamp>_adaptive_ingestion_foundation.sql`

### Migration contents
Create (or equivalent names):
- `ingestion_sources`
- `ingestion_runs`
- `source_schema_registry`
- `ingestion_observations`
- `schema_change_proposals`

### Required properties
- PKs + FKs
- indexes for query hot paths
- CHECK constraints for statuses/types
- comments on governance columns
- RLS strategy documented in SQL comments

### Verification commands
- `supabase db push` (retry with `--include-all` if order issue)
- `supabase migration list`

### Exit criteria
- Migration applies cleanly.
- No existing route behavior changed.
- New tables visible and queryable.

---

## Phase 2 - Ingestion Run Tracking

### Goal
Track every ingestion attempt consistently across uploads and API sync.

### Files to update
- `src/app/api/upload/[id]/extract/route.ts`
- `src/app/api/upload/[id]/confirm/route.ts`
- `src/app/api/upload/[id]/verify/route.ts`
- `src/app/api/quiltt/sync/route.ts`
- `src/lib/quiltt/sync.ts` (only if needed for deeper event granularity)

### Implementation tasks
1. On route start, insert `ingestion_runs` row with `status='running'`.
2. On success, update with `status='completed'`, `duration_ms`, `finished_at`.
3. On handled failure, update with `status='failed'`, `error_category`, `error_message`.
4. Link upload runs to `uploaded_statement_id` where available.
5. Persist backend/model metadata where applicable.

### Required behavior
- Failures in run-tracking must not break ingestion routes.
- Existing response payload contracts remain unchanged.

### Exit criteria
- All target routes produce run records.
- Success/failure states are consistent with existing `parse_status` lifecycle.

---

## Phase 3 - Upload Detection Module

### Goal
Deterministically classify incoming uploads with confidence and structure signatures.

### Files to add
- `src/lib/upload/source-detector.ts`

### Files to update
- `src/app/api/upload/route.ts` (capture initial detection metadata)
- `src/app/api/upload/[id]/extract/route.ts` (final detection + run linkage)

### Detector requirements
- Multi-signal detection:
  - MIME/extension
  - magic bytes or marker tags
  - structural profile (CSV header/JSON key signature)
- Output:
  - `kind`
  - `confidence`
  - `reasons[]`
  - `structureSignature`

### Data persistence
- Store detection results in `ingestion_runs.diagnostics` and/or statement debug context.
- Register/update signatures in `source_schema_registry`.

### Exit criteria
- Known sample file types detect with stable signatures.
- Unknown types map to `unknown` with low confidence (no hard crash).

---

## Phase 4 - Adapter Registry and Normalization Contract

### Goal
Unify API and upload ingestion through a common adapter interface.

### Files to add
- `src/lib/extraction/adapters/types.ts`
- `src/lib/extraction/adapters/registry.ts`
- `src/lib/extraction/adapters/upload-adapter.ts`
- `src/lib/extraction/adapters/quiltt-adapter.ts` (or api adapter naming of choice)

### Files to update
- `src/app/api/upload/[id]/extract/route.ts`
- `src/app/api/quiltt/sync/route.ts` (or routing layer where API payload normalization begins)

### Adapter contract
- Input: source payload + detection context
- Output:
  - canonical `PortsieExtraction`
  - list of `observations` for unknown fields

### Constraints
- Existing `validateExtraction` remains authoritative for canonical acceptance.
- Adapters must not write directly to canonical DB tables.

### Exit criteria
- At least one upload path and one API path use adapter registry.
- Canonical extraction output remains compatible with confirm/write stages.

---

## Phase 5 - Unknown Field Observability

### Goal
Capture unmapped/unknown fields without losing data or polluting canonical schema.

### Files to update
- `src/lib/extraction/validate.ts`
- `src/app/api/upload/[id]/extract/route.ts`
- `src/lib/extraction/processing-log.ts` (optional: include unknown-count summary)

### Implementation tasks
1. Extend validation/normalization flow to emit unknown field observations.
2. Persist observations in `ingestion_observations`.
3. Add safe caps:
   - max observations per run,
   - value truncation/redaction for sensitive strings.

### Privacy requirements
- Reuse existing privacy utilities under `src/lib/privacy`.
- Never store raw sensitive identifiers unless encrypted/redacted policy explicitly allows.

### Exit criteria
- Unknown fields visible in DB with path/type/value samples.
- No increase in extraction hard-fail rate from observability logic.

---

## Phase 6 - Schema Proposal Automation

### Goal
Generate structured schema-change proposals from observed unknown fields.

### Files to add
- `scripts/generate-schema-proposals.ts`

### Optional API visibility
- `src/app/api/admin/schema-proposals/route.ts` (if admin UX/API needed now)

### Generation logic
- Aggregate observations by:
  - source
  - field path
  - structure signature
- Compute:
  - evidence count
  - first/last seen
  - risk score
- Upsert into `schema_change_proposals` with `status='open'`.

### Exit criteria
- Script runs locally and writes proposals.
- Duplicate proposals are merged by deterministic `proposal_key`.

---

## Phase 7 - Constraint Modernization (Optional After Stabilization)

### Goal
Reduce repetitive hardcoded source-constraint edits over time.

### Scope
- Do not do this phase until Phases 1-6 are stable in production-like tests.
- Keep backward compatibility while transitioning.

### Candidate files/migrations
- new migration(s) under `supabase/migrations/` to reduce enum/check churn safely
- source typing updates in shared TS unions where currently duplicated

### Exit criteria
- New source onboarding requires minimal schema constraint edits.
- No regressions in existing routes/data_source semantics.

---

## Test Matrix (Required)

### Unit tests
- detector classification + signature stability
- adapter output contract
- proposal aggregation key generation

### Integration tests
- upload flow: `upload -> extract -> confirm -> verify`
- api sync flow: quiltt sync route with ingestion run tracking
- mixed-source portfolio reads remain correct

### Replay tests
- Reprocess representative historical files/payloads through:
  - detector
  - adapter
  - validator
  - (dry-run) db writer row build

### Data integrity checks
- no duplicate transactions from replay
- no canonical schema drift
- parse_status lifecycle unchanged

---

## Deployment and Rollback Gates

### Rollout order
1. Deploy Phase 1 migration
2. Deploy Phase 2 tracking code
3. Deploy Phase 3+4 detection/adapters
4. Deploy Phase 5 observations
5. Enable Phase 6 proposal job

### Go/No-Go criteria per deploy
- error rate not worse than baseline
- ingestion latency within acceptable threshold
- no spike in `failed` status due to new instrumentation

### Rollback strategy
- Code rollback first (feature flags or revert deploy)
- Leave additive tables in place (safe)
- If needed, disable proposal generation script/job without dropping data

---

## PR Checklist Template (Use Per Phase)

- [ ] Migration is idempotent and reviewed
- [ ] No raw sensitive payload persistence introduced
- [ ] Existing API response contract unchanged (unless explicitly versioned)
- [ ] Tests added/updated and passing
- [ ] Replay sample executed and documented
- [ ] Rollback note included in PR description

---

## Definition of Done

Implementation is complete only when:

1. New sources can be ingested with detector + adapter path.
2. Unknown fields are captured and queryable.
3. Schema proposals are generated from real observation evidence.
4. Canonical financial tables remain stable and trustworthy.
5. Onboarding a new source is materially easier than before (fewer code/migration touchpoints).

