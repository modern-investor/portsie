"use client";

import { Component, type ReactNode } from "react";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import type { ClassifiedPortfolio } from "@/lib/portfolio/types";
import type { CorrelationData } from "@/lib/portfolio/ai-views-types";
import type { DeclarativeChartSpec } from "@/lib/portfolio/chart-spec-types";
import { ChartRenderer } from "@/lib/portfolio/chart-renderer";

// ─── Error Boundary ─────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  fallback?: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ViewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-600">
              This view failed to render
            </p>
            <p className="mt-1 text-xs text-red-500">
              {this.state.error?.message ?? "Unknown error"}
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ─── Dynamic View Wrapper ───────────────────────────────────────────────────

interface Props {
  /** Declarative chart spec (new approach). */
  chartSpec?: DeclarativeChartSpec | null;
  /** @deprecated Legacy code string — only used for backward compat. */
  code?: string;
  portfolioData: PortfolioData;
  classifiedPortfolio: ClassifiedPortfolio;
  hideValues: boolean;
  correlationData?: CorrelationData | null;
}

export function DynamicViewWrapper({
  chartSpec,
  code,
  portfolioData,
  classifiedPortfolio,
  hideValues,
  correlationData,
}: Props) {
  // Prefer declarative chart spec over legacy code
  if (chartSpec) {
    return (
      <ViewErrorBoundary>
        <div className="rounded-lg border bg-white p-4 sm:p-6">
          <ChartRenderer
            spec={chartSpec}
            portfolioData={portfolioData}
            classifiedPortfolio={classifiedPortfolio}
            hideValues={hideValues}
            correlationData={correlationData}
          />
        </div>
      </ViewErrorBoundary>
    );
  }

  // Legacy fallback for old views that still have component_code
  if (code) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-700">
          Legacy view format
        </p>
        <p className="mt-1 text-xs text-amber-600">
          This view uses an older format. Regenerate your AI views to get the improved version.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-700">
        No chart data available
      </p>
      <p className="mt-1 text-xs text-amber-600">
        Try regenerating this view.
      </p>
    </div>
  );
}
