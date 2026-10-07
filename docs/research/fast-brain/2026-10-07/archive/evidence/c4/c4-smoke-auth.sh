#!/bin/bash
# C4 auth smoke — 401 without token, 200 with token, on the new brain routes.
# Scratch only (/tmp/synamp-c4-auth), port 3922. Pattern from evidence/b5/route-smoke-auth.sh.
set -u
REPO=/Users/tapps/_dev/web-apps/SynAmp
S=/tmp/synamp-c4-auth
TOKEN=c4-smoke-token
cd "$REPO/apps/brain" || exit 1
BASE=http://127.0.0.1:3922
rm -rf "$S"; mkdir -p "$S"

if lsof -nP -iTCP:3922 -sTCP:LISTEN >/dev/null 2>&1; then echo "ABORT: port 3922 not free"; exit 1; fi

echo "### boot with PLAYLIST_API_TOKEN=*** (scratch :3922)"
PLAYLIST_DATA_PATH="$S/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3922 BRAIN_HOST=127.0.0.1 PLAYLIST_API_TOKEN="$TOKEN" \
  node --experimental-strip-types src/index.ts > "$S/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null' EXIT
for i in $(seq 1 80); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done

w() { curl -s -o "$S/last.json" -w "%{http_code}" "$@"; }
echo "GET  /health (no token)                 → $(w "$BASE/health") (200; public)"
echo "GET  /api/v1/brain/session (no token)   → $(w "$BASE/api/v1/brain/session") (401)"
echo "GET  /api/v1/brain/session (token)      → $(w -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/brain/session") (200)"
echo "POST /api/v1/brain/forget (no token)    → $(w -X POST -H 'content-type: application/json' -d '{"scope":"epoch"}' "$BASE/api/v1/brain/forget") (401)"
echo "POST /api/v1/brain/forget (token)       → $(w -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"scope":"epoch"}' "$BASE/api/v1/brain/forget") (200)"
echo "POST /api/v1/brain/proposals (no token) → $(w -X POST -H 'content-type: application/json' -d '{"id":"x","action":"accept"}' "$BASE/api/v1/brain/proposals") (401)"
echo "POST /api/v1/brain/proposals (token,bad)→ $(w -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"id":"x","action":"maybe"}' "$BASE/api/v1/brain/proposals") (400)"
echo "GET  /api/v1/events (no token)          → $(w "$BASE/api/v1/events?limit=1") (401)"
echo "GET  /api/v1/events (token)             → $(w -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/events?limit=1") (200)"
echo "POST /api/v1/settings (no token)        → $(w -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/v1/settings") (401)"
echo "POST /api/v1/settings (token, {})       → $(w -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}' "$BASE/api/v1/settings") (200)"
echo "with-token /brain/session head:"; curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/brain/session" | head -c 300; echo
echo "### done (auth smoke) — server killed by trap"
