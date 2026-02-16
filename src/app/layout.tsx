import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteVersion } from "@/components/site-version";
import { StyleGuideInjector } from "@/components/style-guide-injector";
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
  description: "Your portfolio investment tracker",
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
        {children}
        <footer className="fixed bottom-2 right-3">
          <SiteVersion />
        </footer>
      </body>
    </html>
  );
}
