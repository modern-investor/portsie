"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { SiteVersion } from "@/components/site-version";
import { SchwabConnect } from "./schwab-connect";
import { AccountOverview } from "./account-overview";
import { PositionsTable } from "./positions-table";
import { HideValuesToggle } from "./hide-values-toggle";

export function DashboardShell({
  isConnected,
  hasCredentials,
  userEmail,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
  userEmail: string;
}) {
  const [hideValues, setHideValues] = useState(false);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <HideValuesToggle
            hideValues={hideValues}
            onToggle={() => setHideValues(!hideValues)}
          />
          <SiteVersion className="text-gray-400" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Admin
          </Link>
          <LogoutButton />
        </div>
      </div>
      <p className="text-sm text-gray-600">Logged in as: {userEmail}</p>

      <SchwabConnect isConnected={isConnected} hasCredentials={hasCredentials} />

      {isConnected && (
        <>
          <AccountOverview hideValues={hideValues} />
          <PositionsTable hideValues={hideValues} />
        </>
      )}
    </div>
  );
}
