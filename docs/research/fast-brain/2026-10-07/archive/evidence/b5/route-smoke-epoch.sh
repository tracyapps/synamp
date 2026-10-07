#!/bin/bash
# B5 route smoke — epoch mode + auth run. Scratch dir only (/tmp/synamp-b5), never real data.
# Run from anywhere; expects the repo at /Users/tapps/_dev/web-apps/SynAmp.
set -u
REPO=/Users/tapps/_dev/web-apps/SynAmp
cd "$REPO/apps/brain" || exit 1
BASE=http://127.0.0.1:3911
rm -rf /tmp/synamp-b5
mkdir -p /tmp/synamp-b5

echo "### boot: PLAYLIST_DATA_PATH=/tmp/synamp-b5/playlists.json LIBRARY_SIGNALS_PATH=$PWD/fixtures/library.sample.json BRAIN_PORT=3911"
PLAYLIST_DATA_PATH=/tmp/synamp-b5/playlists.json LIBRARY_SIGNALS_PATH=$PWD/fixtures/library.sample.json BRAIN_PORT=3911 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > /tmp/synamp-b5/server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
echo "server pid $SERVER_PID"

echo; echo "### GET /health"
curl -s "$BASE/health"; echo

echo; echo "### POST /api/v1/plans/draft — \"I need to focus. no words, no piano, nothing too slow/relaxing.\""
curl -s -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' \
  -d '{"prompt":"I need to focus. no words, no piano, nothing too slow/relaxing."}' > /tmp/synamp-b5/draft.json
node -e '
const d = require("/tmp/synamp-b5/draft.json");
console.log("parser:", d.parser);
console.log("accuracy:", d.interpretation?.accuracy, "| chosen_index:", d.interpretation?.chosen_index,
  "| readings:", JSON.stringify((d.interpretation?.readings ?? []).map((r) => ({ label: r.label, chosen: r.chosen }))));
console.log("asks:", (d.interpretation?.asks ?? []).length, "| audit entries:", (d.interpretation?.audit ?? []).length);
console.log("validation ok:", d.validation.ok, "| constraints:", d.validation.ok ? d.validation.plan.constraints.length : null);
console.log("preview strict:", d.preview?.strict?.length, "| feedback_policy:", d.preview?.feedback_policy);
console.log("sample reading summary:", JSON.stringify(d.interpretation?.readings?.[0] ?? null));
console.log("has raw plan inside interpretation:", JSON.stringify(d.interpretation ?? {}).includes("\"constraints\""));
'
echo "draft bytes: $(wc -c < /tmp/synamp-b5/draft.json)"

echo; echo "### POST /api/v1/session/queue — 3 sample tracks"
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"smoke-queue-0001","track_ids":["sample-001","sample-002","sample-003"]}' > /tmp/synamp-b5/queue.json
E1=$(node -e 'console.log(require("/tmp/synamp-b5/queue.json").session.queue[0].entry_id)')
echo "queue: $(node -e 'console.log(JSON.stringify(require("/tmp/synamp-b5/queue.json").session.queue.map((q)=>q.track_id)))') entry_id[0]=$E1"

echo; echo "### POST /api/v1/session/report — start + early skip for sample-001 (cycle 1)"
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"smoke-rep-0001\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"smoke-rep-0002\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1\",\"played_ms\":2500}}" \
  | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("derived:",JSON.stringify(r.derived))})'

echo; echo "### re-queue + start + early skip for sample-001 (cycle 2 → skip_early ×2 → epoch hide)"
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"smoke-queue-0002","track_ids":["sample-001","sample-002","sample-003"]}' > /tmp/synamp-b5/queue2.json
E1B=$(node -e 'console.log(require("/tmp/synamp-b5/queue2.json").session.queue[0].entry_id)')
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"smoke-rep-0003\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1B\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"smoke-rep-0004\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1B\",\"played_ms\":1500}}" \
  | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("derived:",JSON.stringify(r.derived))})'

echo; echo "### GET /api/v1/brain/session — after the skips"
curl -s "$BASE/api/v1/brain/session" > /tmp/synamp-b5/brain1.json
node -e '
const r = require("/tmp/synamp-b5/brain1.json");
console.log("policy_version:", r.policy_version, "| listening_policy:", r.listening_policy, "| events:", r.events);
console.log("epoch:", r.epoch ? JSON.stringify({ daypart: r.epoch.daypart, date: r.epoch.date, event_count: r.epoch.event_count }) : null);
console.log("hides:", JSON.stringify(r.hides));
console.log("proposals:", r.proposals.length, "| reliability_notes:", JSON.stringify(r.reliability_notes));
console.log("queue_adjustments:");
for (const a of r.queue_adjustments) console.log("  ", a.track_id, a.value.toFixed ? a.value.toFixed(3) : a.value, JSON.stringify(a.parts));
'

echo; echo "### GET /api/v1/events — policy_version report"
curl -s "$BASE/api/v1/events?limit=3" | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("policy_version:",r.policy_version,"| total:",r.total,"| newest signals:",JSON.stringify(r.events.map(e=>e.signal)))})'

echo; echo "### POST /api/v1/brain/forget {scope: epoch}"
curl -s -X POST "$BASE/api/v1/brain/forget" -H 'content-type: application/json' -d '{"scope":"epoch"}' > /tmp/synamp-b5/forget.json
node -e '
const r = require("/tmp/synamp-b5/forget.json");
console.log("after forget → hides:", JSON.stringify(r.hides), "| notes:", JSON.stringify(r.reliability_notes));
const adj = r.queue_adjustments.filter((a) => a.parts.length);
console.log("adjustments with parts:", adj.length);
'

echo; echo "### POST /api/v1/brain/forget {scope: all} — must be rejected"
curl -s -X POST "$BASE/api/v1/brain/forget" -H 'content-type: application/json' -d '{"scope":"all"}'; echo

echo; echo "### POST /api/v1/brain/proposals — validation paths (no proposals exist in a fresh log)"
curl -s -X POST "$BASE/api/v1/brain/proposals" -H 'content-type: application/json' -d '{"id":"pr1:does-not-exist","action":"accept"}'; echo
curl -s -X POST "$BASE/api/v1/brain/proposals" -H 'content-type: application/json' -d '{"id":"pr1:x","action":"maybe"}'; echo

echo; echo "### GET /api/v1/brain/session — after forget"
curl -s "$BASE/api/v1/brain/session" > /tmp/synamp-b5/brain2.json
node -e '
const r = require("/tmp/synamp-b5/brain2.json");
console.log("hides:", JSON.stringify(r.hides), "| notes:", JSON.stringify(r.reliability_notes));
const adj = r.queue_adjustments.filter((a) => a.parts.length);
console.log("queue_adjustments with parts:", adj.length);
'

echo; echo "### settings rollback — POST /api/v1/settings {listening_policy: legacy-v1}"
curl -s -X POST "$BASE/api/v1/settings" -H 'content-type: application/json' -d '{"listening_policy":"legacy-v1"}' > /tmp/synamp-b5/settings-legacy.json
node -e 'const r=require("/tmp/synamp-b5/settings-legacy.json");console.log("changed:",JSON.stringify(r.changed),"| listening_policy:",r.settings.listening_policy)'
curl -s "$BASE/api/v1/brain/session" | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("legacy readout → policy_version:",r.policy_version,"| listening_policy:",r.listening_policy,"| epoch:",r.epoch,"| hides:",JSON.stringify(r.hides),"| proposals:",r.proposals.length)})'
curl -s -X POST "$BASE/api/v1/settings" -H 'content-type: application/json' -d '{"listening_policy":"epoch-v1"}' > /dev/null

echo; echo "### kill epoch server"
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
echo "done (epoch run)"
