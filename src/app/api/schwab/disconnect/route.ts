import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteSchwabTokens } from "@/lib/schwab/tokens";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteSchwabTokens(supabase, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to disconnect Schwab:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Schwab account" },
      { status: 500 }
    );
  }
}
