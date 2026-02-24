"use client";

import { Component, useMemo, type ReactNode } from "react";
import {
  createDynamicComponent,
  type DynamicViewProps,
} from "@/lib/portfolio/component-renderer";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import type { ClassifiedPortfolio } from "@/lib/portfolio/types";
import type { CorrelationData } from "@/lib/portfolio/ai-views-types";

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
  code: string;
  portfolioData: PortfolioData;
  classifiedPortfolio: ClassifiedPortfolio;
  hideValues: boolean;
  correlationData?: CorrelationData | null;
}

export function DynamicViewWrapper({
  code,
  portfolioData,
  classifiedPortfolio,
  hideValues,
  correlationData,
}: Props) {
  const DynamicComp = useMemo(() => createDynamicComponent(code), [code]);

  if (!DynamicComp) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-700">
          Failed to load view component
        </p>
        <p className="mt-1 text-xs text-amber-600">
          The AI-generated code could not be compiled. Try regenerating.
        </p>
      </div>
    );
  }

  return (
    <ViewErrorBoundary>
      <div className="rounded-lg border bg-white p-4 sm:p-6">
        <DynamicComp
          portfolioData={portfolioData as unknown}
          classifiedPortfolio={classifiedPortfolio as unknown}
          hideValues={hideValues}
          correlationData={correlationData as unknown}
        />
      </div>
    </ViewErrorBoundary>
  );
}
