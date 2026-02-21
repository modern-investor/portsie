"use client";

import { useEffect, useState } from "react";

type LLMMode = "gemini" | "cli" | "api";

export function LLMSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Primary settings state
  const [llmMode, setLlmMode] = useState<LLMMode>("gemini");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [cliEndpoint, setCliEndpoint] = useState("");

  // Verification settings state
  const [verificationEnabled, setVerificationEnabled] = useState(true);
  const [verificationBackend, setVerificationBackend] = useState<"gemini" | "cli">("cli");

  // Fetch current settings on mount
  useEffect(() => {
    fetch("/api/settings/llm")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch settings");
        return res.json();
      })
      .then((data) => {
        setLlmMode(data.llmMode ?? "gemini");
        setHasApiKey(data.hasApiKey ?? false);
        setCliEndpoint(data.cliEndpoint ?? "");
        setVerificationEnabled(data.verificationEnabled ?? true);
        setVerificationBackend(data.verificationBackend ?? "cli");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const body: Record<string, unknown> = {
        llmMode,
        cliEndpoint: cliEndpoint || null,
        verificationEnabled,
        verificationBackend,
        verificationModel: verificationBackend === "cli" ? "claude-sonnet-4-6" : "gemini-3-flash-preview",
      };
      if (apiKey.trim()) {
        body.apiKey = apiKey.trim();
      }

      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSuccess("Settings saved.");
      if (apiKey.trim()) {
        setHasApiKey(true);
        setApiKey(""); // Clear input after save
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteApiKey() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/settings/llm", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete API key");
      setHasApiKey(false);
      setLlmMode("gemini");
      setApiKey("");
      setSuccess("API key removed. Reverted to Gemini Flash.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-4 sm:p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-8 w-48 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Extraction Model */}
      <div className="space-y-4 rounded-lg border p-4 sm:p-6">
        <h3 className="font-medium">Primary Extraction Model</h3>
        <p className="text-sm text-gray-500">
          The main model used to extract financial data from uploaded documents.
        </p>

        <div className="space-y-3">
          {/* Gemini mode (default) */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              llmMode === "gemini"
                ? "border-blue-500 bg-blue-50"
                : "hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="llmMode"
              value="gemini"
              checked={llmMode === "gemini"}
              onChange={() => setLlmMode("gemini")}
              className="mt-1 accent-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Gemini Flash</p>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                  Default
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Google Gemini 3 Flash — fast, accurate, and cost-effective.
                Automatically falls back to Claude if Gemini is unavailable.
              </p>
            </div>
            {llmMode === "gemini" && (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Active
              </span>
            )}
          </label>

          {/* CLI mode */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              llmMode === "cli"
                ? "border-blue-500 bg-blue-50"
                : "hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="llmMode"
              value="cli"
              checked={llmMode === "cli"}
              onChange={() => setLlmMode("cli")}
              className="mt-1 accent-blue-600"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Claude CLI</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Claude Sonnet 4.6 via CLI wrapper. No per-token cost — included
                with Claude Max subscription.
              </p>
            </div>
            {llmMode === "cli" && (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Active
              </span>
            )}
          </label>

          {/* API mode */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              llmMode === "api"
                ? "border-blue-500 bg-blue-50"
                : "hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="llmMode"
              value="api"
              checked={llmMode === "api"}
              onChange={() => setLlmMode("api")}
              className="mt-1 accent-blue-600"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Anthropic API</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Uses the Anthropic API directly. Requires an API key.
                Per-token billing applies.
              </p>
            </div>
            {llmMode === "api" && (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Active
              </span>
            )}
          </label>
        </div>
      </div>

      {/* API Key section — only show for API mode */}
      {llmMode === "api" && (
        <div className="space-y-4 rounded-lg border p-4 sm:p-6">
          <h3 className="font-medium">Anthropic API Key</h3>

          {hasApiKey ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">API key configured</span>
              </div>
              <button
                onClick={handleDeleteApiKey}
                disabled={saving}
                className="w-full rounded-md border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                Remove Key
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No API key configured.</p>
          )}

          <div>
            <label htmlFor="apiKey" className="mb-1 block text-sm font-medium">
              {hasApiKey ? "Update API Key" : "Enter API Key"}
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Encrypted and stored securely. Never exposed to your browser after
              saving.
            </p>
          </div>
        </div>
      )}

      {/* CLI Endpoint (advanced) */}
      {llmMode === "cli" && (
        <div className="space-y-4 rounded-lg border p-4 sm:p-6">
          <h3 className="font-medium">CLI Endpoint</h3>
          <p className="text-sm text-gray-500">
            Optional. URL for a remote Claude CLI HTTP wrapper (e.g., on
            DigitalOcean). Leave blank to use the default server.
          </p>
          <input
            type="url"
            value={cliEndpoint}
            onChange={(e) => setCliEndpoint(e.target.value)}
            placeholder="https://your-do-server.com/extract"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Verification Model */}
      <div className="space-y-4 rounded-lg border p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Verification Model</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verificationEnabled}
              onChange={(e) => setVerificationEnabled(e.target.checked)}
              className="accent-blue-600"
            />
            Enabled
          </label>
        </div>
        <p className="text-sm text-gray-500">
          After primary extraction, a second model independently extracts data
          from the same document. Discrepancies are shown in the upload review.
        </p>

        {verificationEnabled && (
          <div className="space-y-3">
            {/* CLI / Sonnet (default verification) */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                verificationBackend === "cli"
                  ? "border-blue-500 bg-blue-50"
                  : "hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="verificationBackend"
                value="cli"
                checked={verificationBackend === "cli"}
                onChange={() => setVerificationBackend("cli")}
                className="mt-1 accent-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Claude Sonnet 4.6</p>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                    Default
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Claude Sonnet 4.6 via CLI wrapper. No per-token cost.
                </p>
              </div>
            </label>

            {/* Gemini verification */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                verificationBackend === "gemini"
                  ? "border-blue-500 bg-blue-50"
                  : "hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="verificationBackend"
                value="gemini"
                checked={verificationBackend === "gemini"}
                onChange={() => setVerificationBackend("gemini")}
                className="mt-1 accent-blue-600"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Gemini Flash</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Google Gemini 3 Flash. Use when primary is Claude CLI.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
