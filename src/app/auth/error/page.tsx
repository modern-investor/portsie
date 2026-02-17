import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CircleAlert, CheckCircle2 } from "lucide-react";
import { WaitlistForm } from "@/components/waitlist-form";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; waitlisted?: string }>;
}) {
  const { error, email, waitlisted } = await searchParams;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] w-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Card className="text-center">
          <CardHeader>
            <div className="bg-destructive/10 mx-auto flex size-12 items-center justify-center rounded-full">
              <CircleAlert className="text-destructive size-6" />
            </div>
            <CardTitle className="text-2xl">Authentication Error</CardTitle>
            <CardDescription>
              Something went wrong during authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error || "An unexpected error occurred."}
              </AlertDescription>
            </Alert>

            {/* If we captured their email and added to waitlist */}
            {waitlisted && email && (
              <Alert>
                <CheckCircle2 className="size-4 text-green-600" />
                <AlertTitle>You&apos;re on the waiting list!</AlertTitle>
                <AlertDescription>
                  We&apos;ve added <strong>{email}</strong> to our waiting list.
                  Check your inbox for a welcome email.
                </AlertDescription>
              </Alert>
            )}

            {/* If no email was captured, offer the waitlist form */}
            {!waitlisted && (
              <div className="space-y-2 pt-2 text-left">
                <p className="text-muted-foreground text-sm text-center">
                  Want to be notified when we&apos;re ready? Join the waiting list:
                </p>
                <WaitlistForm />
              </div>
            )}

            <Button variant="outline" asChild>
              <Link href="/login">Back to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
