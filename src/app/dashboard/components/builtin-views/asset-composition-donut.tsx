"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { ClassifiedPortfolio } from "@/lib/portfolio/types";

interface Props {
  classifiedPortfolio: ClassifiedPortfolio;
  hideValues: boolean;
}

export function AssetCompositionDonut({ classifiedPortfolio, hideValues }: Props) {
  const [activeClass, setActiveClass] = useState<string | null>(null);

  const { outerData, innerData } = useMemo(() => {
    const outer = classifiedPortfolio.assetClasses
      .filter((ac) => ac.marketValue > 0)
      .map((ac) => ({
        name: ac.def.label,
        value: ac.marketValue,
        pct: ac.allocationPct,
        color: ac.def.chartColor,
        id: ac.def.id,
      }))
      .sort((a, b) => b.value - a.value);

    const inner: { name: string; value: number; pct: number; color: string; parentId: string }[] = [];
    for (const ac of classifiedPortfolio.assetClasses) {
      if (ac.marketValue <= 0) continue;

      // Group positions by sub-asset class
      const subGroups = new Map<string, { value: number; count: number }>();
      for (const pos of ac.positions) {
        const subKey = pos.subAssetClassId ?? pos.instrumentType ?? "other";
        const existing = subGroups.get(subKey) ?? { value: 0, count: 0 };
        existing.value += pos.marketValue;
        existing.count += 1;
        subGroups.set(subKey, existing);
      }

      for (const [subKey, { value }] of subGroups) {
        if (value <= 0) continue;
        const pct = classifiedPortfolio.totalMarketValue > 0
          ? (value / classifiedPortfolio.totalMarketValue) * 100
          : 0;

        // Lighten the parent color for sub-groups
        inner.push({
          name: formatSubLabel(subKey),
          value,
          pct,
          color: adjustBrightness(ac.def.chartColor, 0.15 * inner.filter((i) => i.parentId === ac.def.id).length),
          parentId: ac.def.id,
        });
      }
    }

    return { outerData: outer, innerData: inner };
  }, [classifiedPortfolio]);

  const formatValue = (v: number) => {
    if (hideValues) return "***";
    return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  if (outerData.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">No assets to display</p>
      </div>
    );
  }

  const filteredInner = activeClass
    ? innerData.filter((i) => i.parentId === activeClass)
    : innerData;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Asset Composition</h3>
        <p className="text-sm text-gray-500">
          {activeClass
            ? `Breakdown of ${outerData.find((o) => o.id === activeClass)?.name ?? "selected class"}`
            : "Asset classes (outer) and sub-categories (inner)"}
        </p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            {/* Outer ring — asset classes */}
            <Pie
              data={outerData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              innerRadius="55%"
              label={({ name, percent }: { name?: string; percent?: number }) => {
                const pctVal = (percent ?? 0) * 100;
                if (pctVal < 2) return "";
                const shortName = (name ?? "").replace("and Equivalents", "").trim();
                return `${shortName} ${pctVal.toFixed(0)}%`;
              }}
              labelLine={({ percent }: { percent?: number }) => (percent ?? 0) * 100 >= 2}
              onClick={(entry) => {
                setActiveClass(
                  activeClass === entry.id ? null : (entry.id as string)
                );
              }}
              style={{ cursor: "pointer" }}
            >
              {outerData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  opacity={activeClass && activeClass !== entry.id ? 0.3 : 1}
                  stroke={activeClass === entry.id ? "#000" : "#fff"}
                  strokeWidth={activeClass === entry.id ? 2 : 1}
                />
              ))}
            </Pie>

            {/* Inner ring — sub-categories */}
            <Pie
              data={filteredInner}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="50%"
              innerRadius="30%"
            >
              {filteredInner.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>

            <Tooltip
              formatter={(val) => {
                const num = Number(val) || 0;
                return hideValues
                  ? "***"
                  : formatValue(num);
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {activeClass && (
        <button
          onClick={() => setActiveClass(null)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Clear filter — show all asset classes
        </button>
      )}

      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
        <p className="text-xs text-blue-700">
          Click an outer ring segment to filter the inner ring by that asset class.
          {outerData.length <= 2
            ? " Your portfolio is concentrated in few asset classes — consider broadening your allocation."
            : ` ${outerData.length} asset classes represented in your portfolio.`}
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatSubLabel(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(amount * 255));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(amount * 255));
  const b = Math.min(255, (num & 0xff) + Math.round(amount * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
