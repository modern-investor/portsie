"use client";

import { useState, useEffect } from "react";
import type { AccountMatch, DetectedAccountInfo } from "@/lib/upload/types";
import type { Entity } from "@/lib/entities/types";

export function AccountLinkModal({
  accountMatches,
  detectedInfo,
  autoLinkedAccountId,
  onConfirm,
  onCancel,
}: {
  accountMatches: AccountMatch[];
  detectedInfo: DetectedAccountInfo;
  autoLinkedAccountId: string | null;
  onConfirm: (params: {
    accountId?: string;
    createNewAccount?: boolean;
    accountInfo?: {
      account_type?: string;
      institution_name?: string;
      account_nickname?: string;
    };
    entityId?: string;
    createNewEntity?: boolean;
    newEntityName?: string;
    newEntityType?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    autoLinkedAccountId ??
      (accountMatches.length === 1 ? accountMatches[0].id : null)
  );
  const [createNew, setCreateNew] = useState(false);
  const [nickname, setNickname] = useState(
    detectedInfo.account_nickname ||
      `${detectedInfo.institution_name || "Unknown"} Account`
  );
  const [institutionName, setInstitutionName] = useState(
    detectedInfo.institution_name || ""
  );
  const [accountType, setAccountType] = useState(
    detectedInfo.account_type || ""
  );

  // Entity state
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [createNewEntity, setCreateNewEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState(
    detectedInfo.account_owner_name || ""
  );
  const [newEntityType, setNewEntityType] = useState("other");

  // Detect if this is a new owner
  const detectedOwnerName = detectedInfo.account_owner_name;
  const [isNewOwner, setIsNewOwner] = useState(false);

  useEffect(() => {
    fetch("/api/entities")
      .then(async (res) => {
        if (!res.ok) return;
        const data: Entity[] = await res.json();
        setEntities(data);

        // Default to the default entity
        const defaultEntity = data.find((e) => e.is_default);
        if (defaultEntity) {
          setSelectedEntityId(defaultEntity.id);
        }

        // Check if detected owner matches any entity
        if (detectedOwnerName) {
          const normalizedOwner = detectedOwnerName.toLowerCase().trim();
          const match = data.find((e) => {
            const name = e.entity_name.toLowerCase().trim();
            return (
              name === normalizedOwner ||
              normalizedOwner.includes(name) ||
              name.includes(normalizedOwner)
            );
          });

          if (match) {
            setSelectedEntityId(match.id);
          } else {
            setIsNewOwner(true);
            setCreateNewEntity(true);
            setNewEntityName(detectedOwnerName);
          }
        }
      })
      .catch(() => {
        // Silent fail — entity selection just won't appear
      });
  }, [detectedOwnerName]);

  function handleSubmit() {
    const entityParams = createNewEntity
      ? {
          createNewEntity: true as const,
          newEntityName,
          newEntityType,
        }
      : {
          entityId: selectedEntityId || undefined,
        };

    if (createNew) {
      onConfirm({
        createNewAccount: true,
        accountInfo: {
          account_nickname: nickname,
          institution_name: institutionName,
          account_type: accountType || undefined,
        },
        ...entityParams,
      });
    } else if (selectedAccountId) {
      onConfirm({
        accountId: selectedAccountId,
        ...entityParams,
      });
    }
  }

  const canSubmit =
    (createNew || selectedAccountId) &&
    (!createNewEntity || newEntityName.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h3 className="text-lg font-semibold">Link to Account</h3>
        <p className="mt-1 text-sm text-gray-500">
          Choose which account this statement belongs to, or create a new one.
        </p>

        {/* New owner detected banner */}
        {isNewOwner && detectedOwnerName && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium text-amber-800">
              New account owner detected
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              &ldquo;{detectedOwnerName}&rdquo; doesn&apos;t match any existing
              entity. A new entity will be created.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* Entity selection */}
          {entities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Account Owner (Entity)
              </p>

              <select
                value={createNewEntity ? "__new__" : selectedEntityId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCreateNewEntity(true);
                    setSelectedEntityId("");
                  } else {
                    setCreateNewEntity(false);
                    setSelectedEntityId(e.target.value);
                  }
                }}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.entity_name}
                    {entity.is_default ? " (default)" : ""}
                  </option>
                ))}
                <option value="__new__">+ Create new entity</option>
              </select>

              {createNewEntity && (
                <div className="space-y-2 ml-2 pl-2 border-l-2 border-amber-200">
                  <input
                    type="text"
                    placeholder="Entity name (e.g. Jane Smith, Smith Family Trust)"
                    value={newEntityName}
                    onChange={(e) => setNewEntityName(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <select
                    value={newEntityType}
                    onChange={(e) => setNewEntityType(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="spouse">Spouse / Partner</option>
                    <option value="trust">Trust</option>
                    <option value="partner">Business Partner</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Existing account matches */}
          {accountMatches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Matching accounts
              </p>
              {accountMatches.map((match) => (
                <label
                  key={match.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                    selectedAccountId === match.id && !createNew
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="account"
                    checked={selectedAccountId === match.id && !createNew}
                    onChange={() => {
                      setSelectedAccountId(match.id);
                      setCreateNew(false);
                    }}
                    className="accent-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {match.account_nickname ||
                        match.institution_name ||
                        "Unknown Account"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {[
                        match.institution_name,
                        match.account_type,
                        match.schwab_account_number
                          ? `****${match.schwab_account_number.slice(-4)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" \u2014 ")}
                    </p>
                    <p className="text-xs text-blue-500">
                      {match.match_reason}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Create new account option */}
          <div className="space-y-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                createNew
                  ? "border-blue-500 bg-blue-50"
                  : "hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="account"
                checked={createNew}
                onChange={() => {
                  setCreateNew(true);
                  setSelectedAccountId(null);
                }}
                className="accent-blue-600"
              />
              <span className="text-sm font-medium">Create new account</span>
            </label>

            {createNew && (
              <div className="ml-7 space-y-2">
                <input
                  type="text"
                  placeholder="Account nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Institution name"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Account type (optional)</option>
                  <option value="individual">Individual</option>
                  <option value="ira">IRA</option>
                  <option value="roth_ira">Roth IRA</option>
                  <option value="joint">Joint</option>
                  <option value="trust">Trust</option>
                  <option value="401k">401(k)</option>
                  <option value="403b">403(b)</option>
                  <option value="529">529</option>
                  <option value="custodial">Custodial</option>
                  <option value="margin">Margin</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end sm:gap-3">
          <button
            onClick={onCancel}
            className="w-full rounded-md border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto"
          >
            Save to Account
          </button>
        </div>
      </div>
    </div>
  );
}
