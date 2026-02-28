# ArchVisual: Interactive Infrastructure Diagram with LLM Chat Editor

A guide for setting up an SVG-based architecture diagram with a live chat editor powered by Claude. Users describe changes in natural language, Claude modifies a JSON data model, and the diagram re-renders instantly.

Built with: **Next.js (App Router)**, **React**, **TypeScript**, **Tailwind CSS**, **Lucide React icons**, **Claude CLI wrapper**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Step 1: Define the Data Model](#step-1-define-the-data-model)
3. [Step 2: Build the SVG Renderer](#step-2-build-the-svg-renderer)
4. [Step 3: Auto-Compute Edge Paths](#step-3-auto-compute-edge-paths)
5. [Step 4: Create the API Route](#step-4-create-the-api-route)
6. [Step 5: Build the Chat UI](#step-5-build-the-chat-ui)
7. [Step 6: Wire Up the Page](#step-6-wire-up-the-page)
8. [Querying Your Infrastructure](#querying-your-infrastructure)
9. [Customization Reference](#customization-reference)

---

## Architecture Overview

```
User types: "Add a Redis cache between API Gateway and Database"
  → Frontend sends { diagramData, message } to /api/archvisual/modify
  → API route builds prompt with JSON schema + current diagram + user request
  → POST to Claude CLI wrapper (or Anthropic API)
  → Claude returns modified JSON
  → Frontend receives new DiagramData, React re-renders SVG
```

The system has four layers:

| Layer | File | Purpose |
|-------|------|---------|
| **Data Model** | `lib/archvisual/types.ts` | TypeScript interfaces + color palette + default diagram |
| **SVG Renderer** | `components/data-flow-diagram.tsx` | Renders DiagramData → SVG with nodes, edges, regions |
| **Edge Paths** | `lib/archvisual/edge-paths.ts` | Auto-computes bezier curves from node positions |
| **API Route** | `app/api/archvisual/modify/route.ts` | Proxies modification requests to Claude |
| **Chat UI** | `app/archvisual/page.tsx` + `components/arch-chat.tsx` | Chat sidebar + diagram state management |

---

## Step 1: Define the Data Model

Create `src/lib/archvisual/types.ts`:

```typescript
// ─── Diagram data model ─────────────────────────────────────────────────

export interface DiagramNode {
  id: string;
  label: string;
  sub?: string;        // subtitle (e.g., "PostgreSQL 16")
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;       // key into COLORS palette
  icon: string;        // Lucide icon name: "Server", "Database", "Globe", etc.
}

export interface DiagramEdge {
  from: string;        // source node id
  to: string;          // target node id
  color: string;
  label: string;
  dash?: string;       // SVG strokeDasharray, e.g. "7 4" for dashed lines
  bidir?: boolean;     // bidirectional arrows
  strokeWidth?: number; // defaults to 2
  path?: string;       // explicit SVG path d (omit to auto-compute)
  labelX?: number;     // explicit label position
  labelY?: number;
  labelRotate?: number;
}

export interface DiagramRegion {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface DiagramData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  regions: DiagramRegion[];
}

// ─── Color palette ──────────────────────────────────────────────────────

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

// ─── Your default diagram ───────────────────────────────────────────────
// Replace this with your infrastructure. See "Querying Your Infrastructure"
// section below for how to discover what goes here.

export const DEFAULT_DIAGRAM: DiagramData = {
  regions: [
    { label: "AWS VPC", x: 20, y: 60, w: 280, h: 350, color: "blue" },
  ],
  nodes: [
    { id: "lb",      label: "Load Balancer",  sub: "ALB",          x: 80,  y: 80,  w: 160, h: 48, color: "blue",    icon: "Globe" },
    { id: "api",     label: "API Server",     sub: "Node.js",      x: 80,  y: 180, w: 160, h: 48, color: "emerald", icon: "Server" },
    { id: "db",      label: "Database",        sub: "PostgreSQL",   x: 80,  y: 280, w: 160, h: 48, color: "amber",   icon: "Database" },
    { id: "cache",   label: "Cache",           sub: "Redis",        x: 350, y: 180, w: 140, h: 48, color: "red",     icon: "Zap" },
    { id: "agent",   label: "AI Agent",        sub: "Claude",       x: 350, y: 80,  w: 140, h: 48, color: "violet",  icon: "Cpu" },
    { id: "storage", label: "Object Storage",  sub: "S3",           x: 350, y: 280, w: 140, h: 48, color: "cyan",    icon: "HardDrive" },
  ],
  edges: [
    { from: "lb",    to: "api",     color: "blue",    label: "HTTPS" },
    { from: "api",   to: "db",      color: "amber",   label: "queries" },
    { from: "api",   to: "cache",   color: "red",     label: "read/write" },
    { from: "api",   to: "agent",   color: "violet",  label: "prompts", dash: "7 4" },
    { from: "api",   to: "storage", color: "cyan",    label: "files" },
    { from: "agent", to: "cache",   color: "red",     label: "context", dash: "4 3", strokeWidth: 1.5 },
  ],
};
```

### Key design decisions

- **SVG viewBox is 600x460** — all node positions are in this coordinate space. The SVG scales responsively via `preserveAspectRatio="xMidYMid meet"`.
- **Edges can have explicit `path`** (hand-tuned SVG bezier) or **auto-computed paths** from node positions. For your initial diagram, omit `path` and let the auto-compute handle it. Hand-tune later for aesthetics.
- **Regions** are dashed-border rectangles drawn behind everything — use them for VPCs, security boundaries, cloud providers, etc.

---

## Step 2: Build the SVG Renderer

Create `src/components/data-flow-diagram.tsx`:

```tsx
"use client";

import {
  Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield,
  Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box, type LucideIcon,
} from "lucide-react";
import type { DiagramData, DiagramEdge, DiagramNode, DiagramRegion } from "@/lib/archvisual/types";
import { COLORS, DEFAULT_DIAGRAM } from "@/lib/archvisual/types";
import { computeEdgePath, buildNodeMap } from "@/lib/archvisual/edge-paths";

// ─── Icon registry ──────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield,
  Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box,
};

function getIcon(name: string) {
  return ICON_MAP[name] ?? Box;
}

// ─── Entity node ────────────────────────────────────────────────────────

function Node({ node }: { node: DiagramNode }) {
  const c = COLORS[node.color] ?? COLORS.gray;
  const Icon = getIcon(node.icon);
  return (
    <g>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={8}
            fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
      {/* Lucide icon via foreignObject */}
      <foreignObject x={node.x + 8} y={node.y + (node.h - 20) / 2} width={20} height={20}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, color: c.stroke }}>
          <Icon style={{ width: 16, height: 16 }} />
        </div>
      </foreignObject>
      <text x={node.x + 32} y={node.sub ? node.y + node.h / 2 - 3 : node.y + node.h / 2 + 1}
            fontSize={11} fontWeight={600} fill={c.text}
            dominantBaseline="middle">{node.label}</text>
      {node.sub && (
        <text x={node.x + 32} y={node.y + node.h / 2 + 10}
              fontSize={8.5} fill="#9ca3af"
              dominantBaseline="middle">{node.sub}</text>
      )}
    </g>
  );
}

// ─── Edge label on white pill ───────────────────────────────────────────

function Label({
  x, y, text, color, rotate,
}: {
  x: number; y: number; text: string; color: string; rotate?: number;
}) {
  const pw = text.length * 5.2 + 10;
  return (
    <g transform={rotate ? `rotate(${rotate},${x},${y})` : undefined}>
      <rect x={x - pw / 2} y={y - 7} width={pw} height={14}
            rx={4} fill="white" fillOpacity={0.92} />
      <text x={x} y={y + 1} fontSize={9} fontWeight={500} fill={color}
            textAnchor="middle" dominantBaseline="middle">{text}</text>
    </g>
  );
}

// ─── Edge (path + label) ────────────────────────────────────────────────

function Edge({ edge, nodeMap }: { edge: DiagramEdge; nodeMap: Map<string, DiagramNode> }) {
  const c = COLORS[edge.color] ?? COLORS.gray;
  const sw = edge.strokeWidth ?? 2;
  const colorKey = edge.color;

  let d: string;
  let lx: number;
  let ly: number;
  let lr: number | undefined;

  if (edge.path) {
    d = edge.path;
    lx = edge.labelX ?? 0;
    ly = edge.labelY ?? 0;
    lr = edge.labelRotate;
  } else {
    const computed = computeEdgePath(edge, nodeMap);
    if (!computed) return null;
    d = computed.d;
    lx = edge.labelX ?? computed.labelX;
    ly = edge.labelY ?? computed.labelY;
    lr = edge.labelRotate ?? computed.labelRotate;
  }

  return (
    <g>
      <path d={d}
            stroke={c.stroke} strokeWidth={sw} fill="none"
            strokeDasharray={edge.dash}
            markerEnd={`url(#ah-${colorKey})`}
            markerStart={edge.bidir ? `url(#ah-${colorKey})` : undefined} />
      <Label x={lx} y={ly} text={edge.label} color={c.text} rotate={lr} />
    </g>
  );
}

// ─── Region boundary ────────────────────────────────────────────────────

function Region({ region }: { region: DiagramRegion }) {
  const c = COLORS[region.color] ?? COLORS.gray;
  return (
    <g>
      <rect x={region.x} y={region.y} width={region.w} height={region.h} rx={12}
            fill={c.fill} fillOpacity={0.35} stroke={c.stroke} strokeWidth={1}
            strokeDasharray="4 3" strokeOpacity={0.4} />
      <text x={region.x + region.w / 2} y={region.y + 15} fontSize={8} fontWeight={600}
            fill={c.text} textAnchor="middle" letterSpacing={1.2} opacity={0.55}>
        {region.label}
      </text>
    </g>
  );
}

// ─── Arrow markers ──────────────────────────────────────────────────────

function Markers({ colors }: { colors: string[] }) {
  return (
    <defs>
      {colors.map((k) => {
        const c = COLORS[k];
        if (!c) return null;
        return (
          <marker key={k} id={`ah-${k}`} viewBox="0 0 10 7" refX="9" refY="3.5"
                  markerWidth="7" markerHeight="5" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" fill={c.stroke} />
          </marker>
        );
      })}
    </defs>
  );
}

// ─── Main component ─────────────────────────────────────────────────────

interface Props {
  data?: DiagramData;
  compact?: boolean; // hides heading and legend
}

export function DataFlowDiagram({ data, compact }: Props) {
  const d = data ?? DEFAULT_DIAGRAM;
  const nodeMap = buildNodeMap(d.nodes);
  const edgeColors = [...new Set(d.edges.map((e) => e.color))];

  return (
    <div className="w-full space-y-2">
      {!compact && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
          System Architecture
        </h4>
      )}
      <svg viewBox="0 0 600 460" className="w-full" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Architecture diagram">
        <Markers colors={edgeColors} />
        {d.regions.map((r, i) => <Region key={i} region={r} />)}
        {d.edges.map((e, i) => <Edge key={i} edge={e} nodeMap={nodeMap} />)}
        {d.nodes.map((n) => <Node key={n.id} node={n} />)}
      </svg>
    </div>
  );
}
```

### Why SVG + foreignObject?

- **SVG** gives pixel-perfect control over positioning, paths, and scaling
- **foreignObject** lets us embed Lucide React icons (HTML/CSS) inside SVG nodes
- The `viewBox="0 0 600 460"` coordinate system means the diagram scales to any container width

---

## Step 3: Auto-Compute Edge Paths

Create `src/lib/archvisual/edge-paths.ts`:

```typescript
import type { DiagramNode, DiagramEdge } from "./types";

function anchors(n: DiagramNode) {
  return {
    top:    { x: n.x + n.w / 2, y: n.y },
    bottom: { x: n.x + n.w / 2, y: n.y + n.h },
    left:   { x: n.x,           y: n.y + n.h / 2 },
    right:  { x: n.x + n.w,     y: n.y + n.h / 2 },
  };
}

interface PathResult {
  d: string;
  labelX: number;
  labelY: number;
  labelRotate?: number;
}

export function computeEdgePath(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
): PathResult | null {
  const src = nodeMap.get(edge.from);
  const dst = nodeMap.get(edge.to);
  if (!src || !dst) return null;

  const sa = anchors(src);
  const da = anchors(dst);

  const dx = (dst.x + dst.w / 2) - (src.x + src.w / 2);
  const dy = (dst.y + dst.h / 2) - (src.y + src.h / 2);

  if (Math.abs(dy) > Math.abs(dx)) {
    // Vertical flow
    const start = dy > 0 ? sa.bottom : sa.top;
    const end = dy > 0 ? da.top : da.bottom;

    if (Math.abs(dx) < 40) {
      // Straight vertical
      return {
        d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
        labelX: Math.min(start.x, end.x) - 18,
        labelY: (start.y + end.y) / 2,
      };
    }

    const cpY1 = start.y + (end.y - start.y) * 0.3;
    const cpY2 = start.y + (end.y - start.y) * 0.7;
    return {
      d: `M ${start.x} ${start.y} C ${start.x} ${cpY1}, ${end.x} ${cpY2}, ${end.x} ${end.y}`,
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2,
    };
  }

  // Horizontal flow
  const start = dx > 0 ? sa.right : sa.left;
  const end = dx > 0 ? da.left : da.right;
  const cpX = (start.x + end.x) / 2;
  return {
    d: `M ${start.x} ${start.y} C ${cpX} ${start.y}, ${cpX} ${end.y}, ${end.x} ${end.y}`,
    labelX: cpX,
    labelY: Math.min(start.y, end.y) - 8,
  };
}

export function buildNodeMap(nodes: DiagramNode[]): Map<string, DiagramNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
```

---

## Step 4: Create the API Route

Create `src/app/api/archvisual/modify/route.ts`:

```typescript
import { NextResponse } from "next/server";
import type { DiagramData } from "@/lib/archvisual/types";

// ─── Claude backend config ──────────────────────────────────────────────
// Option A: CLI wrapper on a server (no per-token cost with Max plan)
const CLI_ENDPOINT = process.env.ARCHVISUAL_CLI_ENDPOINT ?? "http://your-server:8910";
const CLI_AUTH = process.env.ARCHVISUAL_CLI_AUTH_TOKEN ?? "";

// Option B: Direct Anthropic API (uncomment and use instead)
// import Anthropic from "@anthropic-ai/sdk";
// const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an architecture diagram editor. You receive a JSON data model describing an SVG architecture diagram and a user request to modify it.

The JSON schema:
{
  "nodes": [{ "id": string, "label": string, "sub"?: string, "x": number, "y": number, "w": number, "h": number, "color": string, "icon": string }],
  "edges": [{ "from": string (node id), "to": string (node id), "color": string, "label": string, "dash"?: string, "bidir"?: boolean, "strokeWidth"?: number }],
  "regions": [{ "label": string, "x": number, "y": number, "w": number, "h": number, "color": string }]
}

The SVG viewBox is 600x460. Node positions are (x, y) for top-left corner.

Available colors: blue, violet, emerald, amber, gray, red, cyan, pink, orange, teal.
Available icons: Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield, Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box.

Rules:
- Return ONLY the modified JSON object, no commentary
- Preserve existing node IDs when modifying
- Keep the diagram readable: avoid overlapping nodes, maintain spacing
- For new nodes, pick positions that flow logically in the existing layout
- The output must be valid JSON parseable as DiagramData`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { diagramData, message } = body as {
      diagramData: DiagramData;
      message: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const prompt = `${SYSTEM_PROMPT}

Current diagram JSON:
${JSON.stringify(diagramData, null, 2)}

User request: ${message}

Return the modified diagram JSON only.`;

    // ── Option A: CLI wrapper ───────────────────────────────────────────
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CLI_AUTH) headers["Authorization"] = `Bearer ${CLI_AUTH}`;

    const resp = await fetch(`${CLI_ENDPOINT}/extract`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, model: "claude-sonnet-4-6" }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: `CLI error: ${text}` }, { status: 502 });
    }

    const raw = await resp.json();

    // ── Option B: Direct Anthropic API (replace Option A above) ─────────
    // const msg = await anthropic.messages.create({
    //   model: "claude-sonnet-4-6-20250514",
    //   max_tokens: 4096,
    //   messages: [{ role: "user", content: prompt }],
    // });
    // const raw = JSON.parse(msg.content[0].type === "text" ? msg.content[0].text : "{}");

    // Parse response — handle both direct JSON and { result: "..." } wrapper
    let modified: DiagramData;
    if (raw.nodes && raw.edges) {
      modified = raw as DiagramData;
    } else if (raw.result) {
      const text = typeof raw.result === "string" ? raw.result : JSON.stringify(raw.result);
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
      modified = JSON.parse(jsonMatch[1]!.trim());
    } else {
      return NextResponse.json({ error: "Unexpected response format" }, { status: 502 });
    }

    if (!Array.isArray(modified.nodes) || !Array.isArray(modified.edges)) {
      return NextResponse.json({ error: "Invalid diagram data" }, { status: 502 });
    }

    return NextResponse.json({ diagramData: modified });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

### Environment variables

Add to your `.env.local`:

```bash
# Option A: CLI wrapper
ARCHVISUAL_CLI_ENDPOINT=http://your-server:8910
ARCHVISUAL_CLI_AUTH_TOKEN=your-secret-token

# Option B: Direct Anthropic API
# ANTHROPIC_API_KEY=sk-ant-...
```

---

## Step 5: Build the Chat UI

Create `src/app/archvisual/components/arch-chat.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  loading: boolean;
}

export function ArchChat({ messages, onSend, loading }: Props) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    onSend(msg);
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Diagram Editor
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            Describe changes to the architecture diagram.
            <br />
            <span className="text-gray-300">
              e.g. &quot;Add a Redis cache between API and Database&quot;
            </span>
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
              m.role === "user"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
              <span className="text-xs text-gray-400">Modifying diagram...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-100 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a change..."
          disabled={loading}
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm
                     placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400
                     disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40
                     hover:bg-gray-700 transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
```

---

## Step 6: Wire Up the Page

Create `src/app/archvisual/page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { DataFlowDiagram } from "@/components/data-flow-diagram";
import { ArchChat, type ChatMessage } from "./components/arch-chat";
import { DEFAULT_DIAGRAM, type DiagramData } from "@/lib/archvisual/types";
import { RotateCcw } from "lucide-react";

export default function ArchVisualPage() {
  const [diagram, setDiagram] = useState<DiagramData>(DEFAULT_DIAGRAM);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = useCallback(async (message: string) => {
    setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const resp = await fetch("/api/archvisual/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramData: diagram, message }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}`, timestamp: Date.now() },
        ]);
        return;
      }

      setDiagram(data.diagramData);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Diagram updated.", timestamp: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [diagram]);

  const handleReset = useCallback(() => {
    setDiagram(DEFAULT_DIAGRAM);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Diagram reset to default.", timestamp: Date.now() },
    ]);
  }, []);

  return (
    <div className="flex h-screen bg-white">
      {/* Diagram panel */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="w-full max-w-2xl">
          <DataFlowDiagram data={diagram} />
        </div>
      </div>

      {/* Chat sidebar */}
      <div className="w-80 flex flex-col border-l border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400">archvisual</span>
          <button onClick={handleReset}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Reset diagram">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ArchChat messages={messages} onSend={handleSend} loading={loading} />
        </div>
      </div>
    </div>
  );
}
```

### Auth middleware

If your app uses auth middleware, add `/archvisual` and `/api/archvisual` to the public route exceptions so the page is accessible without login.

---

## Querying Your Infrastructure

Before building the diagram, you need to know what's in your infrastructure. Here are commands to discover your components:

### AWS

```bash
# EC2 instances
aws ec2 describe-instances --query 'Reservations[].Instances[].{ID:InstanceId,Type:InstanceType,State:State.Name,Name:Tags[?Key==`Name`]|[0].Value}' --output table

# RDS databases
aws rds describe-db-instances --query 'DBInstances[].{ID:DBInstanceIdentifier,Engine:Engine,Status:DBInstanceStatus,Class:DBInstanceClass}' --output table

# ElastiCache clusters
aws elasticache describe-cache-clusters --query 'CacheClusters[].{ID:CacheClusterId,Engine:Engine,Type:CacheNodeType,Status:CacheClusterStatus}' --output table

# S3 buckets
aws s3 ls

# Load balancers
aws elbv2 describe-load-balancers --query 'LoadBalancers[].{Name:LoadBalancerName,Type:Type,DNS:DNSName,State:State.Code}' --output table

# Lambda functions
aws lambda list-functions --query 'Functions[].{Name:FunctionName,Runtime:Runtime,Memory:MemorySize}' --output table

# ECS services
aws ecs list-clusters
aws ecs list-services --cluster your-cluster

# VPCs and subnets
aws ec2 describe-vpcs --query 'Vpcs[].{ID:VpcId,CIDR:CidrBlock,Name:Tags[?Key==`Name`]|[0].Value}' --output table
```

### Docker / Docker Compose

```bash
# Running containers
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"

# Docker Compose services
docker compose ps
docker compose config --services

# Network connections between containers
docker network ls
docker network inspect bridge --format '{{range .Containers}}{{.Name}} {{end}}'
```

### Kubernetes

```bash
# All resources in a namespace
kubectl get all -n your-namespace

# Services and their endpoints
kubectl get svc -n your-namespace -o wide

# Pods with their node assignments
kubectl get pods -n your-namespace -o wide

# Ingress rules (external entry points)
kubectl get ingress -n your-namespace

# ConfigMaps (find external service URLs)
kubectl get configmaps -n your-namespace -o yaml | grep -i "host\|url\|endpoint"
```

### DigitalOcean

```bash
# Droplets
doctl compute droplet list --format ID,Name,PublicIPv4,Region,Status

# Databases
doctl databases list --format ID,Name,Engine,Region,Status

# Load balancers
doctl compute load-balancer list --format ID,Name,IP,Status

# App Platform apps
doctl apps list --format ID,Spec.Name,ActiveDeployment.Phase
```

### GCP

```bash
# Compute instances
gcloud compute instances list --format="table(name,zone,machineType,status)"

# Cloud SQL
gcloud sql instances list --format="table(name,databaseVersion,region,state)"

# Cloud Run services
gcloud run services list --format="table(service,region,url)"

# GKE clusters
gcloud container clusters list --format="table(name,location,status)"
```

### Vercel / Netlify (Serverless)

```bash
# Vercel projects
vercel ls

# Environment variables (find external service URLs)
vercel env ls

# Netlify sites
netlify sites:list
```

### Translating infrastructure to DiagramData

Once you've queried your infrastructure, map each component to a node:

| Infrastructure | Node fields |
|---------------|-------------|
| EC2 / Droplet / VM | `icon: "Server"`, `color: "emerald"` |
| Database (RDS, Cloud SQL, etc.) | `icon: "Database"`, `color: "amber"` |
| Cache (Redis, Memcached) | `icon: "Zap"`, `color: "red"` |
| Load Balancer / CDN | `icon: "Globe"`, `color: "blue"` |
| Object Storage (S3, GCS) | `icon: "HardDrive"`, `color: "cyan"` |
| AI/ML Service | `icon: "Cpu"`, `color: "violet"` |
| Auth / Security | `icon: "Lock"` or `icon: "Shield"`, `color: "pink"` |
| Message Queue / Pub-Sub | `icon: "Layers"`, `color: "orange"` |
| External API | `icon: "Cloud"`, `color: "gray"` |
| Monitoring / Logging | `icon: "Monitor"`, `color: "teal"` |

For edges, think about:
- **Data flow direction**: Which service calls which? Use `from` → `to`.
- **Protocol/label**: "HTTPS", "gRPC", "SQL queries", "pub/sub", "WebSocket"
- **Path type**: Solid lines for primary flows, `dash: "7 4"` for async/optional flows
- **Bidirectional**: Set `bidir: true` for two-way connections (e.g., WebSocket, sync)

For regions, group related services:
- VPCs, security groups, cloud provider boundaries
- Microservice clusters, Kubernetes namespaces
- "Internal" vs "External" boundaries

### Layout tips

- **ViewBox is 600x460** — place nodes in this space
- Standard node size: `w: 150, h: 48` (or `w: 160, h: 48` for longer labels)
- Keep **60-80px spacing** between nodes vertically, 40-60px horizontally
- Place load balancers / entry points at the **top**
- Place databases / storage at the **bottom**
- Place external services on the **right side**
- Use regions for cloud provider boundaries or VPCs

---

## Customization Reference

### Adding new icons

Install additional Lucide icons and add them to the `ICON_MAP` in the renderer:

```typescript
import { Container, GitBranch, MessageSquare } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  // ... existing icons
  Container, GitBranch, MessageSquare,
};
```

Then update the SYSTEM_PROMPT in the API route to include the new icon names.

### Adding new colors

Add to the `COLORS` object in `types.ts`:

```typescript
indigo: { fill: "#eef2ff", stroke: "#6366f1", text: "#4f46e5" },
lime:   { fill: "#f7fee7", stroke: "#84cc16", text: "#65a30d" },
```

### Changing the LLM model

In the API route, change the `model` field in the fetch body:

```typescript
body: JSON.stringify({ prompt, model: "claude-opus-4-6" }), // or "claude-sonnet-4-6"
```

Or switch to direct Anthropic API by uncommenting Option B in the route.

### Persisting diagrams

To save/load diagrams, store the `DiagramData` JSON in your database:

```typescript
// Save
await fetch("/api/diagrams", {
  method: "POST",
  body: JSON.stringify({ name: "Production Infra", data: diagram }),
});

// Load
const { data } = await fetch("/api/diagrams/production-infra").then(r => r.json());
setDiagram(data);
```

### CLI Wrapper setup

If you want to use the CLI wrapper approach (Claude Max plan, no per-token cost), see the `cli-wrapper/` directory in the Portsie repo for the Node.js HTTP server that proxies to the Claude CLI. It accepts `POST /extract` with `{ prompt, model }` and returns the Claude response.

Alternatively, use the Anthropic API directly with `@anthropic-ai/sdk` — uncomment Option B in the API route.
