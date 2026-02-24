import { describe, it, expect, beforeEach } from "vitest";
import { getPrivacyConfig, resetPrivacyConfigCache } from "../config";

beforeEach(() => {
  resetPrivacyConfigCache();
});

describe("getPrivacyConfig", () => {
  it("defaults to strict mode when PRIVACY_MODE is not set", () => {
    delete process.env.PRIVACY_MODE;
    const config = getPrivacyConfig();
    expect(config.mode).toBe("strict");
    expect(config.retainRawLLMResponse).toBe(false);
    expect(config.retainVerificationData).toBe(false);
    expect(config.sourceFileRetentionDays).toBe(30);
    expect(config.debugVerbosity).toBe("minimal");
  });

  it("returns strict config when PRIVACY_MODE=strict", () => {
    process.env.PRIVACY_MODE = "strict";
    const config = getPrivacyConfig();
    expect(config.mode).toBe("strict");
    expect(config.retainRawLLMResponse).toBe(false);
  });

  it("returns standard config when PRIVACY_MODE=standard", () => {
    process.env.PRIVACY_MODE = "standard";
    const config = getPrivacyConfig();
    expect(config.mode).toBe("standard");
    expect(config.retainRawLLMResponse).toBe(true);
    expect(config.retainVerificationData).toBe(true);
    expect(config.sourceFileRetentionDays).toBe(0);
    expect(config.debugVerbosity).toBe("normal");
  });

  it("falls back to strict for invalid PRIVACY_MODE values", () => {
    process.env.PRIVACY_MODE = "invalid_mode";
    const config = getPrivacyConfig();
    expect(config.mode).toBe("strict");
  });

  it("is case-insensitive", () => {
    process.env.PRIVACY_MODE = "STANDARD";
    const config = getPrivacyConfig();
    expect(config.mode).toBe("standard");
  });

  it("caches the config", () => {
    process.env.PRIVACY_MODE = "standard";
    const config1 = getPrivacyConfig();
    process.env.PRIVACY_MODE = "strict";
    const config2 = getPrivacyConfig();
    // Should still be standard because of cache
    expect(config1).toBe(config2);
    expect(config2.mode).toBe("standard");
  });

  it("cache can be reset", () => {
    process.env.PRIVACY_MODE = "standard";
    const config1 = getPrivacyConfig();
    expect(config1.mode).toBe("standard");

    resetPrivacyConfigCache();
    process.env.PRIVACY_MODE = "strict";
    const config2 = getPrivacyConfig();
    expect(config2.mode).toBe("strict");
  });

  it("config is frozen (immutable)", () => {
    const config = getPrivacyConfig();
    expect(() => {
      (config as Record<string, unknown>).mode = "standard";
    }).toThrow();
  });
});
