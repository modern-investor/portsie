"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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

type SetupView = "list" | "setup";

export function ConnectionsView({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: ConnectionsSubTab =
    urlTab === "api" || urlTab === "uploads"
      ? urlTab
      : typeof window !== "undefined"
        ? ((localStorage.getItem(STORAGE_KEY) as ConnectionsSubTab) ?? "api")
        : "api";
  const [subTab, setSubTab] = useState<ConnectionsSubTab>(initialTab);
  const [setupView, setSetupView] = useState<SetupView>("list");

  // Sync tab when URL search params change (e.g. client-side navigation)
  useEffect(() => {
    if (urlTab === "api" || urlTab === "uploads") {
      setSubTab(urlTab);
    }
  }, [urlTab]);
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
    <div className="space-y-6">
      {/* Tabs */}
      <nav className="flex border-b border-gray-200">
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
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              subTab === tab.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
