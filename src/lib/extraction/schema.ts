/**
 * PortsieExtraction v1 — Canonical JSON schema for all financial document extractions.
 *
 * This is the SOLE CONTRACT between:
 *   - Stage 1 (LLM extraction): produces this JSON
 *   - Stage 2 (validation): validates against this schema
 *   - Stage 3 (DB writer): consumes this JSON deterministically
 *
 * Design principles:
 *   1. Every field is explicitly typed — no ambiguity
 *   2. Required vs optional is clearly marked
 *   3. Enums are closed sets matching DB constraints exactly
 *   4. No backward-compat top-level flat arrays — everything is per-account or unallocated
 *   5. Account matching is NOT part of this schema (separate Stage 2.5)
 */

// ── Enum types (must match DB CHECK constraints exactly) ──

export const TRANSACTION_ACTIONS = [
  "buy",
  "sell",
  "buy_to_cover",
  "sell_short",
  "dividend",
  "capital_gain_long",
  "capital_gain_short",
  "interest",
  "transfer_in",
  "transfer_out",
  "fee",
  "commission",
  "stock_split",
  "merger",
  "spinoff",
  "reinvestment",
  "journal",
  "other",
] as const;

export type TransactionAction = (typeof TRANSACTION_ACTIONS)[number];

export const ASSET_TYPES = [
  "EQUITY",
  "OPTION",
  "MUTUAL_FUND",
  "FIXED_INCOME",
  "ETF",
  "CASH_EQUIVALENT",
  "REAL_ESTATE",
  "PRECIOUS_METAL",
  "VEHICLE",
  "JEWELRY",
  "COLLECTIBLE",
  "OTHER_ASSET",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number] | null;

export const ACCOUNT_TYPES = [
  "individual",
  "ira",
  "roth_ira",
  "joint",
  "trust",
  "401k",
  "403b",
  "529",
  "custodial",
  "margin",
  "checking",
  "savings",
  "credit_card",
  "mortgage",
  "heloc",
  "auto_loan",
  "real_estate",
  "view_only",
  "sep_ira",
  "simple_ira",
  "rollover_ira",
  "inherited_ira",
  "education",
  "hsa",
  "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number] | null;

export const DOCUMENT_TYPES = [
  "portfolio_summary",
  "transaction_export",
  "tax_1099",
  "statement",
  "csv_export",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number] | null;

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

// ── Core data types ──

export interface ExtractionTransaction {
  /** Transaction date, YYYY-MM-DD */
  transaction_date: string;
  /** Settlement date, YYYY-MM-DD or null */
  settlement_date: string | null;
  /** Ticker symbol, null for non-security transactions (fees, interest, etc.) */
  symbol: string | null;
  /** CUSIP identifier */
  cusip: string | null;
  /** Asset type classification */
  asset_type: AssetType;
  /** Human-readable description — always required, never null */
  description: string;
  /** Transaction action — must be one of the closed enum values */
  action: TransactionAction;
  /** Number of shares/units, null for cash-only transactions */
  quantity: number | null;
  /** Price per share/unit */
  price_per_share: number | null;
  /** Total dollar amount — REQUIRED, never null. Negative = money leaving account. */
  total_amount: number;
  /** Fees charged */
  fees: number | null;
  /** Commission charged */
  commission: number | null;
}

export interface ExtractionPosition {
  /** Snapshot date, YYYY-MM-DD */
  snapshot_date: string;
  /** Ticker symbol — required for all positions */
  symbol: string;
  /** CUSIP identifier */
  cusip: string | null;
  /** Asset type classification */
  asset_type: AssetType;
  /** Human-readable name/description */
  description: string | null;
  /** Number of shares/units held — required */
  quantity: number;
  /** Number of shares held short */
  short_quantity: number | null;
  /** Average cost basis per share */
  average_cost_basis: number | null;
  /** Current market price per share */
  market_price_per_share: number | null;
  /** Total market value of position */
  market_value: number | null;
  /** Total cost basis */
  cost_basis_total: number | null;
  /** Unrealized gain/loss in dollars */
  unrealized_profit_loss: number | null;
  /** Unrealized gain/loss as percentage (e.g. 36.62 for +36.62%) */
  unrealized_profit_loss_pct: number | null;
  /** Day change amount in dollars (single-day movement, not unrealized P&L) */
  day_change_amount: number | null;
  /** Day change as percentage (e.g. -0.88 for -0.88%) */
  day_change_pct: number | null;
}

export interface ExtractionBalance {
  /** Snapshot date, YYYY-MM-DD */
  snapshot_date: string;
  /** Total account value (liquidation value) */
  liquidation_value: number | null;
  /** Cash and cash equivalents */
  cash_balance: number | null;
  /** Available funds for trading */
  available_funds: number | null;
  /** Total cash including money market */
  total_cash: number | null;
  /** Total equity value */
  equity: number | null;
  /** Long position market value */
  long_market_value: number | null;
  /** Buying power */
  buying_power: number | null;
}

export interface ExtractionAccountInfo {
  /** Account number — may be partial, e.g. "...902" */
  account_number: string | null;
  /** Account type — must be one of the closed enum values */
  account_type: AccountType;
  /** Institution/brokerage name */
  institution_name: string | null;
  /** Display name for the account */
  account_nickname: string | null;
  /** Section/group header, e.g. "Non Retirement", "SubTrust", "Other People's Money" */
  account_group: string | null;
}

/** Per-account container. Every detected account gets one of these. */
export interface ExtractionAccount {
  /** Account identification and metadata */
  account_info: ExtractionAccountInfo;
  /** Transactions for this account (may be empty) */
  transactions: ExtractionTransaction[];
  /** Positions/holdings for this account (may be empty) */
  positions: ExtractionPosition[];
  /** Balance snapshots for this account (should have at least one if value is visible) */
  balances: ExtractionBalance[];
}

/**
 * PortsieExtraction v1 — The root schema type.
 *
 * The LLM produces this. Stage 2 validates it. Stage 3 consumes it.
 */
export interface PortsieExtraction {
  /** Schema version — always 1 for this version */
  schema_version: 1;

  /** Document-level metadata */
  document: {
    /** Top-level institution if identifiable from the document */
    institution_name: string | null;
    /** What kind of document this is */
    document_type: DocumentType;
    /** Statement period start date, YYYY-MM-DD */
    statement_start_date: string | null;
    /** Statement period end date, YYYY-MM-DD */
    statement_end_date: string | null;
  };

  /**
   * Per-account extracted data. ALWAYS an array, even for single-account documents.
   * Every account detected in the document gets one entry.
   */
  accounts: ExtractionAccount[];

  /**
   * Positions from aggregate/combined sections spanning multiple accounts.
   * Example: Schwab summary "Positions" table marked with ††.
   * These cannot be attributed to a specific account.
   * Empty array [] if all positions are per-account.
   */
  unallocated_positions: ExtractionPosition[];

  /** LLM's assessment of extraction quality */
  confidence: Confidence;

  /**
   * Document-level reported totals (for integrity validation).
   * These are "grand total" values printed on the document.
   */
  document_totals?: {
    /** Total portfolio/document value as stated (includes liabilities as negatives) */
    total_value: number | null;
    /** Total day change amount as stated */
    total_day_change: number | null;
    /** Total day change percentage as stated */
    total_day_change_pct: number | null;
  } | null;

  /** Anything unusual, ambiguous, or needing user review */
  notes: string[];
}

// ── Account matching types (Stage 2.5 — separate from extraction) ──

export interface AccountMapping {
  /** Index into PortsieExtraction.accounts[] */
  extraction_index: number;
  /** Whether to match to existing or create new */
  action: "match_existing" | "create_new";
  /** UUID of existing account (null for create_new) */
  account_id: string | null;
  /** How confident is the match */
  match_confidence: Confidence;
  /** Human-readable explanation */
  match_reason: string;
}

export interface AccountMapResult {
  /** One mapping per account in the extraction */
  mappings: AccountMapping[];
  /** How many accounts couldn't be matched */
  unmatched_count: number;
  /** How many new accounts will be created */
  new_account_count: number;
  /** Account ID for unallocated_positions (existing or to-be-created aggregate) */
  aggregate_account_id: string | null;
}

// ── DB Writer types (Stage 3 output) ──

export interface AccountWriteResult {
  account_id: string;
  account_nickname: string;
  action: "matched" | "created";
  holdings_created: number;
  holdings_updated: number;
  holdings_closed: number;
  snapshots_written: number;
  balances_written: number;
  transactions_created: number;
}

export interface WriteReport {
  account_results: AccountWriteResult[];
  aggregate_result: {
    account_id: string;
    positions_written: number;
  } | null;
  totals: {
    accounts_processed: number;
    accounts_created: number;
    holdings_created: number;
    holdings_updated: number;
    holdings_closed: number;
    snapshots_written: number;
    balances_written: number;
    transactions_created: number;
  };
}

// ── Validation types (Stage 2 output) ──

export interface ValidationError {
  /** JSON path to the error, e.g. "accounts[2].transactions[5].action" */
  path: string;
  /** Error description */
  message: string;
  /** The offending value */
  value: unknown;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

export interface ValidationResult {
  /** Whether the extraction is valid */
  valid: boolean;
  /** The validated extraction (null if invalid) */
  extraction: PortsieExtraction | null;
  /** Validation errors (extraction is invalid if any) */
  errors: ValidationError[];
  /** Non-fatal warnings */
  warnings: ValidationWarning[];
  /** Type coercions that were applied, e.g. "total_amount coerced from string to number" */
  coercions: string[];
}

// ── JSON Schema for runtime validation ──

/** ISO date regex pattern */
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

export const PORTSIE_EXTRACTION_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PortsieExtraction",
  description: "Canonical JSON schema for Portsie financial document extractions (v1)",
  type: "object" as const,
  required: [
    "schema_version",
    "document",
    "accounts",
    "unallocated_positions",
    "confidence",
    "notes",
  ],
  properties: {
    schema_version: { type: "number" as const, const: 1 },
    document: {
      type: "object" as const,
      required: [
        "institution_name",
        "document_type",
        "statement_start_date",
        "statement_end_date",
      ],
      properties: {
        institution_name: { type: ["string", "null"] as const },
        document_type: {
          oneOf: [
            { type: "string" as const, enum: [...DOCUMENT_TYPES] },
            { type: "null" as const },
          ],
        },
        statement_start_date: {
          oneOf: [
            { type: "string" as const, pattern: DATE_PATTERN },
            { type: "null" as const },
          ],
        },
        statement_end_date: {
          oneOf: [
            { type: "string" as const, pattern: DATE_PATTERN },
            { type: "null" as const },
          ],
        },
      },
      additionalProperties: false,
    },
    accounts: {
      type: "array" as const,
      items: { $ref: "#/$defs/ExtractionAccount" },
    },
    unallocated_positions: {
      type: "array" as const,
      items: { $ref: "#/$defs/ExtractionPosition" },
    },
    confidence: {
      type: "string" as const,
      enum: [...CONFIDENCE_LEVELS],
    },
    document_totals: {
      oneOf: [
        {
          type: "object" as const,
          properties: {
            total_value: { type: ["number", "null"] as const },
            total_day_change: { type: ["number", "null"] as const },
            total_day_change_pct: { type: ["number", "null"] as const },
          },
          additionalProperties: false,
        },
        { type: "null" as const },
      ],
    },
    notes: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  additionalProperties: false,
  $defs: {
    ExtractionAccount: {
      type: "object" as const,
      required: ["account_info", "transactions", "positions", "balances"],
      properties: {
        account_info: { $ref: "#/$defs/ExtractionAccountInfo" },
        transactions: {
          type: "array" as const,
          items: { $ref: "#/$defs/ExtractionTransaction" },
        },
        positions: {
          type: "array" as const,
          items: { $ref: "#/$defs/ExtractionPosition" },
        },
        balances: {
          type: "array" as const,
          items: { $ref: "#/$defs/ExtractionBalance" },
        },
      },
      additionalProperties: false,
    },
    ExtractionAccountInfo: {
      type: "object" as const,
      required: [
        "account_number",
        "account_type",
        "institution_name",
        "account_nickname",
        "account_group",
      ],
      properties: {
        account_number: { type: ["string", "null"] as const },
        account_type: {
          oneOf: [
            { type: "string" as const, enum: [...ACCOUNT_TYPES] },
            { type: "null" as const },
          ],
        },
        institution_name: { type: ["string", "null"] as const },
        account_nickname: { type: ["string", "null"] as const },
        account_group: { type: ["string", "null"] as const },
      },
      additionalProperties: false,
    },
    ExtractionTransaction: {
      type: "object" as const,
      required: ["transaction_date", "description", "action", "total_amount"],
      properties: {
        transaction_date: { type: "string" as const, pattern: DATE_PATTERN },
        settlement_date: {
          oneOf: [
            { type: "string" as const, pattern: DATE_PATTERN },
            { type: "null" as const },
          ],
        },
        symbol: { type: ["string", "null"] as const },
        cusip: { type: ["string", "null"] as const },
        asset_type: {
          oneOf: [
            { type: "string" as const, enum: [...ASSET_TYPES] },
            { type: "null" as const },
          ],
        },
        description: { type: "string" as const },
        action: { type: "string" as const, enum: [...TRANSACTION_ACTIONS] },
        quantity: { type: ["number", "null"] as const },
        price_per_share: { type: ["number", "null"] as const },
        total_amount: { type: "number" as const },
        fees: { type: ["number", "null"] as const },
        commission: { type: ["number", "null"] as const },
      },
      additionalProperties: false,
    },
    ExtractionPosition: {
      type: "object" as const,
      required: ["snapshot_date", "symbol", "quantity"],
      properties: {
        snapshot_date: { type: "string" as const, pattern: DATE_PATTERN },
        symbol: { type: "string" as const },
        cusip: { type: ["string", "null"] as const },
        asset_type: {
          oneOf: [
            { type: "string" as const, enum: [...ASSET_TYPES] },
            { type: "null" as const },
          ],
        },
        description: { type: ["string", "null"] as const },
        quantity: { type: "number" as const },
        short_quantity: { type: ["number", "null"] as const },
        average_cost_basis: { type: ["number", "null"] as const },
        market_price_per_share: { type: ["number", "null"] as const },
        market_value: { type: ["number", "null"] as const },
        cost_basis_total: { type: ["number", "null"] as const },
        unrealized_profit_loss: { type: ["number", "null"] as const },
        unrealized_profit_loss_pct: { type: ["number", "null"] as const },
        day_change_amount: { type: ["number", "null"] as const },
        day_change_pct: { type: ["number", "null"] as const },
      },
      additionalProperties: false,
    },
    ExtractionBalance: {
      type: "object" as const,
      required: ["snapshot_date"],
      properties: {
        snapshot_date: { type: "string" as const, pattern: DATE_PATTERN },
        liquidation_value: { type: ["number", "null"] as const },
        cash_balance: { type: ["number", "null"] as const },
        available_funds: { type: ["number", "null"] as const },
        total_cash: { type: ["number", "null"] as const },
        equity: { type: ["number", "null"] as const },
        long_market_value: { type: ["number", "null"] as const },
        buying_power: { type: ["number", "null"] as const },
      },
      additionalProperties: false,
    },
  },
} as const;
