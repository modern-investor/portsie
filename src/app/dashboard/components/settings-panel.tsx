"use client";

import { useState, useEffect } from "react";
import { LLMSettings } from "./llm-settings";
import { ExtractionFailures } from "./extraction-failures";

type SettingsTab = "llm" | "failures";

export function SettingsPanel() {
  const [tab, setTab] = useState<SettingsTab>("llm");
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  // Fetch unresolved failure count on mount (for badge)
  useEffect(() => {
    fetch("/api/settings/failures")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setUnresolvedCount(
          Array.isArray(data) ? data.filter((f: { resolved_at: string | null }) => !f.resolved_at).length : 0
        );
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("llm")}
          className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:py-2 ${
            tab === "llm"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          LLM
        </button>
        <button
          onClick={() => setTab("failures")}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:py-2 ${
            tab === "failures"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Failures
          {unresolvedCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
              {unresolvedCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === "llm" && <LLMSettings />}
      {tab === "failures" && (
        <ExtractionFailures onUnresolvedCount={setUnresolvedCount} />
      )}
    </div>
  );
}
