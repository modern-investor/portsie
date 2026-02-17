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
  description?: string | null;
  quantity: number;
  short_quantity?: number | null;
  average_cost_basis?: number | null;
  market_price_per_share?: number | null;
  market_value?: number | null;
  cost_basis_total?: number | null;
  unrealized_profit_loss?: number | null;
  unrealized_profit_loss_pct?: number | null;
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
}

export interface LLMExtractionResult {
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
  parse_status: "pending" | "processing" | "completed" | "partial" | "failed";
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
  created_at: string;
  updated_at: string;
}

// ── Account match result ──

export interface AccountMatch {
  id: string;
  account_nickname: string | null;
  institution_name: string | null;
  account_type: string | null;
  schwab_account_number: string | null;
  match_reason: string;
}
