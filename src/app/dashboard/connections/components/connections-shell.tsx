"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link2, Upload } from "lucide-react";
import { SchwabConnect } from "../../components/schwab-connect";
import { UploadSection } from "../../components/upload-section";

type ConnectionsTab = "api" | "upload";

const tabs: { id: ConnectionsTab; label: string; icon: typeof Link2 }[] = [
  { id: "api", label: "API Connections", icon: Link2 },
  { id: "upload", label: "Upload", icon: Upload },
];

export function ConnectionsShell({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const [activeTab, setActiveTab] = useState<ConnectionsTab>("api");

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4 sm:px-6 sm:py-6 sm:space-y-6">
      <h1 className="text-lg font-semibold sm:text-xl">Connections</h1>

      {/* Sub-tab navigation */}
      <nav className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:py-2",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      {activeTab === "api" && (
        <SchwabConnect
          isConnected={isConnected}
          hasCredentials={hasCredentials}
        />
      )}

      {activeTab === "upload" && <UploadSection />}
    </div>
  );
}
