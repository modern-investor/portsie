import type { StyleGuideSpacing } from "@/lib/style-guide/types";

const SPACING_ORDER = ["1", "2", "3", "4", "5", "6", "8", "10", "12", "16"];

export function SpacingPreview({ spacing }: { spacing: StyleGuideSpacing }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Spacing</h2>
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
        {SPACING_ORDER.filter((k) => k in spacing).map((key) => {
          const rem = spacing[key];
          const px = Math.round(parseFloat(rem) * 16);
          return (
            <div key={key} className="flex items-center gap-4 px-4 py-3">
              <span className="w-10 shrink-0 text-xs font-mono text-gray-400">
                {key}
              </span>
              <span className="w-24 shrink-0 text-xs text-gray-400">
                {rem}rem / {px}px
              </span>
              <div
                className="h-4 rounded bg-blue-500"
                style={{ width: `${rem}rem` }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
