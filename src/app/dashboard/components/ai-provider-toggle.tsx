"use client";

interface Props {
  value: "gemini" | "sonnet";
  onChange: (value: "gemini" | "sonnet") => void;
}

export function AIProviderToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
      <button
        onClick={() => onChange("gemini")}
        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
          value === "gemini"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Gemini
      </button>
      <button
        onClick={() => onChange("sonnet")}
        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
          value === "sonnet"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Sonnet
      </button>
    </div>
  );
}
