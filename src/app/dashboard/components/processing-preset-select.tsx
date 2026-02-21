"use client";

import type { ProcessingPreset } from "@/lib/llm/types";

export const PRESET_LABELS: Record<ProcessingPreset, string> = {
  fast: "Gemini Flash 3 · standard",
  balanced: "Gemini Flash 3 · high res scan",
  quality: "Gemini Flash 3 · high res, deep thinking",
  max_quality: "Claude Sonnet 4.6 · high res, deep thinking",
};

const PRESET_OPTIONS: { value: ProcessingPreset; label: string }[] = (
  Object.entries(PRESET_LABELS) as [ProcessingPreset, string][]
).map(([value, label]) => ({ value, label }));

export function ProcessingPresetSelect({
  value,
  onChange,
  disabled,
}: {
  value: ProcessingPreset;
  onChange: (preset: ProcessingPreset) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="processing-preset"
        className="text-xs font-medium text-gray-500 whitespace-nowrap"
      >
        Processing model:
      </label>
      <select
        id="processing-preset"
        value={value}
        onChange={(e) => onChange(e.target.value as ProcessingPreset)}
        disabled={disabled}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {PRESET_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
