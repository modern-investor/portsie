-- Upload feature: expand file types, add LLM extraction columns, update storage MIME types

-- 1. Expand file_type CHECK constraint to include images, xlsx, txt
ALTER TABLE uploaded_statements
  DROP CONSTRAINT IF EXISTS uploaded_statements_file_type_check;

ALTER TABLE uploaded_statements
  ADD CONSTRAINT uploaded_statements_file_type_check
  CHECK (file_type IN ('pdf', 'csv', 'ofx', 'qfx', 'png', 'jpg', 'xlsx', 'txt'));

-- 2. Add columns for LLM extraction workflow
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS raw_llm_response JSONB,
  ADD COLUMN IF NOT EXISTS extracted_data JSONB,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detected_account_info JSONB;

-- 3. Update storage bucket allowed MIME types to include images and xlsx
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'application/x-ofx',
  'application/x-qfx'
]
WHERE id = 'statements';
