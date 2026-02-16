import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdmin } from "@/lib/supabase/admin";

export async function GET() {
  // Verify caller is authenticated and is an admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const adminClient = createAdminClient();

    // Get all auth users
    const { data: authData, error: authError } =
      await adminClient.auth.admin.listUsers();
    if (authError) throw authError;

    // Get all user profiles
    const { data: profiles } = await adminClient
      .from("user_profiles")
      .select("user_id, role");

    // Get all schwab_tokens (check connection status)
    const { data: tokens } = await adminClient
      .from("schwab_tokens")
      .select("user_id, refresh_token_expires_at");

    // Get all schwab_credentials (check if credentials exist)
    const { data: credentials } = await adminClient
      .from("schwab_credentials")
      .select("user_id");

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p.role])
    );
    const tokenMap = new Map(
      (tokens ?? []).map((t) => [t.user_id, t.refresh_token_expires_at])
    );
    const credentialSet = new Set(
      (credentials ?? []).map((c) => c.user_id)
    );

    const users = authData.users.map((u) => {
      const refreshExpires = tokenMap.get(u.id);
      const schwabConnected = refreshExpires
        ? new Date() < new Date(refreshExpires)
        : false;

      return {
        id: u.id,
        email: u.email,
        role: profileMap.get(u.id) ?? "user",
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
        schwabConnected,
        schwabCredentials: credentialSet.has(u.id),
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to list users:", error);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}
