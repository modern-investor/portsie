-- Supabase Storage bucket for uploaded brokerage statements
-- Files stored under {user_id}/ prefix for folder-based RLS

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'statements',
  'statements',
  false,
  52428800,
  ARRAY['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'text/plain']
);

-- Users can upload files to their own folder
CREATE POLICY "Users can upload own statements"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view/download their own files
CREATE POLICY "Users can view own statements"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own files
CREATE POLICY "Users can delete own statements"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update (overwrite) their own files
CREATE POLICY "Users can update own statements"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
