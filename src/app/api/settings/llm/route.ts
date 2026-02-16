import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  storeLLMSettings,
  getLLMSettings,
  deleteLLMApiKey,
} from "@/lib/llm/settings";
import type { LLMMode } from "@/lib/llm/types";

/** GET /api/settings/llm — Return current LLM settings (no raw API key) */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getLLMSettings(supabase, user.id);
  return NextResponse.json({
    llmMode: settings?.llmMode ?? "cli",
    hasApiKey: settings?.hasApiKey ?? false,
    cliEndpoint: settings?.cliEndpoint ?? null,
  });
}

/** POST /api/settings/llm — Update LLM settings (mode, API key, CLI endpoint) */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { llmMode, apiKey, cliEndpoint } = body as {
    llmMode?: LLMMode;
    apiKey?: string | null;
    cliEndpoint?: string | null;
  };

  // Validate mode
  const mode: LLMMode = llmMode ?? "cli";
  if (mode !== "cli" && mode !== "api") {
    return NextResponse.json({ error: "Invalid LLM mode" }, { status: 400 });
  }

  // If switching to API mode without providing a new key, check for an existing one
  if (mode === "api" && !apiKey) {
    const existing = await getLLMSettings(supabase, user.id);
    if (!existing?.hasApiKey) {
      return NextResponse.json(
        { error: "API key required for API mode" },
        { status: 400 }
      );
    }
  }

  try {
    await storeLLMSettings(
      supabase,
      user.id,
      mode,
      apiKey?.trim() ?? null,
      cliEndpoint?.trim() ?? null
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to store LLM settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

/** DELETE /api/settings/llm — Remove API key and revert to CLI mode */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteLLMApiKey(supabase, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete API key:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 }
    );
  }
}
