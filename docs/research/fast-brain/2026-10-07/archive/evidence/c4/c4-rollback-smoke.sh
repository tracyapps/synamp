#!/bin/bash
# C4 production-review smoke — rollback (legacy switch), forget, error paths, config recipe.
# Scratch only (/tmp/synamp-c4), port 3921. Pattern copied from evidence/b5/route-smoke-epoch.sh.
set -u
REPO=/Users/tapps/_dev/web-apps/SynAmp
S=/tmp/synamp-c4
cd "$REPO/apps/brain" || exit 1
BASE=http://127.0.0.1:3921
rm -rf "$S/rollback"; mkdir -p "$S/rollback"; S="$S/rollback"

if lsof -nP -iTCP:3921 -sTCP:LISTEN >/dev/null 2>&1; then echo "ABORT: port 3921 not free"; exit 1; fi

echo "### boot scratch: PLAYLIST_DATA_PATH=$S/playlists.json LIBRARY_SIGNALS_PATH=$PWD/fixtures/library.sample.json BRAIN_PORT=3921 BRAIN_HOST=127.0.0.1"
PLAYLIST_DATA_PATH="$S/playlists.json" LIBRARY_SIGNALS_PATH="$PWD/fixtures/library.sample.json" BRAIN_PORT=3921 BRAIN_HOST=127.0.0.1 \
  node --experimental-strip-types src/index.ts > "$S/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null' EXIT
for i in $(seq 1 80); do curl -s -o /dev/null "$BASE/health" && break; sleep 0.25; done
echo "server pid $SERVER_PID | /health: $(curl -s "$BASE/health") | server log: $(head -1 "$S/server.log")"

echo; echo "### [1] epoch mode: queue + two early skips → session hide"
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"c4-queue-0001","track_ids":["sample-001","sample-002","sample-003"]}' > "$S/queue1.json"
E1=$(node -e 'console.log(require("/tmp/synamp-c4/rollback/queue1.json").session.queue[0].entry_id)')
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"c4-rep-0001\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"c4-rep-0002\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1\",\"played_ms\":2500}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/queue" -H 'content-type: application/json' \
  -d '{"event_id":"c4-queue-0002","track_ids":["sample-001","sample-002","sample-003"]}' > "$S/queue2.json"
E1B=$(node -e 'console.log(require("/tmp/synamp-c4/rollback/queue2.json").session.queue[0].entry_id)')
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"c4-rep-0003\",\"report\":{\"type\":\"start\",\"entry_id\":\"$E1B\",\"duration_ms\":200000}}" > /dev/null
curl -s -X POST "$BASE/api/v1/session/report" -H 'content-type: application/json' \
  -d "{\"event_id\":\"c4-rep-0004\",\"report\":{\"type\":\"skip\",\"entry_id\":\"$E1B\",\"played_ms\":1500}}" > /dev/null
curl -s "$BASE/api/v1/brain/session" > "$S/readout-epoch-1.json"
node -e '
const r = require("/tmp/synamp-c4/rollback/readout-epoch-1.json");
console.log("policy_version:", r.policy_version, "| listening_policy:", r.listening_policy, "| hides:", JSON.stringify(r.hides));
console.log("epoch:", r.epoch ? r.epoch.daypart + " " + r.epoch.date : null, "| events:", r.events);
const adj = r.queue_adjustments.find(a => a.track_id === "sample-001");
console.log("sample-001 adj:", adj ? JSON.stringify(adj) : null);
'
echo "PASS-EXPECT: policy_version=epoch-v1; hides=[sample-001]"

echo; echo "### [2] rollback switch → legacy-v1 (settings, no restart)"
curl -s -X POST "$BASE/api/v1/settings" -H 'content-type: application/json' -d '{"listening_policy":"legacy-v1"}' > "$S/settings-legacy.json"
node -e 'const r=require("/tmp/synamp-c4/rollback/settings-legacy.json");console.log("settings changed:",JSON.stringify(r.changed),"| listening_policy now:",r.settings.listening_policy)'
curl -s "$BASE/api/v1/brain/session" > "$S/readout-legacy.json"
node -e '
const r = require("/tmp/synamp-c4/rollback/readout-legacy.json");
console.log("policy_version:", r.policy_version, "| listening_policy:", r.listening_policy, "| epoch:", r.epoch, "| hides:", JSON.stringify(r.hides), "| proposals:", r.proposals.length);
const adj = r.queue_adjustments.find(a => a.track_id === "sample-001");
console.log("sample-001 adj (legacy):", adj ? JSON.stringify(adj) : null);
'
curl -s "$BASE/api/v1/events?limit=1" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("events-route policy_version:", r.policy_version)})'
curl -s -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' -d '{"prompt":"I need to focus"}' > "$S/draft-legacy.json"
node -e 'const r=require("/tmp/synamp-c4/rollback/draft-legacy.json");console.log("draft preview feedback_policy:", r.preview && r.preview.feedback_policy, "| accuracy:", r.interpretation.accuracy)'
echo "PASS-EXPECT: heuristic-v1 everywhere; epoch null; hides []"

echo; echo "### [3] switch back to epoch-v1 → hide re-derives (log untouched)"
curl -s -X POST "$BASE/api/v1/settings" -H 'content-type: application/json' -d '{"listening_policy":"epoch-v1"}' > /dev/null
curl -s "$BASE/api/v1/brain/session" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("back to epoch → policy_version:", r.policy_version, "| hides:", JSON.stringify(r.hides))})'
echo "PASS-EXPECT: hides=[sample-001] again"

echo; echo "### [4] forget — append-only proof + clears epoch learning"
BEFORE_LINES=$(wc -l < "$S/events.jsonl" | tr -d ' ')
BEFORE_FIRST=$(head -1 "$S/events.jsonl" | shasum -a 256 | cut -d' ' -f1)
curl -s -X POST "$BASE/api/v1/brain/forget" -H 'content-type: application/json' -d '{"scope":"epoch"}' > "$S/forget.json"
AFTER_LINES=$(wc -l < "$S/events.jsonl" | tr -d ' ')
AFTER_FIRST=$(head -1 "$S/events.jsonl" | shasum -a 256 | cut -d' ' -f1)
node -e '
const r = require("/tmp/synamp-c4/rollback/forget.json");
const adj = r.queue_adjustments.filter(a => a.parts.length);
console.log("after forget → hides:", JSON.stringify(r.hides), "| adjustments with parts:", adj.length);
console.log("notes:", JSON.stringify(r.reliability_notes));
'
echo "events lines: $BEFORE_LINES → $AFTER_LINES | first-line hash unchanged: $([ "$BEFORE_FIRST" = "$AFTER_FIRST" ] && echo yes || echo NO)"
tail -1 "$S/events.jsonl" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const e=JSON.parse(s);console.log("last event:", e.signal, "| scope:", e.scope, "| detail:", JSON.stringify(e.detail), "| policy_version:", e.policy_version)})'
curl -s "$BASE/api/v1/brain/session" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log("re-GET after forget → hides:", JSON.stringify(r.hides))})'
echo "PASS-EXPECT: hides [] after forget; +1 line only; first line unchanged; tail learning_reset"

echo; echo "### [5] error paths (expect codes in parentheses)"
code() { curl -s -o "$S/last.json" -w "%{http_code}" "$@"; }
echo "forget scope=all        → $(code -X POST "$BASE/api/v1/brain/forget" -H 'content-type: application/json' -d '{"scope":"all"}') (400) :: $(cat "$S/last.json")"
echo "forget scope=session    → $(code -X POST "$BASE/api/v1/brain/forget" -H 'content-type: application/json' -d '{"scope":"session"}') (400) :: $(cat "$S/last.json")"
echo "forget {} default epoch → $(code -X POST "$BASE/api/v1/brain/forget" -H 'content-type: application/json' -d '{}') (200)"
echo "forget empty body       → $(code -X POST "$BASE/api/v1/brain/forget") (400) :: $(cat "$S/last.json")"
echo "GET  forget (wrong verb)→ $(code "$BASE/api/v1/brain/forget") (404)"
echo "proposals no id         → $(code -X POST "$BASE/api/v1/brain/proposals" -H 'content-type: application/json' -d '{"action":"accept"}') (400) :: $(cat "$S/last.json")"
echo "proposals bad action    → $(code -X POST "$BASE/api/v1/brain/proposals" -H 'content-type: application/json' -d '{"id":"pr1:x","action":"maybe"}') (400) :: $(cat "$S/last.json")"
echo "proposals unknown id    → $(code -X POST "$BASE/api/v1/brain/proposals" -H 'content-type: application/json' -d '{"id":"pr1:does-not-exist","action":"accept"}') (404) :: $(cat "$S/last.json")"
P501=$(node -e 'process.stdout.write("a".repeat(501))')
echo "draft 501 chars         → $(curl -s -o "$S/last.json" -w "%{http_code}" -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' --data-binary "{\"prompt\":\"$P501\"}") (400) :: $(cat "$S/last.json")"
P500=$(node -e 'process.stdout.write("a".repeat(500))')
echo "draft 500 chars         → $(curl -s -o "$S/last.json" -w "%{http_code}" -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' --data-binary "{\"prompt\":\"$P500\"}") (200 boundary)"
echo "draft whitespace-only   → $(code -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' -d '{"prompt":"   "}') (400) :: $(cat "$S/last.json")"
echo "draft invalid JSON      → $(code -X POST "$BASE/api/v1/plans/draft" -H 'content-type: application/json' -d 'not json{') (400) :: $(cat "$S/last.json")"
echo "settings bogus policy   → $(code -X POST "$BASE/api/v1/settings" -H 'content-type: application/json' -d '{"listening_policy":"bogus"}') (400) :: $(cat "$S/last.json")"

echo; echo "### scratch state files"; ls -la "$S"
echo "### done (rollback smoke) — server killed by trap"
