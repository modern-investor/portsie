import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "License | Portsie",
  description: "Portsie is open source and free — GNU Affero General Public License v3.",
};

export default function LicensePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold mb-2">License</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Portsie is open source and free, licensed under the GNU Affero General Public License v3
        (AGPL-3.0). Anyone who modifies and runs Portsie as a network service must make the source
        code available to its users.
      </p>

      <div className="space-y-4 text-sm">
        <p>
          <strong>You may:</strong> use, modify, and distribute Portsie; run it yourself or as a
          service; charge for hosting or support.
        </p>
        <p>
          <strong>You must:</strong> share the source code of any modified version you convey, and
          if you run it as a network server, offer users a way to obtain the Corresponding Source.
        </p>
      </div>

      <p className="mt-8 text-sm">
        <Link
          href="https://www.gnu.org/licenses/agpl-3.0.html"
          className="underline hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          Full AGPL-3.0 text (gnu.org)
        </Link>
      </p>

      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground">
          Back to home
        </Link>
      </p>
    </div>
  );
}
