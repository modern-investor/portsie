import { getResendClient } from "./resend";
import {
  getEmailTemplate,
  renderTemplate,
  wrapInEmailLayout,
} from "./templates";

const FROM_ADDRESS = "Portsie <noreply@updates.portsie.com>";

interface SendTemplatedEmailOptions {
  to: string;
  templateKey: string;
  variables?: Record<string, string | number | undefined>;
}

/**
 * Send an email using a template from the email_templates table.
 * Fetches the template by key, renders placeholders, wraps in layout, and sends via Resend.
 */
export async function sendTemplatedEmail({
  to,
  templateKey,
  variables = {},
}: SendTemplatedEmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const template = await getEmailTemplate(templateKey);
    if (!template) {
      return { success: false, error: `Template "${templateKey}" not found` };
    }

    const subject = renderTemplate(template.subject_template, variables);
    const htmlBody = renderTemplate(template.html_template, variables);
    const text = renderTemplate(template.text_template, variables);
    const html = await wrapInEmailLayout(htmlBody);

    const resend = await getResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error(`[email/send] Resend error for "${templateKey}":`, error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[email/send] Exception sending "${templateKey}":`, message);
    return { success: false, error: message };
  }
}
