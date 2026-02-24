/** Types for AI-suggested portfolio views. */

export interface ViewSuggestion {
  id: string;
  provider: "gemini" | "sonnet";
  title: string;
  description: string;
  chartType: string;
  insight: string;
  dataSpec: string;
  componentCode: string | null;
  codeStatus: "pending" | "generating" | "complete" | "failed";
  codeError: string | null;
  order: number;
  isBuiltin: boolean;
  builtinType: string | null;
  correlationData: CorrelationData | null;
  portfolioHash: string | null;
  createdAt: string;
}

/** Raw suggestion from an LLM (before code generation). */
export interface RawSuggestion {
  title: string;
  description: string;
  chart_type: string;
  insight: string;
  data_spec: string;
}

/** Correlation analysis result from Gemini. */
export interface CorrelationData {
  symbols: string[];
  correlationMatrix: number[][];
  diversityScore: number; // 1-100
  notablePairs: {
    mostCorrelated: CorrelationPair[];
    leastCorrelated: CorrelationPair[];
  };
  riskClusters: RiskCluster[];
  analysisSummary: string;
}

export interface CorrelationPair {
  pair: [string, string];
  correlation: number;
  reason: string;
}

export interface RiskCluster {
  name: string;
  symbols: string[];
  internalCorrelation: number;
}

/** Props passed to dynamically rendered AI view components. */
export interface DynamicViewProps {
  portfolioData: unknown; // PortfolioData — kept as unknown for the dynamic scope
  classifiedPortfolio: unknown; // ClassifiedPortfolio
  hideValues: boolean;
}

/** DB row shape from ai_view_suggestions table. */
export interface AIViewSuggestionRow {
  id: string;
  user_id: string;
  suggestion_provider: "gemini" | "sonnet";
  title: string;
  description: string;
  chart_type: string;
  insight: string;
  data_spec: string | null;
  component_code: string | null;
  code_generation_status: "pending" | "generating" | "complete" | "failed";
  code_generation_error: string | null;
  suggestion_order: number;
  is_builtin: boolean;
  builtin_type: string | null;
  correlation_data: CorrelationData | null;
  portfolio_hash: string | null;
  generation_errors: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

/** Convert a DB row to a ViewSuggestion. */
export function rowToSuggestion(row: AIViewSuggestionRow): ViewSuggestion {
  return {
    id: row.id,
    provider: row.suggestion_provider,
    title: row.title,
    description: row.description,
    chartType: row.chart_type,
    insight: row.insight,
    dataSpec: row.data_spec ?? "",
    componentCode: row.component_code,
    codeStatus: row.code_generation_status,
    codeError: row.code_generation_error,
    order: row.suggestion_order,
    isBuiltin: row.is_builtin,
    builtinType: row.builtin_type,
    correlationData: row.correlation_data,
    portfolioHash: row.portfolio_hash,
    createdAt: row.created_at,
  };
}
