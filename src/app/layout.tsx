import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { StyleGuideInjector } from "@/components/style-guide-injector";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portsie",
  description: "The AI Agent for your Portfolio",
  metadataBase: new URL("https://www.portsie.com"),
  icons: {
    icon: "/brand/portsie-icon-dark.png",
    apple: "/brand/portsie-icon-blue.png",
  },
  openGraph: {
    title: "Portsie",
    description: "The AI Agent for your Portfolio",
    siteName: "Portsie",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Portsie - The AI Agent for your Portfolio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Portsie",
    description: "The AI Agent for your Portfolio",
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StyleGuideInjector />
        <SiteHeader />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </body>
    </html>
  );
}
