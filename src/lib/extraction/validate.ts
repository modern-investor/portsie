/**
 * Stage 2: Extraction Validator
 *
 * Takes raw JSON text from Stage 1 (LLM output), validates against the
 * PortsieExtraction schema, applies type coercions, and returns a typed result.
 *
 * This is a hand-written validator (not AJV) for performance and clarity.
 * It validates structure, types, enum values, and required fields.
 */

import type {
  PortsieExtraction,
  ExtractionAccount,
  ExtractionTransaction,
  ExtractionPosition,
  ExtractionBalance,
  ExtractionAccountInfo,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  TransactionAction,
  AssetType,
  AccountType,
  Confidence,
  DocumentType,
} from "./schema";

import {
  TRANSACTION_ACTIONS,
  ASSET_TYPES,
  ACCOUNT_TYPES,
  DOCUMENT_TYPES,
  CONFIDENCE_LEVELS,
} from "./schema";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ── Action mapping for common LLM variations ──

const ACTION_MAP: Record<string, TransactionAction> = {
  // Direct matches (lowercase)
  buy: "buy",
  sell: "sell",
  buy_to_cover: "buy_to_cover",
  sell_short: "sell_short",
  dividend: "dividend",
  capital_gain_long: "capital_gain_long",
  capital_gain_short: "capital_gain_short",
  interest: "interest",
  transfer_in: "transfer_in",
  transfer_out: "transfer_out",
  fee: "fee",
  commission: "commission",
  stock_split: "stock_split",
  merger: "merger",
  spinoff: "spinoff",
  reinvestment: "reinvestment",
  journal: "journal",
  other: "other",
  // Common LLM variations
  purchase: "buy",
  sale: "sell",
  bought: "buy",
  sold: "sell",
  div: "dividend",
  int: "interest",
  deposit: "transfer_in",
  withdrawal: "transfer_out",
  transfer: "journal",
  sell_to_close: "sell",
  buy_to_open: "buy",
  cash_dividend: "dividend",
  qualified_dividend: "dividend",
  bank_interest: "interest",
  service_fee: "fee",
  security_transfer: "journal",
  stock_lending: "interest",
  acat_transfer: "transfer_in",
  roth_conversion: "journal",
  reinvest_shares: "reinvestment",
  long_term_cap_gain_reinvest: "reinvestment",
  journaled_shares: "journal",
  adr_mgmt_fee: "fee",
  misc_cash_entry: "other",
  // Additional LLM aliases
  short_sale: "sell_short",
  drip: "reinvestment",
  dividend_reinvestment: "reinvestment",
  internal_transfer: "journal",
  forward_split: "stock_split",
  reverse_split: "stock_split",
  adr_fee: "fee",
  acquisition: "merger",
  spin_off: "spinoff",
  // Robinhood CSV trans_code values
  bto: "buy",
  stc: "sell",
  sto: "sell_short",
  btc: "buy_to_cover",
  cdiv: "dividend",
  slip: "interest",
  ach: "transfer_in",
  acati: "transfer_in",
  acato: "transfer_out",
  jnls: "journal",
  gold: "fee",
  cil: "other",       // cash in lieu
  soff: "spinoff",
  crrd: "other",       // credit/debit
  cfri: "other",       // cash fraction
  gdbp: "fee",         // Robinhood Gold
  spl: "stock_split",
  futswp: "other",     // futures sweep
  mtch: "other",       // match
  "t/a": "journal",    // transfer/adjustment
  gmpc: "other",       // GMPC
  dcf: "other",        // DCF
  // Schwab-specific codes
  wire_in: "transfer_in",
  wire_out: "transfer_out",
  ach_in: "transfer_in",
  ach_out: "transfer_out",
  margin_interest: "interest",
  foreign_tax_paid: "fee",
  return_of_capital: "dividend",
};

// ── Helper functions ──

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function coerceNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // Strip currency symbols, commas, percent signs, and spaces used as thousand separators
    let cleaned = val.replace(/[$,%]/g, "").replace(/\s+/g, "").trim();
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      cleaned = "-" + cleaned.slice(1, -1);
    }
    if (cleaned === "" || cleaned === "-") return null;
    const num = Number(cleaned);
    if (!isNaN(num) && isFinite(num)) return num;
  }
  return null;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function coerceDate(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;

  const trimmed = val.trim();

  // Already ISO format
  if (DATE_REGEX.test(trimmed)) return trimmed;

  // ISO with time: "YYYY-MM-DDTHH:mm:ss..." — strip time portion
  const isoTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoTimeMatch) return isoTimeMatch[1];

  // Handle "MM/DD/YYYY" format
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Handle "MM/DD/YYYY as of MM/DD/YYYY" — use the "as of" date
  const asOfMatch = trimmed.match(
    /\d{1,2}\/\d{1,2}\/\d{4}\s+as\s+of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i
  );
  if (asOfMatch) {
    const [, m, d, y] = asOfMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Handle "DD-Mon-YYYY" (e.g., "19-Feb-2025")
  const dMonYMatch = trimmed.match(/^(\d{1,2})[-\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-\s](\d{4})$/i);
  if (dMonYMatch) {
    const [, d, mon, y] = dMonYMatch;
    const m = MONTH_MAP[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }

  // Handle "Mon DD, YYYY" (e.g., "Feb 19, 2025")
  const monDYMatch = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (monDYMatch) {
    const [, mon, d, y] = monDYMatch;
    const m = MONTH_MAP[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }

  return null;
}

function normalizeSymbol(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed === "" || trimmed === "---" || trimmed === "N/A") return null;
  return trimmed.toUpperCase();
}

function normalizeAction(val: unknown): TransactionAction | null {
  if (typeof val !== "string") return null;
  const key = val.toLowerCase().replace(/[\s-]+/g, "_").trim();
  if (TRANSACTION_ACTIONS.includes(key as TransactionAction)) {
    return key as TransactionAction;
  }
  return ACTION_MAP[key] ?? null;
}

function normalizeAssetType(val: unknown): AssetType {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const upper = val.toUpperCase().replace(/[\s-]+/g, "_");
  if (ASSET_TYPES.includes(upper as Exclude<AssetType, null>)) {
    return upper as AssetType;
  }
  // Common aliases
  const aliases: Record<string, AssetType> = {
    STOCK: "EQUITY",
    STOCKS: "EQUITY",
    BOND: "FIXED_INCOME",
    BONDS: "FIXED_INCOME",
    FUND: "MUTUAL_FUND",
    MONEY_MARKET: "CASH_EQUIVALENT",
    CASH: "CASH_EQUIVALENT",
    VEHICLE: "OTHER_ASSET",
    JEWELRY: "COLLECTIBLE",
  };
  return aliases[upper] ?? null;
}

function normalizeAccountType(val: unknown): AccountType {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const lower = val.toLowerCase().replace(/[\s-]+/g, "_").trim();
  if (ACCOUNT_TYPES.includes(lower as Exclude<AccountType, null>)) {
    return lower as AccountType;
  }
  // Common aliases
  const aliases: Record<string, AccountType> = {
    brokerage: "individual",
    traditional_ira: "ira",
    trad_ira: "ira",
    solo_401k: "401k",
    "solo_401(k)": "401k",
    heloc_loan: "heloc",
    credit: "credit_card",
    loan: "auto_loan",
    property: "real_estate",
  };
  return aliases[lower] ?? null;
}

function normalizeConfidence(val: unknown): Confidence {
  if (typeof val !== "string") return "low";
  const lower = val.toLowerCase();
  if (CONFIDENCE_LEVELS.includes(lower as Confidence)) {
    return lower as Confidence;
  }
  return "low";
}

function normalizeDocumentType(val: unknown): DocumentType {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const lower = val.toLowerCase().replace(/[\s-]+/g, "_").trim();
  if (DOCUMENT_TYPES.includes(lower as Exclude<DocumentType, null>)) {
    return lower as DocumentType;
  }
  return null;
}

// ── Main validator ──

class ExtractionValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  private coercions: string[] = [];

  private addError(path: string, message: string, value: unknown) {
    this.errors.push({ path, message, value });
  }

  /**
   * Add a "soft" error — an individual item that failed validation but
   * will be dropped from the result rather than failing the whole extraction.
   * Recorded as a warning so the caller can see what was skipped.
   */
  private addItemSkipped(path: string, message: string, value: unknown) {
    this.warnings.push({ path, message: `Skipped: ${message} (value: ${JSON.stringify(value)})` });
  }

  private addWarning(path: string, message: string) {
    this.warnings.push({ path, message });
  }

  private addCoercion(description: string) {
    this.coercions.push(description);
  }

  validate(rawJson: string): ValidationResult {
    this.errors = [];
    this.warnings = [];
    this.coercions = [];

    // Step 1: Strip markdown fences
    let cleaned = rawJson.trim();
    if (cleaned.startsWith("```")) {
      // Remove opening fence (with optional language tag)
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "");
      // Remove closing fence
      cleaned = cleaned.replace(/\n?```\s*$/, "");
    }

    // Step 2: Extract JSON if embedded in surrounding text
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      this.addError("$", "No JSON object found in response", cleaned.slice(0, 200));
      return this.result(null);
    }
    if (jsonStart > 0 || jsonEnd < cleaned.length - 1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
      this.addCoercion("Extracted JSON object from surrounding text");
    }

    // Step 3: Parse JSON
    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch (err) {
      this.addError(
        "$",
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        cleaned.slice(0, 500)
      );
      return this.result(null);
    }

    if (!isPlainObject(raw)) {
      this.addError("$", "Top-level value must be an object", typeof raw);
      return this.result(null);
    }

    // Step 4: Validate and build PortsieExtraction
    const extraction = this.validateExtraction(raw);

    if (this.errors.length > 0) {
      return this.result(null);
    }

    return this.result(extraction);
  }

  private result(extraction: PortsieExtraction | null): ValidationResult {
    return {
      valid: this.errors.length === 0 && extraction !== null,
      extraction,
      errors: this.errors,
      warnings: this.warnings,
      coercions: this.coercions,
    };
  }

  private validateExtraction(raw: Record<string, unknown>): PortsieExtraction | null {
    // schema_version
    const schemaVersion = raw.schema_version;
    if (schemaVersion !== 1) {
      if (schemaVersion === undefined) {
        this.addCoercion("Added missing schema_version: 1");
      } else {
        this.addWarning(
          "schema_version",
          `Expected 1, got ${String(schemaVersion)}. Treating as v1.`
        );
      }
    }

    // document
    const docRaw = raw.document;
    let document: PortsieExtraction["document"];
    if (isPlainObject(docRaw)) {
      document = {
        institution_name:
          typeof docRaw.institution_name === "string" ? docRaw.institution_name : null,
        document_type: normalizeDocumentType(docRaw.document_type),
        statement_start_date: coerceDate(docRaw.statement_start_date),
        statement_end_date: coerceDate(docRaw.statement_end_date),
      };
    } else {
      document = {
        institution_name: null,
        document_type: null,
        statement_start_date: null,
        statement_end_date: null,
      };
      if (docRaw === undefined) {
        this.addCoercion("Added missing document metadata block");
      } else {
        this.addWarning("document", "Expected object, using defaults");
      }
    }

    // accounts
    const accountsRaw = raw.accounts;
    let accounts: ExtractionAccount[] = [];
    if (Array.isArray(accountsRaw)) {
      accounts = accountsRaw
        .map((a, i) => this.validateAccount(a, `accounts[${i}]`))
        .filter((a): a is ExtractionAccount => a !== null);
    } else if (accountsRaw === undefined) {
      // Backward compat: if no accounts[] but top-level has transactions/positions/balances,
      // wrap into a single account
      if (raw.transactions || raw.positions || raw.balances) {
        this.addCoercion("Wrapped top-level data into single account entry");
        const singleAccount = this.validateAccount(
          {
            account_info: raw.account_info ?? {
              account_number: null,
              account_type: null,
              institution_name: null,
              account_nickname: null,
              account_group: null,
            },
            transactions: raw.transactions ?? [],
            positions: raw.positions ?? [],
            balances: raw.balances ?? [],
          },
          "accounts[0]"
        );
        if (singleAccount) {
          accounts = [singleAccount];
        }
      }
    } else {
      this.addError("accounts", "Expected array", typeof accountsRaw);
    }

    // unallocated_positions
    const unallocRaw = raw.unallocated_positions;
    let unallocatedPositions: ExtractionPosition[] = [];
    if (Array.isArray(unallocRaw)) {
      unallocatedPositions = unallocRaw
        .map((p, i) => this.validatePosition(p, `unallocated_positions[${i}]`))
        .filter((p): p is ExtractionPosition => p !== null);
    } else if (unallocRaw !== undefined) {
      this.addWarning("unallocated_positions", "Expected array, defaulting to []");
    }

    // confidence
    const confidence = normalizeConfidence(raw.confidence);

    // notes
    const notesRaw = raw.notes;
    let notes: string[] = [];
    if (Array.isArray(notesRaw)) {
      notes = notesRaw.filter((n) => typeof n === "string");
    } else if (typeof notesRaw === "string") {
      notes = [notesRaw];
      this.addCoercion("Converted single notes string to array");
    }

    // document_totals (optional)
    const totalsRaw = raw.document_totals;
    let documentTotals: PortsieExtraction["document_totals"] = null;
    if (isPlainObject(totalsRaw)) {
      documentTotals = {
        total_value: coerceNumber(totalsRaw.total_value),
        total_day_change: coerceNumber(totalsRaw.total_day_change),
        total_day_change_pct: coerceNumber(totalsRaw.total_day_change_pct),
      };
    }

    // Validate we have SOME data
    const totalPositions =
      accounts.reduce((sum, a) => sum + a.positions.length, 0) +
      unallocatedPositions.length;
    const totalTransactions = accounts.reduce((sum, a) => sum + a.transactions.length, 0);
    const totalBalances = accounts.reduce((sum, a) => sum + a.balances.length, 0);

    if (
      accounts.length === 0 &&
      unallocatedPositions.length === 0
    ) {
      this.addWarning(
        "$",
        "Extraction contains no accounts and no unallocated positions"
      );
    }

    if (totalPositions === 0 && totalTransactions === 0 && totalBalances === 0) {
      this.addWarning(
        "$",
        "Extraction contains no positions, transactions, or balances"
      );
    }

    return {
      schema_version: 1,
      document,
      accounts,
      unallocated_positions: unallocatedPositions,
      document_totals: documentTotals,
      confidence,
      notes,
    };
  }

  private validateAccount(
    raw: unknown,
    path: string
  ): ExtractionAccount | null {
    if (!isPlainObject(raw)) {
      this.addItemSkipped(path, "Expected object", typeof raw);
      return null;
    }

    // account_info
    const infoRaw = raw.account_info;
    let accountInfo: ExtractionAccountInfo;
    if (isPlainObject(infoRaw)) {
      accountInfo = {
        account_number:
          typeof infoRaw.account_number === "string" ? infoRaw.account_number : null,
        account_type: normalizeAccountType(infoRaw.account_type),
        institution_name:
          typeof infoRaw.institution_name === "string" ? infoRaw.institution_name : null,
        account_nickname:
          typeof infoRaw.account_nickname === "string" ? infoRaw.account_nickname : null,
        account_group:
          typeof infoRaw.account_group === "string" ? infoRaw.account_group : null,
      };
    } else {
      accountInfo = {
        account_number: null,
        account_type: null,
        institution_name: null,
        account_nickname: null,
        account_group: null,
      };
      if (infoRaw !== undefined) {
        this.addWarning(`${path}.account_info`, "Expected object, using defaults");
      }
    }

    // transactions
    const txRaw = raw.transactions;
    let transactions: ExtractionTransaction[] = [];
    if (Array.isArray(txRaw)) {
      transactions = txRaw
        .map((t, i) => this.validateTransaction(t, `${path}.transactions[${i}]`))
        .filter((t): t is ExtractionTransaction => t !== null);
    }

    // positions
    const posRaw = raw.positions;
    let positions: ExtractionPosition[] = [];
    if (Array.isArray(posRaw)) {
      positions = posRaw
        .map((p, i) => this.validatePosition(p, `${path}.positions[${i}]`))
        .filter((p): p is ExtractionPosition => p !== null);
    }

    // balances
    const balRaw = raw.balances;
    let balances: ExtractionBalance[] = [];
    if (Array.isArray(balRaw)) {
      balances = balRaw
        .map((b, i) => this.validateBalance(b, `${path}.balances[${i}]`))
        .filter((b): b is ExtractionBalance => b !== null);
    }

    return { account_info: accountInfo, transactions, positions, balances };
  }

  private validateTransaction(
    raw: unknown,
    path: string
  ): ExtractionTransaction | null {
    if (!isPlainObject(raw)) {
      this.addItemSkipped(path, "Expected object", typeof raw);
      return null;
    }

    // transaction_date (required)
    const txDate = coerceDate(raw.transaction_date);
    if (!txDate) {
      this.addItemSkipped(
        `${path}.transaction_date`,
        "Required date in YYYY-MM-DD format",
        raw.transaction_date
      );
      return null;
    }
    if (raw.transaction_date !== txDate) {
      this.addCoercion(`${path}.transaction_date coerced to ${txDate}`);
    }

    // action (required)
    const action = normalizeAction(raw.action);
    if (!action) {
      this.addItemSkipped(
        `${path}.action`,
        `Invalid action — must be one of: ${TRANSACTION_ACTIONS.join(", ")}`,
        raw.action
      );
      return null;
    }
    if (raw.action !== action) {
      this.addCoercion(`${path}.action normalized from "${String(raw.action)}" to "${action}"`);
    }

    // description (required)
    let description = typeof raw.description === "string" ? raw.description : "";
    if (!description && typeof raw.symbol === "string") {
      description = raw.symbol;
      this.addCoercion(`${path}.description defaulted to symbol`);
    }

    // total_amount (required)
    let totalAmount = coerceNumber(raw.total_amount);
    if (totalAmount === null) {
      // Try to compute from quantity * price
      const qty = coerceNumber(raw.quantity);
      const price = coerceNumber(raw.price_per_share);
      if (qty !== null && price !== null) {
        totalAmount = qty * price;
        // Negate for buys (money leaving account)
        if (["buy", "buy_to_cover"].includes(action) && totalAmount > 0) {
          totalAmount = -totalAmount;
        }
        this.addCoercion(`${path}.total_amount computed from quantity * price`);
      } else {
        totalAmount = 0;
        this.addCoercion(`${path}.total_amount defaulted to 0`);
      }
    }
    if (typeof raw.total_amount === "string") {
      this.addCoercion(`${path}.total_amount coerced from string to number`);
    }

    return {
      transaction_date: txDate,
      settlement_date: coerceDate(raw.settlement_date),
      symbol: normalizeSymbol(raw.symbol),
      cusip: typeof raw.cusip === "string" ? raw.cusip : null,
      asset_type: normalizeAssetType(raw.asset_type),
      asset_subtype: typeof raw.asset_subtype === "string" ? raw.asset_subtype : null,
      description,
      action,
      quantity: coerceNumber(raw.quantity),
      price_per_share: coerceNumber(raw.price_per_share),
      total_amount: totalAmount,
      fees: coerceNumber(raw.fees),
      commission: coerceNumber(raw.commission),
    };
  }

  private validatePosition(
    raw: unknown,
    path: string
  ): ExtractionPosition | null {
    if (!isPlainObject(raw)) {
      this.addItemSkipped(path, "Expected object", typeof raw);
      return null;
    }

    // snapshot_date (required)
    const snapDate = coerceDate(raw.snapshot_date);
    if (!snapDate) {
      this.addItemSkipped(
        `${path}.snapshot_date`,
        "Required date in YYYY-MM-DD format",
        raw.snapshot_date
      );
      return null;
    }

    // symbol (required)
    const symbol = normalizeSymbol(raw.symbol);
    if (!symbol) {
      this.addItemSkipped(`${path}.symbol`, "Required string", raw.symbol);
      return null;
    }

    // quantity (required)
    const quantity = coerceNumber(raw.quantity);
    if (quantity === null) {
      this.addItemSkipped(`${path}.quantity`, "Required number", raw.quantity);
      return null;
    }

    return {
      snapshot_date: snapDate,
      symbol,
      cusip: typeof raw.cusip === "string" ? raw.cusip : null,
      asset_type: normalizeAssetType(raw.asset_type),
      asset_subtype: typeof raw.asset_subtype === "string" ? raw.asset_subtype : null,
      description: typeof raw.description === "string" ? raw.description : null,
      quantity,
      short_quantity: coerceNumber(raw.short_quantity),
      average_cost_basis: coerceNumber(raw.average_cost_basis),
      market_price_per_share: coerceNumber(raw.market_price_per_share),
      market_value: coerceNumber(raw.market_value),
      cost_basis_total: coerceNumber(raw.cost_basis_total),
      unrealized_profit_loss: coerceNumber(raw.unrealized_profit_loss),
      unrealized_profit_loss_pct: coerceNumber(raw.unrealized_profit_loss_pct),
      day_change_amount: coerceNumber(raw.day_change_amount),
      day_change_pct: coerceNumber(raw.day_change_pct),
    };
  }

  private validateBalance(
    raw: unknown,
    path: string
  ): ExtractionBalance | null {
    if (!isPlainObject(raw)) {
      this.addItemSkipped(path, "Expected object", typeof raw);
      return null;
    }

    // snapshot_date (required)
    const snapDate = coerceDate(raw.snapshot_date);
    if (!snapDate) {
      this.addItemSkipped(
        `${path}.snapshot_date`,
        "Required date in YYYY-MM-DD format",
        raw.snapshot_date
      );
      return null;
    }

    return {
      snapshot_date: snapDate,
      liquidation_value: coerceNumber(raw.liquidation_value),
      cash_balance: coerceNumber(raw.cash_balance),
      available_funds: coerceNumber(raw.available_funds),
      total_cash: coerceNumber(raw.total_cash),
      equity: coerceNumber(raw.equity),
      long_market_value: coerceNumber(raw.long_market_value),
      buying_power: coerceNumber(raw.buying_power),
    };
  }
}

// ── Public API ──

/**
 * Validate raw JSON text against the PortsieExtraction schema.
 *
 * Handles:
 * - Markdown fence stripping (```json ... ```)
 * - JSON extraction from surrounding text
 * - Type coercions (string to number, date format normalization)
 * - Enum normalization (e.g. "Purchase" -> "buy")
 * - Backward compat (top-level flat arrays -> wrapped in single account)
 * - Required field defaults
 *
 * @param rawJson - Raw text from LLM output
 * @returns ValidationResult with typed extraction or errors
 */
export function validateExtraction(rawJson: string): ValidationResult {
  const validator = new ExtractionValidator();
  return validator.validate(rawJson);
}
