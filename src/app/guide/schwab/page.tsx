"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ExternalLink,
  Key,
  RefreshCw,
  Shield,
  Database,
  BarChart3,
  Wallet,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

function CodeBlock({
  children,
  title,
  language = "bash",
}: {
  children: string;
  title?: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100">
      {title && (
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
          <span className="text-xs font-medium text-zinc-400">{title}</span>
          <Badge variant="outline" className="text-[10px] text-zinc-500">
            {language}
          </Badge>
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
          <code>{children.trim()}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-800 p-1.5 opacity-0 transition-opacity hover:bg-zinc-700 group-hover:opacity-100"
        >
          {copied ? (
            <Check className="size-3.5 text-green-400" />
          ) : (
            <Copy className="size-3.5 text-zinc-400" />
          )}
        </button>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        className="flex w-full items-center gap-3 p-6 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {badge && (
              <Badge variant="secondary" className="text-[10px]">
                {badge}
              </Badge>
            )}
          </div>
        </div>
        {open ? (
          <ChevronDown className="text-muted-foreground size-4" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4" />
        )}
      </button>
      {open && (
        <CardContent className="space-y-4 border-t pt-4">{children}</CardContent>
      )}
    </Card>
  );
}

function ResponseField({
  name,
  type,
  description,
}: {
  name: string;
  type: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <code className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
        {name}
      </code>
      <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
        {type}
      </Badge>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}

export default function SchwabApiGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="size-4" />
          Back to Dashboard
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Schwab API Guide
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          How Portsie uses the Charles Schwab API to retrieve your brokerage
          data. This guide covers authentication, endpoints, and data models.
        </p>
      </div>

      <Separator className="my-8" />

      {/* Overview */}
      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          The{" "}
          <a
            href="https://developer.schwab.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Schwab API
            <ExternalLink className="size-3" />
          </a>{" "}
          provides two product families: <strong>Accounts and Trading</strong>{" "}
          (account info, positions, orders) and <strong>Market Data</strong>{" "}
          (real-time quotes, price history). Portsie uses both to pull your
          holdings and current market prices. All requests require an OAuth 2.0
          access token obtained through a 3-legged authorization flow.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">OAuth 2.0</Badge>
          <Badge variant="outline">REST API</Badge>
          <Badge variant="outline">JSON</Badge>
          <Badge variant="outline">Bearer Token Auth</Badge>
        </div>
      </section>

      {/* Base URLs */}
      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Base URLs</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              OAuth / Auth
            </p>
            <code className="text-sm">https://api.schwabapi.com/v1/oauth</code>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Trader (Accounts)
            </p>
            <code className="text-sm">https://api.schwabapi.com/trader/v1</code>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Market Data
            </p>
            <code className="text-sm">
              https://api.schwabapi.com/marketdata/v1
            </code>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {/* 1. OAuth Flow */}
        <CollapsibleSection
          title="OAuth 2.0 Authentication"
          icon={<Key className="size-4" />}
          badge="Required"
          defaultOpen={true}
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Schwab uses a standard 3-legged OAuth 2.0 flow. You need a
            registered developer app with an <strong>App Key</strong> and{" "}
            <strong>App Secret</strong> from{" "}
            <a
              href="https://developer.schwab.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:no-underline"
            >
              developer.schwab.com
            </a>
            .
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Step 1: Redirect user to authorize
              </h4>
              <CodeBlock title="Authorization URL" language="http">
{`GET https://api.schwabapi.com/v1/oauth/authorize
  ?client_id={APP_KEY}
  &redirect_uri={CALLBACK_URL}
  &response_type=code
  &state={CSRF_TOKEN}`}
              </CodeBlock>
              <p className="text-muted-foreground mt-2 text-xs">
                The <code className="rounded bg-muted px-1">state</code>{" "}
                parameter prevents CSRF attacks. Portsie generates a random
                32-byte hex string and stores it in an httpOnly cookie.
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Step 2: Exchange authorization code for tokens
              </h4>
              <CodeBlock title="Token Exchange" language="http">
{`POST https://api.schwabapi.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(APP_KEY:APP_SECRET)}

grant_type=authorization_code
&code={AUTH_CODE}
&redirect_uri={CALLBACK_URL}`}
              </CodeBlock>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Token Response</h4>
              <CodeBlock title="Response" language="json">
{`{
  "access_token": "eyJ...",
  "refresh_token": "abc123...",
  "token_type": "Bearer",
  "expires_in": 1800,
  "scope": "api"
}`}
              </CodeBlock>
              <div className="mt-3 space-y-2">
                <ResponseField
                  name="access_token"
                  type="string"
                  description="Bearer token for API requests. Expires in ~30 minutes."
                />
                <ResponseField
                  name="refresh_token"
                  type="string"
                  description="Used to obtain new access tokens. Valid for 7 days."
                />
                <ResponseField
                  name="expires_in"
                  type="number"
                  description="Seconds until the access token expires (typically 1800)."
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* 2. Token Refresh */}
        <CollapsibleSection
          title="Token Refresh"
          icon={<RefreshCw className="size-4" />}
          badge="Auto"
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Access tokens expire every 30 minutes. Portsie automatically
            refreshes them 2 minutes before expiry using the refresh token.
          </p>

          <CodeBlock title="Refresh Request" language="http">
{`POST https://api.schwabapi.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(APP_KEY:APP_SECRET)}

grant_type=refresh_token
&refresh_token={REFRESH_TOKEN}`}
          </CodeBlock>

          <CodeBlock title="Refresh Response" language="json">
{`{
  "access_token": "eyJ...(new)",
  "refresh_token": "xyz789...(new)",
  "token_type": "Bearer",
  "expires_in": 1800,
  "scope": "api"
}`}
          </CodeBlock>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Important:</strong> The refresh token is also rotated on
              each refresh. Always store the new refresh token from the response.
              Refresh tokens expire after 7 days &mdash; if expired, the user
              must re-authorize through the full OAuth flow.
            </p>
          </div>
        </CollapsibleSection>

        {/* 3. Get Accounts */}
        <CollapsibleSection
          title="Get Accounts"
          icon={<Wallet className="size-4" />}
          badge="Trader API"
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Retrieve all linked brokerage accounts with balances and optionally
            positions.
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Get Account Numbers (hashed)
              </h4>
              <CodeBlock title="Request" language="http">
{`GET https://api.schwabapi.com/trader/v1/accounts/accountNumbers
Authorization: Bearer {ACCESS_TOKEN}`}
              </CodeBlock>
              <CodeBlock title="Response" language="json">
{`[
  {
    "accountNumber": "12345678",
    "hashValue": "A1B2C3D4E5F6..."
  }
]`}
              </CodeBlock>
              <p className="text-muted-foreground mt-2 text-xs">
                The <code className="rounded bg-muted px-1">hashValue</code> is
                used in place of the account number for all subsequent API
                calls.
              </p>
            </div>

            <Separator />

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Get All Accounts with Positions
              </h4>
              <CodeBlock title="Request" language="http">
{`GET https://api.schwabapi.com/trader/v1/accounts?fields=positions
Authorization: Bearer {ACCESS_TOKEN}`}
              </CodeBlock>
              <CodeBlock title="Response (simplified)" language="json">
{`[
  {
    "securitiesAccount": {
      "type": "INDIVIDUAL",
      "accountNumber": "12345678",
      "currentBalances": {
        "liquidationValue": 52340.50,
        "cashBalance": 1200.00,
        "availableFunds": 1200.00,
        "buyingPower": 2400.00
      },
      "positions": [
        {
          "longQuantity": 50,
          "averagePrice": 150.25,
          "marketValue": 8725.00,
          "currentDayProfitLoss": 125.50,
          "currentDayProfitLossPercentage": 1.46,
          "instrument": {
            "assetType": "EQUITY",
            "symbol": "AAPL",
            "cusip": "037833100",
            "description": "APPLE INC"
          }
        }
      ]
    }
  }
]`}
              </CodeBlock>
            </div>

            <Separator />

            <div>
              <h4 className="mb-2 text-sm font-semibold">Key Balance Fields</h4>
              <div className="space-y-2">
                <ResponseField
                  name="liquidationValue"
                  type="number"
                  description="Total account value if all positions were sold."
                />
                <ResponseField
                  name="cashBalance"
                  type="number"
                  description="Available cash in the account."
                />
                <ResponseField
                  name="buyingPower"
                  type="number"
                  description="Total purchasing power (includes margin if applicable)."
                />
                <ResponseField
                  name="equity"
                  type="number"
                  description="Total equity value (long positions minus short positions)."
                />
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Key Position Fields</h4>
              <div className="space-y-2">
                <ResponseField
                  name="longQuantity"
                  type="number"
                  description="Number of shares held long."
                />
                <ResponseField
                  name="averagePrice"
                  type="number"
                  description="Average cost basis per share."
                />
                <ResponseField
                  name="marketValue"
                  type="number"
                  description="Current total market value of the position."
                />
                <ResponseField
                  name="instrument.symbol"
                  type="string"
                  description="Ticker symbol (e.g. AAPL, MSFT)."
                />
                <ResponseField
                  name="instrument.assetType"
                  type="string"
                  description="EQUITY, MUTUAL_FUND, CASH_EQUIVALENT, OPTION, etc."
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* 4. Get Positions */}
        <CollapsibleSection
          title="Get Positions"
          icon={<Database className="size-4" />}
          badge="Trader API"
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Positions are returned as part of the accounts response when you
            include <code className="rounded bg-muted px-1">fields=positions</code>.
            You can also fetch a single account&apos;s positions.
          </p>

          <CodeBlock title="Single Account Positions" language="http">
{`GET https://api.schwabapi.com/trader/v1/accounts/{accountHash}?fields=positions
Authorization: Bearer {ACCESS_TOKEN}`}
          </CodeBlock>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Position Object</h4>
            <CodeBlock title="Position Structure" language="json">
{`{
  "shortQuantity": 0,
  "longQuantity": 100,
  "settledLongQuantity": 100,
  "settledShortQuantity": 0,
  "averagePrice": 174.50,
  "marketValue": 18920.00,
  "currentDayProfitLoss": 320.00,
  "currentDayProfitLossPercentage": 1.72,
  "longOpenProfitLoss": 1470.00,
  "maintenanceRequirement": 5676.00,
  "instrument": {
    "assetType": "EQUITY",
    "symbol": "MSFT",
    "cusip": "594918104",
    "description": "MICROSOFT CORP",
    "netChange": 3.20
  }
}`}
            </CodeBlock>

            <h4 className="text-sm font-semibold">Asset Types</h4>
            <div className="flex flex-wrap gap-2">
              {[
                "EQUITY",
                "MUTUAL_FUND",
                "CASH_EQUIVALENT",
                "OPTION",
                "FIXED_INCOME",
                "ETF",
              ].map((type) => (
                <Badge key={type} variant="secondary" className="font-mono text-xs">
                  {type}
                </Badge>
              ))}
            </div>
          </div>
        </CollapsibleSection>

        {/* 5. Market Data / Quotes */}
        <CollapsibleSection
          title="Get Quotes (Market Data)"
          icon={<BarChart3 className="size-4" />}
          badge="Market Data API"
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Retrieve real-time quotes for one or more symbols. The Market Data
            API uses a different base URL than the Trader API.
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold">Multiple Quotes</h4>
              <CodeBlock title="Request" language="http">
{`GET https://api.schwabapi.com/marketdata/v1/quotes?symbols=AAPL,MSFT,GOOGL
Authorization: Bearer {ACCESS_TOKEN}`}
              </CodeBlock>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Single Quote</h4>
              <CodeBlock title="Request" language="http">
{`GET https://api.schwabapi.com/marketdata/v1/AAPL/quotes
Authorization: Bearer {ACCESS_TOKEN}`}
              </CodeBlock>
            </div>

            <CodeBlock title="Quote Response" language="json">
{`{
  "AAPL": {
    "assetMainType": "EQUITY",
    "symbol": "AAPL",
    "quote": {
      "lastPrice": 189.25,
      "openPrice": 187.50,
      "highPrice": 190.10,
      "lowPrice": 186.80,
      "closePrice": 188.00,
      "netChange": 1.25,
      "netPercentChange": 0.66,
      "totalVolume": 54321000,
      "bidPrice": 189.20,
      "askPrice": 189.30,
      "mark": 189.25,
      "52WeekHigh": 199.62,
      "52WeekLow": 164.08
    },
    "reference": {
      "description": "APPLE INC",
      "exchange": "Q",
      "exchangeName": "NASDAQ"
    },
    "fundamental": {
      "peRatio": 31.20,
      "dividendYield": 0.53,
      "marketCap": 2940000000000
    }
  }
}`}
            </CodeBlock>

            <div>
              <h4 className="text-sm font-semibold">Key Quote Fields</h4>
              <div className="mt-2 space-y-2">
                <ResponseField
                  name="lastPrice"
                  type="number"
                  description="Most recent trade price."
                />
                <ResponseField
                  name="netChange"
                  type="number"
                  description="Dollar change from previous close."
                />
                <ResponseField
                  name="netPercentChange"
                  type="number"
                  description="Percent change from previous close."
                />
                <ResponseField
                  name="52WeekHigh"
                  type="number"
                  description="Highest price in the last 52 weeks."
                />
                <ResponseField
                  name="52WeekLow"
                  type="number"
                  description="Lowest price in the last 52 weeks."
                />
                <ResponseField
                  name="fundamental.peRatio"
                  type="number"
                  description="Price-to-earnings ratio."
                />
                <ResponseField
                  name="fundamental.dividendYield"
                  type="number"
                  description="Annual dividend yield as a percentage."
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* 6. Security & Token Storage */}
        <CollapsibleSection
          title="Security & Token Storage"
          icon={<Shield className="size-4" />}
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Portsie encrypts all sensitive data at rest and enforces strict
            access controls.
          </p>

          <div className="space-y-3">
            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-semibold">AES-256-GCM Encryption</h4>
              <p className="text-muted-foreground mt-1 text-sm">
                Access tokens, refresh tokens, App Keys, and App Secrets are
                encrypted using AES-256-GCM with a random IV and authentication
                tag. The encryption key is stored as a server environment
                variable, never exposed to the browser.
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-semibold">Row-Level Security (RLS)</h4>
              <p className="text-muted-foreground mt-1 text-sm">
                Supabase RLS policies ensure users can only read, update, or
                delete their own tokens and credentials. Even with a valid
                session, User A cannot access User B&apos;s data.
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-semibold">CSRF Protection</h4>
              <p className="text-muted-foreground mt-1 text-sm">
                The OAuth flow uses a cryptographically random{" "}
                <code className="rounded bg-muted px-1">state</code> parameter
                stored in an httpOnly, secure cookie. The callback validates the
                state before exchanging the authorization code.
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-semibold">Token Lifecycle</h4>
              <p className="text-muted-foreground mt-1 text-sm">
                Access tokens auto-refresh 2 minutes before expiry. Refresh
                tokens are valid for 7 days. If the refresh token expires, the
                user is prompted to re-authorize through the full OAuth flow.
              </p>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* How Portsie Uses This */}
      <Separator className="my-8" />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">How Portsie Uses This</h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            When you connect your Schwab account, Portsie calls the{" "}
            <strong>Accounts</strong> endpoint with{" "}
            <code className="rounded bg-muted px-1 text-foreground">
              fields=positions
            </code>{" "}
            to pull all your accounts, balances, and holdings in a single
            request. This data is stored as snapshots in Portsie&apos;s database
            so you can track changes over time.
          </p>
          <p>
            For real-time price updates, Portsie primarily uses{" "}
            <strong>Finnhub</strong> and <strong>Alpha Vantage</strong> (free
            tiers) rather than the Schwab Market Data API, to avoid consuming
            your OAuth token&apos;s rate limits. The Schwab quotes endpoint is
            available as a fallback.
          </p>
          <p>
            All API calls happen server-side. Your tokens never leave the
            server and are encrypted at rest. The browser only sees
            the resulting portfolio data.
          </p>
        </div>
      </section>

      {/* Quick Reference */}
      <Separator className="my-8" />

      <section className="mb-10 space-y-4">
        <h2 className="text-lg font-semibold">Quick Reference</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">Endpoint</th>
                <th className="px-4 py-2.5 text-left font-medium">Method</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">/v1/oauth/authorize</code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    GET
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  Start OAuth flow (redirect)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">/v1/oauth/token</code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    POST
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  Exchange code / refresh token
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">
                    /trader/v1/accounts/accountNumbers
                  </code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    GET
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  List account numbers &amp; hashes
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">/trader/v1/accounts</code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    GET
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  All accounts with balances &amp; positions
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">
                    /trader/v1/accounts/&#123;hash&#125;
                  </code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    GET
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  Single account details
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">
                    /marketdata/v1/quotes
                  </code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    GET
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  Real-time quotes for multiple symbols
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">
                  <code className="text-xs">
                    /marketdata/v1/&#123;symbol&#125;/quotes
                  </code>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">
                    GET
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-2.5">
                  Single symbol quote
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex gap-3">
        <Link href="/setup/schwab" className="flex-1">
          <Button variant="outline" className="w-full">
            Set Up Schwab Connection
          </Button>
        </Link>
        <Link href="/dashboard" className="flex-1">
          <Button className="w-full">Go to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
