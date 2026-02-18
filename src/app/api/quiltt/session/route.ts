import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateQuilttSession } from "@/lib/quiltt/session";

/** GET /api/quiltt/session — Get or create a Quiltt session token for the current user */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token, profileId } = await getOrCreateQuilttSession(
      supabase,
      user.id,
      user.email!
    );
    return NextResponse.json({ token, profileId });
  } catch (error) {
    console.error("Failed to create Quiltt session:", error);
    return NextResponse.json(
      { error: "Failed to create Quiltt session" },
      { status: 500 }
    );
  }
}
