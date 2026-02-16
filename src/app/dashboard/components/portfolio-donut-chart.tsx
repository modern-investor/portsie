"use client";

import { useState, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { AssetClassSummary } from "@/lib/portfolio/types";

interface Props {
  assetClasses: AssetClassSummary[];
  totalMarketValue: number;
  hideValues: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, hideValues }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold">{d.label}</p>
      <p className="tabular-nums">{d.pct.toFixed(1)}%</p>
      {!hideValues && (
        <p className="text-gray-500 tabular-nums">
          ${d.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </p>
      )}
    </div>
  );
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
    }));

  const onPieEnter = useCallback((_: unknown, index: number) => {
    setHoveredIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No portfolio data
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
      {/* Chart */}
      <div className="h-64 w-64 shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
            >
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.color}
                  stroke="none"
                  opacity={hoveredIndex === null || hoveredIndex === idx ? 1 : 0.5}
                  style={{
                    transform: hoveredIndex === idx ? "scale(1.05)" : "scale(1)",
                    transformOrigin: "center",
                    transition: "opacity 0.2s, transform 0.2s",
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip hideValues={hideValues} />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        {hoveredIndex !== null && data[hoveredIndex] && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm font-semibold">{data[hoveredIndex].label}</span>
            <span className="text-xs text-gray-500">{data[hoveredIndex].pct.toFixed(1)}%</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {data.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">{entry.label}</span>
            <span className="ml-auto font-medium tabular-nums">
              {entry.pct.toFixed(1)}%
            </span>
            {!hideValues && (
              <span className="text-gray-400 tabular-nums">
                ${(entry.value / 1000).toFixed(0)}k
              </span>
            )}
          </div>
        ))}
        {/* Total */}
        <div className="col-span-2 mt-2 border-t pt-2 flex items-center gap-2 font-semibold">
          <span>Total</span>
          <span className="ml-auto tabular-nums">100%</span>
          {!hideValues && (
            <span className="text-gray-500 tabular-nums">
              ${totalMarketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
