// ─── Diagram data model ──────────────────────────────────────────────────────

export interface DiagramNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  icon: string; // Lucide icon name: "Monitor" | "HardDrive" | "Cpu" | "Database" | "Landmark" | "TrendingUp" | etc.
}

export interface DiagramEdge {
  from: string;
  to: string;
  color: string;
  label: string;
  dash?: string;       // SVG strokeDasharray, e.g. "7 4"
  bidir?: boolean;     // bidirectional arrows
  strokeWidth?: number; // defaults to 2
  path?: string;       // explicit SVG path d attribute (if omitted, auto-computed from node positions)
  labelX?: number;     // explicit label x position
  labelY?: number;     // explicit label y position
  labelRotate?: number; // label rotation in degrees
}

export interface DiagramRegion {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string; // color key matching COLORS
}

export interface DiagramData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  regions: DiagramRegion[];
}

// ─── Color palette ───────────────────────────────────────────────────────────

export const COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  blue:    { fill: "#eff6ff", stroke: "#3b82f6", text: "#2563eb" },
  violet:  { fill: "#f5f3ff", stroke: "#8b5cf6", text: "#7c3aed" },
  emerald: { fill: "#ecfdf5", stroke: "#10b981", text: "#059669" },
  amber:   { fill: "#fffbeb", stroke: "#f59e0b", text: "#d97706" },
  gray:    { fill: "#f9fafb", stroke: "#9ca3af", text: "#374151" },
  red:     { fill: "#fef2f2", stroke: "#ef4444", text: "#dc2626" },
  cyan:    { fill: "#ecfeff", stroke: "#06b6d4", text: "#0891b2" },
  pink:    { fill: "#fdf2f8", stroke: "#ec4899", text: "#db2777" },
  orange:  { fill: "#fff7ed", stroke: "#f97316", text: "#ea580c" },
  teal:    { fill: "#f0fdfa", stroke: "#14b8a6", text: "#0d9488" },
};

// ─── Default diagram (matches the current architecture) ─────────────────────

export const DEFAULT_DIAGRAM: DiagramData = {
  regions: [
    { label: "PORTSIE CLOUD", x: 18, y: 125, w: 178, h: 210, color: "blue" },
  ],
  nodes: [
    { id: "device",    label: "Your Device",       sub: "Browser",               x: 222, y: 20,  w: 156, h: 48, color: "gray",    icon: "Monitor" },
    { id: "storage",   label: "Cloud Storage",      sub: "Supabase Storage",      x: 32,  y: 150, w: 150, h: 48, color: "blue",    icon: "HardDrive" },
    { id: "llm",       label: "LLM Service",        sub: "Gemini / Claude",       x: 32,  y: 270, w: 150, h: 48, color: "blue",    icon: "Cpu" },
    { id: "db",        label: "Portfolio Database",  sub: "Supabase PostgreSQL",   x: 210, y: 390, w: 180, h: 48, color: "gray",    icon: "Database" },
    { id: "brokerage", label: "Brokerage",           sub: "Charles Schwab",        x: 418, y: 150, w: 150, h: 48, color: "emerald", icon: "Landmark" },
    { id: "market",    label: "Market Data",         sub: "Finnhub / Alpha Vantage", x: 418, y: 320, w: 150, h: 48, color: "amber", icon: "TrendingUp" },
  ],
  edges: [
    { from: "device",    to: "storage",   color: "blue",    label: "raw files",
      path: "M 260 68 C 220 100, 130 110, 107 150", labelX: 170, labelY: 98 },
    { from: "storage",   to: "llm",       color: "blue",    label: "extract",
      path: "M 107 198 L 107 270", labelX: 75, labelY: 234 },
    { from: "llm",       to: "db",        color: "blue",    label: "structured data",
      path: "M 182 294 C 220 300, 250 340, 265 390", labelX: 215, labelY: 342 },
    { from: "device",    to: "db",        color: "violet",  label: "structured data only", dash: "7 4",
      path: "M 300 68 C 305 160, 305 290, 300 390", labelX: 330, labelY: 225, labelRotate: -88 },
    { from: "device",    to: "brokerage", color: "emerald", label: "OAuth",
      path: "M 345 68 C 390 95, 470 110, 493 150", labelX: 430, labelY: 98 },
    { from: "brokerage", to: "db",        color: "emerald", label: "auto-sync", bidir: true,
      path: "M 493 198 C 493 270, 420 350, 375 390", labelX: 460, labelY: 280 },
    { from: "market",    to: "db",        color: "amber",   label: "prices", dash: "4 3", strokeWidth: 1.5,
      path: "M 418 345 C 400 365, 385 380, 370 395", labelX: 400, labelY: 378 },
  ],
};
