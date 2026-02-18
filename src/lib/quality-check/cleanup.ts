/**
 * Quality Check — Data Cleanup
 *
 * Clears canonical data written by a specific upload so it can be re-written
 * with corrected extraction data after a quality check fix.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { updateAccountSummary } from "@/lib/holdings/account-summary";

/**
 * Clear all canonical data written by a specific upload.
 * This deletes transactions, position_snapshots, balance_snapshots,
 * and holdings linked to the upload, then recomputes account summaries.
 */
export async function clearUploadData(
  supabase: SupabaseClient,
  userId: string,
  uploadId: string,
  linkedAccountIds: string[]
): Promise<void> {
  // 1. Delete transactions linked to this upload
  await supabase
    .from("transactions")
    .delete()
    .eq("user_id", userId)
    .eq("uploaded_statement_id", uploadId);

  // 2. Delete position snapshots linked to this upload (new FK column)
  await supabase
    .from("position_snapshots")
    .delete()
    .eq("user_id", userId)
    .eq("uploaded_statement_id", uploadId);

  // 3. Delete balance snapshots linked to this upload (new FK column)
  await supabase
    .from("balance_snapshots")
    .delete()
    .eq("user_id", userId)
    .eq("uploaded_statement_id", uploadId);

  // 4. Delete holdings linked to this upload
  //    Holdings use last_updated_from = 'upload:{statementId}' pattern
  for (const accountId of linkedAccountIds) {
    await supabase
      .from("holdings")
      .delete()
      .eq("account_id", accountId)
      .eq("last_updated_from", `upload:${uploadId}`);
  }

  // 5. Recompute account summaries for affected accounts
  for (const accountId of linkedAccountIds) {
    await updateAccountSummary(supabase, accountId);
  }

  // 6. Reset uploaded_statements metadata
  await supabase
    .from("uploaded_statements")
    .update({
      confirmed_at: null,
      transactions_created: 0,
      positions_created: 0,
      linked_account_ids: null,
      account_id: null,
      account_mappings: null,
    })
    .eq("id", uploadId);
}
