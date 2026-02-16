-- Add application/json to the statements storage bucket allowed MIME types
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
  'application/x-qfx',
  'application/json'
]
WHERE id = 'statements';
