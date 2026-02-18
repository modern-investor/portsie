"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SiteHeaderAuth({
  user,
}: {
  user: { email: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  };

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/signup">Sign up</Link>
        </Button>
      </div>
    );
  }

  const initial = (user.email[0] ?? "U").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground text-base font-medium transition-opacity hover:opacity-80"
        title={user.email}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-1 shadow-lg z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-medium truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
