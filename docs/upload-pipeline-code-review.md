# Upload Pipeline Code Review: Accuracy, Normalization, Categorization, Reliability

This document is a comprehensive code review of the financial document upload and extraction pipeline. Each suggestion includes: (1) description of the change, (2) justification, (3) files and line ranges affected, and (4) suggested approach or code so that Opus 4.6 (or another agent) can implement it.

**Data sources:** Some suggestions (notably 1.3, 1.4, and the data-driven additions in 3.2) are informed by real sample files: Robinhood activity CSVs (Trad/Roth/Individual), Robinhood 1099 CSV, and Charles Schwab JSON transaction exports. These files surface multiline CSV cells, multi-section CSV layout, and institution-specific trans codes that the original review did not assume.

---

## 1. File pre-processing (CSV / XLSX)

### 1.1 Increase CSV pre-extracted rows sent to the LLM

**Description:** For CSV files, only the first 5 pre-parsed rows are currently sent to the LLM as a hint (`llm-gemini.ts` uses `Math.min(5, preExtractedRows.length)`). For large transaction or position exports, 5 rows may not represent column semantics or value variety (e.g. different action types, date formats).

**Justification:** More representative samples improve extraction accuracy and reduce mis-mapping of columns (e.g. Activity Date vs Settlement Date). Sending a small structured summary (e.g. 20–30 rows, or column headers + first N and last N rows) gives the model better context without blowing token limits.

**Files / lines affected:**
- `src/lib/llm/llm-gemini.ts` — lines 65–74 (building `textPayload` with `preExtractedRows`).

**Suggested approach:**

- Option A (simple): Increase sample from 5 to 25 and add a “last 10” tail so the model sees late-date and end-of-file format.
- Option B (richer): Send column headers as a separate line, then “first 15” and “last 10” rows (e.g. `Columns: Activity Date, Symbol, Quantity, ...` then two JSON arrays). Document in the user message that the full file content follows.

**Suggested code (Option A) — replace the preExtractedRows block in llm-gemini.ts:**

Current pattern: `let textPayload = processedFile.textContent!` then optionally append the pre-parsed block, then `parts.push({ text: textPayload })`. Keep that; only change the appended block:

```ts
// In llm-gemini.ts, replace the preExtractedRows block (lines ~65-74) with:
if (processedFile.preExtractedRows && processedFile.preExtractedRows.length > 0) {
  const rows = processedFile.preExtractedRows;
  const headCount = Math.min(20, rows.length);
  const tailCount = rows.length > headCount ? Math.min(10, rows.length - headCount) : 0;
  textPayload += `\n\n--- Pre-parsed CSV structure (${rows.length} total rows) ---\n`;
  textPayload += `First ${headCount} rows:\n${JSON.stringify(rows.slice(0, headCount), null, 2)}`;
  if (tailCount > 0) {
    textPayload += `\n\nLast ${tailCount} rows:\n${JSON.stringify(rows.slice(-tailCount), null, 2)}`;
  }
  textPayload += "\n--- End pre-parsed data. Map the columns above to the schema. ---\n\n";
}
// Do NOT add processedFile.textContent again — textPayload already started with it above.
```

So the full flow remains: `let textPayload = processedFile.textContent!`, then the if-block appends the pre-parsed hint, then `parts.push({ text: textPayload })`.

---

### 1.2 Normalize CSV encoding and strip BOM

**Description:** CSV files are read as UTF-8 only. Some exports (e.g. Excel “CSV”) are UTF-16 or include a BOM, which can break parsing and cause the LLM to see mojibake or wrong column boundaries.

**Justification:** Real-world files often have BOM or different encodings. Normalizing to UTF-8 and stripping BOM increases reliability of both the pre-parser and the raw text sent to the LLM.

**Files / lines affected:**
- `src/lib/upload/file-processor.ts` — `case "csv":` block, lines 66–84.

**Suggested approach:**

- Decode with Node `Buffer` and strip UTF-8 BOM (`\uFEFF`). Optionally use a small heuristic to detect UTF-16 LE/BE (first 2 bytes) and decode accordingly, then re-encode to UTF-8 for the rest of the pipeline.

**Suggested code:**

```ts
// In file-processor.ts, replace the csv case body (lines 66-84) with:
case "csv": {
  let csvText = fileBuffer.toString("utf-8");
  // Strip BOM if present
  if (csvText.charCodeAt(0) === 0xfeff) {
    csvText = csvText.slice(1);
  }
  let rows: Record<string, unknown>[] = [];
  try {
    rows = csvParse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch {
    // If CSV parsing fails, we still send the raw text
  }
  return {
    contentType: "text",
    textContent: csvText,
    preExtractedRows: rows.length > 0 ? rows : undefined,
  };
}
```

Adding `relax_column_count: true` avoids hard failures on inconsistent column counts across rows (common in broker exports).

---

### 1.3 Handle CSV with multiline fields (data-driven: Robinhood activity CSV)

**Description:** Robinhood activity CSVs use a **Description** column that contains embedded newlines (e.g. "Tesla\nCUSIP: 88160R101", or "Forward Industries\nCUSIP: 349862409"). If the CSV parser treats newlines as row boundaries, those rows are split into multiple logical rows and column alignment is wrong — e.g. "CUSIP: 88160R101" is interpreted as a new row with fewer columns. Pre-extracted row counts and samples sent to the LLM then misrepresent the file.

**Justification:** Observed in Robinhood Trad/Roth/Individual report CSVs. Without handling multiline fields, `csv-parse` (or any line-based pre-parse) can produce too many rows and wrong column mapping, reducing extraction accuracy and potentially causing transactions to be dropped or misattributed.

**Files / lines affected:**
- `src/lib/upload/file-processor.ts` — `case "csv":` block. Ensure the parser is configured to respect quoted fields that span lines, or pre-process the raw text so that newlines inside quoted fields are temporarily replaced (e.g. with a placeholder) before parsing, then restored in the text sent to the LLM if needed.

**Suggested approach:**

- **Option A:** Use `csv-parse` with options that support multiline quoted fields. The library supports this when fields are properly quoted; Robinhood’s export may quote the Description field. Verify: if the raw file has `"Tesla\nCUSIP: 88160R101"` (newline inside quotes), then `csv-parse` with default or `relax_column_count: true` should already produce one row per logical record. If the file does **not** quote multiline fields, parsing will be wrong.
- **Option B:** If the CSV has unquoted newlines in the middle of fields, add a pre-pass: detect the header row (e.g. "Activity Date","Process Date",...), then parse only with a parser that supports multiline (e.g. `quote: '"'` and ensure the parser respects RFC 4180-style quoted fields). If that’s not possible, heuristically replace newlines that appear between two commas (or between comma and next quote) with a space before parsing, so pre-extracted rows stay aligned; document in the prompt that “Description may have been normalized (newlines → spaces) for parsing.”

**Suggested code (Option B — pre-pass when csv-parse fails or row count is suspiciously high):**

```ts
// In file-processor.ts csv case, after stripping BOM:
// If the first line looks like a header (e.g. contains "Activity Date" or "Trans Code"),
// try parsing with support for multiline quoted fields:
rows = csvParse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_column_count: true,
  relax_quotes: true,        // allow non-RFC quoting
  quote: '"',
  escape: '"',
});
// If rows.length is very large compared to line count (e.g. 2x), consider
// that newlines inside fields broke rows; optionally re-parse with a
// pre-pass that replaces \n inside quoted regions with a space.
```

Document in the prompt for CSV: “Description and other fields may contain newlines; treat them as a single cell.”

---

### 1.4 Multi-section CSV (data-driven: Robinhood 1099 CSV)

**Description:** Robinhood 1099 tax CSV is **not a single table**. It contains multiple sections (1099-DIV, 1099-INT, 1099-B, 1099-MISC), each with its own header row and different columns. The first row is "1099-DIV,ACCOUNT NUMBER,TAX YEAR,..."; the next is a data row; then "1099-INT,ACCOUNT NUMBER,..."; etc. Parsing the whole file with `columns: true` and a single header produces one flat table where column semantics change mid-file and most columns are misaligned.

**Justification:** Observed in Robinhood 1099 export. Single-table parsing yields wrong column mapping and lost or incorrect extraction for 1099-DIV, 1099-INT, 1099-B, and 1099-MISC data.

**Files / lines affected:**
- `src/lib/upload/file-processor.ts` — `case "csv":` block. Add detection for multi-section CSV (e.g. first column values like "1099-DIV", "1099-INT", "1099-B", "1099-MISC" on what would otherwise be “header” rows).
- `src/lib/llm/llm-gemini.ts` (or prompt): When multi-section is detected, either skip pre-parsed rows for the hint (so we don’t send one merged table) or send a short note to the LLM that “This CSV has multiple sections (1099-DIV, 1099-INT, 1099-B, 1099-MISC) with different columns; extract each section according to its own headers.”

**Suggested approach:**

- **Detection:** After parsing the first few rows, if the first column of consecutive rows matches known section markers (e.g. /^1099-(DIV|INT|B|MISC)$/i), set a flag `multiSectionCsv: true` and do not use `preExtractedRows` as a single table (or build a per-section list of rows and pass section labels + row counts to the prompt).
- **Prompt:** If multi-section is detected, append to the user message: “This file is a multi-section 1099 CSV. Sections: 1099-DIV (columns: ACCOUNT NUMBER, TAX YEAR, ORDINARY DIV, QUALIFIED DIV, …), 1099-INT (…), 1099-B (DATE ACQUIRED, SALE DATE, DESCRIPTION, SHARES, COST BASIS, SALES PRICE, …), 1099-MISC (…). Extract each section using its own column headers; output transactions or summary rows per section as appropriate.”
- **Pre-extracted rows:** When multi-section is detected, either omit `preExtractedRows` and rely on raw text, or send one small sample per section (e.g. first data row of each 1099-X section) with the section label so the LLM sees structure without a single merged table.

**Suggested code (detection only; prompt overlay can be in prompts.ts or buildExtractionPrompt):**

```ts
// In file-processor.ts, after parsing CSV rows:
const firstColValues = rows.slice(0, 10).map((r) => String((r as Record<string, unknown>)[""] ?? Object.values(r)[0]).trim());
const multiSectionCsv = firstColValues.some((v) => /^1099-(DIV|INT|B|MISC)$/i.test(v));
// Then in return value, add:
return {
  contentType: "text",
  textContent: csvText,
  preExtractedRows: rows.length > 0 && !multiSectionCsv ? rows : undefined,
  multiSectionCsv: multiSectionCsv || undefined,  // extend ProcessedFile type if needed
};
```

If `ProcessedFile` is extended with `multiSectionCsv?: boolean`, the LLM user message can branch: when true, add the multi-section 1099 hint and omit or segment pre-extracted rows.

---

## 2. LLM prompt and schema alignment

### 2.1 Add explicit “no placeholder” and “prefer document numbers” rules

**Description:** The prompt already says “DO NOT HALLUCINATE” and “Only extract what is explicitly present.” Strengthen this with a short rule that forbids placeholder text (e.g. “Unknown”, “N/A”) in required fields when the document has a real value, and that numeric fields must prefer document-stated values over computed ones (e.g. use “Market Value” column, not quantity × price when both exist).

**Justification:** Reduces LLM filling description/symbol with placeholders and avoids overwriting document totals with rounded or recomputed numbers, improving accuracy and integrity checks.

**Files / lines affected:**
- `src/lib/llm/prompts.ts` — in the `=== RULES ===` section, after rule 10 (NUMBERS) or 11 (NULL FOR UNKNOWN).

**Suggested approach:**

Add two bullet rules:

- “PREFER DOCUMENT VALUES: For market_value, liquidation_value, total_amount, and any totals, use the value AS PRINTED on the document. Do not substitute a value you computed (e.g. quantity × price) when the document shows a different number.”
- “NO PLACEHOLDERS IN EXTRACTED FIELDS: Do not use placeholder text like 'Unknown', 'N/A', or 'TBD' in required fields (e.g. description, symbol) when the document clearly shows a value. If the document shows a ticker or description, use it verbatim.”

**Suggested code (insert in prompts.ts inside EXTRACTION_SYSTEM_PROMPT, after rule 11):**

```ts
// After "11. NULL FOR UNKNOWN: ..." add:

12. PREFER DOCUMENT VALUES: For market_value, liquidation_value, total_amount, and document/account totals, use the value AS PRINTED on the document. Do not substitute a computed value (e.g. quantity × price) when the document shows a different number — the document may reflect rounding, lot-level pricing, or after-hours adjustments.

13. NO PLACEHOLDERS: Do not use "Unknown", "N/A", or "TBD" in required fields when the document clearly shows a value. Use the exact ticker, description, or label from the document.

// Renumber subsequent rules (current 12→14, 13→15, etc.) so the list stays consistent.
```

---

### 2.2 Add broker-specific CSV column hints to the prompt

**Description:** The prompt mentions “Robinhood CSV trans_code” and “CSV EXPORTS” generically. Adding a short table of known column names per broker (Schwab, Fidelity, Robinhood, etc.) improves mapping of transaction_date, action, symbol, quantity, amount.

**Justification:** Reduces mis-mapping of columns (e.g. “Settlement Date” vs “Trade Date”) and improves action and amount extraction from CSVs.

**Files / lines affected:**
- `src/lib/llm/prompts.ts` — after “=== ACTION MAPPING ===” and the Robinhood trans_code block; add a “=== BROKER CSV COLUMN HINTS ===" subsection.

**Suggested approach:**

Add a small table or list: Broker → Date column → Action/Trans Code → Symbol → Quantity → Amount (and optional Fees). Keep it concise so the model can use it as a hint without prompt bloat.

**Suggested code (insert in prompts.ts after the Robinhood trans_code block, before “=== RULES ===”):**

```ts
=== BROKER CSV COLUMN HINTS ===

When you see these column headers, map them consistently:
- Charles Schwab: "Trade Date" or "Date" → transaction_date; "Action" or "Trans Type" → action; "Symbol" or "Symbol/Description" → symbol; "Quantity" → quantity; "Amount" or "Net Amount" → total_amount.
- Fidelity: "Run Date" or "Trade Date" → transaction_date; "Transaction Type" → action; "Symbol" → symbol; "Quantity" → quantity; "Amount" → total_amount.
- Robinhood: "Activity Date" → transaction_date; "Trans Code" (see Robinhood trans_code list above) → action; "Instrument" or "Symbol" → symbol; "Quantity" → quantity; "Amount" → total_amount.

Use the most specific date column for transaction_date (e.g. "Trade Date" over "Settlement Date" for buys/sells).
```

---

## 3. Validation and normalization (Stage 2)

### 3.1 Expand date coercion to more formats

**Description:** `coerceDate` in `validate.ts` only handles ISO and MM/DD/YYYY (and one “as of” variant). Many statements use DD-Mon-YYYY (e.g. 19-Feb-2025), YYYY-MM-DD with time, or DD/MM/YYYY.

**Justification:** Invalid or unparsed dates cause entire transactions or positions to be dropped (`addItemSkipped`). Supporting more formats reduces data loss and improves reliability.

**Files / lines affected:**
- `src/lib/extraction/validate.ts` — function `coerceDate`, lines 108–131.

**Suggested approach:**

- After the existing MM/DD/YYYY block, add:
  - DD-Mon-YYYY or DD-MMM-YYYY (e.g. 19-Feb-2025): parse with a month map.
  - DD/MM/YYYY (when day > 12 to avoid ambiguity; otherwise prefer document locale or accept both).
  - Strip time from strings like "2025-02-19T00:00:00" or "2025-02-19 12:00" and return the date part only.

**Suggested code:**

```ts
// In validate.ts, replace coerceDate (lines 108-131) with:

const MONTH_ABBR: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function coerceDate(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const raw = val.trim();

  // Already ISO date (with optional time)
  const isoDateOnly = raw.slice(0, 10);
  if (DATE_REGEX.test(isoDateOnly)) return isoDateOnly;

  // MM/DD/YYYY
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD-Mon-YYYY or DD-MMM-YYYY
  const dmyAbbrMatch = raw.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{4})/);
  if (dmyAbbrMatch) {
    const [, d, mon, y] = dmyAbbrMatch;
    const m = MONTH_ABBR[mon.toLowerCase().slice(0, 3)];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }

  // "MM/DD/YYYY as of MM/DD/YYYY" — use the "as of" date
  const asOfMatch = raw.match(
    /\d{1,2}\/\d{1,2}\/\d{4}\s+as\s+of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i
  );
  if (asOfMatch) {
    const [, m, d, y] = asOfMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}
```

---

### 3.2 Expand action normalization map

**Description:** `ACTION_MAP` in `validate.ts` already maps many variants. Some real-world exports use additional phrases (e.g. “Sell to Close”, “Dividend Reinvestment”, “Wire Transfer In”) that may not normalize to the correct enum.

**Justification:** Transactions dropped due to “Invalid action” lose user data. Expanding the map improves categorization and reliability.

**Files / lines affected:**
- `src/lib/extraction/validate.ts` — `ACTION_MAP` and `normalizeAction`, lines 40–85 and 134–141.

**Suggested approach:**

- Add entries for: `sell_to_close`, `buy_to_open`, `dividend_reinvestment`, `wire_in`, `wire_out`, `ach_in`, `ach_out`, `acat_in`, `acat_out`, `long_term_capital_gain`, `short_term_capital_gain`, `cap_gain_reinvest`, `fee_reversal`, `credit_interest`, `debit_interest`. Map them to the existing schema actions (e.g. wire_in → transfer_in).

**Suggested code (extend ACTION_MAP):**

```ts
// Add to ACTION_MAP in validate.ts (after the existing entries, before the closing };
  "sell_to_close": "sell",
  "buy_to_open": "buy",
  "dividend_reinvestment": "reinvestment",
  "wire_in": "transfer_in",
  "wire_out": "transfer_out",
  "ach_in": "transfer_in",
  "ach_out": "transfer_out",
  "acat_in": "transfer_in",
  "acat_out": "transfer_out",
  "long_term_capital_gain": "capital_gain_long",
  "short_term_capital_gain": "capital_gain_short",
  "cap_gain_reinvest": "reinvestment",
  "fee_reversal": "fee",
  "credit_interest": "interest",
  "debit_interest": "interest",
  "margin_interest": "interest",
  "sweep_interest": "interest",
```

**Data-driven — Robinhood trans codes from sample activity CSVs:** The prompt already lists some Robinhood codes (BTO, STC, CDIV, SLIP, ACH, ACATI, GOLD, etc.). The following additional codes appear in real Robinhood Trad/Roth/Individual reports and should be added to `ACTION_MAP` (and to the prompt's Robinhood list) so they normalize instead of being dropped as invalid: `CIL` (Cash in Lieu) → `"interest"`, `SOFF` (Option expiration/exercise) → `"other"`, `CRRD` (Conversion to Roth IRA) → `"journal"`, `CFRI` (Conversion from Traditional IRA) → `"transfer_in"`, `GDBP` (Gold Deposit Boost Payment) → `"interest"`, `FUTSWP` (Event Contracts Inter-Entity Cash Transfer) → `"other"`, `MTCH` (IRA Match) → `"interest"`, `T/A` (Transfer/ACAT) → `"other"`, `GMPC` (Gold Plan Credit) → `"other"`, `DCF` (Debit card transfer) → `"transfer_out"`, `SPL` (Stock split) → `"stock_split"`, `MISC` → `"other"`. Add to `validate.ts` ACTION_MAP:

```ts
  "cil": "interest",
  "soff": "other",
  "crrd": "journal",
  "cfri": "transfer_in",
  "gdbp": "interest",
  "futswp": "other",
  "mtch": "interest",
  "t/a": "other",
  "gmpc": "other",
  "dcf": "transfer_out",
  "spl": "stock_split",
  "misc": "other",
```

**Data-driven — Schwab JSON Action strings:** Schwab transaction JSON uses human-readable `Action` values. Ensure these map in ACTION_MAP so validation accepts them: `security_transfer` → transfer_in/transfer_out (by amount sign), `misc_cash_entry` → other, `bank_interest` → interest, `service_fee` → fee, `cash_dividend` → dividend, `qualified_dividend` → dividend, `journaled_shares` → journal, `journal` → journal, `sell` → sell.

Also in `normalizeAction`, before looking up `ACTION_MAP[key]`, try matching the key with spaces replaced by underscores (already done) and, if no match, try the first token (e.g. “Dividend – Qualified” → “dividend”) so multi-word phrases still map.

---

### 3.3 Normalize and validate ticker symbols

**Description:** Position and transaction symbols are only trimmed in validation. There is no uppercase normalization or cleanup of common suffixes (e.g. “.PR” for preferred, or trailing spaces/newlines). Holdings and snapshots are keyed by symbol; inconsistent casing can create duplicate positions (e.g. “aapl” vs “AAPL”).

**Justification:** Normalizing symbols to a canonical form (e.g. uppercase, trimmed) and treating empty string as null ensures deduplication and reconciliation work correctly and improves consistency with market data. Real Robinhood CSVs use blank Instrument for non-security rows (e.g. Conversion to Roth IRA, Interest Payment); empty string should become null.

**Files / lines affected:**
- `src/lib/extraction/validate.ts` — `validatePosition` (symbol assignment), `validateTransaction` (symbol assignment). Optionally a shared `normalizeSymbol(s: string | null): string | null` that returns null for empty/whitespace (so "" → null).
- `src/lib/holdings/reconcile.ts` — positions are keyed by `p.symbol`; if validation normalizes, no change needed here. Same for `src/lib/extraction/db-writer.ts` and `deduplicatePositions`.

**Suggested approach:**

- Add `normalizeSymbol(s: string | null): string | null`: trim, uppercase, and optionally strip a single trailing “.PR” or “-WT” if you want to collapse those into the same key (optional). Use it in both transaction and position validation when assigning `symbol`.

**Suggested code:**

```ts
// In validate.ts, add near other normalizers (e.g. after normalizeDocumentType):

function normalizeSymbol(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  // Canonical form: uppercase for consistency with market data and deduplication
  return trimmed.toUpperCase();
}
```

In `validateTransaction`, change:
`symbol: typeof raw.symbol === "string" ? raw.symbol : null`
to
`symbol: normalizeSymbol(raw.symbol)`

In `validatePosition`, change:
`const symbol = typeof raw.symbol === "string" ? raw.symbol.trim() : null;`
to
`const symbol = normalizeSymbol(raw.symbol);`
and keep the existing `if (!symbol) { this.addItemSkipped(...); return null; }`.

---

### 3.4 Toughen number coercion (scientific notation, spaces, multiple parens)

**Description:** `coerceNumber` strips `$` and `,` and handles a single parenthesized value. It does not handle scientific notation (e.g. "1.23e-4"), numbers with spaces ("1 234.56"), or double-negative/formatting quirks. **Real-world note:** Schwab JSON exports send `Quantity` as strings with commas and optional minus (e.g. "-5,590", "1,110"); the validator must use coerceNumber for quantity so these parse correctly.

**Justification:** LLMs and broker exports (e.g. Schwab JSON) sometimes output numbers in scientific notation, with commas, or with extra spaces; rejecting them yields null and can trigger defaults (e.g. total_amount 0) or dropped fields, reducing accuracy.

**Files / lines affected:**
- `src/lib/extraction/validate.ts` — `coerceNumber`, lines 93–106.

**Suggested approach:**

- Remove all spaces from the string before parsing.
- After cleaning, if the string looks like a number (regex or parseFloat), use `Number(cleaned)` (which accepts scientific notation).
- Optionally: if cleaned is "-" or empty after strip, return null.

**Suggested code:**

```ts
function coerceNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    if (Number.isNaN(val)) return null;
    return val;
  }
  if (typeof val === "string") {
    let cleaned = val.replace(/\s+/g, "").replace(/[$,]/g, "").trim();
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      cleaned = "-" + cleaned.slice(1, -1);
    }
    if (!cleaned || cleaned === "-") return null;
    const num = Number(cleaned);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}
```

---

## 4. Integrity and post-extraction checks

### 4.1 Use integrity report to warn or block confirm

**Description:** `checkExtractionIntegrity` is run before write and its result is stored on the statement, but confirmation always proceeds. Users may not notice large discrepancies (e.g. document total vs sum of balances).

**Justification:** Making integrity failures visible (or optionally blocking) improves reliability and trust; at least returning warnings in the API and showing them in the UI reduces silent data issues.

**Files / lines affected:**
- `src/app/api/upload/[id]/confirm/route.ts` — after `checkExtractionIntegrity`, before `writeExtraction`.
- Optionally: frontend that calls confirm and displays `integrityReport`.

**Suggested approach (non-blocking first):**

- Keep writing; ensure the API response includes `integrityReport` with `passed` and `discrepancies` (already does). Add a short note in the response when `passed === false` so the client can show a warning banner.
- Optional (configurable): if `integrityReport.passed === false` and any discrepancy has `severity === "error"`, return 400 with a message and do not write, unless the client sends a flag like `forceConfirm: true`.

**Suggested code (optional block on severe errors):**

```ts
// In confirm/route.ts, after:
const integrityReport = checkExtractionIntegrity(extraction);

// Add:
const hasBlockingErrors = integrityReport.discrepancies.some(
  (d) => d.severity === "error"
);
const forceConfirm = body?.forceConfirm === true;
if (hasBlockingErrors && !forceConfirm) {
  return NextResponse.json(
    {
      error: "Integrity check failed. Extracted totals do not match document totals.",
      integrityReport,
      code: "INTEGRITY_ERROR",
    },
    { status: 400 }
  );
}

// Then proceed to writeExtraction(...)
```

Document `forceConfirm` in the API so the UI can offer “Confirm anyway” when appropriate.

---

### 4.2 Include validation warnings in extraction notes

**Description:** Validation produces `warnings` and `coercions` (e.g. “total_amount computed from quantity * price”, “action normalized from X to Y”). These are not persisted on the extraction that gets stored or shown in the UI.

**Justification:** Persisting warnings/coercions (e.g. in `extraction.notes` or in a separate `validation_warnings` field on the statement) improves traceability and helps debug low accuracy (e.g. many coercions → prompt or format issues).

**Files / lines affected:**
- `src/lib/extraction/validate.ts` — `ValidationResult` and the return value of `validate()`.
- Callers: `llm-gemini.ts` (and any other backend) — after `validateExtraction`, merge `validationResult.warnings` and `validationResult.coercions` into `extraction.notes` before returning (or attach to a separate field if the schema is extended).

**Suggested approach:**

- After building the final `extraction` in the validator, do not mutate it. In the caller (e.g. `extractViaGemini`), after `validateExtraction(fullText)`, if `validationResult.valid` and `validationResult.extraction`, append to `extraction.notes` a line per coercion and a line per warning (e.g. “Validation: total_amount computed for 3 transactions; 1 position skipped (invalid date).”). Then return this updated extraction.

**Suggested code (in llm-gemini.ts, after validationResult check):**

```ts
// After: if (!validationResult.valid || !validationResult.extraction) { throw ... }
let extraction = validationResult.extraction;
if (validationResult.coercions.length > 0 || validationResult.warnings.length > 0) {
  const validationNotes = [
    ...validationResult.coercions.map((c) => `[Coercion] ${c}`),
    ...validationResult.warnings.map((w) => `[Warning] ${w.path}: ${w.message}`),
  ];
  extraction = {
    ...extraction,
    notes: [...(extraction.notes || []), ...validationNotes],
  };
}
const rawResponse = { text: fullText, finishReason, usageMetadata };
return { extraction, rawResponse };
```

---

## 5. DB writer and reconciliation

### 5.1 Deduplicate transactions by content, not only by external_transaction_id

**Description:** Transactions are upserted with `external_transaction_id: upload_${statementId}_${accountId}_${index}`. Re-processing the same file (e.g. after a fix) creates the same IDs, which is good. But if the LLM returns duplicate rows for the same real-world transaction (e.g. same date, symbol, action, quantity, amount), they are still written as separate rows with different indices.

**Justification:** Deduplicating transactions by (account_id, transaction_date, symbol, action, quantity, total_amount) before insert reduces double-counting and improves reliability when the LLM repeats rows.

**Files / lines affected:**
- `src/lib/extraction/db-writer.ts` — section “4. Write transactions”, lines 304–334. Add a deduplication step that builds a key from (transaction_date, symbol, action, quantity, total_amount), keeps one representative row per key, and assigns indices (and thus external_transaction_id) after dedup.

**Suggested approach:**

- Before mapping to `transactionRows`, deduplicate `account.transactions` by a content key. For each key, keep the first occurrence (or merge fees/commission if you want). Then map the deduped array to rows with index 0, 1, 2, … so external_transaction_id remains stable per run.

**Suggested code:**

```ts
// In db-writer.ts, before building transactionRows (around line 306), add:

function deduplicateTransactions(
  transactions: ExtractionTransaction[]
): ExtractionTransaction[] {
  const seen = new Map<string, ExtractionTransaction>();
  for (const t of transactions) {
    const key = [
      t.transaction_date,
      t.symbol ?? "",
      t.action,
      t.quantity ?? "",
      t.price_per_share ?? "",
      t.total_amount,
    ].join("|");
    if (!seen.has(key)) seen.set(key, t);
    else {
      // Merge fees/commission into first occurrence if desired
      const existing = seen.get(key)!;
      if (t.fees != null && (existing.fees == null || existing.fees === 0))
        existing.fees = t.fees;
      if (t.commission != null && (existing.commission == null || existing.commission === 0))
        existing.commission = t.commission;
    }
  }
  return Array.from(seen.values());
}

// Then when building transactionRows:
const dedupedTransactions = deduplicateTransactions(account.transactions);
const transactionRows = dedupedTransactions.map((t, index) => ({
  ...
  external_transaction_id: `upload_${statementId}_${accountId}_${index}`,
  ...
}));
```

---

### 5.2 Reconcile: avoid closing positions when snapshot is partial

**Description:** In `reconcileHoldings`, any existing holding not in the incoming position list is marked closed (quantity 0). For documents that are partial (e.g. only “Equities” section, or one account of many), this can incorrectly close positions that were simply not in the extracted set.

**Justification:** If the extraction is a full account snapshot (e.g. one account, all sections), closing missing symbols is correct. If the extraction is partial (e.g. only some asset types or one account), closing all missing symbols is wrong. A simple heuristic (e.g. document_type or a flag, or “if incoming positions are a small fraction of existing holdings, do not close”) reduces false closes.

**Files / lines affected:**
- `src/lib/holdings/reconcile.ts` — section “4. Detect closed positions”, lines 176–208.

**Suggested approach:**

- Add an optional parameter `treatAsFullSnapshot?: boolean` (default true for backward compat). When false, skip the “closed positions” loop. Callers (e.g. db-writer) can set it from extraction metadata (e.g. `document.document_type === "portfolio_summary"` and single-account → true; else false), or from a new extraction field like `coverage: "full" | "partial"`.
- Alternatively: only close positions when the number of incoming positions is at least as large as the current holdings count (or at least 80% of it), to avoid closing everything when the LLM only returned a subset.

**Suggested code (heuristic approach — no API change):**

```ts
// In reconcile.ts, replace the "4. Detect closed positions" block with:

// 4. Detect closed positions — only if incoming data looks like a full snapshot
// (avoid closing positions when the document or LLM only returned a subset)
const existingCount = holdingsBySymbol.size;
const incomingCount = incomingSymbols.size;
const likelyFullSnapshot =
  incomingCount >= existingCount || incomingCount >= Math.max(1, Math.floor(existingCount * 0.8));

if (incomingPositions.length > 0 && likelyFullSnapshot) {
  for (const [symbol, existing] of holdingsBySymbol) {
    // ... rest unchanged (close position if not in incomingSymbols)
  }
}
```

---

## 6. Account matching

### 6.1 Prefer last-4 match over institution+type when both exist

**Description:** Matching order is: (1) number, (2) institution+type, (3) nickname. When the document shows a partial account number (e.g. “…5902”) and there are two accounts with the same institution+type but different numbers, institution+type can match the wrong account if “last 4” was not checked first. Current code already does number first; this is a sanity check.

**Justification:** Ensuring number-based match always wins over institution+type avoids mis-attribution of positions/transactions to the wrong account when multiple accounts exist.

**Files / lines affected:**
- `src/lib/extraction/account-matcher.ts` — `matchAccounts` loop (lines 264–320). Current order is already number → institution+type → nickname. No change needed unless there is a bug; consider adding a test that two accounts with same institution+type but different last-4 digits match by number only.

**Suggested approach:**

- No code change; add a unit test or comment that “number match must be tried first and wins over institution+type.” If in the future “account_group” is used in matching, still prefer number over group.

---

### 6.2 Normalize account number hint for matching

**Description:** Existing accounts store `schwab_account_number` as the hint; it may contain “…5902” or “****5902”. The matcher strips leading dots; some exports use asterisks or spaces. Normalizing both the detected and the hint (e.g. strip non-digits and compare last 4) makes matching more robust.

**Justification:** Reduces false “no match” when the document and DB use different masking styles.

**Files / lines affected:**
- `src/lib/extraction/account-matcher.ts` — `stripPrefix` and `matchByNumber` (and any place that compares account numbers).

**Suggested approach:**

- Replace or complement `stripPrefix` with a function that keeps only digits (or digits + trailing/leading dots/asterisks for length). Compare last 4 digits when at least 3 digits are present.

**Suggested code:**

```ts
/** Return digits-only from account number for comparison; if length >= 4, also return last 4. */
function accountNumberDigits(num: string): { full: string; last4: string | null } {
  const digits = num.replace(/\D/g, "");
  const last4 = digits.length >= 4 ? digits.slice(-4) : null;
  return { full: digits, last4 };
}

// In matchByNumber, use:
const detected = accountNumberDigits(info.account_number);
if (detected.full.length < 2) return null;
for (const acct of existing) {
  if (!acct.account_number_hint) continue;
  const hint = accountNumberDigits(acct.account_number_hint);
  if (hint.full.length < 2) continue;
  if (detected.full === hint.full || detected.last4 === hint.last4) {
    return { accountId: acct.id, confidence: "high", reason: `Account number match` };
  }
}
```

Adjust the exact logic (e.g. require last4 match when full is different for masked numbers) as needed.

---

## 7. Truncation and robustness

### 7.1 Retry extraction on validation failure with repaired JSON

**Description:** When the LLM response is truncated, validation fails and the whole extraction fails. The older `parse.ts` had `repairTruncatedJSON`; the current pipeline uses `validate.ts` which does not attempt repair.

**Justification:** Truncation (e.g. Gemini token limit) can produce invalid JSON; repairing and re-validating can salvage partial extractions instead of failing completely.

**Files / lines affected:**
- `src/lib/extraction/validate.ts` — start of `validate()`: after JSON.parse fails, try to repair (e.g. close open braces/brackets, remove trailing comma) then re-parse. Reuse or port logic from `parse.ts` `repairTruncatedJSON`.

**Suggested approach:**

- In `validate()`, wrap `JSON.parse(cleaned)` in try/catch. On failure, call a small `repairTruncatedJSON(cleaned)` that returns a string or null; if non-null, parse again and proceed. Optionally add a note to `extraction.notes` that the response was truncated and repaired.

**Suggested code (add in validate.ts):**

- Port `repairTruncatedJSON` from `src/lib/llm/parse.ts` (lines 10–62) into `validate.ts` (or a shared util). In the validator’s `validate()` method, when `JSON.parse(cleaned)` throws, set `cleaned = repairTruncatedJSON(cleaned) ?? cleaned` and try `JSON.parse(cleaned)` again. If it still fails, add the existing parse error and return. If it succeeds, add a coercion note: “JSON was truncated and auto-repaired; some data may be missing.”

---

## 8. Summary table

| #   | Area              | Change                                      | Goal                    |
|-----|-------------------|---------------------------------------------|-------------------------|
| 1.1 | File pre-process  | More CSV rows + tail sample to LLM          | Accuracy (column mapping) |
| 1.2 | File pre-process  | BOM strip, relax_column_count for CSV       | Reliability              |
| 1.3 | File pre-process  | Handle multiline CSV fields (Robinhood)    | Reliability (row alignment) |
| 1.4 | File pre-process  | Multi-section CSV (1099); detect + hint     | Accuracy (1099 CSV)     |
| 2.1 | Prompt            | Prefer document values; no placeholders     | Accuracy, integrity     |
| 2.2 | Prompt            | Broker-specific CSV column hints            | Accuracy (CSV)           |
| 3.1 | Validation        | More date formats (DD-Mon-YYYY, etc.)       | Reliability, less drop   |
| 3.2 | Validation        | Expand ACTION_MAP + Robinhood/Schwab codes (data-driven) | Categorization          |
| 3.3 | Validation        | Normalize symbol (uppercase, trim; empty → null)         | Normalization, dedup    |
| 3.4 | Validation        | coerceNumber: scientific, spaces, commas (e.g. Schwab Qty) | Reliability              |
| 4.1 | Integrity         | Optional block confirm on severe errors     | Reliability              |
| 4.2 | Integrity         | Persist validation warnings in notes        | Traceability             |
| 5.1 | DB writer         | Deduplicate transactions by content         | Reliability              |
| 5.2 | Reconcile         | Only close positions when full snapshot     | Reliability              |
| 6.2 | Account match     | Normalize account number (digits, last4)     | Matching accuracy        |
| 7.1 | Robustness        | Truncated JSON repair in validator          | Reliability              |

Implementing these in order of impact (e.g. 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 3.4, 5.1, 5.2, 4.2, 7.1; 1.4 when supporting 1099 CSV) will improve accuracy, normalization, categorization, and reliability of the upload pipeline. Each change is self-contained so Opus 4.6 (or another agent) can apply them incrementally and run tests after each step.
