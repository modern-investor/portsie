"use client";

import { useState } from "react";
import {
  Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield,
  Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box, User, Building2,
  type LucideIcon,
} from "lucide-react";
import type { DiagramData, DiagramEdge, DiagramNode, DiagramRegion } from "@/lib/archvisual/types";
import { COLORS, HOSTED_DIAGRAM, BYOB_DIAGRAM } from "@/lib/archvisual/types";
import { computeEdgePath, buildNodeMap } from "@/lib/archvisual/edge-paths";

// ─── Icon registry ───────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield,
  Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box, User, Building2,
};

function getIcon(name: string) {
  return ICON_MAP[name] ?? Box;
}

// ─── Entity node ─────────────────────────────────────────────────────────────

function Node({ node }: { node: DiagramNode }) {
  const c = COLORS[node.color] ?? COLORS.gray;
  const Icon = getIcon(node.icon);
  return (
    <g>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={8}
            fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
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

// ─── Edge label on white pill ────────────────────────────────────────────────

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

// ─── Edge (path + label) ─────────────────────────────────────────────────────

function Edge({ edge, nodeMap }: { edge: DiagramEdge; nodeMap: Map<string, DiagramNode> }) {
  const c = COLORS[edge.color] ?? COLORS.gray;
  const sw = edge.strokeWidth ?? 2;
  const colorKey = edge.color;

  // Resolve path: use explicit path or compute from node positions
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

// ─── Region boundary ─────────────────────────────────────────────────────────

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

// ─── Arrow markers ───────────────────────────────────────────────────────────

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

// ─── SVG renderer ────────────────────────────────────────────────────────────

function DiagramSVG({ d }: { d: DiagramData }) {
  const nodeMap = buildNodeMap(d.nodes);
  const edgeColors = [...new Set(d.edges.map((e) => e.color))];

  return (
    <svg viewBox="0 0 600 460" className="w-full" preserveAspectRatio="xMidYMid meet"
         role="img" aria-label="System architecture diagram showing data flow paths">
      <Markers colors={edgeColors} />
      {d.regions.map((r, i) => <Region key={i} region={r} />)}
      {d.edges.map((e, i) => <Edge key={i} edge={e} nodeMap={nodeMap} />)}
      {d.nodes.map((n) => <Node key={n.id} node={n} />)}
    </svg>
  );
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  {
    id: "hosted" as const,
    label: "Hosted Cloud",
    sub: "Infrastructure controlled by Portsie",
    icon: Building2,
    diagram: HOSTED_DIAGRAM,
    accent: "blue" as const,
  },
  {
    id: "byob" as const,
    label: "Self-Hosted (BYOB)",
    sub: "Your servers, your keys, your data",
    icon: User,
    diagram: BYOB_DIAGRAM,
    accent: "violet" as const,
  },
];

// ─── Main diagram ────────────────────────────────────────────────────────────

interface Props {
  data?: DiagramData;
  /** Hide the heading, legend, and privacy note (for compact embedding). */
  compact?: boolean;
}

export function DataFlowDiagram({ data, compact }: Props) {
  const [activeTab, setActiveTab] = useState<"hosted" | "byob">("hosted");

  // If data is explicitly provided (archvisual editor), render it directly — no tabs
  if (data) {
    return (
      <div className="w-full space-y-2">
        {!compact && (
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
            System Architecture
          </h4>
        )}
        <DiagramSVG d={data} />
      </div>
    );
  }

  // Dashboard mode: show tabs to switch between HOSTED and BYOB
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const accentColors = COLORS[current.accent];

  return (
    <div className="w-full space-y-3">
      {!compact && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
          System Architecture
        </h4>
      )}

      <DiagramSVG d={current.diagram} />

      {!compact && (
        <>
          {/* Tab switcher */}
          <div className="flex items-center justify-center gap-2">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.icon;
              const tc = COLORS[tab.accent];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-left transition-all ${
                    isActive
                      ? "shadow-sm"
                      : "bg-gray-50 hover:bg-gray-100 opacity-60 hover:opacity-90"
                  }`}
                  style={isActive ? {
                    backgroundColor: tc?.fill,
                    boxShadow: `0 0 0 2px ${tc?.stroke}40`,
                  } : undefined}
                >
                  <div
                    className="flex items-center justify-center rounded-md p-1.5"
                    style={isActive ? { backgroundColor: `${tc?.stroke}18`, color: tc?.stroke } : { color: "#9ca3af" }}
                  >
                    <TabIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={isActive ? { color: tc?.text } : { color: "#6b7280" }}>
                      {tab.label}
                    </div>
                    <div className="text-[10px]" style={{ color: isActive ? tc?.text : "#9ca3af" }}>
                      {tab.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Privacy note for BYOB */}
          {activeTab === "byob" && (
            <p className="text-center text-[10px] text-gray-400 flex items-center justify-center gap-1">
              <Shield className="h-3 w-3 text-violet-400" />
              In BYOB mode, raw files never leave your device — only parsed portfolio data is sent.
            </p>
          )}
        </>
      )}
    </div>
  );
}
