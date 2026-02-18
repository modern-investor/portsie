// ============================================================================
// Quiltt data sync — fetches from Quiltt GraphQL, writes to Portsie tables
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { QuilttGraphQLClient } from "./client";
import type { QuilttAccount, QuilttHolding, QuilttTransaction } from "./types";

// --- Helpers to map Quiltt data → Portsie schema ---

function mapHoldingToPosition(
  userId: string,
  accountId: string,
  holding: QuilttHolding,
  snapshotDate: string
) {
  return {
    user_id: userId,
    account_id: accountId,
    snapshot_date: snapshotDate,
    snapshot_type: "quiltt_sync",
    data_source: "quiltt",
    symbol: holding.security?.tickerSymbol || holding.security?.name || "UNKNOWN",
    cusip: holding.security?.cusip || null,
    asset_type: holding.security?.type || null,
    description: holding.security?.name || null,
    quantity: holding.quantity ?? 0,
    short_quantity: 0,
    average_cost_basis:
      holding.costBasis != null && holding.quantity
        ? holding.costBasis / holding.quantity
        : null,
    market_price_per_share: holding.price ?? null,
    market_value: holding.value ?? null,
    cost_basis_total: holding.costBasis ?? null,
  };
}

function mapQuilttTransactionAction(
  entryType: string | null,
  category: string | null,
  amount: number
): string {
  // Map Quiltt entry type + category to Portsie action
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes("dividend")) return "dividend";
    if (cat.includes("interest")) return "interest";
    if (cat.includes("fee")) return "fee";
    if (cat.includes("transfer")) {
      return amount > 0 ? "transfer_in" : "transfer_out";
    }
  }

  if (entryType === "DEBIT") {
    return amount < 0 ? "buy" : "sell";
  }
  if (entryType === "CREDIT") {
    return amount > 0 ? "sell" : "buy";
  }

  return "other";
}

function mapTransactionToPortsie(
  userId: string,
  accountId: string,
  tx: QuilttTransaction
) {
  return {
    user_id: userId,
    account_id: accountId,
    data_source: "quiltt",
    external_transaction_id: tx.id,
    transaction_date: tx.date,
    symbol: null, // Quiltt basic transactions don't always include security info
    description: tx.description || null,
    action: mapQuilttTransactionAction(tx.entryType, tx.category, tx.amount),
    quantity: null,
    price_per_share: null,
    total_amount: tx.amount,
    fees: 0,
    commission: 0,
  };
}

// --- Core sync functions ---

/**
 * Import accounts discovered by Quiltt into the Portsie accounts table.
 * Creates new account rows for any Quiltt accounts not already linked.
 * Returns the number of new accounts created.
 */
export async function importQuilttAccounts(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<{ imported: number; total: number }> {
  const client = new QuilttGraphQLClient(profileId);
  const quilttAccounts = await client.getAccounts();

  let imported = 0;

  for (const qa of quilttAccounts) {
    // Check if already imported
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("quiltt_account_id", qa.id)
      .single();

    if (existing) continue;

    // Determine account type from taxonomy
    const accountType = qa.taxonomy
      ? [qa.taxonomy.category, qa.taxonomy.type].filter(Boolean).join(" — ")
      : qa.type || null;

    const institutionName =
      qa.institution?.name || qa.connection?.institution?.name || "Unknown";

    const { error } = await supabase.from("accounts").insert({
      user_id: userId,
      data_source: "quiltt",
      quiltt_account_id: qa.id,
      quiltt_connection_id: qa.connection.id,
      account_type: accountType,
      account_nickname: qa.name || `${institutionName} ${qa.mask ? `****${qa.mask}` : ""}`.trim(),
      institution_name: institutionName,
      is_active: true,
    });

    if (error) {
      console.error(`Failed to import Quiltt account ${qa.id}:`, error.message);
    } else {
      imported++;
    }
  }

  return { imported, total: quilttAccounts.length };
}

/**
 * Sync holdings (positions) for a single Quiltt-linked account.
 */
export async function syncQuilttHoldings(
  supabase: SupabaseClient,
  userId: string,
  portsieAccountId: string,
  quilttAccountId: string,
  profileId: string
): Promise<number> {
  const client = new QuilttGraphQLClient(profileId);
  const holdings = await client.getHoldings(quilttAccountId);

  if (holdings.length === 0) return 0;

  const snapshotDate = new Date().toISOString().split("T")[0];

  const positions = holdings.map((h) =>
    mapHoldingToPosition(userId, portsieAccountId, h, snapshotDate)
  );

  // Upsert to handle re-syncs on the same day
  const { error } = await supabase.from("position_snapshots").upsert(positions, {
    onConflict: "account_id,snapshot_date,symbol,snapshot_type",
  });

  if (error) {
    console.error(`Failed to sync positions for account ${portsieAccountId}:`, error.message);
    return 0;
  }

  return holdings.length;
}

/**
 * Sync balance for a single Quiltt-linked account.
 */
export async function syncQuilttBalance(
  supabase: SupabaseClient,
  userId: string,
  portsieAccountId: string,
  quilttAccountId: string,
  profileId: string
): Promise<boolean> {
  const client = new QuilttGraphQLClient(profileId);
  const balance = await client.getBalance(quilttAccountId);

  if (!balance) return false;

  const snapshotDate = new Date().toISOString().split("T")[0];

  const { error } = await supabase.from("balance_snapshots").upsert(
    {
      user_id: userId,
      account_id: portsieAccountId,
      snapshot_date: snapshotDate,
      snapshot_type: "quiltt_sync",
      data_source: "quiltt",
      liquidation_value: balance.current,
      cash_balance: balance.available,
      available_funds: balance.available,
      equity: balance.current,
    },
    { onConflict: "account_id,snapshot_date,snapshot_type" }
  );

  if (error) {
    console.error(`Failed to sync balance for account ${portsieAccountId}:`, error.message);
    return false;
  }

  return true;
}

/**
 * Sync transactions for a single Quiltt-linked account.
 */
export async function syncQuilttTransactions(
  supabase: SupabaseClient,
  userId: string,
  portsieAccountId: string,
  quilttAccountId: string,
  profileId: string
): Promise<number> {
  const client = new QuilttGraphQLClient(profileId);
  const transactions = await client.getTransactions(quilttAccountId);

  if (transactions.length === 0) return 0;

  const mapped = transactions.map((tx) =>
    mapTransactionToPortsie(userId, portsieAccountId, tx)
  );

  // Upsert on external_transaction_id to avoid duplicates
  const { error } = await supabase.from("transactions").upsert(mapped, {
    onConflict: "account_id,external_transaction_id",
  });

  if (error) {
    console.error(`Failed to sync transactions for account ${portsieAccountId}:`, error.message);
    return 0;
  }

  return transactions.length;
}

/**
 * Full sync for a single Quiltt-linked account (holdings + balance + transactions).
 */
export async function syncQuilttAccount(
  supabase: SupabaseClient,
  userId: string,
  portsieAccountId: string,
  quilttAccountId: string,
  profileId: string
): Promise<{ holdings: number; balance: boolean; transactions: number }> {
  const [holdings, balance, transactions] = await Promise.all([
    syncQuilttHoldings(supabase, userId, portsieAccountId, quilttAccountId, profileId),
    syncQuilttBalance(supabase, userId, portsieAccountId, quilttAccountId, profileId),
    syncQuilttTransactions(supabase, userId, portsieAccountId, quilttAccountId, profileId),
  ]);

  return { holdings, balance, transactions };
}

/**
 * Sync all Quiltt-linked accounts for a user.
 */
export async function syncAllQuilttAccounts(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<{
  accounts: number;
  totalHoldings: number;
  totalTransactions: number;
}> {
  // Get all Quiltt-linked accounts for this user
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, quiltt_account_id")
    .eq("user_id", userId)
    .eq("data_source", "quiltt")
    .eq("is_active", true);

  if (error || !accounts) {
    throw new Error(`Failed to fetch Quiltt accounts: ${error?.message}`);
  }

  let totalHoldings = 0;
  let totalTransactions = 0;

  for (const account of accounts) {
    if (!account.quiltt_account_id) continue;

    const result = await syncQuilttAccount(
      supabase,
      userId,
      account.id,
      account.quiltt_account_id,
      profileId
    );

    totalHoldings += result.holdings;
    totalTransactions += result.transactions;
  }

  return {
    accounts: accounts.length,
    totalHoldings,
    totalTransactions,
  };
}
