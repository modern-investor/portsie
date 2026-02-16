import type { StyleGuide } from "./types";

export function styleGuideToCss(guide: StyleGuide): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(guide.colors)) {
    lines.push(`--sg-color-${key.replace(/_/g, "-")}: ${value};`);
  }

  for (const [key, value] of Object.entries(guide.fonts)) {
    lines.push(`--sg-font-${key}: ${value};`);
  }

  for (const [key, value] of Object.entries(guide.font_sizes)) {
    lines.push(`--sg-text-${key}: ${value}rem;`);
  }

  for (const [key, value] of Object.entries(guide.spacing)) {
    lines.push(`--sg-space-${key}: ${value}rem;`);
  }

  for (const [key, value] of Object.entries(guide.radii)) {
    lines.push(`--sg-radius-${key}: ${value};`);
  }

  return `:root {\n  ${lines.join("\n  ")}\n}`;
}
