"use client";

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AssetClassSummary } from "@/lib/portfolio/types";

interface Props {
  assetClasses: AssetClassSummary[];
  totalMarketValue: number;
  hideValues: boolean;
}

export function AssetAllocationTable({ assetClasses, totalMarketValue, hideValues }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  function toggleExpand(idx: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const data = assetClasses
    .filter((ac) => ac.allocationPct > 0)
    .map((ac) => ({
      label: ac.def.label,
      value: ac.marketValue,
      color: ac.def.chartColor,
      pct: ac.allocationPct,
      holdingCount: ac.holdingCount,
      positions: ac.positions,
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
          {data.map((entry, idx) => {
            const isExpanded = expandedRows.has(idx);
            return (
              <React.Fragment key={entry.label}>
                <tr
                  className="border-b last:border-b-0 transition-colors cursor-pointer select-none"
                  style={{
                    backgroundColor: hoveredIndex === idx ? `${entry.color}10` : undefined,
                  }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => toggleExpand(idx)}
                  role="button"
                  aria-expanded={isExpanded}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(idx);
                    }
                  }}
                >
                  <td className="py-3.5">
                    <div className="flex items-center gap-3">
                      <ChevronRight
                        className={`h-4 w-4 text-gray-400 transition-transform duration-200 shrink-0 ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
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

                {/* Expanded position sub-rows */}
                {isExpanded &&
                  entry.positions.map((pos) => (
                    <tr
                      key={`${entry.label}-${pos.symbol}`}
                      className="border-b last:border-b-0"
                      style={{ backgroundColor: `${entry.color}08` }}
                    >
                      <td className="py-2 pl-16">
                        <div className="flex items-center gap-2 text-base">
                          <span className="font-medium">{pos.symbol}</span>
                          {pos.description && (
                            <span className="text-gray-400 truncate max-w-[200px]">
                              {pos.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums text-base text-gray-500">
                        {hideValues ? "" : pos.quantity.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-base text-gray-500">
                        {(pos.allocationPct ?? 0).toFixed(1)}%
                      </td>
                      {!hideValues && (
                        <td className="py-2 text-right tabular-nums text-base text-gray-500">
                          ${pos.marketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                      )}
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
          {/* Total row */}
          <tr className="border-t-2 font-semibold">
            <td className="py-3.5 pl-7">Total</td>
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
