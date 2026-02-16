import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Back to Dashboard
        </Link>
      </div>

      <nav className="flex gap-4 border-b border-gray-200 pb-4">
        <Link
          href="/admin/style-guide"
          className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          Style Guide
        </Link>
      </nav>
    </div>
  );
}
