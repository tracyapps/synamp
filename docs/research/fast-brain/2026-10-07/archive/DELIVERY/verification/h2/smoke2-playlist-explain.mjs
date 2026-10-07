// Scratch E2E smoke #2 (not part of the repo): smart-playlist explain surface —
// persistent removes are "Removed by you" (restorable); epoch hides stay session-counted.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "/Users/tapps/_dev/web-apps/SynAmp";
const tmp = mkdtempSync(join(tmpdir(), "synamp-smoke2-"));
mkdirSync(join(tmp, "data"), { recursive: true });
writeFileSync(join(tmp, "library.json"), readFileSync(join(REPO, "apps/brain/fixtures/library.sample.json")));

const now = Date.now();
const MIN = 60_000;
const lines = [];
let n = 0;
const push = (ts, track, session) => {
  n++;
  lines.push(JSON.stringify({ id: "smoke" + String(n).padStart(4, "0"), ts, signal: "skip_early", track_id: track,
    scope: "session", session_id: session, playlist_id: "smokepl", source: "player", policy_version: "epoch-v1" }));
};
push(now - 7 * MIN, "sample-005", "live"); push(now - 6 * MIN, "sample-005", "live");
const eventsPath = join(tmp, "data", "events.jsonl");
writeFileSync(eventsPath, lines.join("\n") + "\n");

const port = 3974;
const server = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], {
  cwd: join(REPO, "apps/brain"),
  env: { ...process.env, BRAIN_PORT: String(port), BRAIN_HOST: "127.0.0.1",
    PLAYLIST_DATA_PATH: join(tmp, "data", "playlists.json"), LIBRARY_SIGNALS_PATH: join(tmp, "library.json"),
    EVENTS_PATH: eventsPath, SESSION_PATH: join(tmp, "data", "session.json") },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));

const base = `http://127.0.0.1:${port}/api/v1`;
const wait = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 150)); } throw new Error("server did not start:\n" + log); };
const ok = (m) => console.log("ok -", m);
const fail = (m) => { console.error("FAIL -", m); process.exitCode = 1; };
const post = async (p, body) => { const r = await fetch(base + p, { method: "POST", body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null) }; };

try {
  await wait();
  // Create a smart playlist to evaluate against.
  const plan = { version: "2.0", intent: { query_type: "mixed" }, target_size: 60,
    constraints: [{ id: "any", source_phrase: "anything", hard: false, unknown_policy: "neutral", weight: 0.5, confidence: 0.5, where: { field: "bpm", op: "gte", value: 60 } }],
    ranking: { signals: [] }, sequencing: { arc: "build" }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] } };
  const created = await post("/playlists", { type: "smart", name: "H2 smoke", plan, prompt: "smoke" });
  const id = created.body?.node?.id;
  id ? ok("smart playlist created: " + id) : fail("create failed: " + JSON.stringify(created.body).slice(0, 200));

  // Remove sample-004 from THIS playlist (persistent, restorable).
  const rm = await post("/feedback", { event_id: "smoke-rm-0001", signal: "remove", track_id: "sample-004", scope: "playlist", playlist_id: id, session_id: "live" });
  (rm.status === 201 || rm.status === 200) ? ok("remove recorded (persistent, playlist scope)") : fail("remove failed " + rm.status);

  // Explain: persistent remove is `hidden` (+ hidden_by_you), epoch hide is session-counted only.
  const ex1 = await get(`/playlists/${id}/explain`);
  const r1 = ex1.body?.result;
  r1 ? null : fail("explain failed: " + ex1.status);
  const hiddenIds1 = (r1.hidden || []).map((t) => t.id);
  hiddenIds1.includes("sample-004") ? ok("explain: sample-004 is 'Removed by you' (restorable list)") : fail("sample-004 not in hidden: " + JSON.stringify(hiddenIds1));
  !hiddenIds1.includes("sample-005") ? ok("explain: epoch hide sample-005 is NOT in the restore list") : fail("sample-005 masquerades in hidden");
  r1.counts.hidden_by_you === 1 ? ok("explain: hidden_by_you = 1") : fail("hidden_by_you = " + r1.counts.hidden_by_you);
  r1.counts.hidden_by_session === 1 ? ok("explain: hidden_by_session = 1") : fail("hidden_by_session = " + r1.counts.hidden_by_session);
  !(r1.strict || []).some((t) => t.id === "sample-004" || t.id === "sample-005") ? ok("explain: both hidden tracks absent from strict") : fail("hidden track still in strict");
  Array.isArray(r1.sequencing_applied) && r1.sequencing_applied.length > 0 ? ok("explain carries sequencing_applied (F8 surface)") : fail("no sequencing_applied on explain");

  // Restore the persistent remove: it comes back to strict; the epoch hide survives (hence the split).
  const rst = await post("/feedback", { event_id: "smoke-rst-0001", signal: "restore", track_id: "sample-004", scope: "playlist", playlist_id: id, session_id: "live" });
  (rst.status === 201 || rst.status === 200) ? ok("restore recorded") : fail("restore failed " + rst.status);
  const ex2 = await get(`/playlists/${id}/explain`);
  const r2 = ex2.body?.result;
  (r2.hidden || []).length === 0 ? ok("after restore: restore list empty") : fail("after restore hidden not empty: " + JSON.stringify(r2.hidden));
  r2.counts.hidden_by_session === 1 ? ok("after restore: sample-005 still session-hidden (no dead Restore exists)") : fail("hidden_by_session after restore = " + r2.counts.hidden_by_session);
  (r2.strict || []).some((t) => t.id === "sample-004") ? ok("after restore: sample-004 back in strict") : fail("sample-004 not restored to strict");
} catch (e) {
  console.error("ERROR", e); process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  console.log("smoke dir:", tmp);
  console.log("server log tail:", log.split("\n").filter(Boolean).slice(-3).join(" | "));
}
