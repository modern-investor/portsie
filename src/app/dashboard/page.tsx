import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import { hasSchwabCredentials } from "@/lib/schwab/credentials";
import { DashboardShell } from "./components/dashboard-shell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [hasCredentials, isConnected, accountsResult, uploadsResult] =
    await Promise.all([
      user ? hasSchwabCredentials(supabase, user.id) : false,
      user ? hasSchwabConnection(supabase, user.id) : false,
      user
        ? supabase
            .from("accounts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
        : { count: 0 },
      user
        ? supabase
            .from("uploaded_statements")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
        : { count: 0 },
    ]);

  const hasAccounts = (accountsResult.count ?? 0) > 0;
  const hasUploads = (uploadsResult.count ?? 0) > 0;
  const hasAnyData = hasAccounts || hasUploads || isConnected;

  // First-time users with no data go straight to the connections page
  if (!hasAnyData) {
    redirect("/dashboard/connections");
  }

  return (
    <DashboardShell
      isConnected={isConnected}
      hasCredentials={hasCredentials}
    />
  );
}
