import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasCompletedBrokerageSetup(
  supabase: SupabaseClient,
  userId: string,
  hasSchwabCreds: boolean,
  hasSchwabConn: boolean
): Promise<boolean> {
  if (hasSchwabCreds || hasSchwabConn) return true;

  const { count: accountCount } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (accountCount && accountCount > 0) return true;

  const { count: uploadCount } = await supabase
    .from("uploaded_statements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (uploadCount && uploadCount > 0) return true;

  return false;
}
