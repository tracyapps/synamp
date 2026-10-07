#!/bin/bash
# B5 route smoke — auth run: PLAYLIST_API_TOKEN=smoke-token; verifies /api/v1/brain is gated
# and captures exact HTTP status codes for the validation paths.
set -u
REPO=/Users/tapps/_dev/web-apps/SynAmp
cd "$REPO/apps/brain" || exit 1
BASE=http://127.0.0.1:3911
rm -rf /tmp/synamp-b5-auth
mkdir -p /tmp/synamp-b5-auth

echo "### boot with PLAYLIST_API_TOKEN=smoke-token"
PLAYLIST_DATA_PATH=/tmp/synamp-b5-auth/playlists.json LIBRARY_SIGNALS_PATH=$PWD/fixtures/library.sample.json BRAIN_PORT=3911 BRAIN_HOST=127.0.0.1 PLAYLIST_API_TOKEN=smoke-token \
  node --experimental-strip-types src/index.ts > /tmp/synamp-b5-auth/server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
echo "server pid $SERVER_PID"

echo; echo "### auth checks"
curl -s -o /dev/null -w "GET /health (no token)          → %{http_code}\n" "$BASE/health"
curl -s -o /dev/null -w "GET /api/v1/brain/session (no token)   → %{http_code}\n" "$BASE/api/v1/brain/session"
curl -s -o /dev/null -w "GET /api/v1/brain/session (token)      → %{http_code}\n" -H "Authorization: Bearer smoke-token" "$BASE/api/v1/brain/session"
curl -s -o /dev/null -w "POST /api/v1/brain/forget (no token)   → %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"scope":"epoch"}' "$BASE/api/v1/brain/forget"
curl -s -o /dev/null -w "POST /api/v1/brain/forget (token)      → %{http_code}\n" -X POST -H "Authorization: Bearer smoke-token" -H 'content-type: application/json' -d '{"scope":"epoch"}' "$BASE/api/v1/brain/forget"
curl -s -o /dev/null -w "POST /api/v1/brain/forget bad scope    → %{http_code}\n" -X POST -H "Authorization: Bearer smoke-token" -H 'content-type: application/json' -d '{"scope":"all"}' "$BASE/api/v1/brain/forget"
curl -s -o /dev/null -w "POST /api/v1/brain/proposals unknown   → %{http_code}\n" -X POST -H "Authorization: Bearer smoke-token" -H 'content-type: application/json' -d '{"id":"pr1:missing","action":"accept"}' "$BASE/api/v1/brain/proposals"
curl -s -o /dev/null -w "POST /api/v1/brain/proposals bad action → %{http_code}\n" -X POST -H "Authorization: Bearer smoke-token" -H 'content-type: application/json' -d '{"id":"x","action":"maybe"}' "$BASE/api/v1/brain/proposals"

echo; echo "### with token: readout body head"
curl -s -H "Authorization: Bearer smoke-token" "$BASE/api/v1/brain/session" | head -c 400; echo

echo; echo "### kill auth server"
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
echo "done (auth run)"
