/**
 * Stage 3: Deterministic DB Writer
 *
 * Pure function: takes a validated PortsieExtraction + AccountMapResult
 * and writes everything to the database deterministically.
 *
 * Optimized for large extractions (50+ accounts) by batching DB operations:
 *   Phase 1: Resolve all account IDs (batch create new accounts)
 *   Phase 2: Collect all snapshot/balance/transaction rows across accounts
 *   Phase 3: Bulk upsert per table (1 query per table, not 1 per account)
 *   Phase 4: Reconcile holdings for accounts with positions (parallelized)
 *   Phase 5: Handle unallocated/aggregate positions
 *   Phase 6: Update account summaries (parallelized)
 *   Phase 7: Update uploaded_statements metadata
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
 * Batch-create multiple new accounts. Returns a map from extraction_index to account_id.
 */
async function batchCreateAccounts(
  supabase: SupabaseClient,
  userId: string,
  newAccountMappings: { index: number; info: ExtractionAccount["account_info"] }[]
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (newAccountMappings.length === 0) return result;

  // Insert all accounts in one batch
  const rows = newAccountMappings.map((m) => ({
    user_id: userId,
    data_source: "manual_upload",
    schwab_account_number: m.info.account_number ?? null,
    account_type: m.info.account_type ?? null,
    account_nickname:
      m.info.account_nickname ||
      `${m.info.institution_name || "Unknown"} Account`,
    institution_name: m.info.institution_name || "Unknown",
    account_group: m.info.account_group ?? null,
    account_category: accountTypeToCategory(m.info.account_type),
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("accounts")
    .insert(rows)
    .select("id");

  if (error) {
    // Fallback: create accounts individually (handles unique constraint violations)
    for (const m of newAccountMappings) {
      const id = await createAccount(supabase, userId, m.info);
      result.set(m.index, id);
    }
    return result;
  }

  // Map results back by index order
  for (let i = 0; i < newAccountMappings.length; i++) {
    if (data[i]) {
      result.set(newAccountMappings[i].index, data[i].id);
    }
  }

  return result;
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
 * Deduplicate transactions by content key (date, symbol, action, quantity, price, amount).
 */
function deduplicateTransactions(
  transactions: ExtractionTransaction[]
): ExtractionTransaction[] {
  const seen = new Map<string, ExtractionTransaction>();
  for (const t of transactions) {
    const key = [
      t.transaction_date,
      t.symbol ?? "",
      t.action,
      t.quantity ?? "",
      t.price_per_share ?? "",
      t.total_amount,
    ].join("|");
    if (!seen.has(key)) {
      seen.set(key, t);
    } else {
      const existing = seen.get(key)!;
      if (t.fees != null && (existing.fees == null || existing.fees === 0))
        existing.fees = t.fees;
      if (t.commission != null && (existing.commission == null || existing.commission === 0))
        existing.commission = t.commission;
    }
  }
  return Array.from(seen.values());
}

/**
 * Deduplicate balances by snapshot_date, keeping the most complete entry.
 */
function deduplicateBalances(balances: ExtractionBalance[]): ExtractionBalance[] {
  const map = new Map<string, ExtractionBalance>();

  for (const b of balances) {
    const existing = map.get(b.snapshot_date);
    if (existing) {
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

// ── Row builders (no DB calls) ──

function buildPositionRows(
  userId: string,
  accountId: string,
  statementId: string,
  positions: ExtractionPosition[]
): Record<string, unknown>[] {
  const deduped = deduplicatePositions(positions);
  return deduped.map((p) => ({
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
    uploaded_statement_id: statementId,
  }));
}

function buildBalanceRows(
  userId: string,
  accountId: string,
  statementId: string,
  balances: ExtractionBalance[]
): Record<string, unknown>[] {
  const deduped = deduplicateBalances(balances);
  return deduped.map((b) => ({
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
    uploaded_statement_id: statementId,
  }));
}

function buildTransactionRows(
  userId: string,
  accountId: string,
  statementId: string,
  transactions: ExtractionTransaction[]
): Record<string, unknown>[] {
  const deduped = deduplicateTransactions(transactions);
  return deduped.map((t, index) => ({
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
}

// ── Public API ──

/**
 * Write a validated PortsieExtraction to the database.
 *
 * Optimized for large extractions: batches DB writes across all accounts
 * to minimize round-trips (3 bulk upserts instead of N*3 individual ones).
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

  // ── Phase 1: Resolve all account IDs ──
  // Separate existing matches from new accounts, then batch-create new ones
  const accountIdByIndex = new Map<number, string>();
  const newAccountsToCreate: { index: number; info: ExtractionAccount["account_info"] }[] = [];

  for (const mapping of accountMap.mappings) {
    const account = extraction.accounts[mapping.extraction_index];
    if (!account) continue;

    // Skip accounts with no data
    const hasData =
      account.positions.length > 0 ||
      account.transactions.length > 0 ||
      account.balances.length > 0;
    if (!hasData) continue;

    if (mapping.action === "match_existing" && mapping.account_id) {
      accountIdByIndex.set(mapping.extraction_index, mapping.account_id);
    } else {
      newAccountsToCreate.push({
        index: mapping.extraction_index,
        info: account.account_info,
      });
    }
  }

  // Batch create all new accounts (1 INSERT instead of N)
  if (newAccountsToCreate.length > 0) {
    const created = await batchCreateAccounts(supabase, userId, newAccountsToCreate);
    for (const [index, id] of created) {
      accountIdByIndex.set(index, id);
    }
    totals.accounts_created = newAccountsToCreate.length;
  }

  // Build linked account IDs list
  for (const [, id] of accountIdByIndex) {
    linkedAccountIds.push(id);
  }

  // ── Phase 2: Collect all rows across all accounts ──
  const allPositionRows: Record<string, unknown>[] = [];
  const allBalanceRows: Record<string, unknown>[] = [];
  const allTransactionRows: Record<string, unknown>[] = [];

  // Track per-account stats for the report
  const accountsWithPositions: { accountId: string; account: ExtractionAccount; mapping: AccountMapping }[] = [];

  for (const mapping of accountMap.mappings) {
    const account = extraction.accounts[mapping.extraction_index];
    if (!account) continue;

    const accountId = accountIdByIndex.get(mapping.extraction_index);
    if (!accountId) continue;

    // Collect position snapshot rows
    if (account.positions.length > 0) {
      allPositionRows.push(
        ...buildPositionRows(userId, accountId, statementId, account.positions)
      );
      accountsWithPositions.push({ accountId, account, mapping });
    }

    // Collect balance snapshot rows
    if (account.balances.length > 0) {
      allBalanceRows.push(
        ...buildBalanceRows(userId, accountId, statementId, account.balances)
      );
    }

    // Collect transaction rows
    if (account.transactions.length > 0) {
      allTransactionRows.push(
        ...buildTransactionRows(userId, accountId, statementId, account.transactions)
      );
    }
  }

  // ── Phase 3: Bulk upsert per table (1 query per table) ──
  if (allPositionRows.length > 0) {
    const { data, error } = await supabase
      .from("position_snapshots")
      .upsert(allPositionRows, {
        onConflict: "account_id,snapshot_date,symbol,snapshot_type",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write position snapshots: ${error.message}`);
    }
    totals.snapshots_written = data?.length ?? 0;
  }

  if (allBalanceRows.length > 0) {
    const { data, error } = await supabase
      .from("balance_snapshots")
      .upsert(allBalanceRows, {
        onConflict: "account_id,snapshot_date,snapshot_type",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write balance snapshots: ${error.message}`);
    }
    totals.balances_written = data?.length ?? 0;
  }

  if (allTransactionRows.length > 0) {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(allTransactionRows, {
        onConflict: "account_id,external_transaction_id",
      })
      .select("id");

    if (error) {
      throw new Error(`Failed to write transactions: ${error.message}`);
    }
    totals.transactions_created = data?.length ?? 0;
  }

  // ── Phase 4: Reconcile holdings (only for accounts with positions) ──
  // Run in parallel batches for speed
  const CONCURRENCY = 5;
  for (let i = 0; i < accountsWithPositions.length; i += CONCURRENCY) {
    const batch = accountsWithPositions.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ accountId, account, mapping }) => {
        try {
          const reconciliation = await reconcileHoldings(
            supabase,
            userId,
            accountId,
            account.positions as unknown as import("@/lib/upload/types").ExtractedPosition[],
            statementId
          );

          const action: "matched" | "created" =
            mapping.action === "match_existing" && mapping.account_id
              ? "matched"
              : "created";

          const accountNickname =
            account.account_info.account_nickname ||
            `${account.account_info.institution_name || "Unknown"} Account`;

          return {
            result: {
              account_id: accountId,
              account_nickname: accountNickname,
              action,
              holdings_created: reconciliation.changes.filter(
                (c) => c.type === "new_position"
              ).length,
              holdings_updated: reconciliation.upserted,
              holdings_closed: reconciliation.closed,
              snapshots_written: 0, // Already counted in bulk phase
              balances_written: 0,
              transactions_created: 0,
            } as AccountWriteResult,
            reconciliation,
          };
        } catch (err) {
          console.error(
            `Failed to reconcile holdings for account ${accountId}:`,
            err
          );
          return null;
        }
      })
    );

    for (const r of results) {
      if (!r) continue;
      accountResults.push(r.result);
      totals.accounts_processed++;
      totals.holdings_created += r.result.holdings_created;
      totals.holdings_updated += r.result.holdings_updated;
      totals.holdings_closed += r.result.holdings_closed;
    }
  }

  // Also add AccountWriteResults for accounts that only had balances/transactions (no positions)
  for (const mapping of accountMap.mappings) {
    const account = extraction.accounts[mapping.extraction_index];
    if (!account) continue;
    const accountId = accountIdByIndex.get(mapping.extraction_index);
    if (!accountId) continue;

    // Skip if already processed in the positions phase
    if (accountsWithPositions.some((a) => a.accountId === accountId)) continue;

    const hasData =
      account.balances.length > 0 || account.transactions.length > 0;
    if (!hasData) continue;

    const action: "matched" | "created" =
      mapping.action === "match_existing" && mapping.account_id
        ? "matched"
        : "created";

    accountResults.push({
      account_id: accountId,
      account_nickname:
        account.account_info.account_nickname ||
        `${account.account_info.institution_name || "Unknown"} Account`,
      action,
      holdings_created: 0,
      holdings_updated: 0,
      holdings_closed: 0,
      snapshots_written: 0,
      balances_written: 0,
      transactions_created: 0,
    });
    totals.accounts_processed++;
  }

  // ── Phase 5: Handle unallocated (aggregate) positions ──
  let aggregateResult: WriteReport["aggregate_result"] = null;

  if (extraction.unallocated_positions.length > 0) {
    try {
      const institutionName =
        extraction.document.institution_name ?? "Unknown";

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

      // Compute synthetic balance for aggregate account
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

      // Build aggregate position rows and balance rows
      const aggPositionRows = buildPositionRows(
        userId,
        aggAccountId,
        statementId,
        extraction.unallocated_positions
      );

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

      const aggBalanceRows = buildBalanceRows(
        userId,
        aggAccountId,
        statementId,
        aggBalances
      );

      // Bulk upsert aggregate positions and balances
      if (aggPositionRows.length > 0) {
        const { data, error } = await supabase
          .from("position_snapshots")
          .upsert(aggPositionRows, {
            onConflict: "account_id,snapshot_date,symbol,snapshot_type",
          })
          .select("id");

        if (error) {
          throw new Error(`Failed to write aggregate position snapshots: ${error.message}`);
        }
        totals.snapshots_written += data?.length ?? 0;

        aggregateResult = {
          account_id: aggAccountId,
          positions_written: data?.length ?? 0,
        };
      }

      if (aggBalanceRows.length > 0) {
        const { error } = await supabase
          .from("balance_snapshots")
          .upsert(aggBalanceRows, {
            onConflict: "account_id,snapshot_date,snapshot_type",
          });

        if (error) {
          console.error("Failed to write aggregate balance snapshots:", error.message);
        }
      }

      // Reconcile holdings for aggregate account
      await reconcileHoldings(
        supabase,
        userId,
        aggAccountId,
        extraction.unallocated_positions as unknown as import("@/lib/upload/types").ExtractedPosition[],
        statementId
      );

      // Update aggregate account summary
      const aggBalanceData = aggBalances[0];
      await updateAccountSummary(
        supabase,
        aggAccountId,
        aggBalanceData as unknown as import("@/lib/upload/types").ExtractedBalance | undefined
      );
    } catch (err) {
      console.error("Failed to write unallocated/aggregate positions:", err);
    }
  }

  // ── Phase 6: Update account summaries (parallelized) ──
  const summaryUpdates: { accountId: string; balance?: ExtractionBalance }[] = [];

  for (const mapping of accountMap.mappings) {
    const account = extraction.accounts[mapping.extraction_index];
    if (!account) continue;
    const accountId = accountIdByIndex.get(mapping.extraction_index);
    if (!accountId) continue;

    const hasData =
      account.positions.length > 0 ||
      account.transactions.length > 0 ||
      account.balances.length > 0;
    if (!hasData) continue;

    const latestBalance =
      account.balances.length > 0
        ? account.balances[account.balances.length - 1]
        : undefined;

    summaryUpdates.push({ accountId, balance: latestBalance });
  }

  // Run account summary updates in parallel batches
  for (let i = 0; i < summaryUpdates.length; i += CONCURRENCY) {
    const batch = summaryUpdates.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ accountId, balance }) => {
        try {
          await updateAccountSummary(
            supabase,
            accountId,
            balance as unknown as import("@/lib/upload/types").ExtractedBalance | undefined
          );

          // Store document-reported total for integrity validation
          if (balance?.liquidation_value != null) {
            await supabase
              .from("accounts")
              .update({
                document_reported_total: balance.liquidation_value,
                document_reported_date: balance.snapshot_date,
              })
              .eq("id", accountId);
          }
        } catch (err) {
          console.error(`Failed to update account summary for ${accountId}:`, err);
        }
      })
    );
  }

  // ── Phase 7: Update uploaded_statements metadata ──
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
