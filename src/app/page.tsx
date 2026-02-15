import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Portsie</h1>
      <p className="text-gray-600">Your portfolio investment tracker</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-black px-6 py-2 text-sm text-white hover:bg-gray-800"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-gray-300 px-6 py-2 text-sm hover:bg-gray-50"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
