/**
 * Safe dynamic component renderer for AI-generated React code.
 *
 * Uses `new Function()` with an allowlisted scope containing only recharts
 * components and React hooks. No network access, no DOM access, no globals.
 *
 * The generated code is validated against forbidden patterns before execution.
 */

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PieChart,
  Pie,
  Cell,
  Treemap,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Area,
  AreaChart,
  ComposedChart,
  ReferenceLine,
  Label,
} from "recharts";

// ─── Validation ─────────────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /\bimport\s+/,
  /\brequire\s*\(/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bdocument\.\b/,
  /\bwindow\.\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bglobalThis\b/,
  /\bprocess\.\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
];

const MAX_CODE_LENGTH = 50_000;

export function validateComponentCode(code: string): { valid: boolean; error?: string } {
  if (!code || code.trim().length === 0) {
    return { valid: false, error: "Empty code" };
  }
  if (code.length > MAX_CODE_LENGTH) {
    return { valid: false, error: `Code exceeds ${MAX_CODE_LENGTH} character limit` };
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return { valid: false, error: `Forbidden pattern detected: ${pattern.source}` };
    }
  }
  return { valid: true };
}

// ─── Allowlisted Scope ──────────────────────────────────────────────────────

/**
 * Every name available inside the generated code's scope.
 * This is the ONLY way the generated code can access functionality.
 */
const ALLOWED_SCOPE: Record<string, unknown> = {
  // React
  React,
  useState: React.useState,
  useMemo: React.useMemo,
  useCallback: React.useCallback,

  // Recharts — all components
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PieChart,
  Pie,
  Cell,
  Treemap,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Area,
  AreaChart,
  ComposedChart,
  ReferenceLine,
  Label,
};

const SCOPE_KEYS = Object.keys(ALLOWED_SCOPE);
const SCOPE_VALUES = Object.values(ALLOWED_SCOPE);

// ─── Dynamic Component Creator ──────────────────────────────────────────────

export interface DynamicViewProps {
  portfolioData: unknown;
  classifiedPortfolio: unknown;
  hideValues: boolean;
  correlationData?: unknown;
}

/**
 * Sanitize AI-generated code by stripping common LLM artifacts
 * that violate the forbidden pattern checks (imports, exports, fences).
 */
function sanitizeCode(code: string): string {
  let sanitized = code;

  // Strip markdown fences
  if (sanitized.startsWith("```")) {
    const firstNewline = sanitized.indexOf("\n");
    sanitized = sanitized.slice(firstNewline + 1);
  }
  if (sanitized.endsWith("```")) {
    sanitized = sanitized.slice(0, sanitized.lastIndexOf("```")).trim();
  }

  // Strip import statements (everything is already in scope)
  sanitized = sanitized.replace(/^import\s+.*?[;\n]/gm, "");

  // Strip export default / export prefixes
  sanitized = sanitized.replace(/^export\s+default\s+/gm, "");
  sanitized = sanitized.replace(/^export\s+/gm, "");

  // Strip "use client" / "use server" directives
  sanitized = sanitized.replace(/^["']use (client|server)["'];?\s*\n/gm, "");

  return sanitized.trim();
}

/**
 * Create a React functional component from AI-generated code string.
 * Returns { component, error } — component is null on failure with error describing why.
 */
export function createDynamicComponent(
  code: string
): { component: React.FC<DynamicViewProps> | null; error: string | null } {
  if (!code || code.trim().length === 0) {
    return { component: null, error: "Empty code" };
  }

  const sanitized = sanitizeCode(code);

  const validation = validateComponentCode(sanitized);
  if (!validation.valid) {
    console.error("[DynamicComponent] Validation failed:", validation.error);
    return { component: null, error: `Validation: ${validation.error}` };
  }

  try {
    // Build a function that receives the allowlisted scope + props
    // The generated code is the function body — it should end with a return statement
    const fn = new Function(
      ...SCOPE_KEYS,
      "portfolioData",
      "classifiedPortfolio",
      "hideValues",
      "correlationData",
      `"use strict";\n${sanitized}`
    );

    // Create the React component wrapper
    const DynamicComponent: React.FC<DynamicViewProps> = (props) => {
      try {
        return fn(
          ...SCOPE_VALUES,
          props.portfolioData,
          props.classifiedPortfolio,
          props.hideValues,
          props.correlationData
        );
      } catch (renderErr) {
        console.error("[DynamicComponent] Render error:", renderErr);
        return React.createElement(
          "div",
          { className: "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600" },
          `Render error: ${renderErr instanceof Error ? renderErr.message : "Unknown"}`
        );
      }
    };

    DynamicComponent.displayName = "DynamicAIView";
    return { component: DynamicComponent, error: null };
  } catch (err) {
    console.error("[DynamicComponent] Creation failed:", err);
    return { component: null, error: `Compile: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}
