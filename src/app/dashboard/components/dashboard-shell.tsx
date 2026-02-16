"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { SiteVersion } from "@/components/site-version";
import { SchwabConnect } from "./schwab-connect";
import { AccountOverview } from "./account-overview";
import { PositionsTable } from "./positions-table";
import { HideValuesToggle } from "./hide-values-toggle";
import { UploadSection } from "./upload-section";
import { SettingsPanel } from "./settings-panel";
import { BrokerageSelection } from "./brokerage-selection";
import { BrokerageSetup } from "./brokerage-setup";

type View = "portfolio" | "settings" | "brokerage-select" | "brokerage-setup";

export function DashboardShell({
  isConnected,
  hasCredentials,
  userEmail,
  isAdmin,
  hasSetup,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
  userEmail: string;
  isAdmin?: boolean;
  hasSetup?: boolean;
}) {
  const [hideValues, setHideValues] = useState(false);
  const [view, setView] = useState<View>(
    hasSetup ? "portfolio" : "brokerage-select"
  );
  const [selectedBrokerage, setSelectedBrokerage] = useState<string | null>(
    null
  );

  function handleBrokerageSelect(brokerageId: string) {
    setSelectedBrokerage(brokerageId);
    setView("brokerage-setup");
  }

  function handleBackToSelection() {
    setSelectedBrokerage(null);
    setView("brokerage-select");
  }

  const showPortfolioControls = view === "portfolio" || view === "settings";

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {view === "portfolio" && (
            <HideValuesToggle
              hideValues={hideValues}
              onToggle={() => setHideValues(!hideValues)}
            />
          )}
          <SiteVersion className="text-gray-400" />
        </div>
        <div className="flex items-center gap-3">
          {showPortfolioControls && (
            <>
              {/* Connect brokerage */}
              <button
                onClick={() => setView("brokerage-select")}
                className="rounded-md p-2 text-gray-400 transition-colors hover:text-gray-600"
                title="Connect brokerage"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
              {/* Settings toggle */}
              <button
                onClick={() =>
                  setView(view === "settings" ? "portfolio" : "settings")
                }
                className={`rounded-md p-2 transition-colors ${
                  view === "settings"
                    ? "bg-gray-200 text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title={
                  view === "settings" ? "Back to portfolio" : "Settings"
                }
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Admin
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>
      <p className="text-sm text-gray-600">Logged in as: {userEmail}</p>

      {view === "brokerage-select" && (
        <BrokerageSelection onSelect={handleBrokerageSelect} />
      )}

      {view === "brokerage-setup" && selectedBrokerage && (
        <BrokerageSetup
          brokerageId={selectedBrokerage}
          hasCredentials={hasCredentials}
          onBack={handleBackToSelection}
        />
      )}

      {view === "portfolio" && (
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

          <UploadSection />
        </>
      )}

      {view === "settings" && <SettingsPanel />}
    </div>
  );
}
