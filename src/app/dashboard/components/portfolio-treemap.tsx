"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import type { AssetClassSummary } from "@/lib/portfolio/types";
import { SUB_ASSET_CLASSES } from "@/lib/portfolio/asset-class-config";

interface Props {
  assetClasses: AssetClassSummary[];
  totalMarketValue: number;
  hideValues: boolean;
}

interface TreemapNode {
  name: string;
  value: number;
  color: string;
  pct: number;
  children?: TreemapNode[];
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreemapTooltip({ active, payload, hideValues }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold">{d.name}</p>
      <p className="tabular-nums">{(d.pct ?? 0).toFixed(1)}%</p>
      {!hideValues && (
        <p className="text-gray-500 tabular-nums">
          ${d.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </p>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomContent(props: any) {
  const { x, y, width, height, name, color, pct } = props;
  if (!name || width < 2 || height < 2) return null;

  // Scale font size based on available space (both axes) with higher caps
  const nameFontSize = Math.min(22, width / 6, height / 3);
  const pctFontSize = Math.min(18, width / 7, height / 4);
  const lineGap = nameFontSize * 0.3;

  const showLabel = nameFontSize >= 9 && width > 40 && height > 24;
  const showPct = showLabel && pctFontSize >= 8 && height > (nameFontSize + pctFontSize + lineGap + 8);

  // Truncate name based on actual font size vs available width
  const charsPerWidth = width / (nameFontSize * 0.6);
  const displayName = name.length > charsPerWidth
    ? name.slice(0, Math.max(2, Math.floor(charsPerWidth) - 2)) + "\u2026"
    : name;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
        rx={3}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showPct ? (pctFontSize / 2 + lineGap / 2) : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={nameFontSize}
          fontWeight={600}
        >
          {displayName}
        </text>
      )}
      {showPct && (
        <text
          x={x + width / 2}
          y={y + height / 2 + nameFontSize / 2 + lineGap}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.8)"
          fontSize={pctFontSize}
        >
          {(pct ?? 0).toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export function PortfolioTreemap({ assetClasses, totalMarketValue, hideValues }: Props) {
  // Build hierarchical data: asset class → sub-asset classes
  const data: TreemapNode[] = assetClasses
    .filter((ac) => ac.marketValue > 0)
    .map((ac) => {
      // Group positions by subAssetClassId
      const subGroups = new Map<string, { value: number; color: string; label: string }>();

      for (const pos of ac.positions) {
        const subId = pos.subAssetClassId ?? "other";
        const subDef = pos.subAssetClassId ? SUB_ASSET_CLASSES[pos.subAssetClassId] : null;
        const existing = subGroups.get(subId) ?? {
          value: 0,
          color: subDef?.chartColor ?? ac.def.chartColor,
          label: subDef?.label ?? ac.def.label,
        };
        existing.value += pos.marketValue;
        subGroups.set(subId, existing);
      }

      // If the asset class has extra market value (e.g., cash from accounts),
      // that isn't captured in positions, add it as a separate node
      const positionTotal = ac.positions.reduce((s, p) => s + p.marketValue, 0);
      const extraMV = ac.marketValue - positionTotal;
      if (extraMV > 0) {
        const existing = subGroups.get("cash_balance") ?? {
          value: 0,
          color: "#94a3b8",
          label: "Cash Balance",
        };
        existing.value += extraMV;
        subGroups.set("cash_balance", existing);
      }

      const children: TreemapNode[] = Array.from(subGroups.entries())
        .filter(([, g]) => g.value > 0)
        .map(([, g]) => ({
          name: g.label,
          value: Math.abs(g.value),
          color: g.color,
          pct: totalMarketValue > 0 ? (Math.abs(g.value) / totalMarketValue) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      return {
        name: ac.def.label,
        value: Math.abs(ac.marketValue),
        color: ac.def.chartColor,
        pct: ac.allocationPct,
        children: children.length > 1 ? children : undefined,
      };
    });

  if (data.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-3 text-2xl font-semibold text-gray-500 uppercase tracking-wider">
        Asset Breakdown
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="value"
            nameKey="name"
            content={<CustomContent />}
          >
            <Tooltip content={<TreemapTooltip hideValues={hideValues} />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
