#!/usr/bin/env bash
set -euo pipefail

# bump-version.sh — Core versioning engine for Portsie
# Adapted from alpacapps. Called by GitHub Actions on every push to main.
#
# Usage: ./scripts/bump-version.sh [--model <model_code>]
#
# Required env vars:
#   SUPABASE_URL              — Supabase project URL (e.g. https://xxx.supabase.co)
#   SUPABASE_SERVICE_ROLE_KEY — Service role API key
#   GITHUB_SHA                — Push commit SHA (set by GitHub Actions)
#   GITHUB_REF_NAME           — Branch name (set by GitHub Actions)
#   GITHUB_ACTOR              — Who triggered the push (set by GitHub Actions)
#
# Optional env vars:
#   PUSH_COMPARE_FROM — Start of commit range
#   PUSH_COMPARE_TO   — End of commit range
#   RUNNER_NAME       — Machine name

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- Parse args ---
MODEL_CODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) MODEL_CODE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# --- Infer model from branch if not set ---
if [[ -z "$MODEL_CODE" ]]; then
  BRANCH="${GITHUB_REF_NAME:-main}"
  case "$BRANCH" in
    claude/*)  MODEL_CODE="claude" ;;
    cursor/*)  MODEL_CODE="cursor" ;;
    gemini/*)  MODEL_CODE="gemini" ;;
    gpt/*)     MODEL_CODE="gpt" ;;
    *)         MODEL_CODE="manual" ;;
  esac
fi

# --- Gather context ---
SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
SHORT_SHA="${SHA:0:8}"
BRANCH="${GITHUB_REF_NAME:-$(git -C "$REPO_ROOT" branch --show-current)}"
ACTOR="${GITHUB_ACTOR:-$(whoami)}"
SOURCE="${GITHUB_ACTIONS:+github-main-push}"
SOURCE="${SOURCE:-local-script}"
MACHINE="${RUNNER_NAME:-$(hostname -s)}"
COMPARE_FROM="${PUSH_COMPARE_FROM:-}"
COMPARE_TO="${PUSH_COMPARE_TO:-$SHA}"

# --- Build commits JSON ---
if [[ -n "$COMPARE_FROM" && "$COMPARE_FROM" != "0000000000000000000000000000000000000000" ]]; then
  RANGE="${COMPARE_FROM}..${COMPARE_TO}"
else
  RANGE="HEAD~5..HEAD"
fi

COMMITS_JSON="[]"
while IFS='|' read -r c_sha c_msg c_author; do
  [[ -z "$c_sha" ]] && continue
  COMMITS_JSON=$(python3 -c "
import json, sys
commits = json.loads(sys.argv[1])
commits.append({
    'sha': sys.argv[2],
    'short_sha': sys.argv[2][:8],
    'author': sys.argv[3],
    'message': sys.argv[4]
})
print(json.dumps(commits))
" "$COMMITS_JSON" "$c_sha" "$c_author" "$c_msg")
done < <(git -C "$REPO_ROOT" log --format='%H|%s|%an' $RANGE 2>/dev/null || true)

# --- Step 1: Record release in Supabase via REST API ---
echo "Recording release event in Supabase..."

RPC_PAYLOAD=$(python3 -c "
import json
payload = {
    'p_push_sha': '$SHA',
    'p_branch': '$BRANCH',
    'p_compare_from': $([ -n "$COMPARE_FROM" ] && echo "'$COMPARE_FROM'" || echo "None"),
    'p_compare_to': '$COMPARE_TO',
    'p_actor': '$ACTOR',
    'p_source': '$SOURCE',
    'p_model_code': '$MODEL_CODE',
    'p_machine_name': '$MACHINE',
    'p_commits': json.loads('''$COMMITS_JSON''')
}
print(json.dumps(payload))
")

API_RESULT=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/record_release_event" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$RPC_PAYLOAD")

DISPLAY_VERSION=$(echo "$API_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['display_version'])")
RELEASE_SEQ=$(echo "$API_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['seq'])")

if [[ -z "$DISPLAY_VERSION" || "$DISPLAY_VERSION" == "null" ]]; then
  echo "ERROR: Failed to get version from database" >&2
  echo "API response: $API_RESULT" >&2
  exit 1
fi

echo "Version: $DISPLAY_VERSION  (r$(printf '%05d' "$RELEASE_SEQ"))  [$MODEL_CODE]"

# --- Step 2: Rewrite version strings in source files ---
echo "Updating version strings in source files..."

# Update data-site-version spans (use GNU sed on Linux, BSD sed on macOS)
if [[ "$(uname)" == "Darwin" ]]; then
  SED_INPLACE="sed -i ''"
else
  SED_INPLACE="sed -i"
fi

find "$REPO_ROOT/src" -name '*.tsx' -o -name '*.ts' | while read -r file; do
  if grep -q 'data-site-version' "$file" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|data-site-version>[^<]*<|data-site-version>${DISPLAY_VERSION}<|g" "$file"
    else
      sed -i "s|data-site-version>[^<]*<|data-site-version>${DISPLAY_VERSION}<|g" "$file"
    fi
  fi
done

# --- Step 3: Write version.json ---
echo "Writing version.json..."

cat > "$REPO_ROOT/version.json" <<VEOF
{
  "version": "${DISPLAY_VERSION}",
  "release": ${RELEASE_SEQ},
  "sha": "${SHORT_SHA}",
  "fullSha": "${SHA}",
  "actor": "${ACTOR}",
  "source": "${SOURCE}",
  "model": "${MODEL_CODE}",
  "machine": "${MACHINE}",
  "pushedAt": "$(date -u +%Y-%m-%dT%H:%M:%S+00)",
  "commits": ${COMMITS_JSON}
}
VEOF

# Also copy to public/ for frontend runtime access
cp "$REPO_ROOT/version.json" "$REPO_ROOT/public/version.json"

# --- Step 4: Output ---
echo ""
echo "================================================"
echo "  Portsie ${DISPLAY_VERSION}  [$MODEL_CODE]"
echo "  Release: r$(printf '%05d' "$RELEASE_SEQ")"
echo "  SHA: ${SHORT_SHA}"
echo "  Actor: ${ACTOR}"
echo "================================================"
