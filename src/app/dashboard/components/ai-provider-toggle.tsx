"use client";

interface Props {
  value: "gemini" | "sonnet";
  onChange: (value: "gemini" | "sonnet") => void;
}

export function AIProviderToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex rounded-full bg-gray-100 p-0.5"
      title="Both providers generate views — this filters which ones are shown"
    >
      <button
        onClick={() => onChange("gemini")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          value === "gemini"
            ? "bg-black text-white shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Gemini
      </button>
      <button
        onClick={() => onChange("sonnet")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          value === "sonnet"
            ? "bg-black text-white shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Sonnet
      </button>
    </div>
  );
}
