"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PortfolioView } from "./portfolio-view";
import { HideValuesToggle } from "./hide-values-toggle";
import { ConnectionsView } from "./connections-view";
import { SettingsPanel } from "./settings-panel";
import { DashboardNav, type Tab } from "./dashboard-nav";

export function DashboardShell({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const [hideValues, setHideValues] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  function handleNavigateTab(tab: string) {
    setActiveTab(tab as Tab);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4 sm:px-6 sm:py-6 sm:space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold sm:text-xl">Dashboard</h1>
          {activeTab === "dashboard" && (
            <HideValuesToggle
              hideValues={hideValues}
              onToggle={() => setHideValues(!hideValues)}
            />
          )}
        </div>
        <button
          onClick={() => setActiveTab("connections")}
          className="rounded-md p-3 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
          title="Add brokerage"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Tab navigation */}
      <DashboardNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content */}
      {activeTab === "dashboard" && (
        <PortfolioView
          hideValues={hideValues}
          onNavigateTab={handleNavigateTab}
        />
      )}

      {activeTab === "connections" && (
        <ConnectionsView
          isConnected={isConnected}
          hasCredentials={hasCredentials}
        />
      )}

      {activeTab === "settings" && <SettingsPanel />}
    </div>
  );
}
