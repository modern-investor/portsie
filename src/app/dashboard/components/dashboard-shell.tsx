"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortfolioView } from "./portfolio-view";
import { HideValuesToggle } from "./hide-values-toggle";

export function DashboardShell({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const [hideValues, setHideValues] = useState(false);
  const router = useRouter();

  function handleNavigateTab(tab: string) {
    if (tab.startsWith("connections")) {
      const subTab = tab.split(":")[1];
      const url = subTab
        ? `/dashboard/connections?tab=${subTab}`
        : "/dashboard/connections";
      router.push(url);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4 sm:px-6 sm:py-6 sm:space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">Dashboard</h1>
        <HideValuesToggle
          hideValues={hideValues}
          onToggle={() => setHideValues(!hideValues)}
        />
      </div>

      {/* Content */}
      <PortfolioView
        hideValues={hideValues}
        onNavigateTab={handleNavigateTab}
      />
    </div>
  );
}
