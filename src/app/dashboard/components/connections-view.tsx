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
      {/* Large card-style tab selectors */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleTabChange("datalinks")}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 px-4 py-8 text-center transition-all ${
            subTab === "datalinks"
              ? "border-gray-900 bg-black text-white shadow-md"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:shadow-sm"
          }`}
        >
          <Link2 className="h-6 w-6" />
          <span className="text-base font-semibold">Connect Data Feed</span>
          <span
            className={`text-xs ${subTab === "datalinks" ? "text-gray-300" : "text-gray-400"}`}
          >
            Link brokerages &amp; banks via API
          </span>
        </button>

        <button
          onClick={() => handleTabChange("uploads")}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 px-4 py-8 text-center transition-all ${
            subTab === "uploads"
              ? "border-gray-900 bg-black text-white shadow-md"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:shadow-sm"
          }`}
        >
          {pendingUploadCount > 0 && (
            <span className="absolute top-3 right-3 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">
              {pendingUploadCount}
            </span>
          )}
          <Upload className="h-6 w-6" />
          <span className="text-base font-semibold">
            Upload Statements &amp; Reports
          </span>
          <span
            className={`text-xs ${subTab === "uploads" ? "text-gray-300" : "text-gray-400"}`}
          >
            PDF, CSV, Excel, images &amp; more
          </span>
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
