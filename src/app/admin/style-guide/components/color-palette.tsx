"use client";

import { useState } from "react";
import type { StyleGuideColors } from "@/lib/style-guide/types";

const COLOR_GROUPS: { label: string; keys: (keyof StyleGuideColors)[] }[] = [
  {
    label: "Brand",
    keys: ["primary", "secondary", "accent"],
  },
  {
    label: "UI",
    keys: ["background", "foreground", "muted", "muted_foreground", "border"],
  },
  {
    label: "Feedback",
    keys: ["success", "warning", "error"],
  },
  {
    label: "Dark Mode",
    keys: ["dark_background", "dark_foreground"],
  },
];

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

function Swatch({
  name,
  hex,
}: {
  name: string;
  hex: string;
}) {
  const [copied, setCopied] = useState(false);
  const textColor = isLight(hex) ? "#171717" : "#ffffff";

  function handleClick() {
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleClick}
      className="flex flex-col justify-between rounded-lg p-3 text-left transition-shadow hover:shadow-md"
      style={{
        backgroundColor: hex,
        color: textColor,
        minHeight: "80px",
      }}
    >
      <span className="text-xs font-medium opacity-80">
        {name.replace(/_/g, " ")}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono">{hex}</span>
        {copied && (
          <span className="text-xs font-medium">Copied!</span>
        )}
      </div>
    </button>
  );
}

export function ColorPalette({ colors }: { colors: StyleGuideColors }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Colors</h2>
      <div className="space-y-6">
        {COLOR_GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              {group.label}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.keys.map((key) => (
                <Swatch key={key} name={key} hex={colors[key]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
