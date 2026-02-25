/**
 * Declarative chart specification types.
 * LLMs produce these JSON specs instead of executable React code.
 * A trusted renderer maps specs to Recharts components.
 */

/** Top-level chart spec produced by LLM. */
export interface DeclarativeChartSpec {
  chart_type: ChartType;
  title: string;
  subtitle?: string;
  insight?: string;
  data_transform: DataTransform;
  config: ChartConfig;
}

export type ChartType =
  | "bar"
  | "horizontal_bar"
  | "line"
  | "pie"
  | "scatter"
  | "radar"
  | "treemap"
  | "area"
  | "composed"
  | "heatmap";

/**
 * Describes how to extract and shape data from the portfolio.
 * The renderer resolves these against known safe data paths.
 */
export interface DataTransform {
  /** Which portfolio data to pull from. */
  source: DataSource;
  /** Optional filter to narrow rows. */
  filter?: DataFilter;
  /** How to map source fields to chart data keys. */
  map: Record<string, string>;
  /** Optional sort. */
  sort?: { field: string; direction: "asc" | "desc" };
  /** Max items to include. */
  limit?: number;
  /** Optional grouping (e.g., group positions by asset class). */
  group_by?: string;
  /** Aggregation when grouping: "sum" | "count" | "avg". */
  aggregate?: "sum" | "count" | "avg";
}

/** Known safe data sources the transform engine can resolve. */
export type DataSource =
  | "assetClasses"
  | "positions"
  | "accounts"
  | "correlationMatrix"
  | "riskClusters"
  | "notablePairs"
  | "custom";

export interface DataFilter {
  field: string;
  op: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
  value: number | string | boolean;
}

/** Chart rendering configuration. */
export interface ChartConfig {
  /** Key for X axis / category dimension. */
  xKey?: string;
  /** Key(s) for Y axis / value dimension. */
  yKeys?: string[];
  /** Colors for each series/segment. */
  colors?: string[];
  /** Whether to show a legend. */
  showLegend?: boolean;
  /** Whether to show grid lines. */
  showGrid?: boolean;
  /** Chart height in px. */
  height?: number;
  /** Tooltip format string or "currency" | "percent" | "number". */
  valueFormat?: "currency" | "percent" | "number";
  /** Reference lines. */
  referenceLines?: Array<{
    axis: "x" | "y";
    value: number | string;
    label?: string;
    color?: string;
  }>;
  /** For pie/donut: inner radius for donut. */
  innerRadius?: number;
  /** For radar: which fields map to axes. */
  radarAxes?: string[];
  /** Custom label mappings. */
  labels?: Record<string, string>;
  /** For composed: which keys are bars vs lines. */
  barKeys?: string[];
  lineKeys?: string[];
  /** For heatmap: x/y axis label arrays. */
  heatmapXLabels?: string[];
  heatmapYLabels?: string[];
}

/** Default color palette for charts. */
export const CHART_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#ec4899", // pink
  "#3b82f6", // blue
  "#64748b", // slate
  "#eab308", // yellow
];
