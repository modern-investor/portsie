import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetectedAccountInfo, ExtractedAccount, ExistingAccountContext } from "./types";

/**
 * Map account_type to the broader account_category for the DB constraint.
 */
function accountTypeToCategory(accountType: string | null | undefined): string {
  if (!accountType) return "brokerage";
  const t = accountType.toLowerCase();
  if (["checking", "savings"].includes(t)) return "banking";
  if (["credit_card"].includes(t)) return "credit";
  if (["mortgage", "heloc", "auto_loan"].includes(t)) return "loan";
  if (["real_estate"].includes(t)) return "real_estate";
  return "brokerage";
}

export interface AutoLinkResult {
  accountId: string;
  action: "matched" | "created";
  matchReason?: string;
  accountNickname?: string;
}

/**
 * Creates a new manual_upload account from detected account info.
 * Stores the account number in schwab_account_number for future matching.
 * Returns the new account ID.
 */
export async function createManualAccount(
  supabase: SupabaseClient,
  userId: string,
  accountInfo: DetectedAccountInfo
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      data_source: "manual_upload",
      schwab_account_number: accountInfo.account_number ?? null,
      account_type: accountInfo.account_type ?? null,
      account_nickname:
        accountInfo.account_nickname ||
        `${accountInfo.institution_name || "Unknown"} Account`,
      institution_name: accountInfo.institution_name || "Unknown",
      account_group: accountInfo.account_group ?? null,
      account_category: accountTypeToCategory(accountInfo.account_type),
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    // Handle unique constraint violation (concurrent upload for same account)
    if (error.code === "23505" && accountInfo.account_number) {
      const { data: existing } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("schwab_account_number", accountInfo.account_number)
        .eq("data_source", "manual_upload")
        .single();

      if (existing) return existing.id;
    }
    throw new Error(`Failed to create account: ${error.message}`);
  }

  if (!data) {
    throw new Error("Failed to create account: no data returned");
  }

  return data.id;
}

/**
 * Run heuristic number-based matching against the existing accounts list.
 * Returns the best matching account ID if a number-based match is found,
 * or null if no number match exists.
 *
 * This is used as a validator for Claude's account_link decisions:
 * when the heuristic has a strong number-based match that disagrees with
 * Claude's choice, the heuristic wins.
 */
function findHeuristicNumberMatch(
  detectedInfo: DetectedAccountInfo,
  existingAccounts: ExistingAccountContext[]
): { accountId: string; reason: string } | null {
  if (!detectedInfo.account_number) return null;

  const detected = detectedInfo.account_number.replace(/^\.+/, "");

  for (const acct of existingAccounts) {
    if (!acct.account_number_hint) continue;
    const hint = acct.account_number_hint.replace(/^\.+/, "");

    // Exact match
    if (hint === detected) {
      return { accountId: acct.id, reason: `Exact account number match (${hint})` };
    }

    // Partial match: last 4 digits
    if (
      hint.length >= 4 &&
      detected.length >= 4 &&
      (hint.endsWith(detected.slice(-4)) || detected.endsWith(hint.slice(-4)))
    ) {
      return { accountId: acct.id, reason: `Partial account number match (last 4 digits)` };
    }

    // Partial match: last 3 digits
    if (
      hint.length >= 3 &&
      detected.length >= 3 &&
      (hint.endsWith(detected.slice(-3)) || detected.endsWith(hint.slice(-3)))
    ) {
      return { accountId: acct.id, reason: `Partial account number match (last 3 digits)` };
    }
  }

  return null;
}

/**
 * Fallback heuristic matching for accounts without account_link
 * (backward compat with old extracted_data). Uses the same priority logic
 * as the old findMatchingAccounts + autoLinkOrCreateAccount.
 */
function findHeuristicMatch(
  detectedInfo: DetectedAccountInfo,
  existingAccounts: ExistingAccountContext[]
): { accountId: string; reason: string } | null {
  // Priority 1: Number-based match
  const numberMatch = findHeuristicNumberMatch(detectedInfo, existingAccounts);
  if (numberMatch) return numberMatch;

  // Priority 2: Institution + account type match
  if (detectedInfo.institution_name) {
    const detectedInst = detectedInfo.institution_name.toLowerCase();
    const matches: { accountId: string; reason: string }[] = [];

    for (const acct of existingAccounts) {
      if (!acct.institution_name) continue;
      const acctInst = acct.institution_name.toLowerCase();

      if (detectedInst.includes(acctInst) || acctInst.includes(detectedInst)) {
        if (
          detectedInfo.account_type &&
          acct.account_type &&
          detectedInfo.account_type.toLowerCase() === acct.account_type.toLowerCase()
        ) {
          matches.push({
            accountId: acct.id,
            reason: "Institution and account type match",
          });
        }
      }
    }

    // Only auto-link if there's a single confident match
    if (matches.length === 1) return matches[0];
  }

  return null;
}

/**
 * Resolve account linkage for extracted accounts using Claude's account_link
 * decisions, validated by heuristic matching as a safety net.
 *
 * For each extracted account:
 * 1. If Claude returned account_link.match_existing with a UUID:
 *    - Verify the UUID exists and belongs to the user
 *    - If heuristic has a number-based match pointing to a DIFFERENT account,
 *      prefer the heuristic (heuristic wins on number matches)
 *    - Otherwise accept Claude's match
 * 2. If Claude returned account_link.create_new: create the account
 * 3. If no account_link (backward compat): fall back to full heuristic matching
 */
export async function resolveAccountLinks(
  supabase: SupabaseClient,
  userId: string,
  extractedAccounts: ExtractedAccount[],
  existingAccounts: ExistingAccountContext[]
): Promise<Map<number, AutoLinkResult>> {
  const results = new Map<number, AutoLinkResult>();

  for (let i = 0; i < extractedAccounts.length; i++) {
    const acct = extractedAccounts[i];
    const link = acct.account_link;
    const info = acct.account_info;

    // ── Path 1: Claude says match_existing ──
    if (link?.action === "match_existing" && link.existing_account_id) {
      // Verify the UUID exists and belongs to this user
      const { data: verified } = await supabase
        .from("accounts")
        .select("id, account_nickname")
        .eq("id", link.existing_account_id)
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (verified) {
        // Heuristic validator: if heuristic has a number-based match to a
        // DIFFERENT account, prefer the heuristic
        const heuristicMatch = findHeuristicNumberMatch(info, existingAccounts);
        if (heuristicMatch && heuristicMatch.accountId !== verified.id) {
          // Heuristic disagrees on a number match — prefer heuristic
          results.set(i, {
            accountId: heuristicMatch.accountId,
            action: "matched",
            matchReason: `Heuristic override: ${heuristicMatch.reason}`,
            accountNickname: existingAccounts.find(
              (a) => a.id === heuristicMatch.accountId
            )?.account_nickname ?? undefined,
          });
          continue;
        }

        // Claude's match verified and heuristic agrees (or has no opinion)
        results.set(i, {
          accountId: verified.id,
          action: "matched",
          matchReason: link.match_reason,
          accountNickname: verified.account_nickname ?? undefined,
        });
        continue;
      }

      // UUID verification failed (hallucinated or deleted account) — fall through
    }

    // ── Path 2: Claude says create_new ──
    if (link?.action === "create_new") {
      const newId = await createManualAccount(supabase, userId, info);
      results.set(i, {
        accountId: newId,
        action: "created",
        matchReason: link.match_reason,
        accountNickname:
          info.account_nickname ||
          `${info.institution_name || "Unknown"} Account`,
      });
      continue;
    }

    // ── Path 3: No account_link (backward compat / fallback) ──
    const heuristicMatch = findHeuristicMatch(info, existingAccounts);
    if (heuristicMatch) {
      results.set(i, {
        accountId: heuristicMatch.accountId,
        action: "matched",
        matchReason: heuristicMatch.reason,
        accountNickname: existingAccounts.find(
          (a) => a.id === heuristicMatch.accountId
        )?.account_nickname ?? undefined,
      });
    } else {
      // No match — create new account
      const newId = await createManualAccount(supabase, userId, info);
      results.set(i, {
        accountId: newId,
        action: "created",
        accountNickname:
          info.account_nickname ||
          `${info.institution_name || "Unknown"} Account`,
      });
    }
  }

  return results;
}

/**
 * Find or create an aggregate account for a given institution.
 * Aggregate accounts hold positions that span multiple real accounts
 * (e.g. Schwab summary "Positions" section marked with ††).
 */
export async function findOrCreateAggregateAccount(
  supabase: SupabaseClient,
  userId: string,
  institutionName: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_aggregate", true)
    .eq("institution_name", institutionName)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      data_source: "manual_upload",
      account_type: "aggregate",
      account_nickname: `${institutionName} (Aggregate)`,
      institution_name: institutionName,
      account_category: "brokerage",
      is_active: true,
      is_aggregate: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create aggregate account: ${error.message}`);
  }
  return data!.id;
}

/**
 * Find or create an "unknown" account for positions whose
 * originating account can't be determined.
 */
export async function findOrCreateUnknownAccount(
  supabase: SupabaseClient,
  userId: string,
  institutionName?: string
): Promise<string> {
  const instName = institutionName ?? "Unknown";
  const nickname = institutionName
    ? `${institutionName} (Unknown Account)`
    : "Unknown Account";

  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("account_type", "unknown")
    .eq("institution_name", instName)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      data_source: "manual_upload",
      account_type: "unknown",
      account_nickname: nickname,
      institution_name: instName,
      account_category: "brokerage",
      is_active: true,
      is_aggregate: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create unknown account: ${error.message}`);
  }
  return data!.id;
}
