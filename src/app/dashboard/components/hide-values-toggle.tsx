"use client";

export function HideValuesToggle({
  hideValues,
  onToggle,
}: {
  hideValues: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="text-xs text-gray-400 whitespace-nowrap">
        Hide $ Values
      </span>
      <button
        role="switch"
        aria-checked={hideValues}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          hideValues ? "bg-gray-800" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            hideValues ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </label>
  );
}
