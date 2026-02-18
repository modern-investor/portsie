import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMExtractionResult, ExtractedAccount } from "./types";
import type { ReconciliationResult } from "@/lib/holdings/types";
import type { AutoLinkResult } from "./account-matcher";
import { findOrCreateAggregateAccount } from "./account-matcher";
import { reconcileHoldings } from "@/lib/holdings/reconcile";
import { updateAccountSummary } from "@/lib/holdings/account-summary";

/**
 * Writes confirmed extraction results to the canonical database tables.
 *
 * Flow:
 * 1. Reconcile incoming positions against holdings (the source of truth)
 * 2. Write position_snapshots (immutable historical record)
 * 3. Write balance_snapshots (immutable historical record)
 * 4. Write transactions
 * 5. Update account summary (recompute totals from holdings)
 * 6. Update uploaded_statements metadata
 */
export async function writeExtractedData(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  statementId: string,
  extractedData: LLMExtractionResult
): Promise<ReconciliationResult> {
  let transactionsCreated = 0;
  let snapshotsWritten = 0;

  // ── 1. Reconcile holdings (source of truth) ──
  let holdingsCreated = 0;
  let holdingsUpdated = 0;
  let holdingsClosed = 0;
  let changes: ReconciliationResult["changes"] = [];

  if (extractedData.positions.length > 0) {
    const reconciliation = await reconcileHoldings(
      supabase,
      userId,
      accountId,
      extractedData.positions,
      statementId
    );
    changes = reconciliation.changes;
    holdingsCreated = reconciliation.changes.filter(
      (c) => c.type === "new_position"
    ).length;
    holdingsClosed = reconciliation.closed;
    holdingsUpdated = reconciliation.upserted;
  }

  // ── 2. Write position snapshots (immutable history) ──
  if (extractedData.positions.length > 0) {
    // Deduplicate by (snapshot_date, symbol) — aggregate if same symbol appears
    // multiple times (e.g. Schwab summary spanning multiple sub-accounts)
    const positionMap = new Map<
      string,
      (typeof extractedData.positions)[number]
    >();
    for (const p of extractedData.positions) {
      const key = `${p.snapshot_date}|${p.symbol}`;
      const existing = positionMap.get(key);
      if (existing) {
        // Merge: sum quantities and values
        existing.quantity += p.quantity;
        existing.short_quantity =
          (existing.short_quantity ?? 0) + (p.short_quantity ?? 0);
        if (p.market_value != null) {
          existing.market_value =
            (existing.market_value ?? 0) + p.market_value;
        }
        if (p.cost_basis_total != null) {
          existing.cost_basis_total =
            (existing.cost_basis_total ?? 0) + p.cost_basis_total;
        }
        if (p.unrealized_profit_loss != null) {
          existing.unrealized_profit_loss =
            (existing.unrealized_profit_loss ?? 0) + p.unrealized_profit_loss;
        }
        // Keep market price and avg cost from the latest entry (best guess)
        if (p.market_price_per_share != null) {
          existing.market_price_per_share = p.market_price_per_share;
        }
        if (p.average_cost_basis != null) {
          existing.average_cost_basis = p.average_cost_basis;
        }
      } else {
        positionMap.set(key, { ...p });
      }
    }

    const deduped = Array.from(positionMap.values());
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
  if (extractedData.balances.length > 0) {
    // Deduplicate by snapshot_date — keep the most complete entry
    const balanceMap = new Map<
      string,
      (typeof extractedData.balances)[number]
    >();
    for (const b of extractedData.balances) {
      const existing = balanceMap.get(b.snapshot_date);
      if (existing) {
        // Merge: prefer non-null values
        existing.liquidation_value =
          b.liquidation_value ?? existing.liquidation_value;
        existing.cash_balance = b.cash_balance ?? existing.cash_balance;
        existing.available_funds = b.available_funds ?? existing.available_funds;
        existing.total_cash = b.total_cash ?? existing.total_cash;
        existing.equity = b.equity ?? existing.equity;
        existing.long_market_value =
          b.long_market_value ?? existing.long_market_value;
        existing.buying_power = b.buying_power ?? existing.buying_power;
      } else {
        balanceMap.set(b.snapshot_date, { ...b });
      }
    }

    const deduped = Array.from(balanceMap.values());
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

    const { error } = await supabase
      .from("balance_snapshots")
      .upsert(balanceRows, {
        onConflict: "account_id,snapshot_date,snapshot_type",
      });

    if (error) {
      throw new Error(`Failed to write balance snapshots: ${error.message}`);
    }
  }

  // ── 4. Write transactions ──
  if (extractedData.transactions.length > 0) {
    const transactionRows = extractedData.transactions.map((t, index) => ({
      user_id: userId,
      account_id: accountId,
      data_source: "manual_upload",
      external_transaction_id: `upload_${statementId}_${index}`,
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
      total_amount: t.total_amount ?? (
        (t.quantity != null && t.price_per_share != null)
          ? +(t.quantity * t.price_per_share).toFixed(2)
          : 0
      ),
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
  const latestBalance = extractedData.balances.length > 0
    ? extractedData.balances[extractedData.balances.length - 1]
    : undefined;
  await updateAccountSummary(supabase, accountId, latestBalance);

  // ── 6. Update the uploaded_statements record ──
  await supabase
    .from("uploaded_statements")
    .update({
      account_id: accountId,
      parse_status: "completed",
      confirmed_at: new Date().toISOString(),
      transactions_created: transactionsCreated,
      positions_created: snapshotsWritten,
      statement_start_date: extractedData.statement_start_date ?? null,
      statement_end_date: extractedData.statement_end_date ?? null,
    })
    .eq("id", statementId);

  return {
    changes,
    holdingsUpdated,
    holdingsCreated,
    holdingsClosed,
    snapshotsWritten,
    transactionsCreated,
  };
}

// ── Multi-account result type ──

export interface MultiAccountWriteResult {
  accountResults: Array<{
    accountId: string;
    accountNickname?: string;
    reconciliation: ReconciliationResult;
  }>;
  totalTransactionsCreated: number;
  totalSnapshotsWritten: number;
  totalHoldingsCreated: number;
  totalHoldingsClosed: number;
  linkedAccountIds: string[];
}

/**
 * Writes multi-account extraction results to the canonical database tables.
 * Loops over each account in the extraction and calls writeExtractedData for each.
 *
 * The uploaded_statements record is updated once at the end with aggregate totals
 * and the list of all linked account IDs.
 */
export async function writeMultiAccountData(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  extractedData: LLMExtractionResult,
  accountMap: Map<number, AutoLinkResult>
): Promise<MultiAccountWriteResult> {
  const accounts = extractedData.accounts ?? [];
  const accountResults: MultiAccountWriteResult["accountResults"] = [];
  let totalTransactionsCreated = 0;
  let totalSnapshotsWritten = 0;
  let totalHoldingsCreated = 0;
  let totalHoldingsClosed = 0;
  const linkedAccountIds: string[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const acct: ExtractedAccount = accounts[i];
    const linkResult = accountMap.get(i);
    if (!linkResult) continue;

    const accountId = linkResult.accountId;
    linkedAccountIds.push(accountId);

    // Build a single-account LLMExtractionResult for the existing writeExtractedData
    const singleAccountData: LLMExtractionResult = {
      account_info: acct.account_info,
      statement_start_date: extractedData.statement_start_date,
      statement_end_date: extractedData.statement_end_date,
      transactions: acct.transactions,
      positions: acct.positions,
      balances: acct.balances,
      confidence: extractedData.confidence,
      notes: [],
    };

    // Only write if this account has actual data (positions, transactions, or balances)
    const hasData =
      acct.positions.length > 0 ||
      acct.transactions.length > 0 ||
      acct.balances.length > 0;

    if (hasData) {
      try {
        const result = await writeExtractedData(
          supabase,
          userId,
          accountId,
          statementId,
          singleAccountData
        );

        accountResults.push({
          accountId,
          accountNickname: linkResult.accountNickname,
          reconciliation: result,
        });

        totalTransactionsCreated += result.transactionsCreated;
        totalSnapshotsWritten += result.snapshotsWritten;
        totalHoldingsCreated += result.holdingsCreated;
        totalHoldingsClosed += result.holdingsClosed;
      } catch (err) {
        console.error(
          `Failed to write data for account ${accountId} (${linkResult.accountNickname}):`,
          err
        );
        // Continue with other accounts even if one fails
      }
    }
  }

  // ── Handle unallocated (aggregate) positions ──
  // These are positions from summary sections that span multiple accounts
  // (e.g. Schwab summary "Positions" section marked with ††).
  if (
    extractedData.unallocated_positions &&
    extractedData.unallocated_positions.length > 0
  ) {
    try {
      const institutionName =
        extractedData.account_info?.institution_name ?? "Unknown";
      const aggregateAccountId = await findOrCreateAggregateAccount(
        supabase,
        userId,
        institutionName
      );
      linkedAccountIds.push(aggregateAccountId);

      const aggData: LLMExtractionResult = {
        account_info: {
          institution_name: institutionName,
          account_type: "aggregate",
          account_nickname: `${institutionName} (Aggregate)`,
        },
        statement_start_date: extractedData.statement_start_date,
        statement_end_date: extractedData.statement_end_date,
        transactions: [],
        positions: extractedData.unallocated_positions,
        balances: [],
        confidence: extractedData.confidence,
        notes: [],
      };

      const aggResult = await writeExtractedData(
        supabase,
        userId,
        aggregateAccountId,
        statementId,
        aggData
      );

      accountResults.push({
        accountId: aggregateAccountId,
        accountNickname: `${institutionName} (Aggregate)`,
        reconciliation: aggResult,
      });

      totalSnapshotsWritten += aggResult.snapshotsWritten;
      totalHoldingsCreated += aggResult.holdingsCreated;
    } catch (err) {
      console.error("Failed to write unallocated/aggregate positions:", err);
    }
  }

  // Update uploaded_statements with aggregate info
  await supabase
    .from("uploaded_statements")
    .update({
      account_id: linkedAccountIds[0] ?? null,
      linked_account_ids: linkedAccountIds,
      parse_status: "completed",
      confirmed_at: new Date().toISOString(),
      transactions_created: totalTransactionsCreated,
      positions_created: totalSnapshotsWritten,
      statement_start_date: extractedData.statement_start_date ?? null,
      statement_end_date: extractedData.statement_end_date ?? null,
    })
    .eq("id", statementId);

  return {
    accountResults,
    totalTransactionsCreated,
    totalSnapshotsWritten,
    totalHoldingsCreated,
    totalHoldingsClosed,
    linkedAccountIds,
  };
}
