# Data Ingestion Architecture: Recommendations for Increasing Accuracy Across Formats and Institutions

This document recommends architectural changes so the system can get **increasingly accurate** at ingesting files in different formats from different institutions, with **humans in the loop**, **verification** that new formats are properly normalized and mapped, and **mechanisms to add or fix** behavior per upload type and per institution.

Recommendations are informed by:

- Current pipeline: single LLM prompt → validation → account match → DB write; optional preview/confirm; post-confirm quality check with re-extract on failure.
- Sample files reviewed: Robinhood activity CSVs (Trad, Roth, Individual), Robinhood 1099 CSV (multi-section), Schwab JSON transaction exports, and PDFs (Schwab summary, Robinhood statements).

---

## 1. Current State Summary

| Aspect | Current behavior |
|--------|------------------|
| **Format detection** | Only file extension/MIME (`pdf`, `csv`, `json`, etc.). No detection of *document kind* (e.g. activity CSV vs 1099 CSV) or institution from content. |
| **Institution / document type** | Inferred by the LLM and stored in `extraction.document`; not used to select different prompts or parsers. |
| **Prompt** | Single `EXTRACTION_SYSTEM_PROMPT` for all file types and institutions. Broker hints (e.g. Robinhood trans codes) are in the prompt but not conditional. |
| **Human in the loop** | Preview → confirm (with optional account map overrides). After auto-confirm, quality check can trigger re-extract with QC feedback. No structured capture of user corrections. |
| **Verification** | Integrity check (totals vs document); QC compares extraction vs DB. No format- or institution-specific validation rules. |
| **Per-format/institution fixes** | New trans codes or column mappings require code/prompt edits; no data-driven config. |

---

## 2. Format and Institution Detection (Pre-LLM or Early Post-LLM)

**Goal:** Know *what* we’re dealing with (institution + document type + format variant) so we can route to the right prompt, parser, and validation rules.

### 2.1 Content-based format / institution detection

- **Where:** After upload, before or immediately after first LLM call (or in parallel with a small “classifier” call).
- **Inputs:** File type, filename, and optionally a quick peek at content:
  - **CSV:** First row (headers). Robinhood activity: `"Activity Date","Process Date","Settle Date","Instrument",...`. Robinhood 1099: `1099-DIV,ACCOUNT NUMBER,TAX YEAR,...`. Different header sets → different “format profile.”
  - **JSON:** Top-level keys. Schwab: `FromDate`, `ToDate`, `BrokerageTransactions` → Schwab transaction export.
  - **PDF:** Filename and/or a cheap LLM classification call: “Is this a portfolio summary, statement, or 1099? Which institution?”
- **Output:** A **format profile key**, e.g. `{ institution: "Robinhood", document_type: "transaction_export", format_variant: "activity_csv" }` or `{ institution: "Charles Schwab", document_type: "transaction_export", format_variant: "json" }`.

**Recommendation:**

1. Add a **format detection** step that runs on:
   - **CSV:** Parse first row; match against a small table of known header signatures (e.g. Robinhood activity columns, Robinhood 1099 section headers, Fidelity columns).
   - **JSON:** Match top-level keys (e.g. `BrokerageTransactions`, `FromDate`, `ToDate`) to known structures (Schwab JSON).
   - **PDF/Image:** Either use filename heuristics (e.g. “Robinhood”, “Schwab”) or a single short LLM call: “Return JSON: { institution, document_type } only.”
2. Persist the result on `uploaded_statements`, e.g.:
   - `detected_institution TEXT`
   - `detected_document_type TEXT` (portfolio_summary | transaction_export | tax_1099 | statement | csv_export)
   - `detected_format_variant TEXT` (e.g. `robinhood_activity_csv`, `robinhood_1099_csv`, `schwab_transactions_json`)

This gives a stable key for routing and for storing per-format/institution config and corrections.

### 2.2 Fallback when detection is unknown

- If no profile matches, use the current single generic prompt and set `detected_format_variant = 'generic'`.
- Flag these in the UI (“Unknown format — review carefully”) and use them as candidates for defining a new format profile when a human confirms or corrects.

---

## 3. Verification That a New Format Is Properly Normalized and Mapped

**Goal:** Before treating a format as “supported,” verify that extraction and mapping are correct; if not, trigger fixes (prompts or code) per format/institution.

### 3.1 Verification gates (automated)

Run in order; any failure can block auto-confirm or require human review.

1. **Schema and normalization (existing)**  
   - Validation (Stage 2): required fields, enums, dates, numbers.  
   - Keep and extend (e.g. symbol normalization, more date/action coercions as in the upload-pipeline code review).

2. **Integrity (existing, extend)**  
   - Document total vs sum of account balances; balance vs positions + cash; liability sign.  
   - Add **format-specific checks** where the format implies a known structure, e.g.:
     - **Robinhood activity CSV:** Transaction count from pre-parsed rows vs extraction transaction count (within tolerance for skipped/invalid rows).
     - **Schwab JSON:** Sum of `BrokerageTransactions[].Amount` (parsed) vs extraction `total_amount` sum.

3. **Spot-check / sampling (new)**  
   - For CSV/JSON, compare a small random sample of rows to the extracted transactions/positions (same date, symbol, amount).  
   - If a format profile is known, run a small “golden file” or “golden rows” test: for that profile, a few hand-verified rows must extract correctly (stored in tests or in a small DB table of golden snippets).

4. **Confidence and notes (existing, use more)**  
   - If `confidence === 'low'` or `notes` mention truncation, missing data, or ambiguity, require human review before confirm (or block auto-confirm for that upload).

**Recommendation:**

- Add an optional **verification mode** per upload or per format profile:
  - **Strict:** Integrity must pass; if format profile is known, run format-specific checks; low confidence or spot-check failure → do not auto-confirm, set status to `extracted` and show “Needs review” in UI.
  - **Lenient (current):** Integrity and QC can warn; auto-confirm still allowed.
- Store verification results (e.g. `integrity_report`, `format_specific_checks`, `spot_check_result`) on the upload so humans and support can see why something was flagged.

### 3.2 Human verification for new formats

- When `detected_format_variant === 'generic'` or when a **new** variant is first seen (e.g. new header signature):
  - Do **not** auto-confirm; set status to `extracted`.
  - In the preview UI, show: “New format detected. Please review and confirm. Your confirmation will help us improve this format.”
- After the user confirms (or corrects and confirms), treat that as a **verification event**: optionally compare user’s account mapping and any edits (if we capture them) to the extraction, and use that to:
  - Create or update a format profile (e.g. from headers + institution).
  - Add or adjust prompt hints or action maps for that profile (see below).

---

## 4. Per–Upload Type and Per-Institution Configuration (Prompts and Mappings)

**Goal:** Support new formats and institutions without changing core code: drive prompts and normalization from data (DB or config files).

### 4.1 Format profile registry

- **Concept:** A registry of **format profiles**. Each profile has:
  - **Key:** e.g. `robinhood_activity_csv`, `schwab_transactions_json`, `robinhood_1099_csv`.
  - **Detection:** How we recognize it (e.g. CSV header fingerprint, JSON top-level keys).
  - **Prompt overlay:** Optional extra instructions or substitutions for the main extraction prompt (institution-specific column hints, trans code tables, 1099 section rules).
  - **Action map overlay:** Additional or override `Trans Code` / `Action` → Portsie `action` (e.g. Robinhood `CIL`, `SOFF`, `CRRD`, `CFRI`, `GDBP`, `FUTSWP`, `MTCH`, `T/A` from your samples).
  - **Column map (CSV/JSON):** For deterministic parsing, optional mapping from source columns to schema fields (e.g. Activity Date → transaction_date, Trans Code → action). Can be used to validate or to fill gaps when LLM skips a row.

- **Storage options:**
  - **Option A:** JSON/TS config files in repo, e.g. `src/lib/ingestion/profiles/robinhood_activity_csv.ts`, loaded at runtime.
  - **Option B:** DB table `ingestion_format_profiles` (admin-editable): key, detection_rule (e.g. JSON path or header regex), prompt_overlay, action_map_overlay, column_map.

**Recommendation:**

- Start with **Option A** (files) for a small set of profiles (Robinhood activity CSV, Robinhood 1099 CSV, Schwab JSON). Each profile exports:
  - `detect(buffer, fileType, filename): boolean | FormatProfileKey`
  - `getPromptOverlay(): string` (appended or inserted into the main prompt)
  - `getActionMapOverlay(): Record<string, TransactionAction>`
  - Optionally: `getColumnMap(): Record<string, string>` for validation or hybrid parsing.
- When the LLM returns `document_type` / `institution_name`, compare to the profile key; if they disagree, add a note and optionally prefer the profile key for routing (since detection is deterministic).

### 4.2 Using profile in the pipeline

- **Before extraction:** Run format detection; set `detected_format_variant` (and institution/document_type if from detection).
- **Prompt:** If a profile exists, append (or inject) `getPromptOverlay()` to the main system prompt. Overlay can include:
  - “This file is a Robinhood activity CSV. Columns: Activity Date → transaction_date, Trans Code → action (see table below), Instrument → symbol, Amount → total_amount.”
  - Full list of Robinhood trans codes (SLIP, CDIV, CRRD, BTO, STC, CIL, SOFF, CFRI, ACATI, GDBP, INT, FUTSWP, MISC, DCF, GMPC, GOLD, ACH, SPL, MTCH, T/A, etc.) with Portsie action mapping.
- **Validation:** Merge profile’s `getActionMapOverlay()` into the validator’s ACTION_MAP so that institution-specific codes (e.g. CIL, SOFF, CRRD) normalize correctly.
- **New format:** When a new format is confirmed by a human (or discovered via “generic” uploads), add a new profile file (or DB row) with detection rule and overlays; no change to core extraction or validation logic.

---

## 5. Human-in-the-Loop and Correction Capture

**Goal:** Use human review and corrections to improve the system over time and to verify new formats.

### 5.1 Explicit review steps

- **Preview-before-confirm (existing):** Keep and strengthen:
  - Show detected format profile if available (“We detected: Robinhood activity CSV”).
  - Show integrity and any format-specific check results; if failed, explain in plain language (“Total value doesn’t match document total”).
  - Allow account mapping overrides (existing) and, in the future, optional per-account or per-transaction corrections (see below).
- **Post-confirm QC (existing):** Keep. When QC fails, Phase 1 re-extract with QC feedback already uses the extraction + check result; consider also injecting the **format profile’s prompt overlay** in the re-extract so the model is reminded of institution-specific rules.

### 5.2 Capturing user corrections (future)

- **Concept:** When a user changes something at confirm time (e.g. account mapping override, or in the future editing a transaction action or amount), store a minimal **correction** record:
  - Upload id, format profile key, what was changed (e.g. “account mapping for index 2: matched to account X” or “transaction action 5: sell → dividend”).
- **Use:** 
  - **Analytics:** Which formats/institutions get the most overrides? Prioritize prompt/validator improvements there.
  - **Learning:** If many users map “Trans Code = CIL” to “interest” or “other,” add CIL → interest (or other) to the profile’s action map and/or the main validator.
  - **Golden data:** Corrected extractions can be anonymized and used as golden examples for regression tests or for few-shot prompt patches for that profile.

**Recommendation:**

- Add a simple `upload_corrections` or `confirm_overrides` table (or JSONB on `uploaded_statements`): upload_id, format_profile, overrides (e.g. account_mappings override already stored), and optional list of field-level corrections (e.g. `[{ path: "accounts[0].transactions[3].action", from: "other", to: "interest" }]`). Start with account mapping only; extend to field-level when the UI supports editing extracted rows.

### 5.3 Product flow for “new format” and “fix this format”

- **New format (first time we see it):**
  1. Detection returns `generic` or a new variant key.
  2. Extraction runs with the generic prompt; integrity/QC may warn.
  3. UI: “Unknown format. Please review. After you confirm, we can save this format for future uploads.”
  4. User reviews, overrides if needed, confirms.
  5. Backend: Store the format signature (e.g. CSV headers or JSON keys) plus institution/document_type from extraction (or from user if we add “Institution” dropdown). Optionally create a draft format profile (e.g. in admin) for an engineer to fill in prompt overlay and action map.
- **Fix this format (recurring issues for a known format):**
  1. QC or integrity failures for a known profile can be routed to an internal list or admin view: “Robinhood 1099 CSV: 3 failures this week.”
  2. Engineer or support adds/edits prompt overlay or action map for that profile (e.g. add 1099-B column mapping for COST BASIS, SALES PRICE).
  3. Re-run extraction for failed uploads (or users re-upload); verify with the new profile.

---

## 6. Mechanisms to Add or Fix Behavior Per Upload Type and Institution

**Goal:** When a new institution or a new document type (e.g. 1099, statement, account summary) appears, we can add support by **data and config**, not only by changing core code.

### 6.1 Prompt overlays (per institution + document type)

- Stored in the format profile (file or DB).
- Examples:
  - **Robinhood activity CSV:** “Use Activity Date for transaction_date; Trans Code: SLIP→interest, CDIV→dividend, CRRD→journal, BTO→buy, STC→sell, CFRI→transfer_in, ACATI→transfer_in, GDBP→interest, GOLD→fee, ACH→transfer_in, SPL→stock_split, MTCH→interest, T/A→other; Amount: parentheses = negative.”
  - **Robinhood 1099 CSV:** “Multiple sections (1099-DIV, 1099-INT, 1099-B, 1099-MISC). Each section has different columns. For 1099-B use SALE DATE, COST BASIS, SALES PRICE, PROIT; for 1099-DIV use ORDINARY DIV, QUALIFIED DIV; for 1099-INT use INT INCOME.”
  - **Schwab JSON:** “BrokerageTransactions[]. Date may be 'MM/DD/YYYY as of MM/DD/YYYY' — use the first date for transaction_date. Action: 'Security Transfer'→transfer_out or transfer_in by Amount sign; 'Cash Dividend'→dividend; 'Journaled Shares'→journal; 'Bank Interest'→interest; 'Service Fee'→fee. Quantity can be negative and contain commas — strip commas and parse.”

### 6.2 Action and column maps (per format)

- **Action map:** Already partially in the validator; extend by merging profile-specific maps so that e.g. Robinhood CIL, SOFF, CRRD, GDBP, FUTSWP, MTCH, T/A are normalized without code changes.
- **Column map:** For CSV/JSON, a mapping from source column names to schema fields. Used to:
  - Validate: after LLM extraction, compare transaction count and a sample of rows against a deterministic parse using the column map; flag if mismatch.
  - Hybrid: for some formats, run a deterministic parser first and merge with LLM output (e.g. use deterministic for numeric/date columns, LLM for description/classification).

### 6.3 When to add code vs config

- **Config (prompt overlay, action map, column map):** Institution- or document-type-specific rules that only affect prompting or normalization. Example: new Robinhood trans code, new Schwab JSON action string, new CSV column set for a 1099.
- **Code:** Changes to schema (new fields, new document types), new file type (e.g. OFX parsing), or new pipeline step (e.g. format detection). Code is also where we add new format profiles that point at new overlays.

---

## 7. Sample-File Takeaways (Concrete Hooks)

From the files you provided:

| File | Format | Institution | Suggested profile key | Notes |
|------|--------|-------------|----------------------|-------|
| Robinhood Trad report.csv | CSV | Robinhood | `robinhood_activity_csv` | Headers: Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount. Multiline Description (CUSIP). Trans codes: SLIP, CDIV, CRRD, Sell, Buy, STC, BTC, BTO, CFRI, CIL, SOFF, ACATI, etc. |
| Robinhood roth report.csv | CSV | Robinhood | `robinhood_activity_csv` | Same structure. CFRI, MTCH, T/A. |
| robinhood ind report.csv | CSV | Robinhood | `robinhood_activity_csv` | Same. GDBP, INT, FUTSWP, MISC, DCF, GMPC, GOLD, ACH, SPL. |
| Robinhood a1ca0791...csv | CSV | Robinhood | `robinhood_1099_csv` | Multi-section: 1099-DIV, 1099-INT, 1099-B, 1099-MISC. Different columns per section. |
| RS_-_Trad_IRA_XXX902_Transactions_*.json | JSON | Charles Schwab | `schwab_transactions_json` | FromDate, ToDate, BrokerageTransactions[]. Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount. Action: Security Transfer, Misc Cash Entry, Bank Interest, Service Fee, etc. |
| SubTrust_Trad_IRA_XXX403_*.json | JSON | Charles Schwab | `schwab_transactions_json` | Same. Journaled Shares, Journal, Sell, Cash Dividend, Qualified Dividend. |

- **Robinhood activity CSV:** One profile; prompt overlay + extended action map (all trans codes above). Handle multiline CSV cells in pre-processor or instruct LLM.
- **Robinhood 1099 CSV:** Separate profile; prompt overlay describing section headers and column mapping per 1099 type.
- **Schwab JSON:** One profile; prompt overlay for Date “as of” and Action strings; optional deterministic parser for BrokerageTransactions with column map to validate or supplement LLM.

---

## 8. Implementation Order (Suggested)

1. **Format detection (CSV headers, JSON keys)** and persist `detected_institution`, `detected_document_type`, `detected_format_variant` on upload. No change to prompt yet.
2. **Format profile registry (files)** for Robinhood activity CSV and Schwab JSON: detection + prompt overlay + action map overlay. Wire overlays into prompt and validator.
3. **Verification gates:** Strict mode option; format-specific checks (e.g. transaction count for CSV); require human review when variant is `generic` or new.
4. **Human-in-the-loop:** “New format” messaging in UI; store confirm overrides (and later field-level corrections); use overrides to prioritize and add profile entries.
5. **Robinhood 1099 CSV profile** and any other high-value formats from real usage.
6. **Correction capture and analytics** (which profiles get the most overrides) and optional golden-data pipeline for regression tests.

---

## 9. Summary

| Mechanism | Purpose |
|-----------|---------|
| **Content-based format detection** | Know institution + document type + format variant so we can route and store per-format config. |
| **Format profile registry** | Per-format prompt overlays and action/column maps so new formats and institutions are supported via config, not only code. |
| **Verification gates** | Integrity + format-specific checks + optional spot-check; strict mode can require human review for new or failing formats. |
| **Human review for new formats** | No auto-confirm for unknown/generic formats; user confirmation becomes a verification event and can seed new profiles. |
| **Correction capture** | Store overrides and (later) field corrections to learn action maps, improve prompts, and build golden data. |
| **“Fix this format” workflow** | Use QC/integrity failures and correction data to add or edit profile overlays and maps per institution and upload type. |

Together, these make the system **progressively more accurate** for known formats (via profiles and validation) and **verifiable and fixable** for new formats (via detection, human review, and config-driven overlays and maps).
