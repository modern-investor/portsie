import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { SiteVersion } from "@/components/site-version";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <SiteVersion className="text-gray-400" />
        </div>
        <LogoutButton />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Logged in as: {user?.email}
      </p>
    </div>
  );
}
