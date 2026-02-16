-- Add 'json' to the uploaded_statements file_type CHECK constraint
ALTER TABLE uploaded_statements
  DROP CONSTRAINT IF EXISTS uploaded_statements_file_type_check;

ALTER TABLE uploaded_statements
  ADD CONSTRAINT uploaded_statements_file_type_check
  CHECK (file_type IN ('pdf', 'csv', 'ofx', 'qfx', 'png', 'jpg', 'xlsx', 'txt', 'json'));
