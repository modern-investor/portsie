"use client";

import { useEffect, useState } from "react";

type LLMMode = "cli" | "api";

export function LLMSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Settings state
  const [llmMode, setLlmMode] = useState<LLMMode>("cli");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [cliEndpoint, setCliEndpoint] = useState("");

  // Fetch current settings on mount
  useEffect(() => {
    fetch("/api/settings/llm")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch settings");
        return res.json();
      })
      .then((data) => {
        setLlmMode(data.llmMode ?? "cli");
        setHasApiKey(data.hasApiKey ?? false);
        setCliEndpoint(data.cliEndpoint ?? "");
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
      setLlmMode("cli");
      setApiKey("");
      setSuccess("API key removed. Reverted to CLI mode.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-8 w-48 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="space-y-4 rounded-lg border p-6">
        <h3 className="font-medium">Processing Backend</h3>
        <p className="text-sm text-gray-500">
          Choose how uploaded financial documents are processed.
        </p>

        <div className="space-y-3">
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
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Claude CLI</p>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                  Default
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Uses Claude Code CLI on the server. No per-token cost — included
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

      {/* API Key section */}
      <div className="space-y-4 rounded-lg border p-6">
        <h3 className="font-medium">Anthropic API Key</h3>

        {hasApiKey ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">API key configured</span>
            </div>
            <button
              onClick={handleDeleteApiKey}
              disabled={saving}
              className="rounded-md border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
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

      {/* CLI Endpoint (advanced) */}
      {llmMode === "cli" && (
        <div className="space-y-4 rounded-lg border p-6">
          <h3 className="font-medium">CLI Endpoint</h3>
          <p className="text-sm text-gray-500">
            Optional. URL for a remote Claude CLI HTTP wrapper (e.g., on
            DigitalOcean). Leave blank to use the local CLI.
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
