---
name: clearrs
description: Reset rahulioson@gmail.com Portsie account to first-time state by deleting all portfolio, transaction, and upload data. For testing purposes only.
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash
---

# Clear & Reset User Data

Delete all portfolio and transaction data for `rahulioson@gmail.com`, restoring to a clean first-time login state.

**User**: `rahulioson@gmail.com`
**User ID**: `525591e0-afe0-4b8b-a43f-5b5489f30b1a`

## What gets deleted

All rows owned by the user in these tables:

1. `extraction_failures`, `transactions`, `position_snapshots`, `balance_snapshots`, `holdings`
2. `uploaded_statements`, `accounts`
3. `schwab_tokens`, `schwab_credentials`, `llm_settings`, `quiltt_profiles`
4. All files in the `statements` storage bucket under the user's folder

**NOT deleted**: `user_profiles` (keeps role/login intact), `auth.users` (the auth record).

## Implementation

Use the Supabase REST API with the service role key from `.env.local` in the main repo (`/Users/rahulio/Documents/CodingProjects/portsie/.env.local`). The service role key bypasses RLS.

**Always confirm with the user before running the deletion.**

### Step 1 — Load credentials and delete storage files

```bash
set -a && source /Users/rahulio/Documents/CodingProjects/portsie/.env.local && set +a
USER_ID="525591e0-afe0-4b8b-a43f-5b5489f30b1a"
SB_URL="https://kkpciydknhdeoqyaceti.supabase.co"
SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# List files in user's storage folder
FILES=$(curl -s -X POST \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  -H "Content-Type: application/json" \
  "$SB_URL/storage/v1/object/list/statements" \
  -d "{\"prefix\":\"$USER_ID/\",\"limit\":1000}")

echo "$FILES" | python3 -c "
import sys, json, urllib.parse
files = json.load(sys.stdin)
if not files:
    print('No storage files to delete')
    sys.exit(0)
for f in files:
    name = f.get('name','')
    if name:
        encoded = urllib.parse.quote(name, safe='')
        print(f'Deleting: {name}')
        # We print the names; deletion happens below
"

# Delete each file
echo "$FILES" | python3 -c "
import sys, json, urllib.parse, subprocess
files = json.load(sys.stdin)
for f in files:
    name = f.get('name','')
    if name:
        path = '$USER_ID/' + urllib.parse.quote(name, safe='')
        subprocess.run(['curl','-s','-X','DELETE',
            '-H','apikey: $SB_KEY','-H','Authorization: Bearer $SB_KEY',
            '$SB_URL/storage/v1/object/statements/'+path], capture_output=True)
print(f'Deleted {len(files)} storage files')
"
```

### Step 2 — Delete all user-scoped table data

```bash
set -a && source /Users/rahulio/Documents/CodingProjects/portsie/.env.local && set +a
USER_ID="525591e0-afe0-4b8b-a43f-5b5489f30b1a"
SB_URL="https://kkpciydknhdeoqyaceti.supabase.co"
SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"

TABLES=(
  extraction_failures
  transactions
  position_snapshots
  balance_snapshots
  holdings
  uploaded_statements
  accounts
  schwab_tokens
  schwab_credentials
  llm_settings
  quiltt_profiles
)

for TABLE in "${TABLES[@]}"; do
  RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Prefer: return=representation" \
    "$SB_URL/rest/v1/$TABLE?user_id=eq.$USER_ID")
  echo "$TABLE: HTTP $RESULT"
done
```

### Step 3 — Verify everything is cleared

```bash
set -a && source /Users/rahulio/Documents/CodingProjects/portsie/.env.local && set +a
USER_ID="525591e0-afe0-4b8b-a43f-5b5489f30b1a"
SB_URL="https://kkpciydknhdeoqyaceti.supabase.co"
SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"

echo "=== Verification ==="
for TABLE in extraction_failures transactions position_snapshots balance_snapshots holdings uploaded_statements accounts schwab_tokens schwab_credentials llm_settings quiltt_profiles; do
  COUNT=$(curl -s -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    "$SB_URL/rest/v1/$TABLE?user_id=eq.$USER_ID&select=user_id" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  echo "$TABLE: $COUNT rows"
done

STORAGE_COUNT=$(curl -s -X POST \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  -H "Content-Type: application/json" \
  "$SB_URL/storage/v1/object/list/statements" \
  -d "{\"prefix\":\"$USER_ID/\",\"limit\":100}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "storage files: $STORAGE_COUNT"
echo ""
echo "All counts should be 0. Reset complete for rahulioson@gmail.com!"
```
