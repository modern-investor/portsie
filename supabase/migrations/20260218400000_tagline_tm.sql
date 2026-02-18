-- Add ™ before period in tagline
UPDATE style_guide
SET branding = jsonb_set(
  branding,
  '{tagline}',
  '"Your Portfolio Intelligence Agent™."'::jsonb
)
WHERE id = 1;
