import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import { SchwabConnect } from "./components/schwab-connect";
import { AccountOverview } from "./components/account-overview";
import { PositionsTable } from "./components/positions-table";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isConnected = user ? await hasSchwabConnection(supabase, user.id) : false;

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <LogoutButton />
      </div>
      <p className="text-sm text-gray-600">
        Logged in as: {user?.email}
      </p>

      <SchwabConnect isConnected={isConnected} />

      {isConnected && (
        <>
          <AccountOverview />
          <PositionsTable />
        </>
      )}
    </div>
  );
}
