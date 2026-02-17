"use client";

import { BarChart3, Link2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "dashboard" | "connections" | "settings";

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function DashboardNav({
  activeTab,
  onTabChange,
  disabled,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  disabled?: boolean;
}) {
  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = !disabled && activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:py-2",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
