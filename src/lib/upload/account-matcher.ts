import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountMatch, DetectedAccountInfo, ExtractedAccount } from "./types";

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

/**
 * Finds existing user accounts that match the LLM-detected account info.
 * Returns matches ranked by confidence (exact number match first).
 */
export async function findMatchingAccounts(
  supabase: SupabaseClient,
  userId: string,
  detectedInfo: DetectedAccountInfo
): Promise<AccountMatch[]> {
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select(
      "id, account_nickname, institution_name, account_type, schwab_account_number"
    )
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !accounts) return [];

  const matches: AccountMatch[] = [];

  for (const account of accounts) {
    let matchReason = "";

    // Priority 1: Exact account number match
    if (detectedInfo.account_number && account.schwab_account_number) {
      if (account.schwab_account_number === detectedInfo.account_number) {
        matchReason = "Exact account number match";
      } else if (
        account.schwab_account_number.endsWith(
          detectedInfo.account_number.slice(-4)
        ) ||
        detectedInfo.account_number.endsWith(
          account.schwab_account_number.slice(-4)
        )
      ) {
        matchReason = "Partial account number match (last 4 digits)";
      } else if (
        // Also match on last 3 digits (Schwab summaries often show ...XXX)
        account.schwab_account_number.endsWith(
          detectedInfo.account_number.slice(-3)
        ) ||
        detectedInfo.account_number.endsWith(
          account.schwab_account_number.slice(-3)
        )
      ) {
        matchReason = "Partial account number match (last 3 digits)";
      }
    }

    // Priority 2: Institution + account type match
    if (
      !matchReason &&
      detectedInfo.institution_name &&
      account.institution_name
    ) {
      const detectedInst = detectedInfo.institution_name.toLowerCase();
      const accountInst = account.institution_name.toLowerCase();

      if (
        detectedInst.includes(accountInst) ||
        accountInst.includes(detectedInst)
      ) {
        if (
          detectedInfo.account_type &&
          account.account_type &&
          detectedInfo.account_type.toLowerCase() ===
            account.account_type.toLowerCase()
        ) {
          matchReason = "Institution and account type match";
        } else {
          matchReason = "Institution name match";
        }
      }
    }

    if (matchReason) {
      matches.push({
        id: account.id,
        account_nickname: account.account_nickname,
        institution_name: account.institution_name,
        account_type: account.account_type,
        schwab_account_number: account.schwab_account_number,
        match_reason: matchReason,
      });
    }
  }

  // Sort: exact matches first, then partial, then institution
  matches.sort((a, b) => {
    const priority = (reason: string) => {
      if (reason.includes("Exact")) return 0;
      if (reason.includes("Partial")) return 1;
      if (reason.includes("account type")) return 2;
      return 3;
    };
    return priority(a.match_reason) - priority(b.match_reason);
  });

  return matches;
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

export interface AutoLinkResult {
  accountId: string;
  action: "matched" | "created";
  matchReason?: string;
  accountNickname?: string;
}

/**
 * Automatically link to an existing account or create a new one.
 *
 * Match priority:
 *   1. Exact account number match → auto-link
 *   2. Single partial/institution match → auto-link
 *   3. Multiple ambiguous matches or no matches → create new account
 */
export async function autoLinkOrCreateAccount(
  supabase: SupabaseClient,
  userId: string,
  detectedInfo: DetectedAccountInfo
): Promise<AutoLinkResult> {
  const matches = await findMatchingAccounts(supabase, userId, detectedInfo);

  // Priority 1: Exact account number match
  const exactMatch = matches.find((m) => m.match_reason.includes("Exact"));
  if (exactMatch) {
    return {
      accountId: exactMatch.id,
      action: "matched",
      matchReason: exactMatch.match_reason,
      accountNickname: exactMatch.account_nickname ?? undefined,
    };
  }

  // Priority 2: Single non-exact match (partial number or institution+type)
  if (matches.length === 1) {
    return {
      accountId: matches[0].id,
      action: "matched",
      matchReason: matches[0].match_reason,
      accountNickname: matches[0].account_nickname ?? undefined,
    };
  }

  // No confident match → create new account
  const newAccountId = await createManualAccount(supabase, userId, detectedInfo);
  return {
    accountId: newAccountId,
    action: "created",
    accountNickname:
      detectedInfo.account_nickname ||
      `${detectedInfo.institution_name || "Unknown"} Account`,
  };
}

/**
 * Process multiple accounts from a multi-account extraction.
 * Fetches existing accounts once, then matches or creates each extracted account.
 * Returns a map from account index → AutoLinkResult.
 */
/**
 * Find or create an aggregate account for a given institution.
 * Aggregate accounts hold positions that span multiple real accounts
 * (e.g. Schwab summary "Positions" section marked with ††).
 *
 * Returns the account ID.
 */
export async function findOrCreateAggregateAccount(
  supabase: SupabaseClient,
  userId: string,
  institutionName: string
): Promise<string> {
  // Look for existing aggregate account for this institution
  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_aggregate", true)
    .eq("institution_name", institutionName)
    .single();

  if (existing) return existing.id;

  // Create a new aggregate account
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
 *
 * Returns the account ID.
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

  // Look for existing unknown account for this institution
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

export async function autoLinkOrCreateMultipleAccounts(
  supabase: SupabaseClient,
  userId: string,
  extractedAccounts: ExtractedAccount[]
): Promise<Map<number, AutoLinkResult>> {
  const results = new Map<number, AutoLinkResult>();

  // Process each account sequentially to avoid race conditions on account creation
  for (let i = 0; i < extractedAccounts.length; i++) {
    const acctInfo = extractedAccounts[i].account_info;
    const result = await autoLinkOrCreateAccount(supabase, userId, acctInfo);
    results.set(i, result);
  }

  return results;
}
