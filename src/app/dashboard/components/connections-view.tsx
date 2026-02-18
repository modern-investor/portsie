"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SchwabConnect } from "./schwab-connect";
import { BrokerageSelection } from "./brokerage-selection";
import { BrokerageSetup } from "./brokerage-setup";
import { UploadSection } from "./upload-section";

type ConnectionsSubTab = "institutions" | "uploads";

const SUB_TABS: { id: ConnectionsSubTab; label: string }[] = [
  { id: "institutions", label: "Institutions" },
  { id: "uploads", label: "Uploads" },
];

const STORAGE_KEY = "portsie:connections-tab";

function getStoredTab(): ConnectionsSubTab {
  if (typeof window === "undefined") return "institutions";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "institutions" || stored === "uploads") return stored;
  // Migrate old "api" value
  if (stored === "api") return "institutions";
  return "institutions";
}

type SetupView = "list" | "setup";

export function ConnectionsView({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const [subTab, setSubTab] = useState<ConnectionsSubTab>(getStoredTab);
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

      {/* Institutions sub-tab */}
      {subTab === "institutions" && (
        <div className="space-y-6">
          {setupView === "list" && (
            <>
              {(isConnected || hasCredentials) && (
                <SchwabConnect
                  isConnected={isConnected}
                  hasCredentials={hasCredentials}
                />
              )}
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
