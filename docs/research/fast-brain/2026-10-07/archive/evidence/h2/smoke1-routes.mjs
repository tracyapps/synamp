// Scratch E2E smoke for H2 hotfix (not part of the repo):
//   F3 — proposal accept writes thumb_down with no reason + detail.proposal_id
//   F4 — /plans/draft and /plans/evaluate report epoch hides as hidden_by_session, never "Removed by you"
//   F8 — sequencing_applied present on evaluate results with an arc
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "/Users/tapps/_dev/web-apps/SynAmp";
const tmp = mkdtempSync(join(tmpdir(), "synamp-smoke-"));
mkdirSync(join(tmp, "data"), { recursive: true });
writeFileSync(join(tmp, "library.json"), readFileSync(join(REPO, "apps/brain/fixtures/library.sample.json")));

// Seed: closed skip pattern for sample-001 (3 epochs / 3 dates) + live skip x2 for sample-005.
const now = Date.now();
const MIN = 60_000, DAY = 86_400_000;
const lines = [];
let n = 0;
const push = (ts, track, session) => {
  n++;
  lines.push(JSON.stringify({ id: "smoke" + String(n).padStart(4, "0"), ts, signal: "skip_early", track_id: track,
    scope: "session", session_id: session, playlist_id: "smokepl", source: "player", policy_version: "epoch-v1" }));
};
for (const d of [3, 2, 1]) { push(now - d * DAY - 60 * MIN, "sample-001", "sess-d" + d); push(now - d * DAY - 59 * MIN, "sample-001", "sess-d" + d); }
push(now - 7 * MIN, "sample-005", "live");
push(now - 6 * MIN, "sample-005", "live");
const eventsPath = join(tmp, "data", "events.jsonl");
writeFileSync(eventsPath, lines.join("\n") + "\n");

const port = 3973;
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
const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body) => { const r = await fetch(base + p, { method: "POST", body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };

try {
  await wait();
  const session1 = await get("/brain/session");
  const prop = (session1.proposals || []).find((p) => p.subject === "sample-001");
  prop ? ok(`proposal present: ${prop.kind} ${prop.id}\n     suggested_action: ${prop.suggested_action}`) : fail("no sample-001 proposal");
  (session1.hides || []).includes("sample-005") ? ok("live epoch hides sample-005 (brain/session)") : fail("sample-005 not hidden");

  // --- F4: draft preview vs evaluate, same plan (before accept: accept mints its own
  //     event under the server session id, which would start a new epoch in this smoke) ---
  const draft = await post("/plans/draft", { prompt: "I need to focus. no words, no piano" });
  draft.body.validation?.ok ? ok("draft validates; chosen reading: " + draft.body.interpretation?.readings?.find?.((r) => r.chosen)?.label) : fail("draft invalid");
  const preview = draft.body.preview;
  preview.counts.hidden_by_session === 1 ? ok("draft preview counts.hidden_by_session = 1") : fail("draft hidden_by_session = " + preview.counts.hidden_by_session);
  preview.hidden.length === 0 && preview.counts.hidden_by_you === 0 ? ok("draft preview: hidden empty, hidden_by_you = 0 (no masquerade)") : fail("draft preview masquerades hides: " + JSON.stringify(preview.hidden));
  !preview.strict.some((t) => t.id === "sample-005") ? ok("draft preview: sample-005 absent from strict") : fail("sample-005 still in draft strict");

  const evalR = await post("/plans/evaluate", { plan: draft.body.validation.plan });
  const result = evalR.body.result;
  result && result.counts.hidden_by_session === preview.counts.hidden_by_session
    ? ok(`/plans/evaluate parity: hidden_by_session = ${result.counts.hidden_by_session} (matches draft preview)`)
    : fail("evaluate/draft mismatch: " + JSON.stringify(result?.counts));
  result.hidden.length === 0 ? ok("evaluate: hidden empty; counts.hidden_by_you = " + result.counts.hidden_by_you) : fail("evaluate hidden not empty");

  // --- F8: sequencing_applied on an arc plan ---
  const buildPlan = { version: "2.0", intent: { query_type: "mixed" }, target_size: 10,
    constraints: [{ id: "any", source_phrase: "anything", hard: false, unknown_policy: "neutral", weight: 0.5, confidence: 0.5, where: { field: "bpm", op: "gte", value: 60 } }],
    ranking: { signals: [] }, sequencing: { arc: "build" }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] } };
  const seqR = await post("/plans/evaluate", { plan: buildPlan });
  const seq = seqR.body.result?.sequencing_applied;
  Array.isArray(seq) && seq.length > 0 ? ok("sequencing_applied: " + JSON.stringify(seq)) : fail("no sequencing_applied (" + seqR.status + "): " + JSON.stringify(seqR.body).slice(0, 400));

  // --- F3: accept a proposal; check the log event it wrote (last, so it cannot reseed the epoch) ---
  const acc = await post("/brain/proposals", { id: prop.id, action: "accept" });
  acc.status === 200 ? ok("accept 200") : fail("accept status " + acc.status);
  !(acc.body.proposals || []).some((p) => p.id === prop.id) ? ok("accepted proposal gone from readout") : fail("proposal still listed after accept");

  const tail = readFileSync(eventsPath, "utf8").trim().split("\n");
  const last = JSON.parse(tail[tail.length - 1]);
  const shapeOk = last.signal === "thumb_down" && !("reason" in last) && last.track_id === "sample-001"
    && last.scope === "global" && last.source === "server" && last.detail && last.detail.proposal_id === prop.id;
  shapeOk ? ok("accept event shape (F3): " + JSON.stringify(last)) : fail("accept event shape wrong: " + JSON.stringify(last));

  // --- dismiss writes no log event ---
  const before = readFileSync(eventsPath, "utf8").trim().split("\n").length;
  const second = (session1.proposals || []).find((p) => p.id !== prop.id);
  if (second) {
    const dis = await post("/brain/proposals", { id: second.id, action: "dismiss" });
    const after = readFileSync(eventsPath, "utf8").trim().split("\n").length;
    dis.status === 200 && after === before ? ok("dismiss: no log event written") : fail("dismiss wrote an event or failed");
  } else ok("no second proposal to test dismiss (fine)");
} catch (e) {
  console.error("ERROR", e); process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  console.log("smoke dir:", tmp);
  console.log("server log tail:", log.split("\n").filter(Boolean).slice(-3).join(" | "));
}
