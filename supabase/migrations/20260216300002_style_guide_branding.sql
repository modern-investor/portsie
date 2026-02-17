-- Add branding column to style_guide for slogan, tagline, and logo paths

ALTER TABLE style_guide
  ADD COLUMN branding JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE style_guide
SET branding = jsonb_build_object(
  'slogan', E'Guidance to safe harbors,\nthrough open seas,\nand stormy waters.',
  'tagline', 'Investment Portfolio Analysis and Control',
  'logos', jsonb_build_object(
    'icon_blue', '/brand/portsie-icon-blue.png',
    'icon_dark', '/brand/portsie-icon-dark.png',
    'icon_light', '/brand/portsie-icon-light.png',
    'wordmark_blue', '/brand/portsie-wordmark-blue.png',
    'wordmark_dark', '/brand/portsie-wordmark-dark.png',
    'wordmark_light', '/brand/portsie-wordmark-light.png'
  )
)
WHERE id = 1;
