/**
 * Playback and feedback (AGENT-ROADMAP P3 exit criteria), against an isolated
 * temporary event store — never the live library database.
 */

import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { evaluatePlan } from "../query/evaluate.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { validatePlan } from "../query/plan.ts";
import type { ValidatedPlan } from "../query/plan.ts";
import { EventLog } from "./events.ts";
import { deriveFeedback, recordFeedback } from "./feedback.ts";
import { classifyStop, SessionStore } from "./session.ts";
import { resolveInside, sendFile, StreamSigner } from "./stream.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "synamp-session-"));
  const open = () => {
    const log = new EventLog(join(dir, "events.jsonl"));
    return { log, store: new SessionStore(join(dir, "session.json"), log) };
  };
  return { dir, open, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const TRACKS = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }];
const signals = (log: EventLog) => log.all().filter((e) => !["receipt", "exposure", "started"].includes(e.signal)).map((e) => e.signal);
let n = 0;
const rid = () => `report-${String(++n).padStart(4, "0")}`;

test("play → skip is recorded as an early skip, scoped to the session", () => {
  const { open, cleanup } = setup();
  try {
    const { log, store } = open();
    let s = store.replaceQueue(rid(), TRACKS, { playlist_id: "focus" });
    const first = s.queue[0]!.entry_id;
    store.report(rid(), { type: "start", entry_id: first, duration_ms: 200_000 });
    store.report(rid(), { type: "progress", entry_id: first, played_ms: 5_000 });
    s = store.report(rid(), { type: "skip", entry_id: first, played_ms: 6_000 }).session;
    assert.equal(s.index, 1);
    const skip = log.all().find((e) => e.signal === "skip_early")!;
    assert.equal(skip.scope, "session");
    assert.equal(skip.playlist_id, "focus", "the playlist is kept as context");
    assert.equal(skip.play_ms, 6_000);
    // A single early skip changes nothing outside the session.
    assert.equal(deriveFeedback(log.all()).adjust("a", "focus").value, 0);
  } finally { cleanup(); }
});

test("stop classification uses an absolute and a relative floor", () => {
  assert.equal(classifyStop(10_000, 200_000), "skip_early");
  assert.equal(classifyStop(40_000, 200_000), "skip_late");
  assert.equal(classifyStop(20_000, 60_000), "skip_late", "a short track is not punished by the 30 s floor");
  assert.equal(classifyStop(170_000, 200_000), "full_play", "leaving during the outro counts as heard");
  assert.equal(classifyStop(10_000), "skip_early");
});

test("retries are idempotent for reports, queues and feedback", () => {
  const { open, cleanup } = setup();
  try {
    const { log, store } = open();
    const queueId = rid();
    const s = store.replaceQueue(queueId, TRACKS, { playlist_id: "p" });
    store.replaceQueue(queueId, [{ id: "zzz", title: "Z" }], { playlist_id: "p" });
    assert.equal(store.get().queue[0]!.track_id, "a", "a retried queue request does not replace the queue");
    const startId = rid();
    store.report(startId, { type: "start", entry_id: s.queue[0]!.entry_id, duration_ms: 100_000 });
    const skipId = rid();
    store.report(skipId, { type: "skip", entry_id: s.queue[0]!.entry_id, played_ms: 1_000 });
    const again = store.report(skipId, { type: "skip", entry_id: s.queue[0]!.entry_id, played_ms: 1_000 });
    assert.equal(again.duplicate, true);
    assert.equal(again.session.index, 1, "the retry did not advance twice");
    assert.equal(signals(log).filter((x) => x === "skip_early").length, 1);
    const love = { event_id: "love-0001", signal: "love" as const, track_id: "b" };
    assert.equal(recordFeedback(log, love).duplicate, false);
    assert.equal(recordFeedback(log, love).duplicate, true);
    assert.equal(log.all().filter((e) => e.signal === "love").length, 1);
  } finally { cleanup(); }
});

test("interruptions, errors and seeks are never dislikes", () => {
  const { open, cleanup } = setup();
  try {
    const { log, store } = open();
    let s = store.replaceQueue(rid(), TRACKS, { playlist_id: "p" });
    store.report(rid(), { type: "start", entry_id: s.queue[0]!.entry_id, duration_ms: 100_000 });
    store.report(rid(), { type: "seek", entry_id: s.queue[0]!.entry_id, from_ms: 1000, to_ms: 50_000 });
    s = store.replaceQueue(rid(), TRACKS, { playlist_id: "other" }); // started something else mid-track
    store.report(rid(), { type: "start", entry_id: s.queue[0]!.entry_id });
    s = store.report(rid(), { type: "error", entry_id: s.queue[0]!.entry_id, message: "network" }).session;
    assert.equal(s.index, 1, "an unplayable file moves on");
    assert.deepEqual(signals(log), ["seek", "interrupted", "playback_error"]);
    const view = deriveFeedback(log.all());
    assert.equal(view.adjust("a", "p").value, 0);
    assert.equal(view.adjust("a").value, 0);
    assert.equal(view.events, 0);
  } finally { cleanup(); }
});

test("reports for a track that is no longer current are refused", () => {
  const { open, cleanup } = setup();
  try {
    const { store } = open();
    const s = store.replaceQueue(rid(), TRACKS);
    assert.throws(() => store.report(rid(), { type: "skip", entry_id: "not-current", played_ms: 1 }), /no longer current/);
    assert.equal(store.get().index, 0);
    assert.throws(() => store.report("short", { type: "stop" }), /event_id/);
    assert.ok(s.queue.length === 3);
  } finally { cleanup(); }
});

test("restart restores the session and keeps retries recognised", () => {
  const { open, cleanup } = setup();
  try {
    const first = open();
    const s = first.store.replaceQueue(rid(), TRACKS, { playlist_id: "p" });
    const start = rid();
    first.store.report(start, { type: "start", entry_id: s.queue[0]!.entry_id, duration_ms: 100_000 });
    const ended = rid();
    first.store.report(ended, { type: "ended", entry_id: s.queue[0]!.entry_id, played_ms: 100_000 });
    const second = open();
    assert.deepEqual(second.store.get().queue, first.store.get().queue);
    assert.equal(second.store.get().index, 1);
    assert.equal(second.store.report(ended, { type: "ended", entry_id: s.queue[0]!.entry_id, played_ms: 100_000 }).duplicate, true);
    assert.equal(second.log.all().filter((e) => e.signal === "full_play").length, 1);
  } finally { cleanup(); }
});

test("a torn last line from a crash is skipped and the next write starts cleanly", () => {
  const { dir, open, cleanup } = setup();
  try {
    const { log } = open();
    recordFeedback(log, { event_id: "love-0001", signal: "love", track_id: "a" });
    appendFileSync(join(dir, "events.jsonl"), '{"id":"half-writ');
    const reopened = new EventLog(join(dir, "events.jsonl"));
    assert.equal(reopened.all().length, 1);
    recordFeedback(reopened, { event_id: "love-0002", signal: "love", track_id: "b" });
    assert.equal(new EventLog(join(dir, "events.jsonl")).all().length, 2);
    assert.ok(readFileSync(join(dir, "events.jsonl"), "utf8").includes('half-writ\n{"id":"love-0002"'));
  } finally { cleanup(); }
});

test("heard-through and replays count for that playlist", () => {
  const { open, cleanup } = setup();
  try {
    const { log, store } = open();
    const s = store.replaceQueue(rid(), TRACKS, { playlist_id: "p" });
    store.report(rid(), { type: "start", entry_id: s.queue[0]!.entry_id, duration_ms: 100_000 });
    store.report(rid(), { type: "ended", entry_id: s.queue[0]!.entry_id, played_ms: 99_000 });
    store.report(rid(), { type: "previous" });
    const fb = deriveFeedback(log.all());
    assert.deepEqual(fb.adjust("a", "p").parts.map((part) => part.label).sort(), ["heard it through here", "replayed here"]);
    assert.equal(fb.adjust("a", "elsewhere").value, 0, "playlist feedback stays in its playlist");
  } finally { cleanup(); }
});

// --- feedback on smart playlist results ---------------------------------------

function lib(): Library {
  const t = (id: string, piano: number): LibraryTrack => ({ id, title: id.toUpperCase(), artist: `Artist ${id}`,
    signals: { "instruments.piano": piano, bpm: 110, pulse_clarity: 0.6 } });
  return { version: "fb", tracks: [t("a", 0.05), t("b", 0.05), t("c", 0.05), t("pianist", 0.9)] };
}
function plan(): ValidatedPlan {
  const result = validatePlan({
    version: "2.0", intent: { query_type: "exclusion" }, target_size: 10,
    constraints: [{ id: "no_piano", source_phrase: "no piano", hard: true, explicit_exclusion: true, unknown_policy: "exclude",
      confidence: 0.8, where: { field: "instruments.piano", op: "lt", value: 0.2 } }],
    ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  });
  assert.ok(result.ok);
  return result;
}
const order = (result: ReturnType<typeof evaluatePlan>) => result.strict.map((track) => track.id);

test("remove hides a track from that playlist only, and restore brings it back", () => {
  const { open, cleanup } = setup();
  try {
    const { log } = open();
    recordFeedback(log, { event_id: "remove-001", signal: "remove", track_id: "b", scope: "playlist", playlist_id: "focus", reason: "wrong_vibe" });
    const view = deriveFeedback(log.all());
    const here = evaluatePlan(plan(), lib(), { feedback: view, playlistId: "focus" });
    assert.ok(!order(here).includes("b"));
    assert.equal(here.counts.hidden_by_you, 1);
    assert.deepEqual(here.hidden.map((track) => track.id), ["b"]);
    const there = evaluatePlan(plan(), lib(), { feedback: view, playlistId: "workout" });
    assert.ok(order(there).includes("b"), "a remove never leaks to another playlist");
    assert.equal(view.adjust("b").value, 0, "and is not a global dislike");
    recordFeedback(log, { event_id: "restore-01", signal: "restore", track_id: "b", scope: "playlist", playlist_id: "focus" });
    assert.ok(order(evaluatePlan(plan(), lib(), { feedback: deriveFeedback(log.all()), playlistId: "focus" })).includes("b"));
    assert.throws(() => recordFeedback(log, { event_id: "remove-002", signal: "remove", track_id: "b", scope: "global" }), /one playlist/);
  } finally { cleanup(); }
});

test("feedback re-ranks but cannot break a hard rule", () => {
  const { open, cleanup } = setup();
  try {
    const { log } = open();
    recordFeedback(log, { event_id: "love-0001", signal: "love", track_id: "pianist" });
    recordFeedback(log, { event_id: "love-0002", signal: "love", track_id: "c" });
    const result = evaluatePlan(plan(), lib(), { feedback: deriveFeedback(log.all()), playlistId: "focus" });
    assert.ok(!order(result).includes("pianist"), "loving a piano track does not get it past “no piano”");
    assert.equal(order(result)[0], "c");
    const top = result.strict[0]!;
    assert.ok(top.score_breakdown && top.score_breakdown.feedback > 0 && top.score_breakdown.feedback <= 0.15);
    assert.ok(top.reasons.some((reason) => reason.startsWith("your listening: you loved this")));
  } finally { cleanup(); }
});

test("negatives go global only when explicit or corroborated", () => {
  const { open, cleanup } = setup();
  try {
    const { log } = open();
    recordFeedback(log, { event_id: "down-0001", signal: "thumb_down", track_id: "a", scope: "playlist", playlist_id: "p1" });
    assert.equal(deriveFeedback(log.all()).adjust("a", "p3").value, 0);
    recordFeedback(log, { event_id: "down-0002", signal: "thumb_down", track_id: "a", scope: "playlist", playlist_id: "p2" });
    const view = deriveFeedback(log.all());
    assert.ok(view.adjust("a", "p3").value < 0);
    assert.match(view.adjust("a", "p3").parts[0]!.label, /turned down in 2 playlists/);
  } finally { cleanup(); }
});

test("two early skips in one playlist become a small penalty there", () => {
  const { open, cleanup } = setup();
  try {
    const { log, store } = open();
    for (let i = 0; i < 2; i++) {
      const s = store.replaceQueue(rid(), TRACKS, { playlist_id: "p" });
      store.report(rid(), { type: "start", entry_id: s.queue[0]!.entry_id, duration_ms: 200_000 });
      store.report(rid(), { type: "skip", entry_id: s.queue[0]!.entry_id, played_ms: 2_000 });
      if (i === 0) assert.equal(deriveFeedback(log.all()).adjust("a", "p").value, 0);
    }
    const view = deriveFeedback(log.all());
    assert.ok(Math.abs(view.adjust("a", "p").value + 0.6) < 1e-6);
    assert.equal(view.adjust("a").value, 0, "never global on skips alone");
  } finally { cleanup(); }
});

test("feedback decays: playlist signals fade faster than global ones", () => {
  const day = 86_400_000;
  const now = Date.now();
  const base = { source: "player" as const, policy_version: "heuristic-v1" };
  const view = deriveFeedback([
    { ...base, id: "x1", ts: now - 30 * day, signal: "love", track_id: "a", scope: "global" },
    { ...base, id: "x2", ts: now - 30 * day, signal: "repeat", track_id: "a", scope: "playlist", scope_id: "p" },
  ], now);
  const parts = Object.fromEntries(view.adjust("a", "p").parts.map((part) => [part.label, part.value]));
  assert.equal(parts["replayed here"], 0.5, "one half-life for playlist signals");
  assert.ok(parts["you loved this"]! > 1.7, "global signals keep most of their weight after a month");
});

// --- streaming -----------------------------------------------------------------

test("stream links are signed, expire, and stay inside the library", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-stream-"));
  try {
    const root = join(dir, "music");
    mkdirSync(join(root, "A"), { recursive: true });
    writeFileSync(join(root, "A", "one.mp3"), Buffer.from("0123456789"));
    writeFileSync(join(dir, "secret.mp3"), "nope");
    symlinkSync(join(dir, "secret.mp3"), join(root, "A", "escape.mp3"));
    assert.ok(resolveInside(root, "A/one.mp3"));
    for (const bad of ["../secret.mp3", "/etc/passwd", "A/escape.mp3", "A", "A/missing.mp3"]) assert.equal(resolveInside(root, bad), null, bad);

    const signer = new StreamSigner("token");
    const link = new URL(signer.url("p:one"), "http://x");
    assert.ok(signer.verify("p:one", link.searchParams.get("exp"), link.searchParams.get("sig")));
    assert.ok(!signer.verify("p:two", link.searchParams.get("exp"), link.searchParams.get("sig")), "a link is for one track");
    assert.ok(!signer.verify("p:one", link.searchParams.get("exp"), link.searchParams.get("sig"), Date.now() + 7 * 3_600_000), "links expire");
    assert.ok(!new StreamSigner("other").verify("p:one", link.searchParams.get("exp"), link.searchParams.get("sig")));

    const file = resolveInside(root, "A/one.mp3")!;
    const server = createServer((req, res) => sendFile(req, res, file)).listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
      const whole = await fetch(`http://127.0.0.1:${port}`);
      assert.equal(whole.status, 200);
      assert.equal(whole.headers.get("content-type"), "audio/mpeg");
      assert.equal(await whole.text(), "0123456789");
      const part = await fetch(`http://127.0.0.1:${port}`, { headers: { range: "bytes=2-5" } });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get("content-range"), "bytes 2-5/10");
      assert.equal(await part.text(), "2345");
      const tail = await fetch(`http://127.0.0.1:${port}`, { headers: { range: "bytes=-3" } });
      assert.equal(await tail.text(), "789");
      assert.equal((await fetch(`http://127.0.0.1:${port}`, { headers: { range: "bytes=50-60" } })).status, 416);
    } finally { server.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
