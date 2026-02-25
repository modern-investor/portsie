/**
 * Safe data transform engine for declarative chart specs.
 * Resolves DataTransform specs against ClassifiedPortfolio/PortfolioData.
 * Only traverses known safe paths — no eval, no arbitrary property access.
 */

import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import type { ClassifiedPortfolio } from "./types";
import type { CorrelationData } from "./ai-views-types";
import type { DataTransform, DataFilter } from "./chart-spec-types";

export interface TransformContext {
  portfolioData: PortfolioData;
  classifiedPortfolio: ClassifiedPortfolio;
  correlationData?: CorrelationData | null;
}

/**
 * Execute a data transform spec against portfolio data.
 * Returns an array of plain objects ready for Recharts.
 */
export function executeTransform(
  transform: DataTransform,
  ctx: TransformContext
): Record<string, unknown>[] {
  let rows = resolveSource(transform.source, ctx);

  if (transform.filter) {
    rows = applyFilter(rows, transform.filter);
  }

  if (transform.group_by) {
    rows = applyGrouping(rows, transform.group_by, transform.aggregate ?? "sum", transform.map);
  }

  // Map fields
  if (Object.keys(transform.map).length > 0 && !transform.group_by) {
    rows = rows.map((row) => mapFields(row, transform.map));
  }

  if (transform.sort) {
    const { field, direction } = transform.sort;
    rows.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return direction === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }

  if (transform.limit && transform.limit > 0) {
    rows = rows.slice(0, transform.limit);
  }

  return rows;
}

// ─── Source Resolution ──────────────────────────────────────────────────────

function resolveSource(
  source: DataTransform["source"],
  ctx: TransformContext
): Record<string, unknown>[] {
  switch (source) {
    case "assetClasses":
      return ctx.classifiedPortfolio.assetClasses.map((ac) => ({
        name: ac.def.label,
        id: ac.def.id,
        color: ac.def.chartColor,
        marketValue: ac.marketValue,
        dayChange: ac.dayChange,
        allocationPct: ac.allocationPct,
        holdingCount: ac.holdingCount,
      }));

    case "positions": {
      const all = [
        ...ctx.portfolioData.positions,
        ...ctx.portfolioData.aggregatePositions,
      ];
      return all.map((p) => ({
        symbol: p.symbol,
        description: p.description,
        assetType: p.assetType,
        quantity: p.quantity,
        marketValue: p.marketValue,
        averagePrice: p.averagePrice,
        dayPL: p.currentDayProfitLoss,
        dayPLPct: p.currentDayProfitLossPercentage,
        accountName: p.accountName ?? "",
        source: p.source,
        allocationPct:
          ctx.classifiedPortfolio.totalMarketValue > 0
            ? (p.marketValue / ctx.classifiedPortfolio.totalMarketValue) * 100
            : 0,
      }));
    }

    case "accounts": {
      const all = [
        ...ctx.portfolioData.accounts,
        ...ctx.portfolioData.aggregateAccounts,
      ];
      return all.map((a) => ({
        name: a.name,
        institution: a.institution,
        type: a.type,
        source: a.source,
        cashBalance: a.cashBalance,
        liquidationValue: a.liquidationValue,
        holdingsCount: a.holdingsCount,
        isAggregate: a.isAggregate,
        accountCategory: a.accountCategory,
      }));
    }

    case "correlationMatrix": {
      if (!ctx.correlationData) return [];
      const { symbols, correlationMatrix } = ctx.correlationData;
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < symbols.length; i++) {
        for (let j = 0; j < symbols.length; j++) {
          rows.push({
            x: symbols[j],
            y: symbols[i],
            value: correlationMatrix[i]?.[j] ?? 0,
            xIndex: j,
            yIndex: i,
          });
        }
      }
      return rows;
    }

    case "riskClusters": {
      if (!ctx.correlationData) return [];
      return ctx.correlationData.riskClusters.map((c) => ({
        name: c.name,
        symbols: c.symbols.join(", "),
        symbolCount: c.symbols.length,
        internalCorrelation: c.internalCorrelation,
      }));
    }

    case "notablePairs": {
      if (!ctx.correlationData) return [];
      const pairs = [
        ...ctx.correlationData.notablePairs.mostCorrelated.map((p) => ({
          pair: `${p.pair[0]} / ${p.pair[1]}`,
          correlation: p.correlation,
          reason: p.reason,
          type: "most_correlated",
        })),
        ...ctx.correlationData.notablePairs.leastCorrelated.map((p) => ({
          pair: `${p.pair[0]} / ${p.pair[1]}`,
          correlation: p.correlation,
          reason: p.reason,
          type: "least_correlated",
        })),
      ];
      return pairs;
    }

    case "custom":
      return [];

    default:
      return [];
  }
}

// ─── Field Mapping ──────────────────────────────────────────────────────────

function mapFields(
  row: Record<string, unknown>,
  fieldMap: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [outputKey, sourceKey] of Object.entries(fieldMap)) {
    result[outputKey] = resolvePath(row, sourceKey);
  }
  return result;
}

/** Resolve a dot-separated path against an object. Only 1 level of nesting. */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  const parts = path.split(".");
  if (parts.length === 2) {
    const parent = obj[parts[0]];
    if (parent && typeof parent === "object" && !Array.isArray(parent)) {
      return (parent as Record<string, unknown>)[parts[1]];
    }
  }
  return undefined;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

function applyFilter(
  rows: Record<string, unknown>[],
  filter: DataFilter
): Record<string, unknown>[] {
  return rows.filter((row) => {
    const val = row[filter.field];
    const target = filter.value;

    switch (filter.op) {
      case "gt":
        return typeof val === "number" && val > Number(target);
      case "lt":
        return typeof val === "number" && val < Number(target);
      case "gte":
        return typeof val === "number" && val >= Number(target);
      case "lte":
        return typeof val === "number" && val <= Number(target);
      case "eq":
        return val === target;
      case "neq":
        return val !== target;
      default:
        return true;
    }
  });
}

// ─── Grouping ───────────────────────────────────────────────────────────────

function applyGrouping(
  rows: Record<string, unknown>[],
  groupBy: string,
  aggregate: "sum" | "count" | "avg",
  fieldMap: Record<string, string>
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const key = String(row[groupBy] ?? "Other");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([key, items]) => {
    const result: Record<string, unknown> = { name: key };

    // Aggregate numeric fields from the map
    for (const [outputKey, sourceKey] of Object.entries(fieldMap)) {
      if (outputKey === "name") continue;
      const values = items
        .map((r) => Number(r[sourceKey]))
        .filter((v) => Number.isFinite(v));

      if (values.length === 0) {
        result[outputKey] = 0;
      } else if (aggregate === "sum") {
        result[outputKey] = values.reduce((a, b) => a + b, 0);
      } else if (aggregate === "count") {
        result[outputKey] = values.length;
      } else if (aggregate === "avg") {
        result[outputKey] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    }

    result._count = items.length;
    return result;
  });
}
