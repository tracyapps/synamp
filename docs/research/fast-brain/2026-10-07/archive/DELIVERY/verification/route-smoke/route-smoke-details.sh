#!/bin/bash
# B5 screenshot close-ups + functional preview check (isolated ports; :3911 scratch + :5199 preview).
set -euo pipefail
REPO=/Users/tapps/_dev/web-apps/SynAmp
EVID=/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/b5
SCRATCH=/tmp/synamp-b5-shot2
BASE=http://127.0.0.1:3911
WEB=http://127.0.0.1:5199

echo "### boot scratch brain :3911 (same seed data as screenshots v2)"
cd "$REPO/apps/brain"
PLAYLIST_DATA_PATH="$SCRATCH/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3911 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > "$SCRATCH/brain2.log" 2>&1 &
BRAIN_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
[ "$(lsof -tnP -iTCP:3911 -sTCP:LISTEN | head -1)" = "$BRAIN_PID" ] || { echo "PORT MISMATCH"; exit 1; }

echo "### functional: draft preview respects epoch hides (sample-001 hidden by the seeded skips)"
curl -s -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' \
  -d '{"prompt":"I need to focus. no words, no piano, nothing too slow/relaxing."}' > "$SCRATCH/draft-check.json"
node -e '
const d = require("/tmp/synamp-b5-shot2/draft-check.json");
console.log("strict ids:", JSON.stringify(d.preview.strict.map((t) => t.id)));
console.log("hidden:", JSON.stringify(d.preview.hidden.map((t) => t.id)), "| hidden_by_you:", d.preview.counts.hidden_by_you);
console.log("sample-001 hidden:", d.preview.hidden.some((t) => t.id === "sample-001"), "| sample-001 in strict:", d.preview.strict.some((t) => t.id === "sample-001"));
console.log("interpretation:", d.interpretation.accuracy, "| reading:", d.interpretation.readings.find((r) => r.chosen)?.label);
'

echo "### boot preview :5199"
cd "$REPO/apps/web"
./node_modules/.bin/vite preview --config "$SCRATCH/vite.preview.config.mjs" > "$SCRATCH/preview2.log" 2>&1 &
WEB_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$WEB" && break; sleep 0.25; done
[ "$(lsof -tnP -iTCP:5199 -sTCP:LISTEN | head -1)" = "$WEB_PID" ] || { echo "PORT MISMATCH"; exit 1; }

node "$EVID/screenshots-detail.mjs"
echo "detail screenshots exit: $?"

kill $WEB_PID $BRAIN_PID 2>/dev/null || true
wait $WEB_PID 2>/dev/null || true
wait $BRAIN_PID 2>/dev/null || true
echo "done (details)"
