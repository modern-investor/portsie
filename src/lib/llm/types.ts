// LLM settings types

/**
 * LLM backend modes:
 * - "gemini"  — Gemini 3 Flash via Google REST API (default, server-side key)
 * - "cli"     — Claude Sonnet 4.6 via CLI wrapper on DO (fallback)
 * - "api"     — Anthropic API with per-user key (user override)
 */
export type LLMMode = "gemini" | "cli" | "api";

/** Public-facing settings (safe to return to client — no raw API key) */
export interface LLMSettings {
  llmMode: LLMMode;
  hasApiKey: boolean;
  cliEndpoint: string | null;
  verificationEnabled: boolean;
  verificationBackend: "gemini" | "cli";
  verificationModel: string;
}

// ── Processing presets (per-extraction quality/speed controls) ──

export type ProcessingPreset = "fast" | "balanced" | "quality" | "max_quality";

export interface ProcessingSettings {
  preset: ProcessingPreset;
  label: string;
  backend: "gemini" | "cli";
  model: string;
  thinkingLevel: "minimal" | "low" | "medium" | "high";
  mediaResolution: "MEDIA_RESOLUTION_DEFAULT" | "MEDIA_RESOLUTION_HIGH";
}

export const PROCESSING_PRESETS: Record<ProcessingPreset, ProcessingSettings> = {
  fast: {
    preset: "fast",
    label: "Fast",
    backend: "gemini",
    model: "gemini-3-flash-preview",
    thinkingLevel: "low",
    mediaResolution: "MEDIA_RESOLUTION_DEFAULT",
  },
  balanced: {
    preset: "balanced",
    label: "Balanced",
    backend: "gemini",
    model: "gemini-3-flash-preview",
    thinkingLevel: "low",
    mediaResolution: "MEDIA_RESOLUTION_HIGH",
  },
  quality: {
    preset: "quality",
    label: "Quality",
    backend: "gemini",
    model: "gemini-3-flash-preview",
    thinkingLevel: "medium",
    mediaResolution: "MEDIA_RESOLUTION_HIGH",
  },
  max_quality: {
    preset: "max_quality",
    label: "Max Quality",
    backend: "cli",
    model: "claude-sonnet-4-6",
    thinkingLevel: "high",
    mediaResolution: "MEDIA_RESOLUTION_HIGH",
  },
};

export const DEFAULT_PRESET: ProcessingPreset = "fast";

/** Database row shape */
export interface LLMSettingsRecord {
  id: string;
  user_id: string;
  llm_mode: LLMMode;
  api_key_encrypted: string | null;
  cli_endpoint: string | null;
  verification_enabled: boolean;
  verification_backend: string;
  verification_model: string;
  created_at: string;
  updated_at: string;
}
