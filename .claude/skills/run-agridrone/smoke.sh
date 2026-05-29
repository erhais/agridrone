#!/usr/bin/env bash
# Smoke test for app-agridrone
# Starts a fresh Metro bundler, compiles the iOS bundle, checks for key
# code markers, then exits cleanly.
# Usage: bash .claude/skills/run-agridrone/smoke.sh [port]
set -euo pipefail

PORT=${1:-8090}
BUNDLE_FILE=/tmp/agridrone-smoke-$PORT.js

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$BUNDLE_FILE"
}
trap cleanup EXIT

echo "▶ Starting Metro on port $PORT (cache cleared)..."
EXPO_NO_DOTENV=1 npx expo start --port "$PORT" --no-dev --offline --clear 2>&1 &
SERVER_PID=$!

# Wait for server to be ready (up to 30 s)
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT/status" 2>/dev/null | grep -q "running"; then
    echo "  Metro ready after ${i}s"
    break
  fi
  sleep 1
done

curl -s "http://localhost:$PORT/status" | grep -q "running" \
  || { echo "✗ Metro did not start"; exit 1; }

echo "▶ Fetching iOS bundle (src/app/index.tsx module)..."
curl -sf \
  "http://localhost:$PORT/src/app/index.tsx.bundle?platform=ios&dev=true&minify=false" \
  -o "$BUNDLE_FILE" \
  --max-time 60

SIZE=$(wc -c < "$BUNDLE_FILE")
echo "  Bundle size: $SIZE bytes"
[[ $SIZE -gt 100000 ]] || { echo "✗ Bundle too small – likely an error page"; exit 1; }

echo "▶ Checking code markers..."
MISSING=()
grep -q "setLoadingZones"      "$BUNDLE_FILE" || MISSING+=("setLoadingZones")
grep -q "getZones"             "$BUNDLE_FILE" || MISSING+=("getZones")
grep -q "hexToRgba"            "$BUNDLE_FILE" || MISSING+=("hexToRgba style helper")
grep -q "qgis/zones"           "$BUNDLE_FILE" || MISSING+=("API path /qgis/zones")
grep -q "nom_parcel"           "$BUNDLE_FILE" || MISSING+=("nom_parcel")
grep -q "id_parcel"            "$BUNDLE_FILE" || MISSING+=("id_parcel")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "✗ Missing markers in bundle:"
  printf "    - %s\n" "${MISSING[@]}"
  exit 1
fi

echo "✓ All markers present"
echo ""
echo "▶ TypeScript check..."
npx tsc --noEmit 2>&1 | grep "src/app/index.tsx\|src/services/agridroneService" || true
# Only fail if index.tsx or agridroneService have TS errors
if npx tsc --noEmit 2>&1 | grep -q "src/app/index.tsx\|src/services/agridroneService"; then
  echo "✗ TypeScript errors in core files"
  exit 1
fi
echo "✓ No TypeScript errors in core files"

echo ""
echo "✅ Smoke test passed."
echo ""
echo "   To test on a real device:"
echo "   1. npx expo start"
echo "   2. Scan QR code with Expo Go (iOS/Android)"
echo "   3. Tap a parcelle → zones appear with QGIS dynamic style (fillColor from API)"
echo "   4. Check console for: [zones] id_parcel: … → using: …"
