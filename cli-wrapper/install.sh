#!/bin/bash
# ============================================
# Portsie CLI Wrapper - Installation Script
# Run on DigitalOcean droplet as root
# ============================================

set -e

WORKER_DIR="/opt/portsie-cli"
SERVICE_NAME="portsie-cli"

echo "=== Portsie CLI Wrapper - Installation ==="

# ---- Prerequisites ----
echo ""
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install it first."
    exit 1
fi
echo "  Node.js: $(node --version)"

if ! command -v claude &> /dev/null; then
    echo "ERROR: Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi
echo "  Claude: $(claude --version 2>/dev/null || echo 'found')"

# ---- Directory Setup ----
echo ""
echo "Setting up $WORKER_DIR..."
mkdir -p "$WORKER_DIR"

# Copy server file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/server.js" "$WORKER_DIR/server.js"
chown -R bugfixer:bugfixer "$WORKER_DIR"

# ---- Environment File ----
ENV_FILE="$WORKER_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Creating environment file..."
    cat > "$ENV_FILE" << 'ENVEOF'
# Portsie CLI Wrapper Configuration
PORT=8910

# Shared secret for auth (set the same value as PORTSIE_CLI_AUTH_TOKEN in Vercel)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_TOKEN=

# Max processing time per request (ms)
MAX_TIMEOUT_MS=180000
ENVEOF
    chown bugfixer:bugfixer "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "  Created $ENV_FILE - EDIT AUTH_TOKEN BEFORE STARTING"
else
    echo "  Environment file already exists at $ENV_FILE"
fi

# ---- Systemd Service ----
echo ""
echo "Installing systemd service..."
cp "$SCRIPT_DIR/portsie-cli.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
echo "  Service installed"

# ---- Summary ----
echo ""
echo "============================================"
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_FILE:"
echo "     - Set AUTH_TOKEN to a random secret"
echo ""
echo "  2. Add the same token to Vercel env vars as PORTSIE_CLI_AUTH_TOKEN"
echo ""
echo "  3. Set the CLI endpoint in Portsie LLM settings:"
echo "     URL: http://159.89.157.120:8910/extract"
echo "     (or configure via Dashboard > Settings > LLM > CLI Endpoint)"
echo ""
echo "  4. Start the service:"
echo "     systemctl enable $SERVICE_NAME"
echo "     systemctl start $SERVICE_NAME"
echo ""
echo "  5. Check logs:"
echo "     journalctl -u $SERVICE_NAME -f"
echo ""
echo "  6. Test:"
echo "     curl http://localhost:8910/health"
echo "============================================"
