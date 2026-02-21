"use client";

import type { ClassifiedPortfolio } from "@/lib/portfolio/types";
import { ShieldCheck, TrendingUp, Banknote, PieChart } from "lucide-react";

interface Props {
  portfolio: ClassifiedPortfolio;
  hideValues: boolean;
}

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 8) return { text: "Well Diversified", color: "text-green-600" };
  if (score >= 5) return { text: "Moderately Diversified", color: "text-yellow-600" };
  if (score >= 3) return { text: "Concentrated", color: "text-orange-600" };
  return { text: "Highly Concentrated", color: "text-red-600" };
}

function riskLabel(portfolio: ClassifiedPortfolio): { text: string; color: string } {
  // Aggressiveness: based on tech+crypto allocation
  const techCrypto = portfolio.assetClasses
    .filter((ac) => ["tech_equities", "tech_options", "crypto"].includes(ac.def.id))
    .reduce((s, ac) => s + ac.allocationPct, 0);
  if (techCrypto >= 80) return { text: "Extreme", color: "text-red-600" };
  if (techCrypto >= 60) return { text: "Aggressive", color: "text-orange-600" };
  if (techCrypto >= 40) return { text: "Moderate", color: "text-yellow-600" };
  return { text: "Conservative", color: "text-green-600" };
}

export function PortfolioInsightsCard({ portfolio, hideValues }: Props) {
  const { diversificationScore, hhi, safeWithdrawalAnnual, cashPct } = portfolio;
  const divLabel = scoreLabel(diversificationScore);
  const risk = riskLabel(portfolio);

  // Top holding concentration
  const allPositions = portfolio.assetClasses.flatMap((ac) => ac.positions);
  const sorted = [...allPositions].sort((a, b) => b.marketValue - a.marketValue);
  const top1 = sorted[0];
  const top3Pct = sorted.slice(0, 3).reduce((s, p) => s + p.allocationPct, 0);

  return (
    <div className="rounded-lg border bg-white p-4 sm:p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Portfolio Insights
      </h3>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        {/* Diversification */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <PieChart className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Diversification Score</p>
            <p className="text-lg font-bold tabular-nums">
              {diversificationScore}/10
            </p>
            <p className={`text-xs font-medium ${divLabel.color}`}>
              {divLabel.text}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">HHI: {Math.round(hhi)}</p>
          </div>
        </div>

        {/* Risk Profile */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-orange-50 p-2">
            <TrendingUp className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Risk Profile</p>
            <p className={`text-lg font-bold ${risk.color}`}>{risk.text}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Cash buffer: {(cashPct ?? 0).toFixed(1)}%
              {cashPct < 5 && " (low)"}
            </p>
          </div>
        </div>

        {/* Safe Withdrawal */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-green-50 p-2">
            <Banknote className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Safe Withdrawal (4% Rule)</p>
            <p className="text-lg font-bold tabular-nums">
              {hideValues ? (
                <span className="text-gray-300 select-none">$*****</span>
              ) : (
                `$${safeWithdrawalAnnual.toLocaleString("en-US", { maximumFractionDigits: 0 })}/yr`
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hideValues ? "***" : `$${Math.round(safeWithdrawalAnnual / 12).toLocaleString()}`}/mo
            </p>
          </div>
        </div>

        {/* Concentration */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-50 p-2">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Concentration Risk</p>
            {top1 && (
              <>
                <p className="text-sm font-medium">
                  Largest: {top1.symbol} ({(top1.allocationPct ?? 0).toFixed(1)}%)
                </p>
                <p className="text-xs text-gray-400">
                  Top 3: {(top3Pct ?? 0).toFixed(1)}% of portfolio
                </p>
              </>
            )}
            {top3Pct > 50 && (
              <p className="text-xs text-orange-500 mt-0.5">
                High concentration in top holdings
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
