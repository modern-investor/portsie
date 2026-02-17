import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/supabase/admin";
import { SiteVersion } from "@/components/site-version";
import { SiteHeaderAuth } from "@/components/site-header-auth";
import { SiteHeaderNav } from "@/components/site-header-nav";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userIsAdmin = user ? await isAdmin(supabase, user.id) : false;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* Left: Logo + Wordmark + Version */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2">
            <Image
              src="/brand/portsie-icon-dark.png"
              alt="Portsie"
              width={28}
              height={28}
              className="shrink-0"
            />
            <Image
              src="/brand/portsie-wordmark-dark.png"
              alt="PORTSIE"
              width={80}
              height={16}
              className="hidden shrink-0 sm:block"
            />
          </Link>
          <SiteVersion className="hidden text-muted-foreground sm:inline-block" />
        </div>

        {/* Right: Nav + Auth */}
        <div className="flex items-center gap-2 sm:gap-4">
          {user && <SiteHeaderNav />}
          {user && userIsAdmin && (
            <Link
              href="/admin"
              className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Admin
            </Link>
          )}
          <SiteHeaderAuth user={user ? { email: user.email ?? "" } : null} />
        </div>
      </div>
    </header>
  );
}
