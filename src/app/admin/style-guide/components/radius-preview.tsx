import type { StyleGuideRadii } from "@/lib/style-guide/types";

const RADIUS_ORDER = ["none", "sm", "md", "lg", "xl", "full"];

export function RadiusPreview({ radii }: { radii: StyleGuideRadii }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Border Radius</h2>
      <div className="flex flex-wrap gap-6">
        {RADIUS_ORDER.filter((k) => k in radii).map((key) => (
          <div key={key} className="flex flex-col items-center gap-2">
            <div
              className="h-16 w-16 border-2 border-gray-300 bg-gray-100"
              style={{ borderRadius: radii[key] }}
            />
            <span className="text-xs font-medium">{key}</span>
            <span className="text-xs font-mono text-gray-400">
              {radii[key]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
