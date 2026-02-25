"use client";

import { useState, useEffect } from "react";

export type InvestorObjective = "income" | "growth" | "risk" | "tax" | "retirement";

const OBJECTIVES: { id: InvestorObjective; label: string; description: string }[] = [
  { id: "income", label: "Income", description: "Dividend yield, cash flow stability" },
  { id: "growth", label: "Growth", description: "Capital appreciation, growth potential" },
  { id: "risk", label: "Risk", description: "Risk management, volatility analysis" },
  { id: "tax", label: "Tax", description: "Tax efficiency, loss harvesting" },
  { id: "retirement", label: "Retirement", description: "Withdrawal readiness, longevity" },
];

const STORAGE_KEY = "portsie:investor-objective";

interface Props {
  value: InvestorObjective | null;
  onChange: (objective: InvestorObjective | null) => void;
}

export function InvestorObjectiveSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Focus area (optional)</p>
      <div className="flex flex-wrap gap-1.5">
        {OBJECTIVES.map((obj) => (
          <button
            key={obj.id}
            onClick={() => onChange(value === obj.id ? null : obj.id)}
            title={obj.description}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              value === obj.id
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {obj.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hook to persist and restore the selected objective. */
export function useInvestorObjective(): [InvestorObjective | null, (v: InvestorObjective | null) => void] {
  const [objective, setObjective] = useState<InvestorObjective | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && OBJECTIVES.some((o) => o.id === saved)) {
      setObjective(saved as InvestorObjective);
    }
  }, []);

  const set = (v: InvestorObjective | null) => {
    setObjective(v);
    if (v) {
      localStorage.setItem(STORAGE_KEY, v);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return [objective, set];
}

/** Get the prompt context string for a given objective. */
export function objectivePromptContext(objective: InvestorObjective | null): string {
  if (!objective) return "";

  switch (objective) {
    case "income":
      return "\n\nINVESTOR FOCUS: INCOME — Prioritize dividend yield, cash flow stability, income-generating assets, payout ratios, and yield comparison views. Highlight fixed-income positions, REITs, and high-dividend stocks.";
    case "growth":
      return "\n\nINVESTOR FOCUS: GROWTH — Prioritize capital appreciation potential, growth vs value analysis, momentum indicators, and sector growth exposure. Highlight high-growth positions and technology/innovation exposure.";
    case "risk":
      return "\n\nINVESTOR FOCUS: RISK MANAGEMENT — Prioritize volatility analysis, drawdown risk, correlation clustering, concentration risk, and hedging gaps. Highlight unhedged exposures and correlated positions.";
    case "tax":
      return "\n\nINVESTOR FOCUS: TAX EFFICIENCY — Prioritize tax-loss harvesting opportunities, asset location analysis (tax-advantaged vs taxable), short-term vs long-term holdings, and municipal bond exposure.";
    case "retirement":
      return "\n\nINVESTOR FOCUS: RETIREMENT READINESS — Prioritize withdrawal sustainability, safe withdrawal rate analysis, income ladder construction, and risk reduction as horizon shortens. Highlight the 4% rule metrics.";
  }
}
