"use client";

import type { ProcessingPreset } from "@/lib/llm/types";

const PRESET_OPTIONS: { value: ProcessingPreset; label: string }[] = [
  { value: "fast", label: "Fast — low thinking, default res" },
  { value: "balanced", label: "Balanced — low thinking, high res" },
  { value: "quality", label: "Quality — medium thinking, high res" },
  { value: "max_quality", label: "Max Quality — Claude Sonnet 4.6" },
];

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
        Processing:
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
