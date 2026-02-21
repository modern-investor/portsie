"use client";

import { useState } from "react";
import type { AssetClassSummary } from "@/lib/portfolio/types";

interface Props {
  assetClasses: AssetClassSummary[];
  totalMarketValue: number;
  hideValues: boolean;
}

export function PortfolioDonutChart({ assetClasses, totalMarketValue, hideValues }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const data = assetClasses
    .filter((ac) => ac.allocationPct > 0)
    .map((ac) => ({
      label: ac.def.label,
      value: ac.marketValue,
      color: ac.def.chartColor,
      pct: ac.allocationPct,
      holdingCount: ac.holdingCount,
    }));

  const totalHoldings = data.reduce((s, d) => s + d.holdingCount, 0);

  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        No portfolio data
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 100% Stacked Horizontal Bar */}
      <div className="rounded-lg overflow-hidden h-[68px] flex" role="img" aria-label="Asset allocation bar chart">
        {data.map((entry, idx) => (
          <div
            key={entry.label}
            className="relative flex items-center justify-center transition-opacity duration-200 cursor-default"
            style={{
              width: `${entry.pct}%`,
              backgroundColor: entry.color,
              opacity: hoveredIndex === null || hoveredIndex === idx ? 1 : 0.5,
            }}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {entry.pct >= 8 && (
              <span className="text-xl font-semibold text-white truncate px-1">
                {(entry.pct ?? 0).toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Category Table */}
      <table className="w-full text-2xl">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-3.5 text-left font-medium">Category</th>
            <th className="py-3.5 text-right font-medium">Holdings</th>
            <th className="py-3.5 text-right font-medium">Alloc %</th>
            {!hideValues && <th className="py-3.5 text-right font-medium">Value</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((entry, idx) => (
            <tr
              key={entry.label}
              className="border-b last:border-b-0 transition-colors"
              style={{
                backgroundColor: hoveredIndex === idx ? `${entry.color}10` : undefined,
              }}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <td className="py-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-5 w-5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate">{entry.label}</span>
                </div>
              </td>
              <td className="py-3.5 text-right tabular-nums">{entry.holdingCount}</td>
              <td className="py-3.5 text-right tabular-nums font-medium">{(entry.pct ?? 0).toFixed(1)}%</td>
              {!hideValues && (
                <td className="py-3.5 text-right tabular-nums">
                  ${entry.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
              )}
            </tr>
          ))}
          {/* Total row */}
          <tr className="border-t-2 font-semibold">
            <td className="py-3.5">Total</td>
            <td className="py-3.5 text-right tabular-nums">{totalHoldings}</td>
            <td className="py-3.5 text-right tabular-nums">100%</td>
            {!hideValues && (
              <td className="py-3.5 text-right tabular-nums">
                ${totalMarketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
