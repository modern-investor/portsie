import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Portsie",
  description: "Portsie privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Last updated: February 25, 2026
      </p>

      <div className="space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
          <p>
            Portsie LLC (&quot;Portsie,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is a Texas limited
            liability company. This Privacy Policy describes how we collect, use, disclose, and
            protect your personal information when you use our website at{" "}
            <Link href="https://www.portsie.com" className="underline hover:opacity-80">
              www.portsie.com
            </Link>{" "}
            and related services (collectively, the &quot;Service&quot;).
          </p>
          <p className="mt-2">
            We&apos;ve written this policy in plain language so anyone can understand how their data
            is handled. We also provide technical details and code references for transparency.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. What Portsie Does</h2>
          <p>
            Portsie is a portfolio investment tracker. You can connect your brokerage account
            (like Charles Schwab) or upload financial documents (PDFs, CSVs, spreadsheets, images)
            and Portsie will extract and organize your holdings, balances, and transactions into
            a single dashboard.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Information We Collect</h2>
          <p className="mb-2">We may collect the following types of information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account Information:</strong> Email address, used for login and account
              recovery.
            </li>
            <li>
              <strong>Brokerage Connection:</strong> If you connect Charles Schwab, we store OAuth
              tokens (encrypted) to access your account data on your behalf.
            </li>
            <li>
              <strong>Financial Data:</strong> Positions (symbol, quantity, market value), balances
              (cash, equity, buying power), transactions (buy/sell/dividend history), and account
              details (account number stored encrypted, institution name, account type).
            </li>
            <li>
              <strong>Uploaded Documents:</strong> Financial statements, reports, and other documents
              you upload for data extraction, stored in isolated per-user storage.
            </li>
            <li>
              <strong>Cookies and Similar Technologies:</strong> We use essential cookies to
              maintain your session and preferences.
            </li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">What We Do NOT Collect</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>We do not collect your Social Security number, date of birth, or government ID.</li>
            <li>We do not store your brokerage password — we use industry-standard OAuth.</li>
            <li>We do not collect browsing history, device fingerprints, or analytics cookies.</li>
            <li>We do not sell or share your data with advertisers.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide, maintain, and improve the Service.</li>
            <li>To process and display your portfolio data.</li>
            <li>To extract financial data from uploaded documents using AI/LLM services.</li>
            <li>To authenticate your identity and secure your account.</li>
            <li>To communicate with you about the Service.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. How We Process Your Documents</h2>
          <p className="mb-2">When you upload a financial document, here&apos;s what happens:</p>
          <ol className="list-decimal pl-6 space-y-1">
            <li>
              <strong>Upload</strong> — Your file is stored in encrypted, per-user cloud storage.
            </li>
            <li>
              <strong>AI Extraction</strong> — The file is sent to an AI model to read and extract
              the financial data (positions, balances, transactions).
            </li>
            <li>
              <strong>Data Storage</strong> — Only the structured output is saved. The raw AI
              response is <strong>discarded immediately</strong> and replaced with a minimal
              diagnostic summary (model used, processing time, token count).
            </li>
            <li>
              <strong>Confirmation</strong> — Data is written to your portfolio after extraction.
            </li>
          </ol>

          <h3 className="font-semibold mt-4 mb-2">Which AI Models Process Your Data?</h3>
          <p>
            By default, Portsie uses <strong>Google Gemini</strong> for document extraction. If
            Gemini is unavailable, it falls back to <strong>Claude</strong> (by Anthropic). You
            can also configure your own Anthropic API key in Settings.
          </p>
          <p className="mt-2">
            <strong>What the AI model sees:</strong> The content of your uploaded document (text,
            images, or tables). This is sent via API and processed in real-time — it is not stored
            by the AI provider for training purposes.
          </p>
          <p className="mt-2">
            <strong>What we keep:</strong> Only the structured output (positions, balances,
            transactions) plus a small diagnostic summary called{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">debug_context</code> (which
            model was used, processing time, token count). We do <strong>not</strong> store the
            full AI response, the raw extraction output, or any intermediate processing data.
          </p>
          <p className="mt-2">
            <strong>What we removed:</strong> As part of our privacy hardening, we dropped database
            columns that previously stored raw AI responses{" "}
            (<code className="text-xs bg-muted px-1 py-0.5 rounded">raw_llm_response</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">verification_raw_response</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">detected_account_info</code>).
            These fields no longer exist in our database.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. How We Protect Your Data</h2>
          <p className="mb-3">
            Privacy is built into the foundation of Portsie, not bolted on as an afterthought.
            We implemented a dedicated privacy layer with field-level encryption, tokenization,
            data minimization, and automatic log redaction — validated by a 42-test suite.
          </p>

          <h3 className="font-semibold mt-4 mb-2">Field-Level Encryption</h3>
          <p className="mb-2">
            All sensitive fields are encrypted before storage using{" "}
            <strong>AES-256-GCM</strong>, the same encryption standard used by banks and
            governments. Each encrypted value uses a versioned ciphertext format{" "}
            (<code className="text-xs bg-muted px-1 py-0.5 rounded">v1.[iv].[tag].[ciphertext]</code>)
            with a unique initialization vector, making every ciphertext unique even for identical
            inputs. The versioned format enables future key rotation without re-encrypting all data
            at once.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse mt-2 mb-3">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-semibold">Data</th>
                  <th className="py-2 font-semibold">Protection</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Brokerage OAuth tokens</td>
                  <td className="py-2">AES-256-GCM encryption</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Brokerage app credentials</td>
                  <td className="py-2">AES-256-GCM encryption</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Account numbers</td>
                  <td className="py-2">AES-256-GCM encryption + HMAC-SHA256 token for lookups</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">LLM API keys (if you provide one)</td>
                  <td className="py-2">AES-256-GCM encryption</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            Implementation:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/crypto.ts</code>
          </p>

          <h3 className="font-semibold mt-5 mb-2">Account Number Tokenization</h3>
          <p>
            Account numbers receive additional protection through <strong>HMAC-SHA256
            tokenization</strong> with domain separation. This creates a one-way token that lets
            us match &quot;does this uploaded account number correspond to an existing
            account?&quot; without ever storing the plaintext number in a searchable field. The
            domain separation ensures tokens generated for different purposes (e.g., account
            matching vs. deduplication) cannot be cross-referenced. Only a last-4-digit hint{" "}
            (<code className="text-xs bg-muted px-1 py-0.5 rounded">account_number_hint</code>)
            is stored in plaintext for display in the UI.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Implementation:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/crypto.ts</code>{" "}
            (tokenization),{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/mappers/accounts.ts</code>{" "}
            (account number mapping)
          </p>

          <h3 className="font-semibold mt-5 mb-2">Type-Safe Privacy</h3>
          <p>
            Encrypted and tokenized values use <strong>branded types</strong> in our codebase{" "}
            (<code className="text-xs bg-muted px-1 py-0.5 rounded">EncryptedField</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">TokenizedField</code>).
            This means the TypeScript compiler prevents developers from accidentally storing
            plaintext where ciphertext is expected, or mixing up encrypted values with tokens.
            Privacy violations are caught at build time, not at runtime.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Implementation:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/types.ts</code>
          </p>

          <h3 className="font-semibold mt-5 mb-2">Data Minimization</h3>
          <p>We actively minimize data at every stage:</p>
          <ul className="list-disc pl-6 space-y-1 mt-1">
            <li>
              <strong>Raw AI responses are never stored.</strong> After extraction, only the
              structured output and a minimal{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">debug_context</code>{" "}
              (model name, timing, token count) are kept.
            </li>
            <li>
              <strong>Plaintext account numbers are never stored.</strong> The original{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">schwab_account_number</code>{" "}
              column was dropped and replaced with encrypted + tokenized fields.
            </li>
            <li>
              <strong>Uploaded source files</strong> have a configurable retention period (default
              30 days in strict mode) and can be deleted at any time.
            </li>
          </ul>
          <p className="mt-1 text-muted-foreground text-xs">
            Implementation:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/mappers/uploads.ts</code>{" "}
            (extraction sanitization),{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/config.ts</code>{" "}
            (privacy modes)
          </p>

          <h3 className="font-semibold mt-5 mb-2">Data Isolation</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Every database table uses <strong>Row-Level Security (RLS)</strong> — you can only
              access your own data, enforced at the database level.
            </li>
            <li>Uploaded files are stored in per-user folders with access policies.</li>
            <li>Admin views show redacted emails and exclude sensitive fields.</li>
          </ul>

          <h3 className="font-semibold mt-5 mb-2">Automatic Log Redaction</h3>
          <p>
            All server-side logging uses a <strong>safe logging function</strong> that
            automatically redacts sensitive fields before they reach any log output. Account
            numbers, OAuth tokens, API keys, and email addresses are never written to logs. This
            applies across the entire pipeline: the extraction route, database writer, LLM
            dispatcher, data writer, and all admin endpoints.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Implementation:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/redaction.ts</code>{" "}
            — <code className="bg-muted px-1 py-0.5 rounded">safeLog()</code>,{" "}
            <code className="bg-muted px-1 py-0.5 rounded">redactForLog()</code>,{" "}
            <code className="bg-muted px-1 py-0.5 rounded">redactAccountNumber()</code>,{" "}
            <code className="bg-muted px-1 py-0.5 rounded">redactEmail()</code>
          </p>

          <h3 className="font-semibold mt-5 mb-2">Admin Endpoint Hardening</h3>
          <p>
            Admin API endpoints are hardened to prevent data leakage even for privileged users:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-1">
            <li>Quality-checks endpoints exclude raw JSONB data and mask email addresses.</li>
            <li>
              User listing endpoints mask emails using{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">redactEmail()</code>{" "}
              (e.g., &quot;j***@example.com&quot;).
            </li>
            <li>No admin endpoint returns encrypted fields, tokens, or API keys.</li>
          </ul>

          <h3 className="font-semibold mt-5 mb-2">Pipeline Hardening</h3>
          <p>
            The document extraction pipeline was hardened to minimize sensitive data at every step:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-1">
            <li>
              The extract route stores only{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">debug_context</code>{" "}
              — never the raw AI response.
            </li>
            <li>
              Account creation stores encrypted account numbers and HMAC tokens — never plaintext.
            </li>
            <li>
              Account matching uses{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">account_number_hint</code>{" "}
              (last 4 digits) instead of plaintext numbers for comparison.
            </li>
          </ul>

          <h3 className="font-semibold mt-5 mb-2">Privacy Modes</h3>
          <p>
            Portsie supports two privacy modes controlled by server configuration:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-1">
            <li>
              <strong>Strict mode</strong> (default in production) — 30-day source file retention,
              maximum data minimization.
            </li>
            <li>
              <strong>Standard mode</strong> (development) — relaxed retention for debugging.
            </li>
          </ul>
          <p className="mt-1 text-muted-foreground text-xs">
            Implementation:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/config.ts</code>
          </p>

          <h3 className="font-semibold mt-5 mb-2">Transit Security</h3>
          <p>
            All data is transmitted over HTTPS. Communications with AI providers and brokerage
            APIs use encrypted connections.
          </p>

          <h3 className="font-semibold mt-5 mb-2">Automated Testing</h3>
          <p>
            Our privacy protections are validated by a <strong>42-test suite</strong> covering:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-1">
            <li>Encryption round-trip (encrypt → decrypt produces original value)</li>
            <li>Tokenization determinism (same input always produces same token)</li>
            <li>Domain separation (tokens for different purposes cannot be cross-referenced)</li>
            <li>Log redaction (sensitive fields never appear in log output)</li>
            <li>Privacy mode configuration</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Data Retention</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse mt-2 mb-3">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-semibold">Data</th>
                  <th className="py-2 font-semibold">Retention</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Account and portfolio data</td>
                  <td className="py-2">Kept until you delete your account</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Uploaded source files</td>
                  <td className="py-2">30 days after processing (strict mode); configurable</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Raw AI responses</td>
                  <td className="py-2 font-semibold">Never stored (columns removed from database)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">AI diagnostic context</td>
                  <td className="py-2">Kept with upload metadata (model name, timing only)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">Brokerage tokens</td>
                  <td className="py-2">Kept until you disconnect; auto-expire</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Account numbers (plaintext)</td>
                  <td className="py-2 font-semibold">Never stored (column removed from database)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            You can delete any upload and its associated data at any time from the dashboard. When
            an account is deleted, all associated data is permanently removed via cascading
            deletes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Schema Changes for Privacy</h2>
          <p className="mb-2">
            We actively remove database columns that could store sensitive data unnecessarily.
            The following columns were dropped as part of our privacy hardening:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse mt-2 mb-3">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-semibold">Table</th>
                  <th className="py-2 pr-4 font-semibold">Removed Column</th>
                  <th className="py-2 font-semibold">Replaced With</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">accounts</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">schwab_account_number</code>
                  </td>
                  <td className="py-2">
                    Encrypted field + HMAC token + last-4-digit hint
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">uploaded_statements</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">raw_llm_response</code>
                  </td>
                  <td className="py-2">
                    Minimal <code className="text-xs bg-muted px-1 py-0.5 rounded">debug_context</code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">uploaded_statements</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">verification_raw_response</code>
                  </td>
                  <td className="py-2">Not replaced (unnecessary)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4">uploaded_statements</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">detected_account_info</code>
                  </td>
                  <td className="py-2">Not replaced (unnecessary)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">extraction_failures</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">raw_llm_response</code>
                  </td>
                  <td className="py-2">Not replaced (unnecessary)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Third-Party Services</h2>

          <h3 className="font-semibold mt-3 mb-2">Cloud Infrastructure</h3>
          <p>
            <strong>Supabase</strong> (database, authentication, file storage) — hosted on AWS in
            Seoul (ap-northeast-2). Your data is encrypted at rest by Supabase/AWS. Supabase
            cannot read our application-level encrypted fields without our encryption keys.
          </p>

          <h3 className="font-semibold mt-4 mb-2">AI Providers</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Google (Gemini)</strong> — processes uploaded documents for data extraction.
              Google&apos;s API terms state that API data is not used for model training.
            </li>
            <li>
              <strong>Anthropic (Claude)</strong> — fallback extraction engine and optional
              user-configured provider. Anthropic&apos;s API terms state that API data is not used
              for model training.
            </li>
          </ul>

          <h3 className="font-semibold mt-4 mb-2">What Third Parties See</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>AI providers</strong> see the content of your uploaded documents during
              processing (not stored by them, not used for training).
            </li>
            <li>
              <strong>Supabase/AWS</strong> stores your encrypted data (they cannot read
              application-encrypted fields without our encryption keys).
            </li>
            <li>
              <strong>No other third parties</strong> receive your data.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Current Architecture: Managed Cloud</h2>
          <p>In the current managed cloud mode:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Portsie operates the infrastructure (Supabase project, encryption keys, AI API keys).</li>
            <li>Your data is encrypted at rest and in transit.</li>
            <li>Row-Level Security ensures each user&apos;s data is isolated at the database level.</li>
            <li>
              Encryption keys are stored as server environment variables — the Portsie team has
              access to them for operational purposes.
            </li>
          </ul>
          <p className="mt-3 p-3 bg-muted/50 rounded-md">
            <strong>What this means:</strong> While your data is strongly protected against
            external threats and other users, the Portsie team technically has the ability to
            decrypt sensitive fields using the server-side encryption keys. This is standard for
            managed cloud services (similar to how your bank can access your account data).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">11. Future: Bring Your Own Backend (BYOB)</h2>
          <p>
            We are building a <strong>Bring Your Own Backend (BYOB)</strong> mode where you can:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>
              <strong>Provide your own Supabase project</strong> — your data lives entirely in
              your own cloud account.
            </li>
            <li>
              <strong>Provide your own encryption keys</strong> — Portsie never sees or stores
              them.
            </li>
            <li>
              <strong>Provide your own AI API keys</strong> — documents are processed using your
              own accounts.
            </li>
          </ul>
          <p className="mt-2">
            In BYOB mode, Portsie becomes a zero-knowledge client: the application code runs
            against your infrastructure, and we cannot access your data even if we wanted to. This
            is the strongest privacy guarantee possible for a cloud application.
          </p>
          <p className="mt-2 text-muted-foreground">
            BYOB mode is not yet available. When it launches, existing users will be able to
            migrate their data to their own backend.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">12. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>
              <strong>Access</strong> — View all your data in the dashboard at any time.
            </li>
            <li>
              <strong>Delete</strong> — Delete individual uploads, accounts, or your entire
              account.
            </li>
            <li>
              <strong>Export</strong> — Your financial data is yours; we support data export.
            </li>
            <li>
              <strong>Control</strong> — Choose which AI provider processes your documents and
              bring your own API key.
            </li>
            <li>Request correction of inaccurate data.</li>
            <li>Object to or restrict certain processing.</li>
          </ul>
          <p className="mt-2">
            Texas residents may have additional rights under the Texas Data Privacy and Security
            Act (TDPSA). To exercise any of these rights, contact us using the information below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">13. Privacy Documentation</h2>
          <p>
            For full technical transparency, we maintain the following internal documentation
            that describes our privacy architecture in detail:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>
              <strong>Privacy Architecture &amp; Controls</strong> — Threat model, encryption
              scheme, data flow, trust boundaries.
            </li>
            <li>
              <strong>Data Classification Matrix</strong> — Per-table, per-field classification
              (public, internal, confidential, restricted) with storage treatment.
            </li>
            <li>
              <strong>Operations Runbook</strong> — Key generation/rotation procedures, retention
              enforcement, incident response checklist.
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground text-xs">
            Source code:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">src/lib/privacy/</code> — encryption,
            tokenization, redaction, privacy config, and field mappers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">14. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for individuals under the age of 18. We do not knowingly
            collect personal information from children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">15. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material
            changes by posting the updated policy on this page with a revised &quot;Last
            updated&quot; date.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">16. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or how your data is handled, please
            contact us at:{" "}
            <a href="mailto:privacy@portsie.com" className="underline hover:opacity-80">
              privacy@portsie.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-border">
        <Link href="/" className="text-sm text-muted-foreground underline hover:opacity-80">
          &larr; Back to Portsie
        </Link>
      </div>
    </div>
  );
}
