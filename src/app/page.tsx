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
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Portsie</h1>
          <p className="text-sm text-gray-500">
            Portfolio investment tracker
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
