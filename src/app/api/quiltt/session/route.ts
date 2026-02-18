import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateQuilttProfile } from "@/lib/quiltt/session";

/**
 * POST /api/quiltt/session
 * Creates a Quiltt session token for the authenticated user.
 * Used by the client-side Quiltt connector widget.
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
    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { error: "User email required for Quiltt" },
        { status: 400 }
      );
    }

    const result = await getOrCreateQuilttProfile(supabase, user.id, email);

    return NextResponse.json({
      token: result.token,
      profileId: result.profileId,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error("Failed to create Quiltt session:", error);
    return NextResponse.json(
      { error: "Failed to create Quiltt session" },
      { status: 500 }
    );
  }
}
