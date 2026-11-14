/** SynAmp's status in one answer (the menu-bar icon reads it). */

import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_STALE_MS, STREAM_RECENT_MS } from "./activity.ts";
import { systemStatus, type StatusInput } from "./status.ts";

const now = 1_000_000_000;
const quiet: StatusInput = { now, session: null, lastStreamAt: null, analysis: { reported: false }, worker: null, anywhere: {} };

test("a quiet SynAmp says so without guessing", () => {
  assert.deepEqual(systemStatus(quiet), { player: null, phone: false, listening: null, music: null, anywhere: { ready: false } });
});

test("what's playing, and paused is still shown", () => {
  const song = { title: "Monkey Wrench", artist: "Foo Fighters" };
  assert.deepEqual(systemStatus({ ...quiet, session: { state: "playing", updated_at: now - 1000, current: song } }).player, { state: "playing", ...song });
  assert.equal(systemStatus({ ...quiet, session: { state: "paused", updated_at: now - 1000, current: { title: "Untitled" } } }).player?.state, "paused");
  assert.equal(systemStatus({ ...quiet, session: { state: "idle", updated_at: now, current: song } }).player, null);
  assert.equal(systemStatus({ ...quiet, session: { state: "playing", updated_at: now - SESSION_STALE_MS, current: song } }).player, null, "a player that went away");
  assert.equal(systemStatus({ ...quiet, session: { state: "playing", updated_at: now } }).player, null, "between songs");
});

test("a phone app counts for a few minutes", () => {
  assert.equal(systemStatus({ ...quiet, lastStreamAt: now - 60_000 }).phone, true);
  assert.equal(systemStatus({ ...quiet, lastStreamAt: now - STREAM_RECENT_MS }).phone, false);
});

test("listening: how far, and only a time left while it's really running", () => {
  const report = { reported: true, state: "analyzing", catalog: { present: 46_039 }, analysed_once: 12_340, queue: { failed: 15 }, run: { eta_seconds: 10_800 } };
  assert.deepEqual(systemStatus({ ...quiet, analysis: report }).listening, { active: true, done: 12_340, total: 46_024, eta_seconds: 10_800 });
  assert.deepEqual(systemStatus({ ...quiet, analysis: { ...report, stale: true } }).listening, { active: false, done: 12_340, total: 46_024, eta_seconds: null },
    "reports stopped (the computer slept): not active, no promise of a time");
  assert.deepEqual(systemStatus({ ...quiet, analysis: { ...report, state: "idle", analysed_once: 99_999 } }).listening, { active: false, done: 46_024, total: 46_024, eta_seconds: null },
    "never more done than there is");
});

test("the music: reachable, away, or not known", () => {
  assert.equal(systemStatus({ ...quiet, worker: { online: false, library_ok: true } }).music, null, "nobody to say");
  assert.deepEqual(systemStatus({ ...quiet, worker: { online: true, library_ok: true, problem: "old" } }).music, { ok: true, away: false });
  assert.deepEqual(systemStatus({ ...quiet, worker: { online: true, library_ok: false, away: true, problem: "Away from the music" } }).music,
    { ok: false, away: true, problem: "Away from the music" });
});

test("Listen anywhere is ready once the server has a name away from home", () => {
  assert.deepEqual(systemStatus({ ...quiet, anywhere: { tailscale_name: " syd.tail1234.ts.net " } }).anywhere, { ready: true, name: "syd.tail1234.ts.net" });
  assert.deepEqual(systemStatus({ ...quiet, anywhere: { tailscale_name: "" } }).anywhere, { ready: false });
});
