"use client";

import { useMemo } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ClassifiedPortfolio } from "@/lib/portfolio/types";

interface Props {
  classifiedPortfolio: ClassifiedPortfolio;
  hideValues: boolean;
}

export function DiversificationRadar({ classifiedPortfolio, hideValues }: Props) {
  const data = useMemo(() => {
    const assetClassCount = classifiedPortfolio.assetClasses.filter(
      (ac) => ac.marketValue > 0
    ).length;
    const positionCount = classifiedPortfolio.holdingCount;

    // Inverse HHI → allocation spread (0-100 scale)
    // HHI ranges from ~100 (perfectly diversified among 100+ stocks) to 10000 (single stock)
    const allocationSpread = Math.max(0, Math.min(100, ((10000 - classifiedPortfolio.hhi) / 10000) * 100));

    // Largest position weight (inverse → lower is better for diversification)
    const maxAlloc = classifiedPortfolio.assetClasses.reduce((max, ac) => {
      for (const p of ac.positions) {
        if (p.allocationPct > max) max = p.allocationPct;
      }
      return max;
    }, 0);
    const topHoldingBalance = Math.max(0, 100 - maxAlloc);

    // Cash cushion (having some cash is good, but too much dilutes returns)
    const cashScore = classifiedPortfolio.cashPct >= 2 && classifiedPortfolio.cashPct <= 15
      ? 80 + (15 - Math.abs(classifiedPortfolio.cashPct - 8))
      : classifiedPortfolio.cashPct > 15
        ? Math.max(20, 80 - (classifiedPortfolio.cashPct - 15) * 3)
        : Math.max(20, classifiedPortfolio.cashPct * 30);

    return [
      { axis: "Asset Classes", value: Math.min(100, assetClassCount * 15), fullMark: 100 },
      { axis: "Positions", value: Math.min(100, positionCount * 4), fullMark: 100 },
      { axis: "Spread", value: Math.round(allocationSpread), fullMark: 100 },
      { axis: "Balance", value: Math.round(topHoldingBalance), fullMark: 100 },
      { axis: "Cash Cushion", value: Math.round(cashScore), fullMark: 100 },
    ];
  }, [classifiedPortfolio]);

  const overallScore = Math.round(data.reduce((sum, d) => sum + d.value, 0) / data.length);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Diversification Breakdown</h3>
        <p className="text-sm text-gray-500">
          Multi-factor diversification analysis
        </p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <ResponsiveContainer width="100%" height={350}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12 }} />
            <PolarRadiusAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Radar
              dataKey="value"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.25}
              name="Score"
            />
            <Tooltip
              formatter={(val) =>
                hideValues ? "***" : `${Number(val)}/100`
              }
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            overallScore >= 70
              ? "bg-green-100 text-green-700"
              : overallScore >= 40
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          Overall Score: {hideValues ? "***" : `${overallScore}/100`}
        </span>
      </div>

      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
        <p className="text-xs text-blue-700">
          {overallScore >= 70
            ? "Strong diversification profile. Your portfolio is well-balanced across multiple dimensions."
            : overallScore >= 40
              ? "Moderate diversification. Consider spreading investments across more asset classes or positions."
              : "Low diversification. Your portfolio is heavily concentrated in a few areas."}
        </p>
      </div>
    </div>
  );
}
