import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

export default function SignupSuccessPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] w-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Card className="text-center">
          <CardHeader>
            <div className="bg-primary/10 mx-auto flex size-12 items-center justify-center rounded-full">
              <Mail className="text-primary size-6" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We sent you a confirmation link. Please check your email to verify
              your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/login">Back to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
