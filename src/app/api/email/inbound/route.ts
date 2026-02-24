import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/email/resend";

/**
 * Forwarding rules: map recipient addresses to forwarding destinations.
 */
const FORWARDING_RULES: Record<string, string[]> = {
  "accounts@portsie.com": ["moderefugee@gmail.com"],
  "rahulio@portsie.com": ["rahulioson@gmail.com"],
  "privacy@portsie.com": ["modrefugee@gmail.com"],
};

/**
 * POST /api/email/inbound
 * Webhook handler for Resend email.received events.
 * Forwards matching emails based on FORWARDING_RULES.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (type !== "email.received") {
      return NextResponse.json({ message: "ignored" }, { status: 200 });
    }

    const emailId: string = data?.email_id;
    const to: string[] = data?.to ?? [];

    if (!emailId) {
      console.error("[email/inbound] Missing email_id in webhook payload");
      return NextResponse.json({ error: "missing email_id" }, { status: 400 });
    }

    const resend = await getResendClient();

    for (const recipient of to) {
      const normalized = recipient.toLowerCase().trim();
      const destinations = FORWARDING_RULES[normalized];

      if (destinations) {
        for (const dest of destinations) {
          const { error } = await resend.emails.receiving.forward({
            emailId,
            to: dest,
            from: normalized,
          });

          if (error) {
            console.error(
              `[email/inbound] Failed to forward ${normalized} → ${dest}:`,
              error
            );
          } else {
            console.log(`[email/inbound] Forwarded ${normalized} → ${dest}`);
          }
        }
      }
    }

    return NextResponse.json({ message: "ok" }, { status: 200 });
  } catch (err) {
    console.error("[email/inbound] Webhook error:", err);
    return NextResponse.json(
      { error: "internal error" },
      { status: 500 }
    );
  }
}
