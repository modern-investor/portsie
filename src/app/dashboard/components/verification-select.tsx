"use client";

import { useEffect, useState } from "react";

type VerificationOption = "cli" | "gemini" | "gemini25" | "off";

/** Map dropdown value → backend + model for the API */
const VERIFICATION_OPTIONS: Record<
  Exclude<VerificationOption, "off">,
  { backend: "cli" | "gemini"; model: string; label: string }
> = {
  cli: { backend: "cli", model: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  gemini: { backend: "gemini", model: "gemini-3-flash-preview", label: "Gemini Flash 3" },
  gemini25: { backend: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
};

/** Reverse-map stored backend+model → dropdown value */
function settingsToOption(backend: string, model: string): VerificationOption {
  if (backend === "gemini" && model === "gemini-2.5-flash") return "gemini25";
  if (backend === "gemini") return "gemini";
  return "cli";
}

export function VerificationSelect({ disabled, hideLabel }: { disabled?: boolean; hideLabel?: boolean }) {
  const [value, setValue] = useState<VerificationOption>("gemini25");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/llm")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (!data.verificationEnabled) {
          setValue("off");
        } else {
          setValue(settingsToOption(data.verificationBackend ?? "gemini", data.verificationModel ?? "gemini-2.5-flash"));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleChange(next: VerificationOption) {
    setValue(next);
    setSaving(true);
    try {
      const enabled = next !== "off";
      const opt = VERIFICATION_OPTIONS[next === "off" ? "gemini25" : next];
      await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationEnabled: enabled,
          verificationBackend: opt.backend,
          verificationModel: opt.model,
        }),
      });
    } catch {
      // Silently fail — setting will revert on next page load
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="flex items-center gap-2">
      {!hideLabel && (
        <label
          htmlFor="verification-model"
          className="text-xs font-medium text-gray-500 whitespace-nowrap"
        >
          Verification:
        </label>
      )}
      <select
        id="verification-model"
        value={value}
        onChange={(e) => handleChange(e.target.value as VerificationOption)}
        disabled={disabled || saving}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="gemini25">Gemini 2.5 Flash</option>
        <option value="cli">Claude Sonnet 4.6</option>
        <option value="gemini">Gemini Flash 3</option>
        <option value="off">Off</option>
      </select>
    </div>
  );
}
