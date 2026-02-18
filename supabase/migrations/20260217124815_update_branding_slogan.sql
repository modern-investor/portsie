-- Update branding slogan with line breaks after commas
UPDATE style_guide
SET branding = jsonb_set(
  branding,
  '{slogan}',
  to_jsonb(E'Guidance to safe harbors,\nthrough open seas,\nand stormy waters.'::text)
)
WHERE id = 1;
