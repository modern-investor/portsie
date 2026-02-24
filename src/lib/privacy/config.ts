/**
 * Privacy configuration.
 *
 * Reads PRIVACY_MODE from environment (default: "strict").
 * Returns a frozen PrivacyConfig with behavior settings.
 */

import type { PrivacyConfig, PrivacyMode } from "./types";

const VALID_MODES: PrivacyMode[] = ["strict", "standard"];

let cached: PrivacyConfig | null = null;

/**
 * Get the current privacy configuration.
 *
 * Behavior matrix:
 * | Setting                  | strict (default)  | standard (dev)   |
 * |--------------------------|-------------------|------------------|
 * | retainRawLLMResponse     | false             | true             |
 * | retainVerificationData   | false             | true             |
 * | sourceFileRetentionDays  | 30                | 0 (indefinite)   |
 * | debugVerbosity           | minimal           | normal           |
 */
export function getPrivacyConfig(): PrivacyConfig {
  if (cached) return cached;

  const raw = (process.env.PRIVACY_MODE ?? "strict").toLowerCase() as PrivacyMode;
  const mode: PrivacyMode = VALID_MODES.includes(raw) ? raw : "strict";

  const config: PrivacyConfig =
    mode === "strict"
      ? {
          mode: "strict",
          retainRawLLMResponse: false,
          retainVerificationData: false,
          sourceFileRetentionDays: 30,
          debugVerbosity: "minimal",
        }
      : {
          mode: "standard",
          retainRawLLMResponse: true,
          retainVerificationData: true,
          sourceFileRetentionDays: 0,
          debugVerbosity: "normal",
        };

  cached = Object.freeze(config);
  return cached;
}

/** Reset cached config (for testing). */
export function resetPrivacyConfigCache(): void {
  cached = null;
}
