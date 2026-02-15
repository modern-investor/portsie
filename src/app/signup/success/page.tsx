import Link from "next/link";

export default function SignupSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-gray-600">
          We sent you a confirmation link. Please check your email to verify
          your account.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
