#!/bin/bash
# B5 screenshots (v2, isolated): scratch brain on :3911 + vite preview of the built dist on :5199.
# NOTE: :3001/:5173 belong to the user's own long-running dev servers — never used here.
set -euo pipefail
REPO=/Users/tapps/_dev/web-apps/SynAmp
EVID=/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/b5
SCRATCH=/tmp/synamp-b5-shot2
BASE=http://127.0.0.1:3911
WEB=http://127.0.0.1:5199

rm -rf "$SCRATCH/playlists.json" "$SCRATCH/session.json" "$SCRATCH/events.jsonl" "$SCRATCH/brain.log" "$SCRATCH/preview.log"
mkdir -p "$SCRATCH"

# --- seed a closed cross-epoch history: sample-005 skipped early twice in each of 3
# epochs on 2 dates (within the 30-day proposal window) → a track_repeat_skip proposal.
node -e '
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
require("fs").writeFileSync("/tmp/synamp-b5-shot2/events.jsonl", events.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log("seeded", events.length, "events");
'

echo "### boot scratch brain :3911"
cd "$REPO/apps/brain"
PLAYLIST_DATA_PATH="$SCRATCH/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3911 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > "$SCRATCH/brain.log" 2>&1 &
BRAIN_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
BOUND_PID=$(lsof -tnP -iTCP:3911 -sTCP:LISTEN | head -1)
echo "brain pid $BRAIN_PID, port owner $BOUND_PID"
if [ "$BOUND_PID" != "$BRAIN_PID" ]; then echo "PORT OWNER MISMATCH — aborting"; kill $BRAIN_PID 2>/dev/null; exit 1; fi

echo "### seed today's active session: queue 3 + skip sample-001 twice"
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"shot2-queue-0001","track_ids":["sample-001","sample-002","sample-003"]}' > "$SCRATCH/queue.json"
E1=$(node -e "console.log(require('$SCRATCH/queue.json').session.queue[0].entry_id)")
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot2-rep-0001\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot2-rep-0002\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1\",\"played_ms\":2000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"shot2-queue-0002","track_ids":["sample-001","sample-002","sample-003"]}' > "$SCRATCH/queue2.json"
E1B=$(node -e "console.log(require('$SCRATCH/queue2.json').session.queue[0].entry_id)")
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot2-rep-0003\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1B\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"shot2-rep-0004\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1B\",\"played_ms\":1500}}" > /dev/null
curl -s "$BASE/api/v1/brain/session" | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("readout:",JSON.stringify({hides:r.hides,proposals:r.proposals.map((p)=>({kind:p.kind,subject:p.subject,thesis:p.thesis})),notes:r.reliability_notes}))})'

echo "### boot vite preview :5199 (dist build; proxies to :3911 only)"
cd "$REPO/apps/web"
./node_modules/.bin/vite preview --config "$SCRATCH/vite.preview.config.mjs" > "$SCRATCH/preview.log" 2>&1 &
WEB_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$WEB" && break; sleep 0.25; done
WBOUND_PID=$(lsof -tnP -iTCP:5199 -sTCP:LISTEN | head -1)
echo "preview pid $WEB_PID, port owner $WBOUND_PID"
if [ "$WBOUND_PID" != "$WEB_PID" ]; then echo "PORT OWNER MISMATCH — aborting"; kill $WEB_PID $BRAIN_PID 2>/dev/null; exit 1; fi
curl -s -o /dev/null -w "preview / → %{http_code}\n" "$WEB/"

echo "### puppeteer screenshots"
node "$EVID/screenshots.mjs"
echo "screenshots exit: $?"

kill $WEB_PID 2>/dev/null || true
kill $BRAIN_PID 2>/dev/null || true
wait $WEB_PID 2>/dev/null || true
wait $BRAIN_PID 2>/dev/null || true
echo "done (screenshots v2)"
