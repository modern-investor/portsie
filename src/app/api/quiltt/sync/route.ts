import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuilttProfileId } from "@/lib/quiltt/session";
import { syncAllQuilttAccounts } from "@/lib/quiltt/sync";

/**
 * POST /api/quiltt/sync
 * Triggers a manual sync of all Quiltt-linked accounts for the user.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profileId = await getQuilttProfileId(supabase, user.id);
    if (!profileId) {
      return NextResponse.json(
        { error: "No Quiltt profile found. Connect a bank account first." },
        { status: 404 }
      );
    }

    const result = await syncAllQuilttAccounts(supabase, user.id, profileId);

    return NextResponse.json({
      message: "Sync complete",
      ...result,
    });
  } catch (error) {
    console.error("Failed to sync Quiltt accounts:", error);
    return NextResponse.json(
      { error: "Failed to sync accounts" },
      { status: 500 }
    );
  }
}
