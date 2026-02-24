/**
 * Account field encryption/decryption mappers.
 *
 * Handles encryption of account_number and account_nickname
 * for storage, and decryption for authorized server-side reads.
 */

import { encryptField, decryptField, tokenizeAccountNumber } from "../crypto";
import { redactAccountNumber } from "../redaction";
import type { EncryptedField, TokenizedField } from "../types";

export interface AccountEncryptedFields {
  account_number_encrypted: EncryptedField | null;
  account_number_token: TokenizedField | null;
  /** Last 4 digits for UI display (not sensitive on its own) */
  account_number_hint: string | null;
}

/**
 * Encrypt an account number for DB storage.
 * Returns encrypted blob, HMAC token, and display hint.
 */
export function encryptAccountNumber(
  raw: string | null | undefined
): AccountEncryptedFields {
  if (!raw) {
    return {
      account_number_encrypted: null,
      account_number_token: null,
      account_number_hint: null,
    };
  }

  return {
    account_number_encrypted: encryptField(raw),
    account_number_token: tokenizeAccountNumber(raw),
    account_number_hint: redactAccountNumber(raw),
  };
}

/**
 * Decrypt an account number from its encrypted blob.
 * Only call this in authorized server paths.
 */
export function decryptAccountNumber(
  encrypted: EncryptedField | string | null | undefined
): string | null {
  if (!encrypted) return null;
  return decryptField(encrypted);
}
