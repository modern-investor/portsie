"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SchwabConnect } from "./schwab-connect";
import { BrokerageSelection } from "./brokerage-selection";
import { BrokerageSetup } from "./brokerage-setup";
import { UploadSection } from "./upload-section";

type ConnectionsSubTab = "api" | "uploads";

const SUB_TABS: { id: ConnectionsSubTab; label: string }[] = [
  { id: "api", label: "API Connections" },
  { id: "uploads", label: "Uploads" },
];

const STORAGE_KEY = "portsie:connections-tab";

function getInitialTab(): ConnectionsSubTab {
  if (typeof window === "undefined") return "api";
  // URL ?tab= param takes priority (e.g. from dashboard empty-state buttons)
  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab === "api" || urlTab === "uploads") return urlTab;
  // Fall back to localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "api" || stored === "uploads") return stored;
  return "api";
}

type SetupView = "list" | "setup";

export function ConnectionsView({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const [subTab, setSubTab] = useState<ConnectionsSubTab>(getInitialTab);
  const [setupView, setSetupView] = useState<SetupView>("list");
  const [selectedBrokerage, setSelectedBrokerage] = useState<string | null>(
    null
  );

  function handleBrokerageSelect(brokerageId: string) {
    setSelectedBrokerage(brokerageId);
    setSetupView("setup");
  }

  function handleBackToList() {
    setSelectedBrokerage(null);
    setSetupView("list");
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <nav className="flex gap-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setSubTab(tab.id);
              localStorage.setItem(STORAGE_KEY, tab.id);
              setSetupView("list");
              setSelectedBrokerage(null);
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              subTab === tab.id
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* API Connections sub-tab */}
      {subTab === "api" && (
        <div className="space-y-6">
          {setupView === "list" && (
            <>
              <SchwabConnect
                isConnected={isConnected}
                hasCredentials={hasCredentials}
              />
              <BrokerageSelection onSelect={handleBrokerageSelect} />
            </>
          )}
          {setupView === "setup" && selectedBrokerage && (
            <BrokerageSetup
              brokerageId={selectedBrokerage}
              hasCredentials={hasCredentials}
              onBack={handleBackToList}
            />
          )}
        </div>
      )}

      {/* Uploads sub-tab */}
      {subTab === "uploads" && <UploadSection />}
    </div>
  );
}
