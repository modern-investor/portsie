"use client";

import { useEffect, useState } from "react";

type VerificationOption = "cli" | "gemini" | "off";

export function VerificationSelect({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<VerificationOption>("cli");
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
          setValue(data.verificationBackend ?? "cli");
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
      const backend = next === "off" ? "cli" : next;
      const model =
        backend === "cli" ? "claude-sonnet-4-6" : "gemini-3-flash-preview";
      await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationEnabled: enabled,
          verificationBackend: backend,
          verificationModel: model,
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
      <label
        htmlFor="verification-model"
        className="text-xs font-medium text-gray-500 whitespace-nowrap"
      >
        Verification:
      </label>
      <select
        id="verification-model"
        value={value}
        onChange={(e) => handleChange(e.target.value as VerificationOption)}
        disabled={disabled || saving}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="cli">Claude Sonnet 4.6</option>
        <option value="gemini">Gemini Flash 3</option>
        <option value="off">Off</option>
      </select>
    </div>
  );
}
