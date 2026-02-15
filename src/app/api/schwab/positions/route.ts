import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, SchwabApiClient } from "@/lib/schwab/client";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountHash = request.nextUrl.searchParams.get("accountHash");

  try {
    const accessToken = await getValidAccessToken(supabase, user.id);
    const client = new SchwabApiClient(accessToken);

    if (accountHash) {
      const account = await client.getAccount(accountHash, "positions");
      return NextResponse.json(
        account.securitiesAccount.positions ?? []
      );
    }

    // If no specific account, get all accounts with positions
    const accounts = await client.getAccounts("positions");
    const allPositions = accounts.flatMap(
      (a) => a.securitiesAccount.positions ?? []
    );
    return NextResponse.json(allPositions);
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
    }
    console.error("Failed to fetch positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
