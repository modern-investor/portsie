-- Create waiting_list table for pre-launch email signups
CREATE TABLE IF NOT EXISTS waiting_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waiting_list_email_unique UNIQUE (email)
);

-- Enable RLS (admin-only reads via service role; inserts are public via API route)
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (signup from landing page, no auth required)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can join waiting list' AND tablename = 'waiting_list'
  ) THEN
    CREATE POLICY "Anyone can join waiting list"
      ON waiting_list FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Only service_role can read (admin dashboard)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role can read waiting list' AND tablename = 'waiting_list'
  ) THEN
    CREATE POLICY "Service role can read waiting list"
      ON waiting_list FOR SELECT
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Update branding tagline
UPDATE style_guide
SET branding = jsonb_set(
  branding,
  '{tagline}',
  '"Your Portfolio Intelligence Agent"'::jsonb
)
WHERE id = 1;

-- Add waitlist welcome email template
INSERT INTO email_templates (
  template_key, category, sender_type,
  subject_template, html_template, text_template,
  placeholders, is_active, version
) VALUES (
  'waitlist_welcome', 'onboarding', 'auto',
  'You''re on the Portsie waiting list!',
  '<h2 style="margin-top:0;">Thanks for signing up!</h2>
<p>Thanks for signing up for the Portsie waiting list.</p>
<p>We''re working hard to create the best portfolio management system we can imagine. We''ll let you know when it''s ready for you.</p>
<p style="color:#737373;font-size:14px;">In the meantime, keep an eye on your inbox &mdash; we''ll be in touch soon.</p>',
  'Thanks for signing up!

Thanks for signing up for the Portsie waiting list.

We''re working hard to create the best portfolio management system we can imagine. We''ll let you know when it''s ready for you.

In the meantime, keep an eye on your inbox -- we''ll be in touch soon.',
  '[]'::jsonb,
  true,
  1
) ON CONFLICT DO NOTHING;
