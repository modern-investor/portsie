import { createAdminClient } from "@/lib/supabase/admin";

export interface EmailTemplate {
  id: string;
  template_key: string;
  category: string;
  sender_type: string;
  subject_template: string;
  html_template: string;
  text_template: string;
  placeholders: { key: string; label: string; required: boolean }[];
  is_active: boolean;
  version: number;
}

/**
 * Fetch an active email template by its key from the email_templates table.
 */
export async function getEmailTemplate(
  templateKey: string
): Promise<EmailTemplate | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error(
      `[email/templates] Failed to fetch template "${templateKey}":`,
      error?.message
    );
    return null;
  }

  return data as EmailTemplate;
}

/**
 * Render a Handlebars-style template string by replacing {{placeholder}} tokens.
 * Supports simple {{#if key}}...{{else}}...{{/if}} blocks.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined>
): string {
  // Process {{#if key}}...{{else}}...{{/if}} blocks
  let result = template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, inner: string) => {
      const hasElse = inner.includes("{{else}}");
      if (hasElse) {
        const [truthy, falsy] = inner.split("{{else}}");
        return variables[key] ? truthy : falsy;
      }
      return variables[key] ? inner : "";
    }
  );

  // Replace simple {{key}} placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value !== undefined ? String(value) : "";
  });

  return result;
}

/**
 * Fetch the current tagline from the style_guide branding column.
 */
async function getTagline(): Promise<string> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("style_guide")
      .select("branding")
      .eq("id", 1)
      .single();

    return (
      (data?.branding as { tagline?: string } | null)?.tagline ??
      "The AI Agent for your Portfolio. Now with ultra-mega-max intelligence.\u2122"
    );
  } catch {
    return "The AI Agent for your Portfolio. Now with ultra-mega-max intelligence.\u2122";
  }
}

/**
 * Wraps HTML email content in a standard Portsie email layout.
 * Fetches the tagline from the DB for the footer.
 */
export async function wrapInEmailLayout(htmlBody: string): Promise<string> {
  const tagline = await getTagline();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e5e5;">
              <img src="https://portsie.vercel.app/brand/portsie-wordmark-dark.png" alt="Portsie" width="120" style="display:block;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;color:#171717;font-size:16px;line-height:1.6;">
              ${htmlBody}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e5e5;color:#737373;font-size:13px;">
              <p style="margin:0;">Portsie &mdash; ${tagline}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
