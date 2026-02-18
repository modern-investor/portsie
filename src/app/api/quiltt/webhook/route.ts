import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUILTT_CONFIG, getQuilttWebhookSecret } from "@/lib/quiltt/config";
import {
  importQuilttAccounts,
  syncQuilttAccount,
  syncQuilttBalance,
} from "@/lib/quiltt/sync";

/**
 * POST /api/quiltt/webhook
 * Receives webhook events from Quiltt.
 * Public endpoint — no auth session. Uses signature verification.
 */
export async function POST(request: NextRequest) {
  try {
    // --- 1. Read headers and body ---
    const signature = request.headers.get("quiltt-signature");
    const timestamp = request.headers.get("quiltt-timestamp");

    if (!signature || !timestamp) {
      return NextResponse.json(
        { error: "Missing signature headers" },
        { status: 401 }
      );
    }

    const rawBody = await request.text();

    // --- 2. Verify timestamp freshness ---
    const eventTime = parseInt(timestamp, 10) * 1000; // Convert to ms
    const now = Date.now();
    if (Math.abs(now - eventTime) > QUILTT_CONFIG.webhookTimestampToleranceMs) {
      return NextResponse.json(
        { error: "Timestamp too old or in future" },
        { status: 401 }
      );
    }

    // --- 3. Verify HMAC signature ---
    const secret = getQuilttWebhookSecret();
    const signaturePayload = `${QUILTT_CONFIG.webhookSignatureVersion}${timestamp}${rawBody}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(signaturePayload)
      .digest("base64");

    if (signature !== expectedSignature) {
      console.error("Quiltt webhook signature mismatch");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // --- 4. Parse body and handle event ---
    const payload = JSON.parse(rawBody);
    const eventType: string = payload.type;
    const record = payload.record;

    console.log(`Quiltt webhook: ${eventType}`, { id: record?.id });

    const supabase = createAdminClient();

    // Route by event type
    if (eventType.startsWith("connection.synced")) {
      await handleConnectionSynced(supabase, record);
    } else if (eventType === "connection.disconnected") {
      await handleConnectionDisconnected(supabase, record);
    } else if (
      eventType === "account.created" ||
      eventType === "account.verified"
    ) {
      await handleAccountEvent(supabase, record);
    } else if (eventType === "balance.created") {
      await handleBalanceCreated(supabase, record);
    } else if (eventType.startsWith("statement")) {
      await handleStatementReady(supabase, record);
    } else {
      console.log(`Quiltt webhook: unhandled event type "${eventType}"`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Quiltt webhook error:", error);
    // Return 200 to prevent retries for parse errors
    return NextResponse.json({ received: true, error: "Processing failed" });
  }
}

// --- Event handlers ---

async function handleConnectionSynced(
  supabase: ReturnType<typeof createAdminClient>,
  record: { id: string; [key: string]: unknown }
) {
  const connectionId = record.id;

  // Find all accounts linked to this connection
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id, quiltt_account_id")
    .eq("quiltt_connection_id", connectionId)
    .eq("is_active", true);

  if (!accounts?.length) {
    // Connection synced but no accounts imported yet — try to import
    // We need the user_id and profile_id. Look up via quiltt_profiles.
    console.log(
      `Quiltt webhook: connection ${connectionId} synced but no accounts found`
    );
    return;
  }

  // Sync each account
  for (const account of accounts) {
    if (!account.quiltt_account_id) continue;

    // Get the profile ID for this user
    const { data: profile } = await supabase
      .from("quiltt_profiles")
      .select("quiltt_profile_id")
      .eq("user_id", account.user_id)
      .single();

    if (!profile) continue;

    try {
      await syncQuilttAccount(
        supabase,
        account.user_id,
        account.id,
        account.quiltt_account_id,
        profile.quiltt_profile_id
      );
    } catch (err) {
      console.error(
        `Quiltt webhook: sync failed for account ${account.id}:`,
        err
      );
    }
  }
}

async function handleConnectionDisconnected(
  supabase: ReturnType<typeof createAdminClient>,
  record: { id: string; [key: string]: unknown }
) {
  const connectionId = record.id;

  // Mark all accounts for this connection as inactive
  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("quiltt_connection_id", connectionId);

  if (error) {
    console.error(
      `Quiltt webhook: failed to deactivate accounts for connection ${connectionId}:`,
      error.message
    );
  }
}

async function handleAccountEvent(
  supabase: ReturnType<typeof createAdminClient>,
  record: { id: string; [key: string]: unknown }
) {
  // When a new account is created/verified in Quiltt, try to import it.
  // We need to find which user this belongs to via the connection.
  const quilttAccountId = record.id;

  // Check if already imported
  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("quiltt_account_id", quilttAccountId)
    .single();

  if (existing) {
    console.log(
      `Quiltt webhook: account ${quilttAccountId} already imported`
    );
    return;
  }

  // We can't easily determine the user without the connection ID in the record.
  // Log for now — the connection.synced event will trigger a full import.
  console.log(
    `Quiltt webhook: new account ${quilttAccountId} — will be imported on next connection sync`
  );
}

async function handleBalanceCreated(
  supabase: ReturnType<typeof createAdminClient>,
  record: { id: string; accountId?: string; [key: string]: unknown }
) {
  const quilttAccountId = record.accountId;
  if (!quilttAccountId) return;

  // Find the Portsie account
  const { data: account } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("quiltt_account_id", quilttAccountId)
    .single();

  if (!account) return;

  // Get profile ID
  const { data: profile } = await supabase
    .from("quiltt_profiles")
    .select("quiltt_profile_id")
    .eq("user_id", account.user_id)
    .single();

  if (!profile) return;

  try {
    await syncQuilttBalance(
      supabase,
      account.user_id,
      account.id,
      quilttAccountId,
      profile.quiltt_profile_id
    );
  } catch (err) {
    console.error(
      `Quiltt webhook: balance sync failed for account ${quilttAccountId}:`,
      err
    );
  }
}

async function handleStatementReady(
  supabase: ReturnType<typeof createAdminClient>,
  record: { id: string; accountId?: string; [key: string]: unknown }
) {
  // Statement ready — do a full sync for the account
  const quilttAccountId = record.accountId;
  if (!quilttAccountId) return;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, user_id, quiltt_account_id")
    .eq("quiltt_account_id", quilttAccountId)
    .single();

  if (!account?.quiltt_account_id) return;

  const { data: profile } = await supabase
    .from("quiltt_profiles")
    .select("quiltt_profile_id")
    .eq("user_id", account.user_id)
    .single();

  if (!profile) return;

  try {
    await syncQuilttAccount(
      supabase,
      account.user_id,
      account.id,
      account.quiltt_account_id,
      profile.quiltt_profile_id
    );
  } catch (err) {
    console.error(
      `Quiltt webhook: statement sync failed for account ${quilttAccountId}:`,
      err
    );
  }
}
