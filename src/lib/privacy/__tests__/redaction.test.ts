import { describe, it, expect } from "vitest";
import {
  redactForLog,
  redactAccountNumber,
  redactEmail,
  safeLog,
} from "../redaction";

describe("redactForLog", () => {
  it("redacts sensitive fields by name", () => {
    const input = {
      id: "abc",
      account_number: "1234567890",
      access_token: "tok_secret",
      api_key: "sk-1234",
      status: "active",
    };
    const result = redactForLog(input) as Record<string, unknown>;
    expect(result.id).toBe("abc");
    expect(result.account_number).toBe("[REDACTED]");
    expect(result.access_token).toBe("[REDACTED]");
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.status).toBe("active");
  });

  it("redacts nested objects", () => {
    const input = {
      user: {
        name: "Test",
        password: "hunter2",
      },
    };
    const result = redactForLog(input) as { user: Record<string, unknown> };
    expect(result.user.name).toBe("Test");
    expect(result.user.password).toBe("[REDACTED]");
  });

  it("handles arrays with objects", () => {
    const input = [
      { id: 1, secret: "abc" },
      { id: 2, secret: "def" },
    ];
    const result = redactForLog(input) as Array<Record<string, unknown>>;
    expect(result[0].id).toBe(1);
    expect(result[0].secret).toBe("[REDACTED]");
    expect(result[1].secret).toBe("[REDACTED]");
  });

  it("handles null and undefined", () => {
    expect(redactForLog(null)).toBe(null);
    expect(redactForLog(undefined)).toBe(undefined);
  });

  it("handles primitives", () => {
    expect(redactForLog("hello")).toBe("hello");
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog(true)).toBe(true);
  });

  it("respects max depth", () => {
    const deeply = { a: { b: { c: { d: "value" } } } };
    const result = redactForLog(deeply, 2) as { a: { b: unknown } };
    // At depth 2, the inner objects get truncated
    expect(result.a.b).toBe("[MAX_DEPTH]");
  });

  it("redacts raw_llm_response", () => {
    const input = { raw_llm_response: "huge JSON blob..." };
    const result = redactForLog(input) as Record<string, unknown>;
    expect(result.raw_llm_response).toBe("[REDACTED]");
  });

  it("redacts base64Data", () => {
    const input = { base64Data: "aGVsbG8gd29ybGQ=" };
    const result = redactForLog(input) as Record<string, unknown>;
    expect(result.base64Data).toBe("[REDACTED]");
  });
});

describe("redactAccountNumber", () => {
  it("shows last 4 digits for a full account number", () => {
    expect(redactAccountNumber("1234567890")).toBe("...7890");
  });

  it("handles masked inputs like ...5902", () => {
    expect(redactAccountNumber("...5902")).toBe("...5902");
  });

  it("handles short numbers", () => {
    expect(redactAccountNumber("12")).toBe("...12");
  });

  it("handles null/undefined", () => {
    expect(redactAccountNumber(null)).toBe("[no account number]");
    expect(redactAccountNumber(undefined)).toBe("[no account number]");
  });

  it("handles empty string", () => {
    expect(redactAccountNumber("")).toBe("[no account number]");
  });
});

describe("redactEmail", () => {
  it("masks email with first char of local and domain", () => {
    const result = redactEmail("rahul@example.com");
    expect(result).toBe("r***@e***.com");
  });

  it("handles single-part domain", () => {
    const result = redactEmail("user@localhost");
    // domain = "localhost", no dot → domainBase = "", tld = "localhost"
    expect(result).toBe("u***@***.localhost");
  });

  it("handles null/undefined", () => {
    expect(redactEmail(null)).toBe("[no email]");
    expect(redactEmail(undefined)).toBe("[no email]");
  });

  it("handles malformed email without @", () => {
    expect(redactEmail("noemail")).toBe("n***");
  });
});

describe("safeLog", () => {
  it("calls console methods without throwing", () => {
    // Just verify no errors — safeLog wraps console methods
    expect(() => safeLog("info", "test", "hello")).not.toThrow();
    expect(() => safeLog("warn", "test", "warning")).not.toThrow();
    expect(() => safeLog("error", "test", "error")).not.toThrow();
    expect(() =>
      safeLog("info", "test", "with data", { api_key: "secret" })
    ).not.toThrow();
  });
});
