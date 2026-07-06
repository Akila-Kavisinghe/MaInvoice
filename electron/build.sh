#!/usr/bin/env bash
# Build the WONDERvoice desktop app.
#
#   ./electron/build.sh          → dmg/zip in electron/dist/
#
# Pipeline: standalone Next build (local mode) → copy static assets the
# standalone output doesn't include → electron-builder packages it all.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building standalone Next server (local mode)"
rm -rf .next-local
LOCAL_MODE=1 BUILD_STANDALONE=1 pnpm build

echo "==> Copying static assets into the standalone bundle"
test -f .next-local/standalone/server.js  # layout sanity check
cp -R .next-local/static .next-local/standalone/.next-local/static
cp -R public .next-local/standalone/public
# Never ship local dev data (gig store, settings) inside the app bundle.
rm -rf .next-local/standalone/data

echo "==> Packaging with electron-builder"
cd electron
if [ ! -d node_modules ]; then
  pnpm install
fi
pnpm exec electron-builder

# electron-builder silently skips missing extraResources — fail loudly if the
# server bundle didn't make it into the app.
test -f "dist/mac-arm64/WONDERvoice.app/Contents/Resources/server/server.js" \
  || { echo "ERROR: server bundle missing from packaged app"; exit 1; }

echo "==> Done. Artifacts in electron/dist/"
