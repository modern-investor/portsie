"use client";

import {
  Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield,
  Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box, type LucideIcon,
} from "lucide-react";
import type { DiagramData, DiagramEdge, DiagramNode, DiagramRegion } from "@/lib/archvisual/types";
import { COLORS, DEFAULT_DIAGRAM } from "@/lib/archvisual/types";
import { computeEdgePath, buildNodeMap } from "@/lib/archvisual/edge-paths";

// ─── Icon registry ───────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield,
  Server, Globe, Cloud, Lock, Wifi, Zap, Layers, Box,
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

// ─── Legend item ──────────────────────────────────────────────────────────────

function LegendLine({ color, dash, sw }: { color: string; dash?: string; sw?: number }) {
  const c = COLORS[color];
  if (!c) return null;
  return (
    <svg width={20} height={3}>
      <line x1={0} y1={1.5} x2={20} y2={1.5}
            stroke={c.stroke} strokeWidth={sw ?? 2} strokeDasharray={dash} />
    </svg>
  );
}

// ─── Main diagram ────────────────────────────────────────────────────────────

interface Props {
  data?: DiagramData;
  /** Hide the heading, legend, and privacy note (for compact embedding). */
  compact?: boolean;
}

export function DataFlowDiagram({ data, compact }: Props) {
  const d = data ?? DEFAULT_DIAGRAM;
  const nodeMap = buildNodeMap(d.nodes);

  // Collect unique edge colors for markers
  const edgeColors = [...new Set(d.edges.map((e) => e.color))];

  // Build legend entries from edges (unique by color)
  const legendEntries = d.edges.reduce<{ color: string; label: string; dash?: string; sw?: number }[]>(
    (acc, e) => {
      if (!acc.some((l) => l.color === e.color)) {
        const labels: Record<string, string> = {
          blue: "Hosted Upload", violet: "BYOB (local parse)",
          emerald: "Brokerage API", amber: "Market Prices",
        };
        acc.push({ color: e.color, label: labels[e.color] ?? e.color, dash: e.dash, sw: e.strokeWidth });
      }
      return acc;
    }, [],
  );

  return (
    <div className="w-full space-y-2">
      {!compact && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
          System Architecture
        </h4>
      )}

      <svg viewBox="0 0 600 460" className="w-full" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="System architecture diagram showing data flow paths">

        <Markers colors={edgeColors} />

        {/* Regions (background) */}
        {d.regions.map((r, i) => <Region key={i} region={r} />)}

        {/* Edges (paths + labels, behind nodes) */}
        {d.edges.map((e, i) => <Edge key={i} edge={e} nodeMap={nodeMap} />)}

        {/* Nodes (on top) */}
        {d.nodes.map((n) => <Node key={n.id} node={n} />)}
      </svg>

      {!compact && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[10px]">
            {legendEntries.map((l) => (
              <span key={l.color} className="flex items-center gap-1.5">
                <LegendLine color={l.color} dash={l.dash} sw={l.sw} />
                <span className="font-medium" style={{ color: COLORS[l.color]?.text }}>{l.label}</span>
              </span>
            ))}
          </div>

          {/* BYOB privacy note */}
          <p className="text-center text-[10px] text-gray-400 flex items-center justify-center gap-1">
            <Shield className="h-3 w-3 text-violet-400" />
            In BYOB mode, raw files never leave your device — only parsed portfolio data is sent.
          </p>
        </>
      )}
    </div>
  );
}
