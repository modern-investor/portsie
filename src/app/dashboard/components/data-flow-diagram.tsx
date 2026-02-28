"use client";

import { Monitor, HardDrive, Cpu, Database, Landmark, TrendingUp, Shield } from "lucide-react";

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  blue:    { fill: "#eff6ff", stroke: "#3b82f6", text: "#2563eb" },
  violet:  { fill: "#f5f3ff", stroke: "#8b5cf6", text: "#7c3aed" },
  emerald: { fill: "#ecfdf5", stroke: "#10b981", text: "#059669" },
  amber:   { fill: "#fffbeb", stroke: "#f59e0b", text: "#d97706" },
  gray:    { fill: "#f9fafb", stroke: "#9ca3af", text: "#374151" },
} as const;

// ─── Entity node ─────────────────────────────────────────────────────────────

function Node({
  x, y, w, h, label, sub, icon, color,
}: {
  x: number; y: number; w: number; h: number;
  label: string; sub?: string;
  icon: React.ReactNode; color: keyof typeof C;
}) {
  const c = C[color];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8}
            fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
      <foreignObject x={x + 8} y={y + (h - 20) / 2} width={20} height={20}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, color: c.stroke }}>
          {icon}
        </div>
      </foreignObject>
      <text x={x + 32} y={sub ? y + h / 2 - 3 : y + h / 2 + 1}
            fontSize={11} fontWeight={600} fill={c.text}
            dominantBaseline="middle">{label}</text>
      {sub && (
        <text x={x + 32} y={y + h / 2 + 10}
              fontSize={8.5} fill="#9ca3af"
              dominantBaseline="middle">{sub}</text>
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

// ─── Arrow markers ───────────────────────────────────────────────────────────

function Markers() {
  return (
    <defs>
      {(["blue", "violet", "emerald", "amber"] as const).map((k) => (
        <marker key={k} id={`ah-${k}`} viewBox="0 0 10 7" refX="9" refY="3.5"
                markerWidth="7" markerHeight="5" orient="auto-start-reverse">
          <polygon points="0 0, 10 3.5, 0 7" fill={C[k].stroke} />
        </marker>
      ))}
    </defs>
  );
}

// ─── Main diagram ────────────────────────────────────────────────────────────

export function DataFlowDiagram() {
  // Node positions: [x, y, w, h]
  const device:    [number, number, number, number] = [222, 20, 156, 48];
  const storage:   [number, number, number, number] = [32,  150, 150, 48];
  const llm:       [number, number, number, number] = [32,  270, 150, 48];
  const db:        [number, number, number, number] = [210, 390, 180, 48];
  const brokerage: [number, number, number, number] = [418, 150, 150, 48];
  const market:    [number, number, number, number] = [418, 320, 150, 48];

  return (
    <div className="w-full space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
        System Architecture
      </h4>

      <svg viewBox="0 0 600 460" className="w-full" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="System architecture diagram showing data flow paths">

        <Markers />

        {/* ── Portsie Cloud boundary (subtle background for hosted services) ── */}
        <rect x={18} y={125} width={178} height={210} rx={12}
              fill="#f0f7ff" fillOpacity={0.5} stroke="#bfdbfe" strokeWidth={1}
              strokeDasharray="4 3" />
        <text x={107} y={140} fontSize={8} fontWeight={600} fill={C.blue.text}
              textAnchor="middle" letterSpacing={1.2} opacity={0.55}>PORTSIE CLOUD</text>

        {/* ══════════════════════════════════════════════════════════════════════
            PATHS  (rendered before nodes so nodes sit on top)
           ══════════════════════════════════════════════════════════════════════ */}

        {/* P1  HOSTED: Device → Storage */}
        <path d="M 260 68 C 220 100, 130 110, 107 150"
              stroke={C.blue.stroke} strokeWidth={2} fill="none"
              markerEnd="url(#ah-blue)" />
        <Label x={170} y={98} text="raw files" color={C.blue.text} />

        {/* P2  HOSTED: Storage → LLM */}
        <path d="M 107 198 L 107 270"
              stroke={C.blue.stroke} strokeWidth={2} fill="none"
              markerEnd="url(#ah-blue)" />
        <Label x={75} y={234} text="extract" color={C.blue.text} />

        {/* P3  HOSTED: LLM → Database */}
        <path d="M 182 294 C 220 300, 250 340, 265 390"
              stroke={C.blue.stroke} strokeWidth={2} fill="none"
              markerEnd="url(#ah-blue)" />
        <Label x={215} y={342} text="structured data" color={C.blue.text} />

        {/* P4  BYOB: Device → Database (direct, dashed — bypasses storage & LLM) */}
        <path d="M 300 68 C 305 160, 305 290, 300 390"
              stroke={C.violet.stroke} strokeWidth={2} fill="none"
              strokeDasharray="7 4" markerEnd="url(#ah-violet)" />
        <Label x={330} y={225} text="structured data only" color={C.violet.text} rotate={-88} />

        {/* P5  API: Device → Brokerage */}
        <path d="M 345 68 C 390 95, 470 110, 493 150"
              stroke={C.emerald.stroke} strokeWidth={2} fill="none"
              markerEnd="url(#ah-emerald)" />
        <Label x={430} y={98} text="OAuth" color={C.emerald.text} />

        {/* P6  API: Brokerage ↔ Database (bidirectional) */}
        <path d="M 493 198 C 493 270, 420 350, 375 390"
              stroke={C.emerald.stroke} strokeWidth={2} fill="none"
              markerEnd="url(#ah-emerald)" markerStart="url(#ah-emerald)" />
        <Label x={460} y={280} text="auto-sync" color={C.emerald.text} />

        {/* P7  Market → Database */}
        <path d="M 418 345 C 400 365, 385 380, 370 395"
              stroke={C.amber.stroke} strokeWidth={1.5} fill="none"
              strokeDasharray="4 3" markerEnd="url(#ah-amber)" />
        <Label x={400} y={378} text="prices" color={C.amber.text} />

        {/* ══════════════════════════════════════════════════════════════════════
            NODES  (rendered last so they sit on top of paths)
           ══════════════════════════════════════════════════════════════════════ */}

        <Node x={device[0]} y={device[1]} w={device[2]} h={device[3]}
              label="Your Device" sub="Browser"
              icon={<Monitor style={{ width: 16, height: 16 }} />}
              color="gray" />

        <Node x={storage[0]} y={storage[1]} w={storage[2]} h={storage[3]}
              label="Cloud Storage" sub="Supabase Storage"
              icon={<HardDrive style={{ width: 16, height: 16 }} />}
              color="blue" />

        <Node x={llm[0]} y={llm[1]} w={llm[2]} h={llm[3]}
              label="LLM Service" sub="Gemini / Claude"
              icon={<Cpu style={{ width: 16, height: 16 }} />}
              color="blue" />

        <Node x={db[0]} y={db[1]} w={db[2]} h={db[3]}
              label="Portfolio Database" sub="Supabase PostgreSQL"
              icon={<Database style={{ width: 16, height: 16 }} />}
              color="gray" />

        <Node x={brokerage[0]} y={brokerage[1]} w={brokerage[2]} h={brokerage[3]}
              label="Brokerage" sub="Charles Schwab"
              icon={<Landmark style={{ width: 16, height: 16 }} />}
              color="emerald" />

        <Node x={market[0]} y={market[1]} w={market[2]} h={market[3]}
              label="Market Data" sub="Finnhub / Alpha Vantage"
              icon={<TrendingUp style={{ width: 16, height: 16 }} />}
              color="amber" />

      </svg>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[10px]">
        <span className="flex items-center gap-1.5">
          <svg width={20} height={3}><line x1={0} y1={1.5} x2={20} y2={1.5} stroke={C.blue.stroke} strokeWidth={2} /></svg>
          <span className="font-medium text-blue-700">Hosted Upload</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={3}><line x1={0} y1={1.5} x2={20} y2={1.5} stroke={C.violet.stroke} strokeWidth={2} strokeDasharray="4 2" /></svg>
          <span className="font-medium text-violet-700">BYOB (local parse)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={3}><line x1={0} y1={1.5} x2={20} y2={1.5} stroke={C.emerald.stroke} strokeWidth={2} /></svg>
          <span className="font-medium text-emerald-700">Brokerage API</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={3}><line x1={0} y1={1.5} x2={20} y2={1.5} stroke={C.amber.stroke} strokeWidth={1.5} strokeDasharray="3 2" /></svg>
          <span className="font-medium text-amber-700">Market Prices</span>
        </span>
      </div>

      {/* ── BYOB privacy note ── */}
      <p className="text-center text-[10px] text-gray-400 flex items-center justify-center gap-1">
        <Shield className="h-3 w-3 text-violet-400" />
        In BYOB mode, raw files never leave your device — only parsed portfolio data is sent.
      </p>
    </div>
  );
}
