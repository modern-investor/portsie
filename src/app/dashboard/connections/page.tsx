import { createClient } from "@/lib/supabase/server";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import { hasSchwabCredentials } from "@/lib/schwab/credentials";
import { ConnectionsView } from "../components/connections-view";

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
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4 sm:px-6 sm:py-6 sm:space-y-6">
      <h1 className="text-lg font-semibold sm:text-xl">Connections</h1>
      <ConnectionsView
        isConnected={isConnected}
        hasCredentials={hasCredentials}
      />
    </div>
  );
}
