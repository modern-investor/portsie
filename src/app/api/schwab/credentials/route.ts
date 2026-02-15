import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  storeSchwabCredentials,
  hasSchwabCredentials,
  deleteSchwabCredentials,
} from "@/lib/schwab/credentials";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasCredentials = await hasSchwabCredentials(supabase, user.id);
  return NextResponse.json({ hasCredentials });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { appKey, appSecret } = await request.json();

  if (!appKey || !appSecret) {
    return NextResponse.json(
      { error: "App Key and App Secret are required" },
      { status: 400 }
    );
  }

  if (typeof appKey !== "string" || typeof appSecret !== "string") {
    return NextResponse.json(
      { error: "Invalid credential format" },
      { status: 400 }
    );
  }

  try {
    await storeSchwabCredentials(supabase, user.id, appKey.trim(), appSecret.trim());
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to store Schwab credentials:", error);
    return NextResponse.json(
      { error: "Failed to save credentials" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteSchwabCredentials(supabase, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete Schwab credentials:", error);
    return NextResponse.json(
      { error: "Failed to delete credentials" },
      { status: 500 }
    );
  }
}
