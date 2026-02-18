/**
 * Stage 3: Deterministic DB Writer
 *
 * Pure function: takes a validated PortsieExtraction + AccountMapResult
 * and writes everything to the database deterministically.
 *
 * For each account mapping:
 *   1. Resolve account_id (existing or INSERT new)
 *   2. Reconcile holdings (new/update/close)
 *   3. Write position_snapshots (immutable, deduped)
 *   4. Write balance_snapshots (immutable, deduped)
 *   5. Write transactions (upsert by external_transaction_id)
 *   6. Update account summary (recompute totals from holdings)
 *
 * For unallocated_positions:
 *   7. Find or create aggregate account
 *   8. Write holdings + position_snapshots
 *
 * Final:
 *   9. Update uploaded_statements metadata
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PortsieExtraction,
  ExtractionAccount,
  ExtractionPosition,
  ExtractionBalance,
  ExtractionTransaction,
  AccountMapResult,
  AccountMapping,
  AccountWriteResult,
  WriteReport,
} from "./schema";
import { accountTypeToCategory } from "./account-matcher";
import { reconcileHoldings } from "@/lib/holdings/reconcile";
import { updateAccountSummary } from "@/lib/holdings/account-summary";

// ── Helpers ──

/**
 * Create a new account in the DB from extraction data.
 */
async function createAccount(
  supabase: SupabaseClient,
  userId: string,
  info: ExtractionAccount["account_info"]
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      data_source: "manual_upload",
      schwab_account_number: info.account_number ?? null,
      account_type: info.account_type ?? null,
      account_nickname:
        info.account_nickname ||
        `${info.institution_name || "Unknown"} Account`,
      institution_name: info.institution_name || "Unknown",
      account_group: info.account_group ?? null,
      account_category: accountTypeToCategory(info.account_type),
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    // Handle unique constraint violation (concurrent upload for same account)
    if (error.code === "23505" && info.account_number) {
      const { data: existing } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("schwab_account_number", info.account_number)
        .eq("data_source", "manual_upload")
        .single();

      if (existing) return existing.id;
    }
    throw new Error(`Failed to create account: ${error.message}`);
  }

  return data!.id;
}

/**
 * Find or create an aggregate account for a given institution.
 * Aggregate accounts hold positions that span multiple real accounts.
 */
async function findOrCreateAggregateAccount(
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
      account_type: null,
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
 * Deduplicate positions by (snapshot_date, symbol).
 * Merges quantities and values when the same symbol appears multiple times.
 */
function deduplicatePositions(positions: ExtractionPosition[]): ExtractionPosition[] {
  const map = new Map<string, ExtractionPosition>();

  for (const p of positions) {
    const key = `${p.snapshot_date}|${p.symbol}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += p.quantity;
      existing.short_quantity =
        (existing.short_quantity ?? 0) + (p.short_quantity ?? 0);
      if (p.market_value != null) {
        existing.market_value = (existing.market_value ?? 0) + p.market_value;
      }
      if (p.cost_basis_total != null) {
        existing.cost_basis_total =
          (existing.cost_basis_total ?? 0) + p.cost_basis_total;
      }
      if (p.unrealized_profit_loss != null) {
        existing.unrealized_profit_loss =
          (existing.unrealized_profit_loss ?? 0) + p.unrealized_profit_loss;
      }
      if (p.market_price_per_share != null) {
        existing.market_price_per_share = p.market_price_per_share;
      }
      if (p.average_cost_basis != null) {
        existing.average_cost_basis = p.average_cost_basis;
      }
    } else {
      map.set(key, { ...p });
    }
  }

  return Array.from(map.values());
}

/**
 * Deduplicate balances by snapshot_date, keeping the most complete entry.
 */
function deduplicateBalances(balances: ExtractionBalance[]): ExtractionBalance[] {
  const map = new Map<string, ExtractionBalance>();

  for (const b of balances) {
    const existing = map.get(b.snapshot_date);
    if (existing) {
      // Merge: prefer non-null values from the newer entry
      existing.liquidation_value = b.liquidation_value ?? existing.liquidation_value;
      existing.cash_balance = b.cash_balance ?? existing.cash_balance;
      existing.available_funds = b.available_funds ?? existing.available_funds;
      existing.total_cash = b.total_cash ?? existing.total_cash;
      existing.equity = b.equity ?? existing.equity;
      existing.long_market_value = b.long_market_value ?? existing.long_market_value;
      existing.buying_power = b.buying_power ?? existing.buying_power;
    } else {
      map.set(b.snapshot_date, { ...b });
    }
  }

  return Array.from(map.values());
}

// ── Per-account writer ──

/**
 * Write all data for a single account to the DB.
 */
async function writeAccountData(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  statementId: string,
  account: ExtractionAccount,
  statementStartDate: string | null,
  statementEndDate: string | null
): Promise<AccountWriteResult> {
  let holdingsCreated = 0;
  let holdingsUpdated = 0;
  let holdingsClosed = 0;
  let snapshotsWritten = 0;
  let balancesWritten = 0;
  let transactionsCreated = 0;

  // ── 1. Reconcile holdings (source of truth) ──
  if (account.positions.length > 0) {
    // The reconcileHoldings function expects the old ExtractedPosition type,
    // but our ExtractionPosition is structurally compatible
    const reconciliation = await reconcileHoldings(
      supabase,
      userId,
      accountId,
      account.positions as unknown as import("@/lib/upload/types").ExtractedPosition[],
      statementId
    );
    holdingsCreated = reconciliation.changes.filter(
      (c) => c.type === "new_position"
    ).length;
    holdingsClosed = reconciliation.closed;
    holdingsUpdated = reconciliation.upserted;
  }

  // ── 2. Write position snapshots (immutable history) ──
  if (account.positions.length > 0) {
    const deduped = deduplicatePositions(account.positions);
    const positionRows = deduped.map((p) => ({
      user_id: userId,
      account_id: accountId,
      snapshot_date: p.snapshot_date,
      snapshot_type: "manual",
      data_source: "manual_upload",
      symbol: p.symbol,
      name: p.symbol,
      cusip: p.cusip ?? null,
      asset_type: p.asset_type ?? null,
      asset_subtype: p.asset_subtype ?? null,
      asset_category: "tradeable",
      description: p.description ?? null,
      quantity: p.quantity,
      quantity_unit: "shares",
      short_quantity: p.short_quantity ?? 0,
      purchase_price: p.average_cost_basis ?? null,
      average_cost_basis: p.average_cost_basis ?? null,
      market_price_per_share: p.market_price_per_share ?? null,
      market_value: p.market_value ?? null,
      cost_basis_total: p.cost_basis_total ?? null,
      unrealized_profit_loss: p.unrealized_profit_loss ?? null,
      unrealized_profit_loss_pct: p.unrealized_profit_loss_pct ?? null,
      valuation_source: "statement",
    }));

    const { data, error } = await supabase
      .from("position_snapshots")
      .upsert(positionRows, {
        onConflict: "account_id,snapshot_date,symbol,snapshot_type",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write position snapshots: ${error.message}`);
    }
    snapshotsWritten = data?.length ?? 0;
  }

  // ── 3. Write balance snapshots (immutable history) ──
  if (account.balances.length > 0) {
    const deduped = deduplicateBalances(account.balances);
    const balanceRows = deduped.map((b) => ({
      user_id: userId,
      account_id: accountId,
      snapshot_date: b.snapshot_date,
      snapshot_type: "manual",
      data_source: "manual_upload",
      liquidation_value: b.liquidation_value ?? null,
      cash_balance: b.cash_balance ?? null,
      available_funds: b.available_funds ?? null,
      total_cash: b.total_cash ?? null,
      equity: b.equity ?? null,
      long_market_value: b.long_market_value ?? null,
      buying_power: b.buying_power ?? null,
    }));

    const { data, error } = await supabase
      .from("balance_snapshots")
      .upsert(balanceRows, {
        onConflict: "account_id,snapshot_date,snapshot_type",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write balance snapshots: ${error.message}`);
    }
    balancesWritten = data?.length ?? 0;
  }

  // ── 4. Write transactions ──
  if (account.transactions.length > 0) {
    const transactionRows = account.transactions.map((t, index) => ({
      user_id: userId,
      account_id: accountId,
      data_source: "manual_upload",
      external_transaction_id: `upload_${statementId}_${accountId}_${index}`,
      transaction_date: t.transaction_date,
      settlement_date: t.settlement_date ?? null,
      symbol: t.symbol ?? null,
      cusip: t.cusip ?? null,
      asset_type: t.asset_type ?? null,
      asset_subtype: t.asset_subtype ?? null,
      description: t.description,
      action: t.action,
      quantity: t.quantity ?? null,
      price_per_share: t.price_per_share ?? null,
      total_amount: t.total_amount,
      fees: t.fees ?? 0,
      commission: t.commission ?? 0,
      uploaded_statement_id: statementId,
    }));

    const { data, error } = await supabase
      .from("transactions")
      .upsert(transactionRows, {
        onConflict: "account_id,external_transaction_id",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write transactions: ${error.message}`);
    }
    transactionsCreated = data?.length ?? 0;
  }

  // ── 5. Update account summary (recompute from holdings + balances) ──
  const latestBalance =
    account.balances.length > 0
      ? account.balances[account.balances.length - 1]
      : undefined;

  // updateAccountSummary expects the old ExtractedBalance type,
  // but our ExtractionBalance is structurally compatible
  await updateAccountSummary(
    supabase,
    accountId,
    latestBalance as unknown as import("@/lib/upload/types").ExtractedBalance | undefined
  );

  const accountNickname =
    account.account_info.account_nickname ||
    `${account.account_info.institution_name || "Unknown"} Account`;

  return {
    account_id: accountId,
    account_nickname: accountNickname,
    action: "matched", // Will be overridden by caller
    holdings_created: holdingsCreated,
    holdings_updated: holdingsUpdated,
    holdings_closed: holdingsClosed,
    snapshots_written: snapshotsWritten,
    balances_written: balancesWritten,
    transactions_created: transactionsCreated,
  };
}

// ── Public API ──

/**
 * Write a validated PortsieExtraction to the database.
 *
 * Pure deterministic function: takes extraction + account map, writes everything.
 *
 * @param supabase - Supabase client with user auth
 * @param userId - User's UUID
 * @param statementId - uploaded_statements.id
 * @param extraction - Validated PortsieExtraction from Stage 2
 * @param accountMap - Account mappings from Stage 2.5
 * @returns WriteReport with per-account results and totals
 */
export async function writeExtraction(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  extraction: PortsieExtraction,
  accountMap: AccountMapResult
): Promise<WriteReport> {
  const accountResults: AccountWriteResult[] = [];
  const linkedAccountIds: string[] = [];

  const totals = {
    accounts_processed: 0,
    accounts_created: 0,
    holdings_created: 0,
    holdings_updated: 0,
    holdings_closed: 0,
    snapshots_written: 0,
    balances_written: 0,
    transactions_created: 0,
  };

  // ── Process each account mapping ──
  for (const mapping of accountMap.mappings) {
    const account = extraction.accounts[mapping.extraction_index];
    if (!account) continue;

    // Skip accounts with no data at all
    const hasData =
      account.positions.length > 0 ||
      account.transactions.length > 0 ||
      account.balances.length > 0;
    if (!hasData) continue;

    // Resolve account_id
    let accountId: string;
    let action: "matched" | "created";

    if (mapping.action === "match_existing" && mapping.account_id) {
      accountId = mapping.account_id;
      action = "matched";
    } else {
      accountId = await createAccount(supabase, userId, account.account_info);
      action = "created";
      totals.accounts_created++;
    }

    linkedAccountIds.push(accountId);

    try {
      const result = await writeAccountData(
        supabase,
        userId,
        accountId,
        statementId,
        account,
        extraction.document.statement_start_date,
        extraction.document.statement_end_date
      );
      result.action = action;
      accountResults.push(result);

      totals.accounts_processed++;
      totals.holdings_created += result.holdings_created;
      totals.holdings_updated += result.holdings_updated;
      totals.holdings_closed += result.holdings_closed;
      totals.snapshots_written += result.snapshots_written;
      totals.balances_written += result.balances_written;
      totals.transactions_created += result.transactions_created;
    } catch (err) {
      console.error(
        `Failed to write data for account ${accountId} (index ${mapping.extraction_index}):`,
        err
      );
      // Continue with other accounts
    }
  }

  // ── Handle unallocated (aggregate) positions ──
  let aggregateResult: WriteReport["aggregate_result"] = null;

  if (extraction.unallocated_positions.length > 0) {
    try {
      const institutionName =
        extraction.document.institution_name ?? "Unknown";

      // Use provided aggregate account or find/create one
      let aggAccountId: string;
      if (accountMap.aggregate_account_id) {
        aggAccountId = accountMap.aggregate_account_id;
      } else {
        aggAccountId = await findOrCreateAggregateAccount(
          supabase,
          userId,
          institutionName
        );
      }
      linkedAccountIds.push(aggAccountId);

      // Compute a synthetic balance for the aggregate account by summing
      // individual accounts' liquidation values. This ensures the aggregate
      // account total matches the document's stated total rather than being
      // recomputed from holdings (which may differ due to rounding, dedup,
      // or LLM-computed vs document-stated market values).
      const snapshotDate =
        extraction.document.statement_end_date ??
        extraction.unallocated_positions[0]?.snapshot_date ??
        new Date().toISOString().slice(0, 10);

      let aggLiquidationValue = 0;
      let aggCash = 0;
      for (const acct of extraction.accounts) {
        for (const bal of acct.balances) {
          aggLiquidationValue += bal.liquidation_value ?? 0;
          aggCash += bal.cash_balance ?? 0;
        }
      }

      const aggBalances: ExtractionBalance[] =
        aggLiquidationValue !== 0
          ? [
              {
                snapshot_date: snapshotDate,
                liquidation_value: aggLiquidationValue,
                cash_balance: aggCash || null,
                available_funds: null,
                total_cash: null,
                equity: null,
                long_market_value: null,
                buying_power: null,
              },
            ]
          : [];

      // Build a synthetic account for the aggregate positions
      const aggAccount: ExtractionAccount = {
        account_info: {
          account_number: null,
          account_type: null,
          institution_name: institutionName,
          account_nickname: `${institutionName} (Aggregate)`,
          account_group: null,
        },
        transactions: [],
        positions: extraction.unallocated_positions,
        balances: aggBalances,
      };

      const result = await writeAccountData(
        supabase,
        userId,
        aggAccountId,
        statementId,
        aggAccount,
        extraction.document.statement_start_date,
        extraction.document.statement_end_date
      );

      aggregateResult = {
        account_id: aggAccountId,
        positions_written: result.snapshots_written,
      };

      totals.holdings_created += result.holdings_created;
      totals.holdings_updated += result.holdings_updated;
      totals.snapshots_written += result.snapshots_written;
    } catch (err) {
      console.error("Failed to write unallocated/aggregate positions:", err);
    }
  }

  // ── Update uploaded_statements metadata ──
  await supabase
    .from("uploaded_statements")
    .update({
      account_id: linkedAccountIds[0] ?? null,
      linked_account_ids: linkedAccountIds,
      parse_status: "completed",
      confirmed_at: new Date().toISOString(),
      transactions_created: totals.transactions_created,
      positions_created: totals.snapshots_written,
      statement_start_date: extraction.document.statement_start_date ?? null,
      statement_end_date: extraction.document.statement_end_date ?? null,
      account_mappings: accountMap,
      extraction_schema_version: extraction.schema_version,
    })
    .eq("id", statementId);

  return {
    account_results: accountResults,
    aggregate_result: aggregateResult,
    totals,
  };
}
