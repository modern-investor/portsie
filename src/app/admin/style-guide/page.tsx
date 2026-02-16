import Link from "next/link";
import { fetchStyleGuide } from "@/lib/style-guide/server";
import { ColorPalette } from "./components/color-palette";
import { FontSamples } from "./components/font-samples";
import { SpacingPreview } from "./components/spacing-preview";
import { RadiusPreview } from "./components/radius-preview";
import { PreviewCard } from "./components/preview-card";

export default async function StyleGuidePage() {
  const guide = await fetchStyleGuide();

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-10">
      <div>
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Admin
        </Link>
        <h1 className="text-2xl font-bold mt-1">Style Guide</h1>
        <p className="text-sm text-gray-500 mt-1">
          Design tokens from database &middot; Last updated{" "}
          {new Date(guide.updated_at).toLocaleString()}
        </p>
      </div>

      <ColorPalette colors={guide.colors} />
      <FontSamples fonts={guide.fonts} fontSizes={guide.font_sizes} />
      <SpacingPreview spacing={guide.spacing} />
      <RadiusPreview radii={guide.radii} />
      <PreviewCard />
    </div>
  );
}
