"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ClassifiedPortfolio } from "@/lib/portfolio/types";

interface Props {
  classifiedPortfolio: ClassifiedPortfolio;
  hideValues: boolean;
}

export function ConcentrationRisk({ classifiedPortfolio, hideValues }: Props) {
  const { data, equalWeight } = useMemo(() => {
    const allPositions = classifiedPortfolio.assetClasses.flatMap((ac) =>
      ac.positions.map((p) => ({
        name: p.symbol,
        allocation: p.allocationPct,
        value: p.marketValue,
      }))
    );

    // Sort by allocation descending, take top 15
    allPositions.sort((a, b) => b.allocation - a.allocation);
    const top = allPositions.slice(0, 15);
    const ew = allPositions.length > 0 ? 100 / allPositions.length : 0;

    return { data: top, equalWeight: ew };
  }, [classifiedPortfolio]);

  const formatPct = (v: unknown) => {
    if (hideValues) return "***";
    return `${Number(v).toFixed(1)}%`;
  };

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">No holdings to analyze</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Concentration Risk</h3>
        <p className="text-sm text-gray-500">
          Top {data.length} holdings by portfolio weight
        </p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              tick={{ fontSize: 12 }}
              tickFormatter={formatPct}
              domain={[0, "auto"]}
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={70} />
            <Tooltip
              formatter={(val) =>
                hideValues ? "***" : `${Number(val).toFixed(2)}%`
              }
            />
            <ReferenceLine
              x={equalWeight}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{ value: "Equal weight", position: "top", fontSize: 11 }}
            />
            <Bar
              dataKey="allocation"
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
              name="Allocation %"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
        <p className="text-xs text-blue-700">
          {classifiedPortfolio.hhi > 2500
            ? "Your portfolio shows high concentration. Consider diversifying across more positions."
            : classifiedPortfolio.hhi > 1500
              ? "Moderate concentration. A few positions dominate your portfolio."
              : "Good diversification across your holdings."}
          {" "}HHI: {classifiedPortfolio.hhi.toLocaleString()} (Diversification score: {classifiedPortfolio.diversificationScore}/10)
        </p>
      </div>
    </div>
  );
}
