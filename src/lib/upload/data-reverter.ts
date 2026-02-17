import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reverts a confirmed upload by deleting all data it created
 * and resetting the uploaded_statements record.
 *
 * Preserves extracted_data so the user can re-confirm to a different account.
 */
export async function revertConfirmedUpload(
  supabase: SupabaseClient,
  userId: string,
  statementId: string
): Promise<{
  transactionsDeleted: number;
  positionsDeleted: number;
  balancesDeleted: number;
}> {
  // 1. Delete transactions linked to this upload
  const { data: deletedTx, error: txErr } = await supabase
    .from("transactions")
    .delete()
    .eq("uploaded_statement_id", statementId)
    .eq("user_id", userId)
    .select("id");

  if (txErr)
    throw new Error(`Failed to delete transactions: ${txErr.message}`);

  // 2. Delete position_snapshots linked to this upload
  const { data: deletedPos, error: posErr } = await supabase
    .from("position_snapshots")
    .delete()
    .eq("uploaded_statement_id", statementId)
    .eq("user_id", userId)
    .select("id");

  if (posErr)
    throw new Error(`Failed to delete position snapshots: ${posErr.message}`);

  // 3. Delete balance_snapshots linked to this upload
  const { data: deletedBal, error: balErr } = await supabase
    .from("balance_snapshots")
    .delete()
    .eq("uploaded_statement_id", statementId)
    .eq("user_id", userId)
    .select("id");

  if (balErr)
    throw new Error(`Failed to delete balance snapshots: ${balErr.message}`);

  // 4. Reset the uploaded_statements record (keep extracted_data for re-review)
  const { error: updateErr } = await supabase
    .from("uploaded_statements")
    .update({
      confirmed_at: null,
      account_id: null,
      transactions_created: 0,
      positions_created: 0,
      parse_status: "completed", // back to "ready to review"
    })
    .eq("id", statementId)
    .eq("user_id", userId);

  if (updateErr)
    throw new Error(`Failed to reset upload record: ${updateErr.message}`);

  return {
    transactionsDeleted: deletedTx?.length ?? 0,
    positionsDeleted: deletedPos?.length ?? 0,
    balancesDeleted: deletedBal?.length ?? 0,
  };
}
