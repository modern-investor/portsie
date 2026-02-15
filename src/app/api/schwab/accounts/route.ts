import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, SchwabApiClient } from "@/lib/schwab/client";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessToken = await getValidAccessToken(supabase, user.id);
    const client = new SchwabApiClient(accessToken);
    const accounts = await client.getAccounts("positions");
    return NextResponse.json(accounts);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SCHWAB_NOT_CONNECTED") {
        return NextResponse.json(
          { error: "Schwab account not connected" },
          { status: 404 }
        );
      }
      if (error.message === "SCHWAB_REFRESH_EXPIRED") {
        return NextResponse.json(
          { error: "Schwab connection expired, please reconnect" },
          { status: 401 }
        );
      }
      if (error.message === "SCHWAB_CREDENTIALS_NOT_FOUND") {
        return NextResponse.json(
          { error: "Schwab credentials not configured" },
          { status: 400 }
        );
      }
    }
    console.error("Failed to fetch Schwab accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
