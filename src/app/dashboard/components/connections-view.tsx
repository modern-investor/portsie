"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Upload } from "lucide-react";
import { SchwabConnect } from "./schwab-connect";
import { BrokerageSelection } from "./brokerage-selection";
import { BrokerageSetup } from "./brokerage-setup";
import { UploadSection } from "./upload-section";

type ConnectionsSubTab = "datalinks" | "uploads";

const STORAGE_KEY = "portsie:connections-tab";

function getStoredTab(): ConnectionsSubTab {
  if (typeof window === "undefined") return "datalinks";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "datalinks" || stored === "uploads") return stored;
  // Migrate old values
  if (stored === "api" || stored === "institutions") return "datalinks";
  return "datalinks";
}

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
    urlTab === "datalinks" || urlTab === "uploads"
      ? urlTab
      : urlTab === "institutions"
        ? "datalinks"
        : getStoredTab();
  const [subTab, setSubTab] = useState<ConnectionsSubTab>(initialTab);
  const [setupView, setSetupView] = useState<SetupView>("list");
  const [pendingUploadCount, setPendingUploadCount] = useState(0);

  // Sync tab when URL search params change (e.g. client-side navigation)
  useEffect(() => {
    if (urlTab === "datalinks" || urlTab === "uploads") {
      setSubTab(urlTab);
    } else if (urlTab === "institutions") {
      setSubTab("datalinks");
    }
  }, [urlTab]);

  // Fetch pending/processing upload count for badge
  useEffect(() => {
    fetch("/api/upload")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const count = Array.isArray(data)
          ? data.filter((u: { parse_status: string }) =>
              u.parse_status === "pending" || u.parse_status === "processing"
            ).length
          : 0;
        setPendingUploadCount(count);
      })
      .catch(() => {});
  }, []);

  const [selectedBrokerage, setSelectedBrokerage] = useState<string | null>(
    null
  );

  function handleTabChange(tab: ConnectionsSubTab) {
    setSubTab(tab);
    localStorage.setItem(STORAGE_KEY, tab);
    setSetupView("list");
    setSelectedBrokerage(null);
  }

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
      {/* Tab selectors */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => handleTabChange("datalinks")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
            subTab === "datalinks"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Link2 className="h-4 w-4" />
          Connect Data Feed
        </button>

        <button
          onClick={() => handleTabChange("uploads")}
          className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
            subTab === "uploads"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload Statements &amp; Reports
          {pendingUploadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">
              {pendingUploadCount}
            </span>
          )}
        </button>
      </div>

      {/* Data Links content */}
      {subTab === "datalinks" && (
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

      {/* Uploads content */}
      {subTab === "uploads" && <UploadSection />}
    </div>
  );
}
