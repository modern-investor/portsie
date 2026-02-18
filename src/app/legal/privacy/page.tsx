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
        Last updated: February 18, 2026
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
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
          <p className="mb-2">We may collect the following types of information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account Information:</strong> Name, email address, and authentication
              credentials when you create an account.
            </li>
            <li>
              <strong>Financial Data:</strong> Brokerage account information, portfolio holdings,
              transactions, and balances that you connect or upload to the Service.
            </li>
            <li>
              <strong>Uploaded Documents:</strong> Financial statements, reports, and other documents
              you upload for data extraction.
            </li>
            <li>
              <strong>Usage Data:</strong> Information about how you interact with the Service,
              including pages visited, features used, and device information.
            </li>
            <li>
              <strong>Cookies and Similar Technologies:</strong> We use essential cookies to maintain
              your session and preferences.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. How We Use Your Information</h2>
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
          <h2 className="text-lg font-semibold mb-2">4. Third-Party Services</h2>
          <p>
            We use third-party services to operate the Service. These may include authentication
            providers (Google, Supabase), brokerage API integrations (Charles Schwab), AI/LLM
            providers for document processing, and cloud hosting services. These providers may
            process your data in accordance with their own privacy policies. We only share the
            minimum information necessary for these services to function.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Data Security</h2>
          <p>
            We take reasonable measures to protect your personal information. Sensitive data such as
            brokerage credentials and API keys are encrypted at rest using AES-256-GCM encryption.
            All data is transmitted over HTTPS. Row-level security policies ensure that users can
            only access their own data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Data Retention</h2>
          <p>
            We retain your personal information for as long as your account is active or as needed
            to provide the Service. You may request deletion of your account and associated data at
            any time by contacting us. When an account is deleted, all associated data is
            permanently removed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access the personal information we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your data.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Request portability of your data.</li>
          </ul>
          <p className="mt-2">
            Texas residents may have additional rights under the Texas Data Privacy and Security Act
            (TDPSA). To exercise any of these rights, contact us using the information below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for individuals under the age of 18. We do not knowingly
            collect personal information from children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material
            changes by posting the updated policy on this page with a revised &quot;Last
            updated&quot; date.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:{" "}
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
