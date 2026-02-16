-- Seed the style guide with default design tokens

INSERT INTO style_guide (id, colors, fonts, font_sizes, spacing, radii)
VALUES (
  1,

  -- colors
  '{
    "primary": "#171717",
    "secondary": "#6b7280",
    "accent": "#3b82f6",
    "background": "#ffffff",
    "foreground": "#171717",
    "muted": "#f5f5f5",
    "muted_foreground": "#737373",
    "border": "#e5e5e5",
    "success": "#22c55e",
    "warning": "#f59e0b",
    "error": "#ef4444",
    "dark_background": "#0a0a0a",
    "dark_foreground": "#ededed"
  }'::jsonb,

  -- fonts
  '{
    "sans": "var(--font-geist-sans)",
    "mono": "var(--font-geist-mono)",
    "heading": "var(--font-geist-sans)"
  }'::jsonb,

  -- font_sizes (rem)
  '{
    "xs": "0.75",
    "sm": "0.875",
    "base": "1",
    "lg": "1.125",
    "xl": "1.25",
    "2xl": "1.5",
    "3xl": "1.875",
    "4xl": "2.25"
  }'::jsonb,

  -- spacing (rem)
  '{
    "1": "0.25",
    "2": "0.5",
    "3": "0.75",
    "4": "1",
    "5": "1.25",
    "6": "1.5",
    "8": "2",
    "10": "2.5",
    "12": "3",
    "16": "4"
  }'::jsonb,

  -- radii
  '{
    "none": "0",
    "sm": "0.125rem",
    "md": "0.375rem",
    "lg": "0.5rem",
    "xl": "0.75rem",
    "full": "9999px"
  }'::jsonb
);
