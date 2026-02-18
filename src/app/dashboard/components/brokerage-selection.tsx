"use client";

import { useState } from "react";
import {
  getBrokerages,
  getBanks,
  type BrokerageInfo,
  type ConnectionMethod,
} from "@/lib/brokerage/types";
import { Badge } from "@/components/ui/badge";
import { BrokerageLogo } from "@/components/brokerage-logo";
import { Building2, Briefcase, ChevronDown, ChevronUp } from "lucide-react";

const GENERIC_IDS = new Set(["other-bank", "other-brokerage"]);

const METHOD_BADGE: Record<
  ConnectionMethod,
  { label: string; className: string }
> = {
  api: { label: "API", className: "bg-green-100 text-green-700" },
  quiltt: { label: "Link", className: "bg-blue-100 text-blue-700" },
  upload: { label: "Upload", className: "bg-gray-100 text-gray-600" },
};

function InstitutionCard({
  brokerage,
  index,
  onSelect,
}: {
  brokerage: BrokerageInfo;
  index: number;
  onSelect: () => void;
}) {
  const isGeneric = GENERIC_IDS.has(brokerage.id);
  // Show badges for non-upload methods (upload is always implied)
  const visibleMethods = brokerage.connectionMethods.filter(
    (m) => m !== "upload"
  );

  return (
    <button
      onClick={onSelect}
      className={`flex items-start gap-4 rounded-xl border p-4 text-left transition-all hover:border-gray-400 hover:shadow-md ${
        isGeneric
          ? "border-dashed border-gray-300 bg-gray-50"
          : "bg-white"
      }`}
    >
      {isGeneric ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-200">
          {brokerage.category === "bank" ? (
            <Building2 className="size-5 text-gray-500" />
          ) : (
            <Briefcase className="size-5 text-gray-500" />
          )}
        </div>
      ) : (
        <BrokerageLogo
          domain={brokerage.logoDomain}
          name={brokerage.name}
          placeholder={brokerage.logoPlaceholder}
          colorIndex={index}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900">{brokerage.name}</p>
          {visibleMethods.map((method) => {
            const badge = METHOD_BADGE[method];
            return (
              <Badge
                key={method}
                variant="secondary"
                className={`text-xs ${badge.className}`}
              >
                {badge.label}
              </Badge>
            );
          })}
        </div>
        {brokerage.parentCompany && (
          <p className="text-xs text-gray-400">{brokerage.parentCompany}</p>
        )}
        <p className="mt-0.5 text-sm text-gray-500">
          {brokerage.description}
        </p>
      </div>
    </button>
  );
}

function SectionToggle({
  expanded,
  count,
  label,
}: {
  expanded: boolean;
  count: number;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-50">
      {expanded ? (
        <>
          Hide
          <ChevronUp className="size-4" />
        </>
      ) : (
        <>
          Show {count} {label}
          <ChevronDown className="size-4" />
        </>
      )}
    </div>
  );
}

export function BrokerageSelection({
  onSelect,
}: {
  onSelect: (brokerageId: string) => void;
}) {
  const brokerages = getBrokerages();
  const banks = getBanks();
  const [showBrokerages, setShowBrokerages] = useState(true);
  const [showBanks, setShowBanks] = useState(true);

  return (
    <div className="space-y-8">
      {/* Brokerages — collapsible */}
      <div className="space-y-4">
        <button
          onClick={() => setShowBrokerages((prev) => !prev)}
          className="flex w-full items-center gap-4"
        >
          <SectionToggle
            expanded={showBrokerages}
            count={brokerages.length}
            label="brokerages"
          />
          <div className="text-left">
            <h2 className="text-xl font-bold text-gray-900">Brokerages</h2>
            <p className="mt-1 text-sm text-gray-500">
              Connect your brokerage via API, account linking, or file upload.
            </p>
          </div>
        </button>

        {showBrokerages && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {brokerages.map((b, i) => (
              <InstitutionCard
                key={b.id}
                brokerage={b}
                index={i}
                onSelect={() => onSelect(b.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Banks — collapsible */}
      <div className="space-y-4">
        <button
          onClick={() => setShowBanks((prev) => !prev)}
          className="flex w-full items-center gap-4"
        >
          <SectionToggle
            expanded={showBanks}
            count={banks.length}
            label="banks"
          />
          <div className="text-left">
            <h2 className="text-xl font-bold text-gray-900">Banks</h2>
            <p className="mt-1 text-sm text-gray-500">
              Link your bank accounts to track cash, deposits, and balances.
            </p>
          </div>
        </button>

        {showBanks && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {banks.map((b, i) => (
              <InstitutionCard
                key={b.id}
                brokerage={b}
                index={i + brokerages.length}
                onSelect={() => onSelect(b.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
