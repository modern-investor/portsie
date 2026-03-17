#!/usr/bin/env bash
# =============================================================================
# bw-secrets.sh — Bitwarden-backed secret management for Portsie
# =============================================================================
# Unlocks Bitwarden once per shell session (no repeated Touch ID), pulls all
# secrets from a single vault item, writes .env.local, and logs every access.
#
# Usage:
#   source scripts/bw-secrets.sh        # Load functions into current shell
#   bw-unlock                            # Unlock vault (once per session)
#   bw-env                               # Generate .env.local from vault
#   bw-get <FIELD_NAME>                  # Get a single secret by field name
#   bw-audit                             # View audit log
#   bw-status                            # Check session status
#
# Setup:
#   1. Install: brew install bitwarden-cli
#   2. Login:   bw login
#   3. Create a Bitwarden Secure Note named "Portsie Dev Env" with custom
#      fields matching your .env var names (e.g., SUPABASE_URL, GEMINI_API_KEY)
#   4. source scripts/bw-secrets.sh && bw-unlock && bw-env
# =============================================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------
BW_ITEM_NAME="${BW_ITEM_NAME:-Portsie Dev Env}"
BW_SESSION_FILE="${HOME}/.bw-session"
BW_AUDIT_LOG="${HOME}/.bw-audit.log"
PORTSIE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
ENV_LOCAL="${PORTSIE_ROOT}/.env.local"

# Non-secret env vars that are safe to hardcode (not stored in Bitwarden)
# Used by bw-env if these keys aren't in the vault item
BW_DEFAULTS_KEYS="NEXT_PUBLIC_SITE_URL PORTSIE_CLI_ENDPOINT SCHWAB_CALLBACK_URL PRIVACY_MODE"
BW_DEFAULT_NEXT_PUBLIC_SITE_URL="https://portsie.com"
BW_DEFAULT_PORTSIE_CLI_ENDPOINT="http://159.89.157.120:8910/extract"
BW_DEFAULT_SCHWAB_CALLBACK_URL="https://portsie.com/api/schwab/callback"
BW_DEFAULT_PRIVACY_MODE="strict"

# --- Audit logging -----------------------------------------------------------
_bw_log() {
  local action="$1"
  local detail="${2:-}"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local caller="${3:-$(basename "$0")}"
  echo "${timestamp} | ${action} | ${detail} | caller=${caller}" >> "${BW_AUDIT_LOG}"
}

# --- Session management ------------------------------------------------------
bw-unlock() {
  # Check if already unlocked
  if [ -f "${BW_SESSION_FILE}" ]; then
    export BW_SESSION
    BW_SESSION="$(cat "${BW_SESSION_FILE}")"
    if bw unlock --check &>/dev/null; then
      echo "✓ Bitwarden already unlocked"
      _bw_log "SESSION_REUSE" "existing session valid"
      return 0
    fi
    rm -f "${BW_SESSION_FILE}"
  fi

  # Check login status
  if ! bw login --check &>/dev/null; then
    echo "→ Not logged in. Running 'bw login'..."
    BW_SESSION="$(bw login --raw 2>/dev/null)" || {
      echo "✗ Login failed"
      _bw_log "LOGIN_FAIL" ""
      return 1
    }
  else
    echo "→ Unlocking vault (one-time biometric/password prompt)..."
    BW_SESSION="$(bw unlock --raw 2>/dev/null)" || {
      echo "✗ Unlock failed"
      _bw_log "UNLOCK_FAIL" ""
      return 1
    }
  fi

  export BW_SESSION
  echo "${BW_SESSION}" > "${BW_SESSION_FILE}"
  chmod 600 "${BW_SESSION_FILE}"
  _bw_log "UNLOCK" "new session created"
  echo "✓ Vault unlocked — session cached for this shell"
}

bw-lock() {
  bw lock &>/dev/null || true
  rm -f "${BW_SESSION_FILE}"
  unset BW_SESSION 2>/dev/null || true
  _bw_log "LOCK" "session destroyed"
  echo "✓ Vault locked"
}

bw-status() {
  if [ -f "${BW_SESSION_FILE}" ]; then
    export BW_SESSION
    BW_SESSION="$(cat "${BW_SESSION_FILE}")"
    if bw unlock --check &>/dev/null; then
      echo "✓ Unlocked (session active)"
      return 0
    fi
  fi
  echo "✗ Locked (no active session)"
  return 1
}

# --- Secret retrieval ---------------------------------------------------------
bw-get() {
  local field_name="$1"
  if [ -z "${BW_SESSION:-}" ] && [ -f "${BW_SESSION_FILE}" ]; then
    export BW_SESSION
    BW_SESSION="$(cat "${BW_SESSION_FILE}")"
  fi

  if [ -z "${BW_SESSION:-}" ]; then
    echo "✗ Vault is locked. Run 'bw-unlock' first." >&2
    return 1
  fi

  local value
  value="$(bw get item "${BW_ITEM_NAME}" --session "${BW_SESSION}" 2>/dev/null \
    | python3 -c "
import json, sys
item = json.load(sys.stdin)
fields = {f['name']: f['value'] for f in item.get('fields', [])}
print(fields.get('${field_name}', ''), end='')
")" || {
    echo "✗ Failed to retrieve '${field_name}'" >&2
    _bw_log "GET_FAIL" "${field_name}"
    return 1
  }

  if [ -z "${value}" ]; then
    echo "✗ Field '${field_name}' not found in '${BW_ITEM_NAME}'" >&2
    _bw_log "GET_MISS" "${field_name}"
    return 1
  fi

  _bw_log "GET" "${field_name}"
  echo "${value}"
}

# bw-read — drop-in replacement for `op read`
# Usage: bw-read "ItemName"                  → returns password field
#        bw-read "ItemName" "FieldName"       → returns custom field value
#        bw-read "ItemName" "username"        → returns username field
# Works across all projects (not Portsie-specific)
bw-read() {
  local item_name="$1"
  local field_name="${2:-password}"

  if [ -z "${BW_SESSION:-}" ] && [ -f "${BW_SESSION_FILE}" ]; then
    export BW_SESSION
    BW_SESSION="$(cat "${BW_SESSION_FILE}")"
  fi

  if [ -z "${BW_SESSION:-}" ]; then
    echo "✗ Vault is locked. Run 'bw-unlock' first." >&2
    return 1
  fi

  local value
  if [ "${field_name}" = "password" ]; then
    value="$(bw get password "${item_name}" --session "${BW_SESSION}" 2>/dev/null)"
  elif [ "${field_name}" = "username" ]; then
    value="$(bw get username "${item_name}" --session "${BW_SESSION}" 2>/dev/null)"
  else
    # Custom field lookup
    value="$(bw get item "${item_name}" --session "${BW_SESSION}" 2>/dev/null \
      | python3 -c "
import json, sys
item = json.load(sys.stdin)
for f in item.get('fields', []):
    if f['name'] == '${field_name}':
        print(f['value'], end='')
        sys.exit(0)
# Check login fields too
login = item.get('login', {})
if '${field_name}' in login:
    print(login['${field_name}'], end='')
    sys.exit(0)
sys.exit(1)
")" || {
      echo "✗ Field '${field_name}' not found in '${item_name}'" >&2
      _bw_log "READ_MISS" "${item_name}/${field_name}"
      return 1
    }
  fi

  _bw_log "READ" "${item_name}/${field_name}"
  echo "${value}"
}

# --- .env.local generation ----------------------------------------------------
bw-env() {
  if [ -z "${BW_SESSION:-}" ] && [ -f "${BW_SESSION_FILE}" ]; then
    export BW_SESSION
    BW_SESSION="$(cat "${BW_SESSION_FILE}")"
  fi

  if [ -z "${BW_SESSION:-}" ]; then
    echo "✗ Vault is locked. Run 'bw-unlock' first." >&2
    return 1
  fi

  echo "→ Fetching secrets from Bitwarden item '${BW_ITEM_NAME}'..."

  local item_json
  item_json="$(bw get item "${BW_ITEM_NAME}" --session "${BW_SESSION}" 2>/dev/null)" || {
    echo "✗ Failed to fetch item '${BW_ITEM_NAME}'. Does it exist in your vault?" >&2
    _bw_log "ENV_FAIL" "item not found"
    return 1
  }

  # Parse all custom fields
  local fields_json
  fields_json="$(echo "${item_json}" | python3 -c "
import json, sys
item = json.load(sys.stdin)
fields = {f['name']: f['value'] for f in item.get('fields', [])}
json.dump(fields, sys.stdout)
")"

  # Back up existing .env.local
  if [ -f "${ENV_LOCAL}" ]; then
    cp "${ENV_LOCAL}" "${ENV_LOCAL}.bak"
    echo "  (backed up existing .env.local → .env.local.bak)"
  fi

  # Build .env.local using Python (avoids bash/zsh compat issues)
  local count
  count="$(echo "${fields_json}" | python3 -c "
import json, sys, datetime

fields = json.load(sys.stdin)
defaults = {
    'NEXT_PUBLIC_SITE_URL': 'https://portsie.com',
    'PORTSIE_CLI_ENDPOINT': 'http://159.89.157.120:8910/extract',
    'SCHWAB_CALLBACK_URL': 'https://portsie.com/api/schwab/callback',
    'PRIVACY_MODE': 'strict',
}

with open('${ENV_LOCAL}', 'w') as f:
    f.write('# =============================================================================\n')
    f.write('# Portsie .env.local — generated from Bitwarden\n')
    f.write(f'# Generated: {datetime.datetime.now(datetime.UTC).strftime(\"%Y-%m-%dT%H:%M:%SZ\")}\n')
    f.write('# DO NOT EDIT — regenerate with: source scripts/bw-secrets.sh && bw-env\n')
    f.write('# =============================================================================\n\n')

    count = 0
    for k in sorted(fields.keys()):
        f.write(f'{k}={fields[k]}\n')
        count += 1

    # Write defaults for keys not in Bitwarden
    has_defaults = False
    for k, v in sorted(defaults.items()):
        if k not in fields:
            if not has_defaults:
                f.write('\n# --- Defaults (non-secret) ---\n')
                has_defaults = True
            f.write(f'{k}={v}\n')
            count += 1

print(count)
")"

  # Log each written key
  grep '^[A-Z_]*=' "${ENV_LOCAL}" | while IFS='=' read -r key _; do
    _bw_log "ENV_WRITE" "${key}"
  done

  _bw_log "ENV_GEN" "${count} vars written to ${ENV_LOCAL}"
  echo "✓ Wrote ${count} variables to .env.local"
  echo ""
  echo "  Variables written:"
  grep '^[A-Z_]*=' "${ENV_LOCAL}" | sed 's/=.*//' | sed 's/^/    /'
}

# --- Audit log viewer ---------------------------------------------------------
bw-audit() {
  local lines="${1:-20}"
  if [ ! -f "${BW_AUDIT_LOG}" ]; then
    echo "No audit log yet."
    return 0
  fi
  echo "=== Bitwarden Audit Log (last ${lines} entries) ==="
  tail -n "${lines}" "${BW_AUDIT_LOG}"
}

bw-audit-search() {
  local query="$1"
  if [ ! -f "${BW_AUDIT_LOG}" ]; then
    echo "No audit log yet."
    return 0
  fi
  grep -i "${query}" "${BW_AUDIT_LOG}" || echo "No matches for '${query}'"
}

# --- Help ---------------------------------------------------------------------
bw-help() {
  cat <<'HELP'
Bitwarden Secrets Manager for Portsie
======================================

Commands:
  bw-unlock          Unlock vault (one-time prompt, cached for session)
  bw-lock            Lock vault and destroy session
  bw-status          Check if vault is unlocked
  bw-env             Generate .env.local from Bitwarden vault
  bw-get <FIELD>     Get a single secret (e.g., bw-get GEMINI_API_KEY)
  bw-audit [N]       Show last N audit log entries (default: 20)
  bw-audit-search Q  Search audit log for a query
  bw-help            Show this help

Setup:
  1. bw login
  2. Create a Secure Note in Bitwarden named "Portsie Dev Env"
  3. Add custom fields matching your env var names
  4. source scripts/bw-secrets.sh && bw-unlock && bw-env

Env vars:
  BW_ITEM_NAME       Override vault item name (default: "Portsie Dev Env")
  BW_SESSION_FILE    Override session file path (default: ~/.bw-session)
  BW_AUDIT_LOG       Override audit log path (default: ~/.bw-audit.log)
HELP
}

echo "bw-secrets loaded. Run 'bw-help' for commands."
