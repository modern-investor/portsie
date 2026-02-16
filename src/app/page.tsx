import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-10 text-center">
        {/* Large branding */}
        <div className="flex flex-col items-center gap-5">
          <Image
            src="/brand/portsie-icon-blue.png"
            alt="Portsie"
            width={120}
            height={120}
            priority
          />
          <Image
            src="/brand/portsie-wordmark-dark.png"
            alt="PORTSIE"
            width={220}
            height={44}
            priority
          />
          <p className="text-muted-foreground">
            Portfolio investment tracker
          </p>
        </div>

        {/* Auth actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
