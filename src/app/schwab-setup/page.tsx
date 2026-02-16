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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  Clock,
} from "lucide-react";

export default function SchwabSetupLandingPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Connect Schwab to Portsie
        </h1>
        <p className="text-muted-foreground mt-3 text-base">
          Portsie uses the Schwab API to securely read your portfolio data. The
          setup takes just a few minutes.
        </p>
      </div>

      <Alert className="mt-8">
        <ShieldCheck className="size-4" />
        <AlertTitle>What you&apos;ll need</AlertTitle>
        <AlertDescription>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>An existing Charles Schwab brokerage account</li>
            <li>
              A free Schwab developer account (same login as your brokerage)
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Separator className="my-10" />

      <div>
        <h2 className="text-lg font-semibold">How it works</h2>
        <div className="mt-6 grid gap-4">
          <StepCard
            step={1}
            icon={<ExternalLink className="size-4" />}
            title="Create a developer account"
            description={
              <>
                Register at{" "}
                <a
                  href="https://developer.schwab.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-4 hover:no-underline"
                >
                  developer.schwab.com
                </a>{" "}
                using your Schwab brokerage login.
              </>
            }
          />
          <StepCard
            step={2}
            icon={<MonitorSmartphone className="size-4" />}
            title="Register a new app"
            description="Portsie's setup wizard will give you the exact settings to use in the developer portal."
          />
          <StepCard
            step={3}
            icon={<Clock className="size-4" />}
            title="Wait for approval"
            description="Schwab reviews new apps before activation. This typically takes 1–3 business days."
          />
          <StepCard
            step={4}
            icon={<KeyRound className="size-4" />}
            title="Enter credentials & connect"
            description="Paste your App Key and Secret into Portsie and click Connect."
          />
        </div>
      </div>

      <Card className="mt-10 text-center">
        <CardHeader>
          <CardTitle>Ready to get started?</CardTitle>
          <CardDescription>
            Log in to Portsie and the setup wizard will guide you through each
            step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" asChild>
            <Link href="/setup/schwab">Open Setup Wizard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  description,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <Card className="flex-row items-start gap-4 py-4">
      <CardContent className="flex items-start gap-4 p-0 px-6">
        <Badge
          variant="outline"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs"
        >
          {step}
        </Badge>
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium">
            {icon}
            {title}
          </div>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
