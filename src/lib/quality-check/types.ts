/**
 * Quality Check types — used by the checker, orchestrator, and API routes.
 */

import type { PortsieExtraction } from "../extraction/schema";

// ── Check result types ──

export interface ValueCheck {
  expected: number;
  actual: number;
  diff: number;
  diff_pct: number;
  passed: boolean;
}

export interface CountCheck {
  expected: number;
  actual: number;
  passed: boolean;
}

export interface CheckResult {
  /** Hard check: extraction balance total vs DB account total */
  total_value: ValueCheck;
  /** Hard check: extraction position count vs DB holdings count */
  position_count: CountCheck;
  /** Soft check: extraction transaction count vs DB transaction count */
  transaction_count: CountCheck;
  /** Soft check: cash + equity ≈ total within the extraction itself */
  balance_sanity: {
    cash: number;
    equity: number;
    total: number;
    expected_total: number;
    passed: boolean;
  };
  /** Soft check: sum of position market_value ≈ equity from balance */
  position_sum: ValueCheck;
  /** True if all hard checks pass */
  overall_passed: boolean;
  /** Human-readable summary */
  summary: string;
}

// ── Quality check input ──

export interface QualityCheckInput {
  extraction: PortsieExtraction;
  linkedAccountIds: string[];
  /** Account summaries from the DB */
  dbAccounts: Array<{
    id: string;
    total_market_value: number | null;
    equity_value: number | null;
    cash_balance: number | null;
    holdings_count: number | null;
  }>;
  /** Total active holdings across linked accounts */
  dbHoldingsCount: number;
  /** Transactions linked to this upload's statement_id */
  dbTransactionCount: number;
}

// ── Fix attempt tracking ──

export interface FixAttempt {
  phase: 1 | 2;
  started_at: string;
  completed_at: string | null;
  status: "running" | "succeeded" | "failed";
  /** Phase 1: the modified prompt used */
  prompt_used?: string;
  /** Phase 1: the re-extraction result */
  new_extraction?: PortsieExtraction;
  /** Quality check on the new extraction */
  re_check?: CheckResult;
  /** Phase 2: git branch name */
  branch_name?: string;
  /** Phase 2: Vercel preview URL */
  preview_url?: string;
  /** Error message if failed */
  error?: string;
}

// ── DB row type ──

export interface QualityCheck {
  id: string;
  user_id: string;
  upload_id: string;
  extraction_data: PortsieExtraction;
  linked_account_ids: string[];
  check_status:
    | "running"
    | "passed"
    | "failed"
    | "fixing_prompt"
    | "fixing_code"
    | "fixed"
    | "unresolved";
  checks: CheckResult;
  fix_attempts: FixAttempt[];
  fix_count: number;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Extended UploadedStatement parse_status ──

export type QCParseStatus =
  | "pending"
  | "processing"
  | "extracted"
  | "completed"
  | "partial"
  | "failed"
  | "qc_running"
  | "qc_failed"
  | "qc_fixing";
