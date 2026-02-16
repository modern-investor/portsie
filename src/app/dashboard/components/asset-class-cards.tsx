"use client";

import type { AssetClassSummary, AssetClassId } from "@/lib/portfolio/types";

/** Tailwind bg class for each asset class color. */
const BG_MAP: Record<string, string> = {
  indigo: "bg-indigo-50 border-indigo-200",
  violet: "bg-violet-50 border-violet-200",
  cyan: "bg-cyan-50 border-cyan-200",
  amber: "bg-amber-50 border-amber-200",
  yellow: "bg-yellow-50 border-yellow-200",
  emerald: "bg-emerald-50 border-emerald-200",
  red: "bg-red-50 border-red-200",
  slate: "bg-slate-50 border-slate-200",
};

const DOT_MAP: Record<string, string> = {
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  emerald: "bg-emerald-500",
  red: "bg-red-500",
  slate: "bg-slate-500",
};

interface Props {
  assetClasses: AssetClassSummary[];
  hideValues: boolean;
  onSelectClass?: (id: AssetClassId) => void;
}

export function AssetClassCards({ assetClasses, hideValues, onSelectClass }: Props) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {assetClasses
        .filter((ac) => ac.marketValue !== 0 || ac.holdingCount > 0)
        .map((ac) => {
          const bgClass = BG_MAP[ac.def.color] ?? "bg-gray-50 border-gray-200";
          const dotClass = DOT_MAP[ac.def.color] ?? "bg-gray-500";
          const dayChangeColor =
            ac.dayChange >= 0 ? "text-green-600" : "text-red-600";

          return (
            <button
              key={ac.def.id}
              onClick={() => onSelectClass?.(ac.def.id)}
              className={`rounded-lg border p-4 text-left transition-shadow hover:shadow-md ${bgClass}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <span className="text-sm font-medium truncate">{ac.def.label}</span>
              </div>

              <div className="text-xl font-bold tabular-nums">
                {hideValues ? (
                  <span className="text-gray-300 select-none">$*****</span>
                ) : (
                  `$${ac.marketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                )}
              </div>

              <div className="mt-1 flex items-center gap-3 text-xs">
                <span className="font-medium tabular-nums">
                  {ac.allocationPct.toFixed(1)}%
                </span>
                {!hideValues && (
                  <span className={`tabular-nums ${dayChangeColor}`}>
                    {ac.dayChange >= 0 ? "+" : ""}$
                    {ac.dayChange.toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                )}
                <span className="text-gray-400">
                  {ac.holdingCount} holding{ac.holdingCount !== 1 ? "s" : ""}
                </span>
              </div>
            </button>
          );
        })}
    </div>
  );
}
