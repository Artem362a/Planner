#!/usr/bin/env bash
# deploy.sh — pull latest code, rebuild frontend, restart backend.
# Run as the deploy user (needs passwordless sudo for systemctl).
# Usage: ./deploy.sh [branch]   (default: v0.1)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$REPO_DIR/planner/backend"
FRONTEND_DIR="$REPO_DIR/planner/frontend"
VENV="$BACKEND_DIR/venv"
SERVICE="dayplan-backend"
BRANCH="${1:-v0.1}"

info()    { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
success() { printf '\033[1;32m ok \033[0m %s\n' "$*"; }

# ── 1. Pull ───────────────────────────────────────────────────────────────────
info "Fetching branch $BRANCH ..."
git -C "$REPO_DIR" fetch --quiet origin
git -C "$REPO_DIR" checkout "$BRANCH"
git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
success "code updated"

# ── 2. Backend deps ───────────────────────────────────────────────────────────
info "Installing Python dependencies ..."
"$VENV/bin/pip" install --quiet -r "$BACKEND_DIR/requirements.txt"
success "pip done"

# ── 3. Frontend build ─────────────────────────────────────────────────────────
info "Building frontend ..."
cd "$FRONTEND_DIR"
npm ci --silent
npm run build
success "frontend built → planner/frontend/dist/"

# ── 4. Restart backend ────────────────────────────────────────────────────────
info "Restarting $SERVICE ..."
sudo systemctl restart "$SERVICE"
success "$SERVICE restarted"

# ── 5. Reload nginx ───────────────────────────────────────────────────────────
info "Reloading nginx ..."
sudo nginx -t -q
sudo systemctl reload nginx
success "nginx reloaded"

echo ""
echo "Deploy complete."
