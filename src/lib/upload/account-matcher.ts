import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountMatch, DetectedAccountInfo } from "./types";

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
      account_type: accountInfo.account_type ?? null,
      account_nickname:
        accountInfo.account_nickname ||
        `${accountInfo.institution_name || "Unknown"} Account`,
      institution_name: accountInfo.institution_name || "Unknown",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create account: ${error?.message}`);
  }

  return data.id;
}
