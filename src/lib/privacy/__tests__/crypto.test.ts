import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";
import {
  encryptField,
  decryptField,
  tokenize,
  tokenizeAccountNumber,
  isEncryptedField,
} from "../crypto";

// Set up test keys before running
beforeAll(() => {
  process.env.SCHWAB_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.PRIVACY_HMAC_KEY = randomBytes(32).toString("hex");
});

describe("encryptField / decryptField", () => {
  it("round-trips plaintext through encrypt → decrypt", () => {
    const plaintext = "1234567890";
    const encrypted = encryptField(plaintext);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces versioned ciphertext with v1 prefix", () => {
    const encrypted = encryptField("test");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted.split(".")).toHaveLength(4);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const encrypted1 = encryptField("same-value");
    const encrypted2 = encryptField("same-value");
    expect(encrypted1).not.toBe(encrypted2);
    // But both decrypt to the same value
    expect(decryptField(encrypted1)).toBe("same-value");
    expect(decryptField(encrypted2)).toBe("same-value");
  });

  it("produces different ciphertexts for different plaintexts", () => {
    const encrypted1 = encryptField("value-a");
    const encrypted2 = encryptField("value-b");
    expect(encrypted1).not.toBe(encrypted2);
  });

  it("handles empty string", () => {
    const encrypted = encryptField("");
    expect(decryptField(encrypted)).toBe("");
  });

  it("handles unicode", () => {
    const plaintext = "账户号码 🔒 Ñoño";
    const encrypted = encryptField(plaintext);
    expect(decryptField(encrypted)).toBe(plaintext);
  });

  it("detects tampered ciphertext", () => {
    const encrypted = encryptField("sensitive");
    // Tamper with the ciphertext portion
    const parts = encrypted.split(".");
    parts[3] = "AAAA" + parts[3].slice(4);
    const tampered = parts.join(".");
    expect(() => decryptField(tampered)).toThrow();
  });
});

describe("isEncryptedField", () => {
  it("returns true for versioned format", () => {
    const encrypted = encryptField("test");
    expect(isEncryptedField(encrypted)).toBe(true);
  });

  it("returns false for non-encrypted strings", () => {
    expect(isEncryptedField("plain text")).toBe(false);
    expect(isEncryptedField("abc.def.ghi")).toBe(false);
    expect(isEncryptedField("")).toBe(false);
  });
});

describe("tokenize", () => {
  it("produces deterministic tokens for the same input and domain", () => {
    const token1 = tokenize("12345", "account_number");
    const token2 = tokenize("12345", "account_number");
    expect(token1).toBe(token2);
  });

  it("produces different tokens for different domains (domain separation)", () => {
    const token1 = tokenize("12345", "account_number");
    const token2 = tokenize("12345", "email");
    expect(token1).not.toBe(token2);
  });

  it("produces different tokens for different values in the same domain", () => {
    const token1 = tokenize("12345", "account_number");
    const token2 = tokenize("67890", "account_number");
    expect(token1).not.toBe(token2);
  });

  it("includes domain prefix in the token", () => {
    const token = tokenize("value", "my_domain");
    expect(token.startsWith("my_domain:")).toBe(true);
  });
});

describe("tokenizeAccountNumber", () => {
  it("strips non-digits before tokenizing", () => {
    const token1 = tokenizeAccountNumber("...5902");
    const token2 = tokenizeAccountNumber("5902");
    expect(token1).toBe(token2);
  });

  it("normalizes different mask formats to the same token", () => {
    const token1 = tokenizeAccountNumber("****5902");
    const token2 = tokenizeAccountNumber("XX-5902");
    const token3 = tokenizeAccountNumber("5902");
    expect(token1).toBe(token2);
    expect(token2).toBe(token3);
  });

  it("prefixes with account_number domain", () => {
    const token = tokenizeAccountNumber("12345");
    expect(token.startsWith("account_number:")).toBe(true);
  });
});
