import { createClient } from "@/lib/supabase/server";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import { hasSchwabCredentials } from "@/lib/schwab/credentials";
import { DashboardShell } from "./components/dashboard-shell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hasCredentials = user ? await hasSchwabCredentials(supabase, user.id) : false;
  const isConnected = user ? await hasSchwabConnection(supabase, user.id) : false;

  return (
    <DashboardShell
      isConnected={isConnected}
      hasCredentials={hasCredentials}
      userEmail={user?.email ?? ""}
    />
  );
}
