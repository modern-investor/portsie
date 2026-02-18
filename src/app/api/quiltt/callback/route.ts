import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/quiltt/callback — Save a Quiltt connection result as an account */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { connectionId, profileId, institutionName } = await request.json();

  if (!connectionId) {
    return NextResponse.json(
      { error: "connectionId is required" },
      { status: 400 }
    );
  }

  try {
    // Check for duplicate connection
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("quiltt_connection_id", connectionId)
      .single();

    if (existing) {
      return NextResponse.json({ accountId: existing.id, action: "existing" });
    }

    // Create new account linked to Quiltt connection
    const { data: account, error } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        data_source: "quiltt",
        quiltt_connection_id: connectionId,
        institution_name: institutionName || "Connected Account",
        account_nickname: institutionName
          ? `${institutionName} Account`
          : "Linked Account",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create account: ${error.message}`);
    }

    // Update quiltt_profiles with profileId if provided and not yet saved
    if (profileId) {
      await supabase
        .from("quiltt_profiles")
        .update({ quiltt_profile_id: profileId })
        .eq("user_id", user.id);
    }

    return NextResponse.json({ accountId: account!.id, action: "created" });
  } catch (error) {
    console.error("Failed to save Quiltt connection:", error);
    return NextResponse.json(
      { error: "Failed to save connection" },
      { status: 500 }
    );
  }
}
