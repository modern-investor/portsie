/**
 * Stage 2.5: Deterministic Account Matcher
 *
 * Takes a validated PortsieExtraction and the user's existing accounts,
 * produces an AccountMapResult with one mapping per extracted account.
 *
 * This is purely deterministic — no LLM involvement. Matching priority:
 *   1. Account number (last 3-4 digits overlap)
 *   2. Institution + account type (unique match)
 *   3. Institution + nickname (fuzzy)
 *   4. Fallback: create_new
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PortsieExtraction,
  ExtractionAccountInfo,
  AccountMapping,
  AccountMapResult,
  Confidence,
} from "./schema";

// ── Types ──

/** Existing account context loaded from the DB for matching. */
export interface ExistingAccountForMatching {
  id: string;
  account_nickname: string | null;
  institution_name: string | null;
  account_type: string | null;
  /** Last 4+ digits of account number, e.g. "...5902" */
  account_number_hint: string | null;
  account_group: string | null;
  is_aggregate: boolean;
}

// ── Helpers ──

/**
 * Strip leading dots/ellipsis from account number for comparison.
 * "...902" → "902", "5902" → "5902"
 */
function stripPrefix(num: string): string {
  return num.replace(/^\.+/, "").trim();
}

/**
 * Normalize institution name for fuzzy matching.
 * "Charles Schwab & Co., Inc." → "charles schwab"
 */
function normalizeInstitution(name: string): string {
  return name
    .toLowerCase()
    .replace(/[&,.]|inc|llc|corp|co\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two institution names match (fuzzy).
 * Handles: "Schwab" vs "Charles Schwab", "BoA" vs "Bank of America"
 */
function institutionsMatch(a: string, b: string): boolean {
  const na = normalizeInstitution(a);
  const nb = normalizeInstitution(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// ── Matching functions ──

/**
 * Try to match by account number (highest confidence).
 * Returns the matching account ID and confidence, or null.
 */
function matchByNumber(
  info: ExtractionAccountInfo,
  existing: ExistingAccountForMatching[]
): { accountId: string; confidence: Confidence; reason: string } | null {
  if (!info.account_number) return null;

  const detected = stripPrefix(info.account_number);
  if (detected.length < 2) return null; // Too short to match

  for (const acct of existing) {
    if (!acct.account_number_hint) continue;
    const hint = stripPrefix(acct.account_number_hint);

    // Exact match
    if (hint === detected) {
      return {
        accountId: acct.id,
        confidence: "high",
        reason: `Exact account number match (${hint})`,
      };
    }

    // Partial match: last 4 digits
    if (
      hint.length >= 4 &&
      detected.length >= 4 &&
      (hint.endsWith(detected.slice(-4)) || detected.endsWith(hint.slice(-4)))
    ) {
      return {
        accountId: acct.id,
        confidence: "high",
        reason: `Account number match on last 4 digits (${detected.slice(-4)})`,
      };
    }

    // Partial match: last 3 digits (lower confidence)
    if (
      hint.length >= 3 &&
      detected.length >= 3 &&
      (hint.endsWith(detected.slice(-3)) || detected.endsWith(hint.slice(-3)))
    ) {
      // Additional validation: institution must also match if available
      if (
        info.institution_name &&
        acct.institution_name &&
        institutionsMatch(info.institution_name, acct.institution_name)
      ) {
        return {
          accountId: acct.id,
          confidence: "high",
          reason: `Account number match on last 3 digits + institution match`,
        };
      }
      return {
        accountId: acct.id,
        confidence: "medium",
        reason: `Account number match on last 3 digits (${detected.slice(-3)})`,
      };
    }
  }

  return null;
}

/**
 * Try to match by institution + account type (unique match only).
 */
function matchByInstitutionAndType(
  info: ExtractionAccountInfo,
  existing: ExistingAccountForMatching[]
): { accountId: string; confidence: Confidence; reason: string } | null {
  if (!info.institution_name) return null;

  const candidates: ExistingAccountForMatching[] = [];

  for (const acct of existing) {
    if (acct.is_aggregate) continue; // Don't match against aggregate accounts
    if (!acct.institution_name) continue;
    if (!institutionsMatch(info.institution_name, acct.institution_name)) continue;

    // If we have account type info, require it to match
    if (info.account_type && acct.account_type) {
      if (info.account_type.toLowerCase() === acct.account_type.toLowerCase()) {
        candidates.push(acct);
      }
    } else {
      candidates.push(acct);
    }
  }

  // Only return a match if there's exactly one candidate (unambiguous)
  if (candidates.length === 1) {
    return {
      accountId: candidates[0].id,
      confidence: "medium",
      reason: `Institution (${info.institution_name}) and account type match — unique candidate`,
    };
  }

  return null;
}

/**
 * Try to match by institution + nickname (fuzzy).
 */
function matchByNickname(
  info: ExtractionAccountInfo,
  existing: ExistingAccountForMatching[]
): { accountId: string; confidence: Confidence; reason: string } | null {
  if (!info.account_nickname || !info.institution_name) return null;

  const normalizedNick = info.account_nickname.toLowerCase().trim();

  for (const acct of existing) {
    if (acct.is_aggregate) continue;
    if (!acct.institution_name) continue;
    if (!institutionsMatch(info.institution_name, acct.institution_name)) continue;
    if (!acct.account_nickname) continue;

    const existingNick = acct.account_nickname.toLowerCase().trim();
    if (normalizedNick === existingNick || normalizedNick.includes(existingNick) || existingNick.includes(normalizedNick)) {
      return {
        accountId: acct.id,
        confidence: "medium",
        reason: `Institution and nickname match ("${info.account_nickname}" ≈ "${acct.account_nickname}")`,
      };
    }
  }

  return null;
}

// ── Public API ──

/**
 * Load existing accounts for a user from the DB, formatted for matching.
 */
export async function loadExistingAccountsForMatching(
  supabase: SupabaseClient,
  userId: string
): Promise<ExistingAccountForMatching[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select(
      "id, account_nickname, institution_name, account_type, schwab_account_number, account_group, is_aggregate"
    )
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to load accounts for matching: ${error.message}`);
  }

  return (data ?? []).map((a) => ({
    id: a.id,
    account_nickname: a.account_nickname,
    institution_name: a.institution_name,
    account_type: a.account_type,
    account_number_hint: a.schwab_account_number ?? null,
    account_group: a.account_group,
    is_aggregate: a.is_aggregate ?? false,
  }));
}

/**
 * Match extracted accounts to existing user accounts.
 *
 * Pure deterministic function — no LLM involvement.
 * Returns one AccountMapping per account in the extraction, plus
 * an aggregate_account_id for unallocated_positions if needed.
 */
export function matchAccounts(
  extraction: PortsieExtraction,
  existingAccounts: ExistingAccountForMatching[]
): AccountMapResult {
  const mappings: AccountMapping[] = [];
  const usedAccountIds = new Set<string>();
  let unmatchedCount = 0;
  let newAccountCount = 0;

  // Filter out aggregate accounts from the candidate pool
  const candidates = existingAccounts.filter((a) => !a.is_aggregate);

  for (let i = 0; i < extraction.accounts.length; i++) {
    const info = extraction.accounts[i].account_info;

    // Try matching in priority order
    const numberMatch = matchByNumber(info, candidates.filter((c) => !usedAccountIds.has(c.id)));
    if (numberMatch) {
      usedAccountIds.add(numberMatch.accountId);
      mappings.push({
        extraction_index: i,
        action: "match_existing",
        account_id: numberMatch.accountId,
        match_confidence: numberMatch.confidence,
        match_reason: numberMatch.reason,
      });
      continue;
    }

    const typeMatch = matchByInstitutionAndType(
      info,
      candidates.filter((c) => !usedAccountIds.has(c.id))
    );
    if (typeMatch) {
      usedAccountIds.add(typeMatch.accountId);
      mappings.push({
        extraction_index: i,
        action: "match_existing",
        account_id: typeMatch.accountId,
        match_confidence: typeMatch.confidence,
        match_reason: typeMatch.reason,
      });
      continue;
    }

    const nickMatch = matchByNickname(
      info,
      candidates.filter((c) => !usedAccountIds.has(c.id))
    );
    if (nickMatch) {
      usedAccountIds.add(nickMatch.accountId);
      mappings.push({
        extraction_index: i,
        action: "match_existing",
        account_id: nickMatch.accountId,
        match_confidence: nickMatch.confidence,
        match_reason: nickMatch.reason,
      });
      continue;
    }

    // No match — create new
    unmatchedCount++;
    newAccountCount++;
    mappings.push({
      extraction_index: i,
      action: "create_new",
      account_id: null,
      match_confidence: "high",
      match_reason: "No matching existing account found",
    });
  }

  // Determine aggregate account for unallocated_positions
  let aggregateAccountId: string | null = null;
  if (extraction.unallocated_positions.length > 0) {
    // Look for an existing aggregate account for this institution
    const institutionName = extraction.document.institution_name;
    if (institutionName) {
      const aggAcct = existingAccounts.find(
        (a) =>
          a.is_aggregate &&
          a.institution_name &&
          institutionsMatch(institutionName, a.institution_name)
      );
      if (aggAcct) {
        aggregateAccountId = aggAcct.id;
      }
    }
    // If no existing aggregate, leave null — the DB writer will create one
  }

  return {
    mappings,
    unmatched_count: unmatchedCount,
    new_account_count: newAccountCount,
    aggregate_account_id: aggregateAccountId,
  };
}

/**
 * Map account_type to the broader account_category for the DB constraint.
 */
export function accountTypeToCategory(accountType: string | null | undefined): string {
  if (!accountType) return "brokerage";
  const t = accountType.toLowerCase();
  if (["checking", "savings"].includes(t)) return "banking";
  if (["credit_card"].includes(t)) return "credit";
  if (["mortgage", "heloc", "auto_loan"].includes(t)) return "loan";
  if (["real_estate"].includes(t)) return "real_estate";
  return "brokerage";
}
