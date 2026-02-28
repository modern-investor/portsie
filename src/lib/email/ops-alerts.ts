import { getResendClient } from "./resend";

const DEFAULT_FROM = "Portsie Alerts <alerts@updates.portsie.com>";

interface LlmOpsAlertInput {
  reason: "anthropic_api_override" | "cli_extraction_failed";
  message: string;
  details?: Record<string, unknown>;
}

function getAlertRecipients(): string[] {
  const configured = process.env.LLM_ALERT_EMAIL_TO ?? process.env.OPS_ALERT_EMAIL_TO;
  const fallback = "rahulioson@gmail.com";
  const raw = configured ?? fallback;

  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export async function sendLlmOpsAlert(input: LlmOpsAlertInput): Promise<void> {
  try {
    const recipients = getAlertRecipients();
    if (recipients.length === 0) return;

    const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
    const subject = `[Portsie][LLM Alert][${env}] ${input.reason}`;
    const detailsJson = input.details
      ? JSON.stringify(input.details, null, 2)
      : "{}";

    const text = [
      `Reason: ${input.reason}`,
      `Environment: ${env}`,
      `Time: ${new Date().toISOString()}`,
      "",
      input.message,
      "",
      "Details:",
      detailsJson,
    ].join("\n");

    const resend = await getResendClient();
    const { error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: recipients,
      subject,
      text,
    });

    if (error) {
      console.error("[ops-alerts] Failed to send LLM alert:", error);
    }
  } catch (error) {
    console.error("[ops-alerts] Exception sending LLM alert:", error);
  }
}
