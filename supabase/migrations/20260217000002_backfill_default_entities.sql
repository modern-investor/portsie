-- Create a default "Personal" entity for each user who has accounts
INSERT INTO entities (user_id, entity_name, entity_type, is_default)
SELECT DISTINCT user_id, 'Personal', 'personal', true
FROM accounts
ON CONFLICT (user_id, entity_name) DO NOTHING;

-- Link all existing accounts to their user's default entity
UPDATE accounts a
SET entity_id = e.id
FROM entities e
WHERE a.user_id = e.user_id
  AND e.is_default = true
  AND a.entity_id IS NULL;
