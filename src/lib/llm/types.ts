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
}

/** Database row shape */
export interface LLMSettingsRecord {
  id: string;
  user_id: string;
  llm_mode: LLMMode;
  api_key_encrypted: string | null;
  cli_endpoint: string | null;
  created_at: string;
  updated_at: string;
}
