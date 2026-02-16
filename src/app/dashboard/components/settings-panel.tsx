"use client";

import { useState } from "react";
import { LLMSettings } from "./llm-settings";

type SettingsTab = "llm";

export function SettingsPanel() {
  const [tab, setTab] = useState<SettingsTab>("llm");

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
        {/* Future tabs can be added here */}
      </div>

      {/* Tab content */}
      {tab === "llm" && <LLMSettings />}
    </div>
  );
}
