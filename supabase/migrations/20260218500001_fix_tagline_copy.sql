-- Fix tagline copy: lowercase portfolio, dash separator, lowercase now
UPDATE style_guide
SET branding = jsonb_set(
  branding,
  '{tagline}',
  to_jsonb(E'The AI Agent for your portfolio -\nnow with ultra-mega-max intelligence\u2122.'::text)
)
WHERE id = 1;
