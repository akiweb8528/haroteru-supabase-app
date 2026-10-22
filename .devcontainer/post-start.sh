#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/haroteru-supabase-app"

cd "$ROOT_DIR"

if [ -f .env.local ]; then
  cp .env.local .env
fi

echo "[devcontainer] Starting frontend container..."
docker compose up -d

echo "[devcontainer] Starting local Supabase..."
npx supabase start

echo "[devcontainer] Applying local migrations..."
npx supabase db push --local

echo "[devcontainer] Frontend and Supabase are ready."
