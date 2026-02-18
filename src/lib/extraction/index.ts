/**
 * Extraction pipeline — re-exports for clean imports.
 *
 * Usage:
 *   import { validateExtraction, matchAccounts, writeExtraction } from "@/lib/extraction";
 *   import type { PortsieExtraction, AccountMapResult } from "@/lib/extraction";
 */

// Schema types + enums
export {
  TRANSACTION_ACTIONS,
  ASSET_TYPES,
  ACCOUNT_TYPES,
  DOCUMENT_TYPES,
  CONFIDENCE_LEVELS,
  PORTSIE_EXTRACTION_JSON_SCHEMA,
} from "./schema";

export type {
  TransactionAction,
  AssetType,
  AccountType,
  DocumentType,
  Confidence,
  ExtractionTransaction,
  ExtractionPosition,
  ExtractionBalance,
  ExtractionAccountInfo,
  ExtractionAccount,
  PortsieExtraction,
  AccountMapping,
  AccountMapResult,
  AccountWriteResult,
  WriteReport,
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from "./schema";

// Stage 2: Validator
export { validateExtraction } from "./validate";

// Stage 2.5: Account matcher
export {
  matchAccounts,
  loadExistingAccountsForMatching,
  accountTypeToCategory,
} from "./account-matcher";
export type { ExistingAccountForMatching } from "./account-matcher";

// Stage 3: DB writer
export { writeExtraction } from "./db-writer";
