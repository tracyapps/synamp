#!/bin/bash
# B5 resolve-path probe: smart playlist → resolveSmart (evaluateSaved) applies policy + sequencing.
# Isolated scratch (:3911, /tmp/synamp-b5-resolve). Never the user's servers.
set -euo pipefail
REPO=/Users/tapps/_dev/web-apps/SynAmp
SCRATCH=/tmp/synamp-b5-resolve
BASE=http://127.0.0.1:3911
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"

cd "$REPO/apps/brain"
PLAYLIST_DATA_PATH="$SCRATCH/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3911 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > "$SCRATCH/brain.log" 2>&1 &
BP=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
[ "$(lsof -tnP -iTCP:3911 -sTCP:LISTEN | head -1)" = "$BP" ] || { echo "PORT MISMATCH — abort"; exit 1; }

echo "### draft 'pump me up to do this task / win this game' → chosen reading (arc build)"
curl -s -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' \
  -d '{"prompt":"pump me up to do this task / win this game"}' > "$SCRATCH/draft.json"
node -e '
const d = require("/tmp/synamp-b5-resolve/draft.json");
console.log("accuracy:", d.interpretation.accuracy, "| reading:", d.interpretation.readings.find((r)=>r.chosen)?.label, "| arc:", d.validation.ok ? JSON.stringify(d.validation.plan.sequencing ?? null) : "INVALID");
console.log("preview sequencing_applied:", JSON.stringify(d.preview?.sequencing_applied ?? null));
console.log("preview strict order:", JSON.stringify(d.preview?.strict.map((t)=>t.id).slice(0,8)));
require("fs").writeFileSync("/tmp/synamp-b5-resolve/plan.json", JSON.stringify(d.validation.plan));
'

echo "### create smart playlist from the chosen plan"
curl -s -X POST "$BASE/api/v1/playlists" -H 'content-type: application/json' \
  -d "{\"type\":\"smart\",\"name\":\"B5 resolve probe\",\"prompt\":\"pump me up to do this task / win this game\",\"plan\":$(cat "$SCRATCH/plan.json")}" > "$SCRATCH/created.json"
PID=$(node -e 'console.log(require("/tmp/synamp-b5-resolve/created.json").node.id)')
echo "playlist id: $PID"

echo "### GET /resolve — the sequenced order (resolveSmart path)"
curl -s "$BASE/api/v1/playlists/$PID/resolve" > "$SCRATCH/resolve.json"
node -e 'console.log("resolve order:", JSON.stringify(require("/tmp/synamp-b5-resolve/resolve.json").tracks.map((t)=>t.id).slice(0,8)))'

echo "### GET /explain — evaluation + sequencing_applied note"
curl -s "$BASE/api/v1/playlists/$PID/explain" > "$SCRATCH/explain.json"
node -e '
const e = require("/tmp/synamp-b5-resolve/explain.json").result;
console.log("explain strict order:", JSON.stringify(e.strict.map((t)=>t.id).slice(0,8)));
console.log("sequencing_applied:", JSON.stringify(e.sequencing_applied ?? null));
console.log("feedback_policy:", e.feedback_policy);
'

echo "### POST /plans/evaluate — same plan, same sequencing"
curl -s -X POST "$BASE/api/v1/plans/evaluate" -H 'content-type: application/json' \
  -d "{\"plan\":$(cat "$SCRATCH/plan.json")}" | node -e '
let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{
  const r=JSON.parse(s).result;
  console.log("evaluate order:", JSON.stringify(r.strict.map((t)=>t.id).slice(0,8)));
  console.log("sequencing_applied:", JSON.stringify(r.sequencing_applied ?? null));
})'

echo "### skip lesson: hide a resolved track in the live epoch, resolve again"
node -e '
const fs = require("fs");
const now = Date.now();
const id = require("/tmp/synamp-b5-resolve/resolve.json").tracks[1].id; // second track of the resolved order
console.log("hiding:", id);
const extra = [0,1].map((k)=>JSON.stringify({ id:`resolve-probe-000${k+1}`, ts: now - 30_000 + k * 10_000, signal:"skip_early", track_id:id, scope:"session", session_id:"resolve-probe", playlist_id:"seedpl", source:"server", policy_version:"epoch-v1" }));
fs.writeFileSync("/tmp/synamp-b5-resolve/pending-hide.json", JSON.stringify({ id, lines: extra.join("\n") + "\n" }));
'
echo "(append + restart so the new epoch is derived fresh)"
cat /tmp/synamp-b5-resolve/pending-hide.json | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const p=JSON.parse(s);require("fs").appendFileSync("/tmp/synamp-b5-resolve/events.jsonl", p.lines);console.log("appended for", p.id)})'
kill $BP 2>/dev/null; wait $BP 2>/dev/null
PLAYLIST_DATA_PATH="$SCRATCH/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3911 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > "$SCRATCH/brain2.log" 2>&1 &
BP=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
curl -s "$BASE/api/v1/brain/session" | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{console.log("hides:", JSON.stringify(JSON.parse(s).hides))})'
curl -s "$BASE/api/v1/playlists/$PID/resolve" | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{console.log("resolve order after hide:", JSON.stringify(JSON.parse(s).tracks.map((t)=>t.id).slice(0,8)))})'
echo "(the hidden track must be gone from the resolve)"

kill $BP 2>/dev/null; wait $BP 2>/dev/null
echo "done (resolve probe)"
