"use client";

import Image from "next/image";
import { useState } from "react";

const FALLBACK_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-indigo-600",
  "bg-amber-600",
  "bg-purple-600",
  "bg-cyan-600",
  "bg-rose-600",
  "bg-teal-600",
  "bg-orange-600",
  "bg-pink-600",
];

function getLogoUrl(domain: string) {
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  return `https://img.logo.dev/${domain}?token=${token}&size=64&format=png`;
}

export function BrokerageLogo({
  domain,
  name,
  placeholder,
  colorIndex = 0,
  size = 44,
}: {
  domain: string;
  name: string;
  placeholder: string;
  colorIndex?: number;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

  if (failed || !token) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg ${FALLBACK_COLORS[colorIndex % FALLBACK_COLORS.length]} text-sm font-bold text-white`}
        style={{ width: size, height: size }}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <Image
      src={getLogoUrl(domain)}
      alt={`${name} logo`}
      width={size}
      height={size}
      className="shrink-0 rounded-lg bg-white object-contain"
      onError={() => setFailed(true)}
    />
  );
}
