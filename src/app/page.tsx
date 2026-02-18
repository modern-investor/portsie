import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStyleGuide } from "@/lib/style-guide/server";
import { WaitlistForm } from "@/components/waitlist-form";

export const dynamic = "force-dynamic";

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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center pt-5 p-4 lg:h-[calc(100vh-3.5rem)] lg:pt-0 lg:p-6 lg:overflow-hidden">
      <div className="w-full max-w-lg space-y-3 text-center lg:max-w-6xl lg:flex lg:items-center lg:gap-12 lg:text-left lg:space-y-0 lg:my-auto lg:px-8">
        {/* Left column — branding, text, actions */}
        <div className="lg:flex-1 lg:max-w-md space-y-3 lg:space-y-5">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:items-end lg:gap-4">
            <Image
              src={branding.logos.icon_blue}
              alt="Portsie"
              width={100}
              height={100}
              className="w-16 h-16 lg:w-16 lg:h-16"
              priority
            />
            <Image
              src={branding.logos.wordmark_dark}
              alt="PORTSIE"
              width={200}
              height={40}
              className="w-[150px] h-auto lg:w-[160px] lg:h-auto"
              priority
            />
          </div>

          {/* Tagline */}
          <p className="text-muted-foreground text-sm whitespace-pre-line lg:text-base">
            {branding.tagline}
          </p>

          {/* Slogan */}
          <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground whitespace-pre-line lg:text-3xl">
            {branding.slogan}
          </h1>

          {/* Waiting list signup */}
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-sm">
              Get on the waiting list
            </p>
            <WaitlistForm />
          </div>

          {/* Auth actions */}
          <div className="flex flex-row gap-3 lg:flex-row">
            <Link
              href="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity flex-1 text-center lg:py-2.5"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted flex-1 text-center lg:py-2.5"
            >
              Create account
            </Link>
          </div>
        </div>

        {/* Right column — hero image */}
        <div className="lg:flex-1 lg:flex lg:items-center lg:justify-center">
          <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm lg:max-h-[calc(100vh-3.5rem-6rem)]">
            <Image
              src="/brand/portsie-hero.jpeg"
              alt="Portsie — nautical illustration with orca and port scene"
              width={1478}
              height={788}
              className="w-full h-auto lg:max-h-[calc(100vh-3.5rem-6rem)] lg:w-auto lg:object-contain"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}
