import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuilttProfileId } from "@/lib/quiltt/session";
import { importQuilttAccounts, syncAllQuilttAccounts } from "@/lib/quiltt/sync";

/**
 * POST /api/quiltt/callback
 * Called by the client after the Quiltt connector completes.
 * Imports new accounts and triggers initial data sync.
 *
 * Body: { connectionId: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const connectionId = body?.connectionId;

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 400 }
      );
    }

    const profileId = await getQuilttProfileId(supabase, user.id);
    if (!profileId) {
      return NextResponse.json(
        { error: "No Quiltt profile found" },
        { status: 404 }
      );
    }

    // Import any new accounts from Quiltt
    const importResult = await importQuilttAccounts(
      supabase,
      user.id,
      profileId
    );

    // Trigger initial sync for all Quiltt accounts
    const syncResult = await syncAllQuilttAccounts(
      supabase,
      user.id,
      profileId
    );

    return NextResponse.json({
      message: "Connection processed",
      connectionId,
      imported: importResult.imported,
      totalAccounts: importResult.total,
      sync: syncResult,
    });
  } catch (error) {
    console.error("Failed to process Quiltt callback:", error);
    return NextResponse.json(
      { error: "Failed to process connection" },
      { status: 500 }
    );
  }
}
