import type { StyleGuideFonts, StyleGuideFontSizes } from "@/lib/style-guide/types";

const FONT_SIZE_ORDER = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];

export function FontSamples({
  fonts,
  fontSizes,
}: {
  fonts: StyleGuideFonts;
  fontSizes: StyleGuideFontSizes;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Typography</h2>

      <div className="space-y-6">
        {/* Font families */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Font Families
          </h3>
          <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            {Object.entries(fonts).map(([name, value]) => (
              <div key={name} className="flex items-baseline gap-4">
                <span className="w-20 shrink-0 text-xs font-medium text-gray-500">
                  {name}
                </span>
                <span
                  className="text-xl"
                  style={{ fontFamily: value }}
                >
                  The quick brown fox jumps over the lazy dog
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Font sizes */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Font Sizes
          </h3>
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {FONT_SIZE_ORDER.filter((k) => k in fontSizes).map((key) => {
              const rem = fontSizes[key];
              const px = Math.round(parseFloat(rem) * 16);
              return (
                <div
                  key={key}
                  className="flex items-baseline gap-4 px-4 py-3"
                >
                  <span className="w-12 shrink-0 text-xs font-mono text-gray-400">
                    {key}
                  </span>
                  <span className="w-20 shrink-0 text-xs text-gray-400">
                    {rem}rem / {px}px
                  </span>
                  <span style={{ fontSize: `${rem}rem` }}>
                    Portsie
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
