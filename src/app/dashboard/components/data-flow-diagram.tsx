"use client";

import { Upload, Link2, Shield, Monitor, Cloud, Landmark, Database, ArrowRight } from "lucide-react";

// ─── Shared pieces ──────────────────────────────────────────────────────────

function FlowArrow({ label, color }: { label: string; color: string }) {
  const arrowColor: Record<string, string> = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
  };
  const textColor: Record<string, string> = {
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    violet: "text-violet-600",
  };
  return (
    <div className="flex flex-col items-center gap-0.5 px-1">
      <span className={`text-[10px] font-medium leading-tight ${textColor[color]}`}>
        {label}
      </span>
      <div className="flex items-center">
        <div className={`h-px w-6 sm:w-10 ${arrowColor[color]} bg-current`} />
        <ArrowRight className={`h-3 w-3 -ml-1 ${arrowColor[color]}`} />
      </div>
    </div>
  );
}

function BiArrow({ label, color }: { label: string; color: string }) {
  const arrowColor: Record<string, string> = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
  };
  const textColor: Record<string, string> = {
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    violet: "text-violet-600",
  };
  return (
    <div className="flex flex-col items-center gap-0.5 px-1">
      <span className={`text-[10px] font-medium leading-tight text-center ${textColor[color]}`}>
        {label}
      </span>
      <div className="flex items-center">
        <ArrowRight className={`h-3 w-3 rotate-180 ${arrowColor[color]}`} />
        <div className={`h-px w-4 sm:w-8 ${arrowColor[color]} bg-current`} />
        <ArrowRight className={`h-3 w-3 -ml-0.5 ${arrowColor[color]}`} />
      </div>
    </div>
  );
}

function NodeBox({
  icon,
  label,
  sublabel,
  bg,
  border,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  bg: string;
  border: string;
  iconColor: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-lg border ${border} ${bg} px-2.5 py-2 min-w-[72px] sm:min-w-[88px]`}
    >
      <div className={iconColor}>{icon}</div>
      <span className="text-[11px] font-semibold text-gray-800 leading-tight text-center">
        {label}
      </span>
      {sublabel && (
        <span className="text-[9px] text-gray-400 leading-tight text-center max-w-[80px]">
          {sublabel}
        </span>
      )}
    </div>
  );
}

function TrackLabel({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  const bg: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${bg[color]}`}
    >
      {label}
    </span>
  );
}

// ─── Main diagram ───────────────────────────────────────────────────────────

export function DataFlowDiagram() {
  return (
    <div className="w-full space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
        How your data flows
      </h4>

      {/* Track 1: Upload */}
      <div className="flex items-center justify-center gap-1 flex-wrap sm:flex-nowrap">
        <TrackLabel label="Upload" color="blue" />
        <NodeBox
          icon={<Monitor className="h-4 w-4" />}
          label="Your Device"
          sublabel="PDF, CSV, Excel"
          bg="bg-blue-50"
          border="border-blue-200"
          iconColor="text-blue-500"
        />
        <FlowArrow label="Files sent" color="blue" />
        <NodeBox
          icon={<Cloud className="h-4 w-4" />}
          label="Portsie"
          sublabel="Parse & classify"
          bg="bg-blue-50"
          border="border-blue-200"
          iconColor="text-blue-500"
        />
        <FlowArrow label="Stored" color="blue" />
        <NodeBox
          icon={<Database className="h-4 w-4" />}
          label="Portfolio"
          bg="bg-blue-50"
          border="border-blue-200"
          iconColor="text-blue-500"
        />
      </div>

      {/* Track 2: API Connection */}
      <div className="flex items-center justify-center gap-1 flex-wrap sm:flex-nowrap">
        <TrackLabel label="API" color="emerald" />
        <NodeBox
          icon={<Monitor className="h-4 w-4" />}
          label="Your Device"
          sublabel="Authorize once"
          bg="bg-emerald-50"
          border="border-emerald-200"
          iconColor="text-emerald-500"
        />
        <FlowArrow label="Auth" color="emerald" />
        <NodeBox
          icon={<Cloud className="h-4 w-4" />}
          label="Portsie"
          sublabel="Sync engine"
          bg="bg-emerald-50"
          border="border-emerald-200"
          iconColor="text-emerald-500"
        />
        <BiArrow label="Auto-sync" color="emerald" />
        <NodeBox
          icon={<Landmark className="h-4 w-4" />}
          label="Brokerage"
          sublabel="Positions & txns"
          bg="bg-emerald-50"
          border="border-emerald-200"
          iconColor="text-emerald-500"
        />
      </div>

      {/* Track 3: BYOB (Local Processing) */}
      <div className="flex items-center justify-center gap-1 flex-wrap sm:flex-nowrap">
        <TrackLabel label="BYOB" color="violet" />
        <NodeBox
          icon={
            <div className="relative">
              <Monitor className="h-4 w-4" />
              <Shield className="h-2.5 w-2.5 absolute -top-1 -right-1.5 text-violet-600" />
            </div>
          }
          label="Your Device"
          sublabel="Parse locally"
          bg="bg-violet-50"
          border="border-violet-200"
          iconColor="text-violet-500"
        />
        <FlowArrow label="Summary only" color="violet" />
        <NodeBox
          icon={<Cloud className="h-4 w-4" />}
          label="Portsie"
          sublabel="No raw files"
          bg="bg-violet-50"
          border="border-violet-200"
          iconColor="text-violet-500"
        />
        <FlowArrow label="Stored" color="violet" />
        <NodeBox
          icon={<Database className="h-4 w-4" />}
          label="Portfolio"
          bg="bg-violet-50"
          border="border-violet-200"
          iconColor="text-violet-500"
        />
      </div>

      {/* BYOB privacy note */}
      <p className="text-center text-[10px] text-gray-400 flex items-center justify-center gap-1">
        <Shield className="h-3 w-3 text-violet-400" />
        In BYOB mode, raw files never leave your device — only parsed portfolio data is sent.
      </p>
    </div>
  );
}
