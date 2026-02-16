import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStyleGuide } from "@/lib/style-guide/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const guide = await fetchStyleGuide();
  const { branding } = guide;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center pt-16 p-6">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <Image
            src={branding.logos.icon_blue}
            alt="Portsie"
            width={100}
            height={100}
            priority
          />
          <Image
            src={branding.logos.wordmark_dark}
            alt="PORTSIE"
            width={200}
            height={40}
            priority
          />
        </div>

        {/* Slogan */}
        <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
          {branding.slogan}
        </h1>

        {/* Tagline */}
        <p className="text-muted-foreground text-base">
          {branding.tagline}
        </p>

        {/* Auth actions */}
        <div className="flex flex-col gap-3 pt-2">
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
