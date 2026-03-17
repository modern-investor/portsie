#!/usr/bin/env bash
# =============================================================================
# bw-profile.sh — Add to ~/.zshrc for auto-loading Bitwarden session
# =============================================================================
# Add this line to your ~/.zshrc:
#   source ~/Documents/CodingProjects/portsie/scripts/bw-profile.sh
#
# What it does:
#   1. Sources bw-secrets.sh (loads all bw-* functions)
#   2. Restores BW_SESSION from cached file (no prompt if still valid)
#   3. Provides 'portsie-env' alias to unlock + generate .env.local in one step
# =============================================================================

# Auto-detect portsie root (works from any directory)
_PORTSIE_BW_ROOT="${HOME}/Documents/CodingProjects/portsie"

if [ -f "${_PORTSIE_BW_ROOT}/scripts/bw-secrets.sh" ]; then
  source "${_PORTSIE_BW_ROOT}/scripts/bw-secrets.sh"

  # Restore cached session silently (no prompt if session expired)
  if [ -f "${HOME}/.bw-session" ]; then
    export BW_SESSION
    BW_SESSION="$(cat "${HOME}/.bw-session")"
    # Silently validate — don't print anything on shell startup
    if ! bw unlock --check &>/dev/null 2>&1; then
      unset BW_SESSION
    fi
  fi

  # Convenience alias: unlock + generate .env.local in one step
  portsie-env() {
    bw-unlock && bw-env
  }
fi
