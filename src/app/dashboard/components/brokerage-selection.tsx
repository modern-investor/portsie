"use client";

import { BROKERAGES, type BrokerageInfo } from "@/lib/brokerage/types";
import { Badge } from "@/components/ui/badge";
import { BrokerageLogo } from "@/components/brokerage-logo";

function BrokerageCard({
  brokerage,
  index,
  onSelect,
}: {
  brokerage: BrokerageInfo;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="flex items-start gap-4 rounded-xl border bg-white p-4 text-left transition-all hover:border-gray-400 hover:shadow-md"
    >
      <BrokerageLogo
        domain={brokerage.logoDomain}
        name={brokerage.name}
        placeholder={brokerage.logoPlaceholder}
        colorIndex={index}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900">{brokerage.name}</p>
          {brokerage.hasApiSupport && (
            <Badge variant="secondary" className="text-xs">
              API
            </Badge>
          )}
        </div>
        {brokerage.parentCompany && (
          <p className="text-xs text-gray-400">{brokerage.parentCompany}</p>
        )}
        <p className="mt-0.5 text-sm text-gray-500">{brokerage.description}</p>
      </div>
    </button>
  );
}

export function BrokerageSelection({
  onSelect,
}: {
  onSelect: (brokerageId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Select Your Brokerage
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose your brokerage to connect your portfolio or upload statements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BROKERAGES.map((brokerage, i) => (
          <BrokerageCard
            key={brokerage.id}
            brokerage={brokerage}
            index={i}
            onSelect={() => onSelect(brokerage.id)}
          />
        ))}
      </div>
    </div>
  );
}
