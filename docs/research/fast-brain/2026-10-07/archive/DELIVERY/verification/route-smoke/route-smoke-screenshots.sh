#!/bin/bash
# B5 screenshots — scratch brain on :3001 (vite's proxy target) + web dev on :5173.
# Seeds a small cross-epoch history so the suggestions UI has real content.
set -u
REPO=/Users/tapps/_dev/web-apps/SynAmp
EVID=/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/b5
SCRATCH=/tmp/synamp-b5-shot
BASE=http://127.0.0.1:3001

rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"

# --- seed a closed cross-epoch history: sample-005 skipped early twice in each of 3
# epochs on 2 dates (within the 30-day proposal window) → a track_repeat_skip proposal.
node -e '
const DAY = 86400000;
const at = (iso) => Date.parse(iso);
const events = [];
let n = 0;
const skipPair = (base, session) => {
  for (const k of [0, 1]) events.push({
    id: `seed-${String(++n).padStart(4, "0")}`, ts: base + k * 30_000,
    signal: "skip_early", track_id: "sample-005", scope: "session", session_id: session,
    playlist_id: "seedpl", source: "server", policy_version: "epoch-v1",
  });
};
skipPair(at("2026-10-04T10:00:00-05:00"), "seed-1");
skipPair(at("2026-10-04T10:45:00-05:00"), "seed-2");
skipPair(at("2026-10-05T10:00:00-05:00"), "seed-3");
require("fs").writeFileSync("/tmp/synamp-b5-shot/events.jsonl", events.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log("seeded", events.length, "events");
'

echo "### boot brain :3001 (scratch)"
cd "$REPO/apps/brain" || exit 1
PLAYLIST_DATA_PATH="$SCRATCH/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3001 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > "$SCRATCH/brain.log" 2>&1 &
BRAIN_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
echo "brain pid $BRAIN_PID"

echo "### seed today's active session: queue 3 + skip sample-001 twice"
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"shot-queue-0001","track_ids":["sample-001","sample-002","sample-003"]}' > "$SCRATCH/queue.json"
E1=$(node -e "console.log(require('$SCRATCH/queue.json').session.queue[0].entry_id)")
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot-rep-0001\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot-rep-0002\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1\",\"played_ms\":2000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"shot-queue-0002","track_ids":["sample-001","sample-002","sample-003"]}' > "$SCRATCH/queue2.json"
E1B=$(node -e "console.log(require('$SCRATCH/queue2.json').session.queue[0].entry_id)")
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot-rep-0003\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1B\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot-rep-0004\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1B\",\"played_ms\":1500}}" > /dev/null
curl -s "$BASE/api/v1/brain/session" | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("readout:",JSON.stringify({hides:r.hides,proposals:r.proposals.map((p)=>p.kind),notes:r.reliability_notes}))})'

echo "### boot web dev :5173"
cd "$REPO" || exit 1
pnpm --filter @synamp/web dev > "$SCRATCH/web.log" 2>&1 &
WEB_PID=$!
for i in $(seq 1 120); do curl -s -o /dev/null http://localhost:5173/ && break; sleep 0.5; done
echo "web pid $WEB_PID"

echo "### puppeteer screenshots"
node "$EVID/screenshots.mjs"
SHOT_EXIT=$?
echo "screenshots exit: $SHOT_EXIT"

kill $WEB_PID 2>/dev/null; wait $WEB_PID 2>/dev/null
kill $BRAIN_PID 2>/dev/null; wait $BRAIN_PID 2>/dev/null
echo "done (screenshots)"
