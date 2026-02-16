"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { SchwabConnect } from "./schwab-connect";
import { AccountOverview } from "./account-overview";
import { PositionsTable } from "./positions-table";
import { HideValuesToggle } from "./hide-values-toggle";
import { UploadSection } from "./upload-section";
import { SettingsPanel } from "./settings-panel";
import { BrokerageSelection } from "./brokerage-selection";
import { BrokerageSetup } from "./brokerage-setup";
import { DashboardNav, type Tab } from "./dashboard-nav";

type OverlayView = "brokerage-select" | "brokerage-setup" | null;

export function DashboardShell({
  isConnected,
  hasCredentials,
  hasSetup,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
  hasSetup?: boolean;
}) {
  const [hideValues, setHideValues] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");
  const [overlayView, setOverlayView] = useState<OverlayView>(
    hasSetup ? null : "brokerage-select"
  );
  const [selectedBrokerage, setSelectedBrokerage] = useState<string | null>(
    null
  );

  function handleBrokerageSelect(brokerageId: string) {
    setSelectedBrokerage(brokerageId);
    setOverlayView("brokerage-setup");
  }

  function handleBackToSelection() {
    setSelectedBrokerage(null);
    setOverlayView("brokerage-select");
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setOverlayView(null);
  }

  const showOverlay = overlayView !== null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4 sm:px-6 sm:py-6 sm:space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold sm:text-xl">Dashboard</h1>
          {activeTab !== "settings" && !showOverlay && (
            <HideValuesToggle
              hideValues={hideValues}
              onToggle={() => setHideValues(!hideValues)}
            />
          )}
        </div>
        <button
          onClick={() => setOverlayView("brokerage-select")}
          className="rounded-md p-3 text-muted-foreground transition-colors hover:text-foreground sm:p-2"
          title="Add brokerage"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Tab navigation */}
      <DashboardNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        disabled={showOverlay}
      />

      {/* Content */}
      {showOverlay ? (
        <>
          {overlayView === "brokerage-select" && (
            <BrokerageSelection onSelect={handleBrokerageSelect} />
          )}
          {overlayView === "brokerage-setup" && selectedBrokerage && (
            <BrokerageSetup
              brokerageId={selectedBrokerage}
              hasCredentials={hasCredentials}
              onBack={handleBackToSelection}
            />
          )}
        </>
      ) : (
        <>
          {activeTab === "portfolio" && (
            <>
              <SchwabConnect
                isConnected={isConnected}
                hasCredentials={hasCredentials}
              />
              {isConnected && (
                <>
                  <AccountOverview hideValues={hideValues} />
                  <PositionsTable hideValues={hideValues} />
                </>
              )}
            </>
          )}

          {activeTab === "uploads" && <UploadSection />}

          {activeTab === "settings" && <SettingsPanel />}
        </>
      )}
    </div>
  );
}
