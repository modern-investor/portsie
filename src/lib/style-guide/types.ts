export interface StyleGuideColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  muted_foreground: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  dark_background: string;
  dark_foreground: string;
}

export interface StyleGuideFonts {
  sans: string;
  mono: string;
  heading: string;
}

export interface StyleGuideFontSizes {
  [key: string]: string;
}

export interface StyleGuideSpacing {
  [key: string]: string;
}

export interface StyleGuideRadii {
  [key: string]: string;
}

export interface StyleGuide {
  id: number;
  colors: StyleGuideColors;
  fonts: StyleGuideFonts;
  font_sizes: StyleGuideFontSizes;
  spacing: StyleGuideSpacing;
  radii: StyleGuideRadii;
  created_at: string;
  updated_at: string;
}
