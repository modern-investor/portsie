import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Portsie",
  description: "Portsie terms of service — rules and guidelines for using our platform.",
};

export default function TermsOfService() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Last updated: February 18, 2026
      </p>

      <div className="space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the services provided by Portsie LLC (&quot;Portsie,&quot;
            &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a Texas limited liability company,
            through our website at{" "}
            <Link href="https://www.portsie.com" className="underline hover:opacity-80">
              www.portsie.com
            </Link>{" "}
            and related services (collectively, the &quot;Service&quot;), you agree to be bound by
            these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not
            use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
          <p>
            Portsie is a portfolio investment tracking platform that allows users to connect
            brokerage accounts, upload financial documents, and view aggregated portfolio data. The
            Service uses artificial intelligence to extract data from uploaded documents.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Eligibility</h2>
          <p>
            You must be at least 18 years of age to use the Service. By using the Service, you
            represent and warrant that you meet this requirement and have the legal capacity to enter
            into these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Account Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You are responsible for all activities that occur under your account.</li>
            <li>You agree to provide accurate and complete information when creating your account.</li>
            <li>You must notify us immediately of any unauthorized use of your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Acceptable Use</h2>
          <p className="mb-2">You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the Service for any unlawful purpose.</li>
            <li>Attempt to gain unauthorized access to any part of the Service.</li>
            <li>Interfere with or disrupt the integrity or performance of the Service.</li>
            <li>Upload malicious files or content designed to exploit the Service.</li>
            <li>Use the Service to store or transmit content that infringes on third-party rights.</li>
            <li>Resell, redistribute, or sublicense access to the Service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Financial Data Disclaimer</h2>
          <p>
            <strong>Portsie is not a financial advisor, broker-dealer, or investment adviser.</strong>{" "}
            The Service is a data aggregation and tracking tool only. Nothing in the Service
            constitutes financial advice, investment advice, trading advice, or any other sort of
            advice. You should not make any financial decisions based solely on information presented
            by the Service. Portfolio data, valuations, and extracted information may contain errors
            or inaccuracies. Always verify data with your brokerage or financial institution.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. AI-Processed Data</h2>
          <p>
            The Service uses artificial intelligence and large language models to extract data from
            uploaded documents. While we strive for accuracy, AI-extracted data may contain errors,
            omissions, or misinterpretations. You are responsible for reviewing and verifying all
            extracted data before relying on it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Third-Party Integrations</h2>
          <p>
            The Service may integrate with third-party brokerage accounts and services. Your use of
            these integrations is subject to the respective third party&apos;s terms of service and
            privacy policy. We are not responsible for the availability, accuracy, or actions of
            third-party services.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Intellectual Property</h2>
          <p>
            The Service, including its design, code, features, and content (excluding user-submitted
            data), is owned by Portsie LLC and protected by applicable intellectual property laws.
            You retain ownership of all data you upload or connect to the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Portsie LLC and its officers,
            directors, members, employees, and agents shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, including but not limited to
            loss of profits, data, or other intangible losses, resulting from your use of or
            inability to use the Service. In no event shall our total liability exceed the amount you
            paid us, if any, in the twelve (12) months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">11. Disclaimer of Warranties</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties
            of any kind, either express or implied, including but not limited to implied warranties
            of merchantability, fitness for a particular purpose, and non-infringement. We do not
            warrant that the Service will be uninterrupted, error-free, or secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">12. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Portsie LLC and its officers,
            directors, members, employees, and agents from and against any claims, liabilities,
            damages, losses, and expenses arising out of or related to your use of the Service or
            violation of these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">13. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without
            cause, with or without notice. You may terminate your account at any time by contacting
            us. Upon termination, your right to use the Service ceases immediately and your data will
            be deleted.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">14. Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the State of
            Texas, without regard to its conflict of law provisions. Any legal action or proceeding
            arising under these Terms shall be brought exclusively in the state or federal courts
            located in Travis County, Texas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">15. Changes to These Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify you of material
            changes by posting the updated Terms on this page with a revised &quot;Last
            updated&quot; date. Your continued use of the Service after changes are posted
            constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">16. Contact Us</h2>
          <p>
            If you have questions about these Terms, please contact us at:{" "}
            <a href="mailto:legal@portsie.com" className="underline hover:opacity-80">
              legal@portsie.com
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
