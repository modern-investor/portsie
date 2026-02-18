import Link from "next/link";

export default async function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
      <h1 className="text-xl font-semibold">Admin Panel</h1>

      {/* Admin Pages */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Admin Pages</h2>
        <div className="space-y-2">
          <Link
            href="/admin/users"
            className="block rounded-md bg-black px-4 py-2 text-sm text-white text-center hover:bg-gray-800"
          >
            User Management
          </Link>
          <Link
            href="/admin/quality-checks"
            className="block rounded-md bg-black px-4 py-2 text-sm text-white text-center hover:bg-gray-800"
          >
            Quality Checks
          </Link>
          <Link
            href="/admin/style-guide"
            className="block rounded-md bg-black px-4 py-2 text-sm text-white text-center hover:bg-gray-800"
          >
            Style Guide
          </Link>
        </div>
      </div>

      {/* External Links */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-lg font-semibold">External Admin Links</h2>
        <div className="space-y-2">
          <a
            href="https://console.cloud.google.com/auth/audience?project=portsie"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span>Google Cloud — OAuth Audience &amp; Test Users</span>
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
          <a
            href="https://supabase.com/dashboard/project/kkpciydknhdeoqyaceti"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span>Supabase Dashboard</span>
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
