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

// ─── HOSTED diagram — "Infrastructure controlled by Portsie" ────────────────

export const HOSTED_DIAGRAM: DiagramData = {
  regions: [
    { label: "PORTSIE CLOUD", x: 14, y: 90, w: 290, h: 300, color: "blue" },
  ],
  nodes: [
    // User's device at top-left
    { id: "device",    label: "Your Device",        sub: "Browser upload",         x: 30,  y: 20,  w: 155, h: 48, color: "gray",    icon: "Monitor" },
    // Portsie institutional entity
    { id: "portsie",   label: "Portsie",             sub: "Managed platform",       x: 30,  y: 110, w: 155, h: 42, color: "blue",    icon: "Building2" },
    // Cloud pipeline
    { id: "storage",   label: "Cloud Storage",        sub: "Supabase Storage",       x: 30,  y: 175, w: 155, h: 48, color: "blue",    icon: "HardDrive" },
    { id: "llm",       label: "LLM Service",          sub: "Gemini / Claude",        x: 30,  y: 265, w: 155, h: 48, color: "blue",    icon: "Cpu" },
    { id: "db",        label: "Portfolio Database",    sub: "Supabase PostgreSQL",    x: 80,  y: 345, w: 200, h: 48, color: "blue",    icon: "Database" },
    // External services on right
    { id: "brokerage", label: "Brokerage",             sub: "Charles Schwab",         x: 400, y: 150, w: 170, h: 48, color: "emerald", icon: "Landmark" },
    { id: "market",    label: "Market Data",           sub: "Finnhub / Alpha Vantage", x: 400, y: 280, w: 170, h: 48, color: "amber",  icon: "TrendingUp" },
  ],
  edges: [
    // Upload flow: device → storage → llm → db
    { from: "device",    to: "storage",   color: "blue",    label: "raw files",
      path: "M 107 68 L 107 175", labelX: 140, labelY: 122 },
    { from: "storage",   to: "llm",       color: "blue",    label: "extract",
      path: "M 107 223 L 107 265", labelX: 140, labelY: 244 },
    { from: "llm",       to: "db",        color: "blue",    label: "structured data",
      path: "M 107 313 C 120 330, 150 340, 165 345", labelX: 100, labelY: 334 },
    // Brokerage API
    { from: "brokerage", to: "db",        color: "emerald", label: "auto-sync", bidir: true,
      path: "M 400 174 C 350 220, 310 300, 280 345", labelX: 345, labelY: 260 },
    // Market data
    { from: "market",    to: "db",        color: "amber",   label: "prices", dash: "4 3", strokeWidth: 1.5,
      path: "M 400 310 C 360 330, 310 345, 280 360", labelX: 345, labelY: 340 },
  ],
};

// ─── BYOB diagram — "Your servers, your keys, your data" ───────────────────

export const BYOB_DIAGRAM: DiagramData = {
  regions: [
    { label: "YOUR INFRASTRUCTURE", x: 14, y: 10, w: 250, h: 290, color: "violet" },
  ],
  nodes: [
    // You — the user in control
    { id: "you",       label: "You",                 sub: "Full control",           x: 30,  y: 30,  w: 130, h: 42, color: "violet",  icon: "User" },
    // User's device — prominent, inside their boundary
    { id: "device",    label: "Your Device",          sub: "Local parsing",          x: 30,  y: 95,  w: 155, h: 48, color: "violet",  icon: "Monitor" },
    // Local LLM / parser on user's machine
    { id: "parser",    label: "Local Parser",          sub: "On-device extraction",   x: 30,  y: 190, w: 155, h: 48, color: "violet",  icon: "Cpu" },
    // Database — outside user's boundary (Portsie-hosted)
    { id: "db",        label: "Portfolio Database",    sub: "Supabase PostgreSQL",    x: 80,  y: 345, w: 200, h: 48, color: "gray",    icon: "Database" },
    // External services on right
    { id: "brokerage", label: "Brokerage",             sub: "Charles Schwab",         x: 400, y: 150, w: 170, h: 48, color: "emerald", icon: "Landmark" },
    { id: "market",    label: "Market Data",           sub: "Finnhub / Alpha Vantage", x: 400, y: 280, w: 170, h: 48, color: "amber",  icon: "TrendingUp" },
  ],
  edges: [
    // Local flow: device → parser (stays local)
    { from: "device",  to: "parser",    color: "violet",  label: "raw files stay local",
      path: "M 107 143 L 107 190", labelX: 160, labelY: 167 },
    // Only structured data leaves
    { from: "parser",  to: "db",        color: "violet",  label: "structured data only", dash: "7 4",
      path: "M 107 238 C 120 280, 150 320, 165 345", labelX: 95, labelY: 295 },
    // Brokerage API
    { from: "brokerage", to: "db",      color: "emerald", label: "auto-sync", bidir: true,
      path: "M 400 174 C 350 220, 310 300, 280 345", labelX: 345, labelY: 260 },
    // Market data
    { from: "market",    to: "db",      color: "amber",   label: "prices", dash: "4 3", strokeWidth: 1.5,
      path: "M 400 310 C 360 330, 310 345, 280 360", labelX: 345, labelY: 340 },
  ],
};

// ─── Default (backward compat) ──────────────────────────────────────────────

export const DEFAULT_DIAGRAM: DiagramData = HOSTED_DIAGRAM;
