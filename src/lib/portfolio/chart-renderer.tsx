"use client";

/**
 * Trusted chart renderer.
 * Maps DeclarativeChartSpec → Recharts JSX via switch on chart_type.
 * No dynamic code execution — all rendering is deterministic.
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  AreaChart,
  Area,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Treemap,
} from "recharts";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import type { ClassifiedPortfolio } from "./types";
import type { CorrelationData } from "./ai-views-types";
import type { DeclarativeChartSpec } from "./chart-spec-types";
import { CHART_COLORS } from "./chart-spec-types";
import { executeTransform, type TransformContext } from "./data-transform";

export interface ChartRendererProps {
  spec: DeclarativeChartSpec;
  portfolioData: PortfolioData;
  classifiedPortfolio: ClassifiedPortfolio;
  hideValues: boolean;
  correlationData?: CorrelationData | null;
}

export function ChartRenderer({
  spec,
  portfolioData,
  classifiedPortfolio,
  hideValues,
  correlationData,
}: ChartRendererProps) {
  const ctx: TransformContext = useMemo(
    () => ({ portfolioData, classifiedPortfolio, correlationData }),
    [portfolioData, classifiedPortfolio, correlationData]
  );

  const data = useMemo(
    () => executeTransform(spec.data_transform, ctx),
    [spec.data_transform, ctx]
  );

  const colors = spec.config.colors ?? CHART_COLORS;
  const height = spec.config.height ?? 400;
  const formatValue = makeFormatter(spec.config.valueFormat, hideValues);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">No data available for this view</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{spec.title}</h3>
        {spec.subtitle && (
          <p className="text-sm text-gray-500">{spec.subtitle}</p>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <ResponsiveContainer width="100%" height={height}>
          {renderChartByType(spec, data, colors, formatValue)}
        </ResponsiveContainer>
      </div>

      {spec.insight && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">{spec.insight}</p>
        </div>
      )}
    </div>
  );
}

// ─── Chart Type Renderers ───────────────────────────────────────────────────

function renderChartByType(
  spec: DeclarativeChartSpec,
  data: Record<string, unknown>[],
  colors: string[],
  formatValue: (v: unknown) => string
): React.ReactElement {
  const { config } = spec;
  const xKey = config.xKey ?? "name";
  const yKeys = config.yKeys ?? ["value"];
  const showGrid = config.showGrid !== false;
  const showLegend = config.showLegend ?? false;

  switch (spec.chart_type) {
    case "bar":
      return (
        <BarChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} />
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
          {renderReferenceLines(config.referenceLines)}
          {yKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colors[i % colors.length]}
              name={config.labels?.[key] ?? key}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      );

    case "horizontal_bar":
      return (
        <BarChart data={data} layout="vertical">
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={formatValue} />
          <YAxis type="category" dataKey={xKey} tick={{ fontSize: 12 }} width={100} />
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
          {renderReferenceLines(config.referenceLines)}
          {yKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colors[i % colors.length]}
              name={config.labels?.[key] ?? key}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </BarChart>
      );

    case "line":
      return (
        <LineChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} />
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
          {renderReferenceLines(config.referenceLines)}
          {yKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={config.labels?.[key] ?? key}
            />
          ))}
        </LineChart>
      );

    case "area":
      return (
        <AreaChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} />
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
          {yKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              fill={colors[i % colors.length]}
              stroke={colors[i % colors.length]}
              fillOpacity={0.3}
              name={config.labels?.[key] ?? key}
            />
          ))}
        </AreaChart>
      );

    case "pie":
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey={yKeys[0]}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            innerRadius={config.innerRadius ?? 0}
            outerRadius="80%"
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={(data[i]?.color as string) ?? colors[i % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
        </PieChart>
      );

    case "scatter":
      return (
        <ScatterChart>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis
            dataKey={xKey}
            type="number"
            name={config.labels?.[xKey] ?? xKey}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            dataKey={yKeys[0]}
            type="number"
            name={config.labels?.[yKeys[0]] ?? yKeys[0]}
            tick={{ fontSize: 12 }}
            tickFormatter={formatValue}
          />
          <Tooltip formatter={formatValue} />
          <Scatter data={data} fill={colors[0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      );

    case "radar": {
      const axes = config.radarAxes ?? Object.keys(data[0] ?? {}).filter((k) => k !== "name");
      return (
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          {axes.map((key, i) => (
            <Radar
              key={key}
              dataKey={key}
              stroke={colors[i % colors.length]}
              fill={colors[i % colors.length]}
              fillOpacity={0.2}
              name={config.labels?.[key] ?? key}
            />
          ))}
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
        </RadarChart>
      );
    }

    case "treemap":
      return (
        <Treemap
          data={data}
          dataKey={yKeys[0]}
          nameKey={xKey}
          stroke="#fff"
          content={({ x, y, width, height: h, name, value }: {
            x: number; y: number; width: number; height: number;
            name?: string; value?: number;
          }) => (
            <g>
              <rect
                x={x}
                y={y}
                width={width}
                height={h}
                fill={colors[Math.abs(hashCode(String(name ?? ""))) % colors.length]}
                stroke="#fff"
                strokeWidth={2}
                rx={4}
              />
              {width > 50 && h > 30 && (
                <>
                  <text
                    x={x + width / 2}
                    y={y + h / 2 - 6}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {name}
                  </text>
                  <text
                    x={x + width / 2}
                    y={y + h / 2 + 10}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.8)"
                    fontSize={10}
                  >
                    {formatValue(value)}
                  </text>
                </>
              )}
            </g>
          )}
        />
      );

    case "composed":
      return (
        <ComposedChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} />
          <Tooltip formatter={formatValue} />
          {showLegend && <Legend />}
          {renderReferenceLines(config.referenceLines)}
          {(config.barKeys ?? []).map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colors[i % colors.length]}
              name={config.labels?.[key] ?? key}
              radius={[4, 4, 0, 0]}
            />
          ))}
          {(config.lineKeys ?? []).map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[(i + (config.barKeys?.length ?? 0)) % colors.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={config.labels?.[key] ?? key}
            />
          ))}
        </ComposedChart>
      );

    case "heatmap":
      return renderHeatmap(data, config, formatValue);

    default:
      return (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} />
          <Tooltip formatter={formatValue} />
          {yKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      );
  }
}

// ─── Heatmap (custom SVG via Recharts container) ────────────────────────────

function renderHeatmap(
  data: Record<string, unknown>[],
  config: DeclarativeChartSpec["config"],
  _formatValue: (v: unknown) => string
): React.ReactElement {
  const xLabels = config.heatmapXLabels ?? [...new Set(data.map((d) => String(d.x)))];
  const yLabels = config.heatmapYLabels ?? [...new Set(data.map((d) => String(d.y)))];
  const cellSize = Math.min(40, Math.floor(600 / Math.max(xLabels.length, 1)));
  const width = xLabels.length * cellSize + 80;
  const height = yLabels.length * cellSize + 40;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 500 }}>
      {data.map((d, i) => {
        const xi = typeof d.xIndex === "number" ? d.xIndex : xLabels.indexOf(String(d.x));
        const yi = typeof d.yIndex === "number" ? d.yIndex : yLabels.indexOf(String(d.y));
        const val = Number(d.value) || 0;
        return (
          <rect
            key={i}
            x={80 + xi * cellSize}
            y={yi * cellSize}
            width={cellSize - 1}
            height={cellSize - 1}
            fill={correlationColor(val)}
            rx={2}
          >
            <title>{`${d.y} / ${d.x}: ${val.toFixed(2)}`}</title>
          </rect>
        );
      })}
      {/* X axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={`x-${i}`}
          x={80 + i * cellSize + cellSize / 2}
          y={yLabels.length * cellSize + 16}
          textAnchor="middle"
          fontSize={9}
          fill="#6b7280"
        >
          {label.length > 5 ? label.slice(0, 5) : label}
        </text>
      ))}
      {/* Y axis labels */}
      {yLabels.map((label, i) => (
        <text
          key={`y-${i}`}
          x={76}
          y={i * cellSize + cellSize / 2 + 4}
          textAnchor="end"
          fontSize={9}
          fill="#6b7280"
        >
          {label.length > 8 ? label.slice(0, 8) : label}
        </text>
      ))}
    </svg>
  );
}

function correlationColor(val: number): string {
  if (val >= 0.7) return "#ef4444";
  if (val >= 0.4) return "#f59e0b";
  if (val >= 0.1) return "#eab308";
  if (val >= -0.1) return "#d1d5db";
  if (val >= -0.4) return "#06b6d4";
  return "#3b82f6";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderReferenceLines(
  lines?: DeclarativeChartSpec["config"]["referenceLines"]
): React.ReactNode[] {
  if (!lines) return [];
  return lines.map((line, i) => (
    <ReferenceLine
      key={i}
      {...(line.axis === "x" ? { x: line.value } : { y: line.value })}
      stroke={line.color ?? "#94a3b8"}
      strokeDasharray="3 3"
      label={line.label ? { value: line.label, position: "top", fontSize: 11 } : undefined}
    />
  ));
}

function makeFormatter(
  format: DeclarativeChartSpec["config"]["valueFormat"],
  hideValues: boolean
): (v: unknown) => string {
  return (v: unknown) => {
    if (hideValues) return "***";
    const num = Number(v);
    if (!Number.isFinite(num)) return String(v ?? "");
    switch (format) {
      case "currency":
        return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
      case "percent":
        return `${num.toFixed(1)}%`;
      case "number":
        return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
      default:
        if (Math.abs(num) >= 1000) {
          return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
        }
        return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }
  };
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
