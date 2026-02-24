/**
 * Privacy module — centralized exports.
 *
 * All privacy-related operations (encryption, tokenization, redaction,
 * configuration, mappers) should be imported from this barrel.
 */

// Crypto primitives
export {
  encryptField,
  decryptField,
  tokenize,
  tokenizeAccountNumber,
  isEncryptedField,
} from "./crypto";

// Types
export type {
  EncryptedField,
  TokenizedField,
  PrivacyMode,
  PrivacyConfig,
  DebugContext,
} from "./types";

// Config
export { getPrivacyConfig, resetPrivacyConfigCache } from "./config";

// Redaction
export {
  redactForLog,
  redactAccountNumber,
  redactEmail,
  safeLog,
} from "./redaction";

// Mappers
export {
  encryptAccountNumber,
  decryptAccountNumber,
} from "./mappers/accounts";

export {
  sanitizeExtractionForStorage,
  buildDebugContext,
} from "./mappers/uploads";
