import { createClient } from "@/lib/supabase/server";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import { hasSchwabCredentials } from "@/lib/schwab/credentials";
import { ConnectionsShell } from "./components/connections-shell";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [hasCredentials, isConnected] = await Promise.all([
    user ? hasSchwabCredentials(supabase, user.id) : false,
    user ? hasSchwabConnection(supabase, user.id) : false,
  ]);

  return (
    <ConnectionsShell
      isConnected={isConnected}
      hasCredentials={hasCredentials}
    />
  );
}
