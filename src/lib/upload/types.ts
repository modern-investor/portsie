// Upload feature types

/** File types matching the uploaded_statements.file_type CHECK constraint */
export type UploadFileType =
  | "pdf"
  | "csv"
  | "ofx"
  | "qfx"
  | "png"
  | "jpg"
  | "xlsx"
  | "txt"
  | "json";

/** Maps browser MIME types to our internal file type identifiers */
export const MIME_TO_FILE_TYPE: Record<string, UploadFileType> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/x-ofx": "ofx",
  "application/x-qfx": "qfx",
  "application/json": "json",
};

// ── LLM extraction result types ──

export interface ExtractedTransaction {
  transaction_date: string; // ISO date YYYY-MM-DD
  settlement_date?: string | null;
  symbol?: string | null;
  cusip?: string | null;
  asset_type?: string | null;
  asset_subtype?: string | null;
  description: string;
  action: string; // must match transactions.action CHECK constraint
  quantity?: number | null;
  price_per_share?: number | null;
  total_amount: number;
  fees?: number | null;
  commission?: number | null;
}

export interface ExtractedPosition {
  snapshot_date: string; // ISO date YYYY-MM-DD
  symbol: string;
  cusip?: string | null;
  asset_type?: string | null;
  asset_subtype?: string | null;
  description?: string | null;
  quantity: number;
  short_quantity?: number | null;
  average_cost_basis?: number | null;
  market_price_per_share?: number | null;
  market_value?: number | null;
  cost_basis_total?: number | null;
  unrealized_profit_loss?: number | null;
  unrealized_profit_loss_pct?: number | null;
  /** Day change amount in dollars */
  day_change_amount?: number | null;
  /** Day change as percentage */
  day_change_pct?: number | null;
}

export interface ExtractedBalance {
  snapshot_date: string; // ISO date YYYY-MM-DD
  liquidation_value?: number | null;
  cash_balance?: number | null;
  available_funds?: number | null;
  total_cash?: number | null;
  equity?: number | null;
  long_market_value?: number | null;
  buying_power?: number | null;
}

export interface DetectedAccountInfo {
  account_number?: string | null;
  account_type?: string | null;
  institution_name?: string | null;
  account_nickname?: string | null;
  account_group?: string | null;
}

/** Claude's account linkage decision — returned inline in extraction results */
export interface AccountLink {
  action: "match_existing" | "create_new";
  existing_account_id?: string; // UUID, present only when action === "match_existing"
  match_confidence: "high" | "medium" | "low";
  match_reason: string;
}

/** Per-account container for multi-account extractions */
export interface ExtractedAccount {
  account_link?: AccountLink; // Claude's matching decision (optional for backward compat)
  account_info: DetectedAccountInfo;
  transactions: ExtractedTransaction[];
  positions: ExtractedPosition[];
  balances: ExtractedBalance[];
}

/** Existing account context injected into the extraction prompt */
export interface ExistingAccountContext {
  id: string;
  account_nickname: string | null;
  institution_name: string | null;
  account_type: string | null;
  account_number_hint: string | null; // last 4 digits only, e.g. "...5902"
  account_group: string | null;
}

export interface LLMExtractionResult {
  // Multi-account: per-account data (primary structure for multi-account docs)
  accounts?: ExtractedAccount[];
  // Positions from aggregate sections that can't be attributed to a specific account
  unallocated_positions?: ExtractedPosition[];

  // Single-account / backward-compat: always populated (synthesized from accounts[] if needed)
  account_info: DetectedAccountInfo;
  statement_start_date?: string | null;
  statement_end_date?: string | null;
  transactions: ExtractedTransaction[];
  positions: ExtractedPosition[];
  balances: ExtractedBalance[];
  confidence: "high" | "medium" | "low";
  notes: string[];
}

// ── Database row type ──

export interface UploadedStatement {
  id: string;
  user_id: string;
  account_id: string | null;
  filename: string;
  file_path: string;
  file_type: UploadFileType;
  file_size_bytes: number | null;
  file_hash: string | null;
  parse_status:
    | "pending"
    | "processing"
    | "extracted"
    | "completed"
    | "partial"
    | "failed"
    | "qc_running"
    | "qc_failed"
    | "qc_fixing";
  parse_error: string | null;
  parsed_at: string | null;
  transactions_created: number;
  positions_created: number;
  statement_start_date: string | null;
  statement_end_date: string | null;
  raw_llm_response: unknown;
  extracted_data: LLMExtractionResult | null;
  process_count: number;
  confirmed_at: string | null;
  detected_account_info: DetectedAccountInfo | null;
  quality_check_id: string | null;
  qc_status_message: string | null;
  processing_settings: {
    preset: string;
    label: string;
    backend: string;
    model: string;
    thinkingLevel: string;
    mediaResolution: string;
  } | null;
  created_at: string;
  updated_at: string;
}

