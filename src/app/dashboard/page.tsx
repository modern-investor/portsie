import { createClient } from "@/lib/supabase/server";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import { hasSchwabCredentials } from "@/lib/schwab/credentials";
import { hasCompletedBrokerageSetup } from "@/lib/brokerage/setup-status";
import { DashboardShell } from "./components/dashboard-shell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [hasCredentials, isConnected] = await Promise.all([
    user ? hasSchwabCredentials(supabase, user.id) : false,
    user ? hasSchwabConnection(supabase, user.id) : false,
  ]);

  const hasSetup = user
    ? await hasCompletedBrokerageSetup(
        supabase,
        user.id,
        hasCredentials,
        isConnected
      )
    : false;

  return (
    <DashboardShell
      isConnected={isConnected}
      hasCredentials={hasCredentials}
      hasSetup={hasSetup}
    />
  );
}
