/**
 * Epoch policy derivation tests (A3 §3.2–3.7, dispatch deliverable 8).
 *
 * Covers: isolation (both directions, byte compare), resume/split semantics,
 * midnight, missing session ids, half-life, hide rules and expiry, flood
 * bounds, determinism, explicit-only parity with heuristic-v1, scope_persistence
 * modes, learning_reset, odd inputs, reliability notes and the centroid term.
 *
 * All fixtures are synthetic; they test the LOGIC, not how real music measures.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveEpochPolicy } from "./derive.ts";
import { deriveFeedback, feedbackBonus } from "../session/feedback.ts";
import type { ListeningEvent, Signal } from "../session/events.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import type { EpochPolicyView } from "./types.ts";

const TZ = "America/Chicago";

/** An instant at local h:mm in America/Chicago (CDT) on 2026-10-<dayOfMonth>. */
const local = (dayOfMonth: number, hour: number, minute = 0, second = 0): number =>
  Date.UTC(2026, 9, dayOfMonth, hour + 5, minute, second);

let seq = 0;
function ev(ts: number, signal: Signal, track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent {
  seq += 1;
  return { id: `d${String(seq).padStart(4, "0")}`, ts, signal, track_id: track, scope: "session", source: "player", policy_version: "test", ...extra };
}

function track(
  id: string,
  opts: { artist?: string; title?: string; bpm?: number; tc?: number; lufs?: number; crest?: number; onset?: number; perc?: number } = {},
): LibraryTrack {
  const signals: Record<string, number> = {};
  if (opts.bpm !== undefined) signals["bpm"] = opts.bpm;
  if (opts.tc !== undefined) signals["tempo_confidence"] = opts.tc;
  if (opts.lufs !== undefined) signals["lufs_integrated"] = opts.lufs;
  if (opts.crest !== undefined) signals["crest_factor"] = opts.crest;
  if (opts.onset !== undefined) signals["onset_rate"] = opts.onset;
  if (opts.perc !== undefined) signals["percussiveness"] = opts.perc;
  return { id, title: opts.title ?? `Track ${id}`, ...(opts.artist ? { artist: opts.artist } : {}), signals };
}

const snapshot = (view: EpochPolicyView, ids: string[], playlist = "PL1"): string =>
  JSON.stringify({
    events: view.events,
    epoch: view.epoch,
    hides: [...view.epochHides()].sort(),
    removed: [...view.removed(playlist)].sort(),
    adjusts: ids.map((id) => [id, view.adjust(id), view.adjust(id, playlist)]),
    notes: view.reliabilityNotes(),
    proposals: view.proposals(),
  });

// --- isolation ----------------------------------------------------------------

test("isolation: implicit events from another day never change a derived value (byte compare, both directions)", () => {
  const day1 = [
    ev(local(2, 9, 0), "full_play", "X", { session_id: "s1", playlist_id: "PL1" }),
    ev(local(2, 9, 5), "skip_early", "Y", { session_id: "s1" }),
    ev(local(2, 9, 10), "skip_early", "Y", { session_id: "s1" }),
    ev(local(2, 9, 15), "repeat", "Z", { session_id: "s1", playlist_id: "PL1" }),
  ];
  const day2 = [
    ev(local(3, 10, 0), "full_play", "X", { session_id: "s2" }),
    ev(local(3, 10, 10), "repeat", "X", { session_id: "s2" }),
    ev(local(3, 10, 20), "skip_early", "Z", { session_id: "s2" }),
    ev(local(3, 10, 30), "skip_early", "Z", { session_id: "s2" }),
    ev(local(3, 10, 40), "repeat", "Z", { session_id: "s2" }),
  ];
  const ids = ["X", "Y", "Z", "Q"];
  const now1 = local(2, 9, 30);

  const before = deriveEpochPolicy(day1, { now: now1, timezone: TZ });
  const after = deriveEpochPolicy([...day1, ...day2], { now: now1, timezone: TZ });
  assert.equal(snapshot(after, ids), snapshot(before, ids));

  // Reverse direction: day-1 events must not move day-2 derived values.
  // (Proposals are compared separately — they are the sanctioned cross-epoch channel.)
  const now2 = local(3, 11, 0);
  const day2Only = deriveEpochPolicy(day2, { now: now2, timezone: TZ });
  const both = deriveEpochPolicy([...day1, ...day2], { now: now2, timezone: TZ });
  const withoutProposals = (view: EpochPolicyView): string => {
    const parsed = JSON.parse(snapshot(view, ids)) as Record<string, unknown>;
    delete parsed["proposals"];
    return JSON.stringify(parsed);
  };
  assert.equal(withoutProposals(both), withoutProposals(day2Only));
});

test("resume within 30 min keeps this session's evidence; a 30:01 gap starts fresh", () => {
  const t0 = local(2, 14, 0);
  const tight = [
    ev(t0, "full_play", "X", { session_id: "s1" }),
    ev(t0 + 29 * 60_000 + 59_000, "started", "X", { session_id: "s1" }),
  ];
  const kept = deriveEpochPolicy(tight, { now: t0 + 30 * 60_000, timezone: TZ });
  assert.ok(kept.adjust("X").value > 0.1);
  assert.notEqual(kept.epoch, null);

  const split = [
    ev(t0, "full_play", "X", { session_id: "s1" }),
    ev(t0 + 30 * 60_000 + 1_000, "started", "Y", { session_id: "s1" }),
  ];
  const fresh = deriveEpochPolicy(split, { now: t0 + 31 * 60_000, timezone: TZ });
  assert.equal(fresh.adjust("X").value, 0); // the old epoch is closed — killed, not decayed
  assert.equal(fresh.adjust("Y").value, 0);
});

test("midnight boundary kills the previous day's evidence (P2)", () => {
  const events = [ev(local(2, 23, 55), "repeat", "X", { session_id: "s1" })];
  const sameNight = deriveEpochPolicy(events, { now: local(2, 23, 59), timezone: TZ });
  assert.ok(sameNight.adjust("X").value > 0.6);

  const afterMidnight = deriveEpochPolicy([...events, ev(local(3, 0, 5), "started", "Y", { session_id: "s1" })], {
    now: local(3, 0, 10),
    timezone: TZ,
  });
  assert.equal(afterMidnight.adjust("X").value, 0);
});

// --- half-life ------------------------------------------------------------------

test("half-life: this session's weight at +60 min is ≤ 0.25× a fresh one (P3)", () => {
  const t0 = local(2, 10, 0);
  const events = [
    ev(t0, "repeat", "old", { session_id: "s1" }),
    ev(t0 + 20 * 60_000, "started", "anchor1", { session_id: "s1" }),
    ev(t0 + 40 * 60_000, "started", "anchor2", { session_id: "s1" }),
    ev(t0 + 55 * 60_000, "started", "anchor3", { session_id: "s1" }),
    ev(t0 + 60 * 60_000, "repeat", "fresh", { session_id: "s1" }),
  ];
  const view = deriveEpochPolicy(events, { now: t0 + 60 * 60_000, timezone: TZ });
  const oldValue = view.adjust("old").value;
  const freshValue = view.adjust("fresh").value;
  assert.ok(Math.abs(freshValue - 0.7) < 1e-9);
  assert.ok(oldValue <= 0.25 * freshValue + 1e-9);
  assert.ok(oldValue >= 0.25 * freshValue - 1e-9);
});

// --- hides -----------------------------------------------------------------------

test("hide rules: one skip never hides; the 2nd hides; not_now hides; all die with the epoch", () => {
  const t0 = local(2, 15, 0);
  const base = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 30_000, "thumb_down", "N", { session_id: "s1", reason: "not_now", scope: "global" }),
  ];
  const view1 = deriveEpochPolicy(base, { now: t0 + 60_000, timezone: TZ });
  assert.deepEqual([...view1.epochHides()], ["N"]);
  assert.ok(view1.adjust("Y").value < 0); // small, non-hiding negative

  const withSecond = [...base, ev(t0 + 60_000, "skip_early", "Y", { session_id: "s1" })];
  const view2 = deriveEpochPolicy(withSecond, { now: t0 + 90_000, timezone: TZ });
  assert.deepEqual([...view2.epochHides()].sort(), ["N", "Y"]);

  const after = deriveEpochPolicy(withSecond, { now: t0 + 60_000 + 30 * 60_000 + 1_000, timezone: TZ });
  assert.equal(after.epoch, null);
  assert.equal(after.epochHides().size, 0);
  assert.equal(after.adjust("Y").value, 0);
  assert.equal(after.adjust("N").value, 0); // not_now never persists
  assert.ok(after.reliabilityNotes().includes("no active session — learning is paused"));
});

test("remove/restore keep their v1 semantics: last write wins per playlist", () => {
  const t0 = local(2, 16, 0);
  const removedEvents = [
    ev(t0, "remove", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 60_000, "restore", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 120_000, "remove", "W", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 180_000, "restore", "W", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 240_000, "remove", "W", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 300_000, "remove", "Q", { session_id: "s1", scope: "playlist", scope_id: "PL2" }),
  ];
  const view = deriveEpochPolicy(removedEvents, { now: t0 + 360_000, timezone: TZ });
  assert.deepEqual([...view.removed("PL1")].sort(), ["W"]);
  assert.deepEqual([...view.removed("PL2")], ["Q"]);
  assert.equal(view.removed("PL3").size, 0);
});

// --- bounds -----------------------------------------------------------------------

test("bounds: a flood of loves or skips stays under the saturated |bonus| bound (P5)", () => {
  const t0 = local(2, 16, 0);
  const loves = Array.from({ length: 20 }, (_, index) => ev(t0 + index * 1000, "love", "X", { session_id: "s1", scope: "global" }));
  const skips = Array.from({ length: 20 }, (_, index) => ev(t0 + index * 1000, "skip_early", "Z", { session_id: "s1" }));
  const view = deriveEpochPolicy([...loves, ...skips], { now: t0 + 30_000, timezone: TZ });
  const x = view.adjust("X").value;
  const z = view.adjust("Z").value;
  assert.ok(x > 2);
  assert.ok(Math.abs(feedbackBonus(x)) <= 0.15);
  assert.ok(Math.abs(feedbackBonus(z)) <= 0.15);
  assert.ok(feedbackBonus(x) <= 0.15 + 1e-9);

  const single = deriveEpochPolicy([ev(t0, "love", "X", { session_id: "s1", scope: "global" })], { now: t0 + 30_000, timezone: TZ });
  assert.ok(feedbackBonus(x) - feedbackBonus(single.adjust("X").value) < 0.05); // saturation: 20 × louder than one, only a hair stronger
});

// --- determinism --------------------------------------------------------------------

test("determinism: identical inputs derive byte-identical views, insertion order included", () => {
  const t0 = local(2, 9, 0);
  const events: ListeningEvent[] = [
    ev(t0 + 0, "love", "A", { session_id: "s1", scope: "global" }),
    ev(t0 + 60_000, "full_play", "B", { session_id: "s1", playlist_id: "PL1" }),
    ev(t0 + 120_000, "skip_early", "C", { session_id: "s1" }),
    ev(t0 + 180_000, "skip_early", "C", { session_id: "s1" }),
    ev(t0 + 240_000, "repeat", "B", { session_id: "s1" }),
    ev(t0 + 300_000, "thumb_down", "D", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 360_000, "external_play", "E", { session_id: "s1" }),
  ];
  const now = t0 + 600_000;
  const a = deriveEpochPolicy(events, { now, timezone: TZ });
  const b = deriveEpochPolicy([...events].reverse(), { now, timezone: TZ });
  assert.equal(snapshot(a, ["A", "B", "C", "D", "E", "Q"]), snapshot(b, ["A", "B", "C", "D", "E", "Q"]));
});

// --- explicit-only parity with heuristic-v1 ------------------------------------------

test("explicit-only parity: love/thumb/remove streams derive the same value and parts as deriveFeedback", () => {
  const t0 = local(2, 9, 0);
  const events: ListeningEvent[] = [
    ev(t0 + 0, "love", "X", { session_id: "s1", scope: "global" }),
    ev(t0 + 60_000, "thumb_up", "X", { session_id: "s1", scope: "global" }),
    ev(t0 + 120_000, "thumb_up", "X", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 180_000, "thumb_down", "Y", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 240_000, "thumb_down", "Y", { session_id: "s1", scope: "playlist", scope_id: "PL2" }),
    ev(t0 + 300_000, "remove", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 360_000, "restore", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 420_000, "remove", "W", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
  ];
  const now = t0 + 600_000;
  const mine = deriveEpochPolicy(events, { now, timezone: TZ }); // no library ⇒ no derived terms
  const v1 = deriveFeedback(events, now, (id) => id);
  for (const id of ["X", "Y", "Z", "W", "Q"]) {
    assert.deepEqual(mine.adjust(id), v1.adjust(id));
    assert.deepEqual(mine.adjust(id, "PL1"), v1.adjust(id, "PL1"));
    assert.deepEqual(mine.adjust(id, "PL2"), v1.adjust(id, "PL2"));
  }
  for (const playlist of ["PL1", "PL2", "PL3"]) {
    assert.deepEqual([...mine.removed(playlist)].sort(), [...v1.removed(playlist)].sort());
  }
});

// --- scope_persistence ------------------------------------------------------------

test("scope_persistence: declared keeps playlist thumbs across epochs; global_only makes them die with the epoch (P25)", () => {
  const t0 = local(2, 12, 0);
  const events = [ev(t0, "thumb_up", "X", { session_id: "s1", scope: "playlist", scope_id: "PL1" })];

  const declaredNow = deriveEpochPolicy(events, { now: t0 + 5 * 60_000, timezone: TZ, scopePersistence: "declared" });
  const declaredLater = deriveEpochPolicy(events, { now: t0 + 40 * 60_000, timezone: TZ, scopePersistence: "declared" });
  assert.ok(declaredNow.adjust("X", "PL1").value > 0.99);
  assert.ok(declaredLater.adjust("X", "PL1").value > 0.99); // persists (30-day half-life)
  assert.deepEqual(declaredNow.adjust("X", "PL1").parts.map((part) => part.label), ["thumbs up here"]);

  const strictNow = deriveEpochPolicy(events, { now: t0 + 5 * 60_000, timezone: TZ, scopePersistence: "global_only" });
  const strictLater = deriveEpochPolicy(events, { now: t0 + 40 * 60_000, timezone: TZ, scopePersistence: "global_only" });
  assert.ok(strictNow.adjust("X", "PL1").value > 0.7 && strictNow.adjust("X", "PL1").value < 0.9);
  assert.deepEqual(strictNow.adjust("X", "PL1").parts.map((part) => part.label), ["thumbs up (this session)"]);
  assert.equal(strictLater.adjust("X", "PL1").value, 0); // epoch-scoped: gone with the session
  assert.equal(strictLater.epochHides().size, 0);
});

// --- learning_reset ----------------------------------------------------------------

test("learning_reset bounds the epoch evidence and clears epoch hides", () => {
  const t0 = local(2, 13, 0);
  const events = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 60_000, "skip_early", "Y", { session_id: "s1" }), // would hide…
    ev(t0 + 120_000, "love", "X", { session_id: "s1", scope: "global" }),
    ev(t0 + 180_000, "learning_reset", "", { session_id: "s1", scope: "none", detail: { scope: "epoch" } }),
    ev(t0 + 240_000, "skip_early", "Z", { session_id: "s1" }),
  ];
  const view = deriveEpochPolicy(events, { now: t0 + 300_000, timezone: TZ });
  assert.equal(view.epochHides().size, 0); // Y's pre-reset skips no longer hide
  assert.equal(view.adjust("Y").value, 0); // …and no longer score
  assert.ok(view.adjust("X").value > 1.9); // explicit love is persistent, before or after a reset
  assert.ok(view.adjust("Z").value < 0); // post-reset evidence still scores
  assert.ok(view.reliabilityNotes().some((note) => note.includes("reset")));

  // Two post-reset skips hide again.
  const again = [...events, ev(t0 + 300_000, "skip_early", "Z", { session_id: "s1" })];
  const view2 = deriveEpochPolicy(again, { now: t0 + 360_000, timezone: TZ });
  assert.deepEqual([...view2.epochHides()], ["Z"]);

  // A marker scoped to something other than the epoch is ignored.
  const globalMarker = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 60_000, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 120_000, "learning_reset", "", { session_id: "s1", scope: "none", detail: { scope: "global" } }),
  ];
  const view3 = deriveEpochPolicy(globalMarker, { now: t0 + 180_000, timezone: TZ });
  assert.deepEqual([...view3.epochHides()], ["Y"]);
});

// --- odd inputs ---------------------------------------------------------------------

test("odd inputs: empty stream, a single event, unknown signals, a torn timestamp — no throws, honest defaults", () => {
  const empty = deriveEpochPolicy([], { now: local(2, 9, 0), timezone: TZ });
  assert.equal(empty.epoch, null);
  assert.deepEqual(empty.adjust("X"), { value: 0, parts: [] });
  assert.equal(empty.epochHides().size, 0);
  assert.deepEqual(empty.proposals(), []);
  assert.deepEqual(empty.reliabilityNotes(), ["no active session — learning is paused"]);

  const t0 = local(2, 9, 0);
  const single = deriveEpochPolicy([ev(t0, "love", "X", { session_id: "s1", scope: "global" })], { now: t0 + 1_000, timezone: TZ });
  assert.ok(single.adjust("X").value > 1.99);
  assert.equal(single.epoch?.event_count, 1);

  const weird = deriveEpochPolicy(
    [ev(t0, "mystery" as Signal, "X", { session_id: "s1" }), ev(t0 + 1_000, "started", "X", { session_id: "s1" })],
    { now: t0 + 2_000, timezone: TZ },
  );
  assert.deepEqual(weird.adjust("X"), { value: 0, parts: [] });
  assert.equal(weird.epochHides().size, 0);

  const torn = deriveEpochPolicy(
    [{ ...ev(t0 + 1_000, "love", "B", { session_id: "s1", scope: "global" }), ts: Number.NaN }, ev(t0, "started", "A", { session_id: "s1" })],
    { now: t0 + 2_000, timezone: TZ },
  );
  assert.equal(torn.adjust("B").value, 0); // a torn timestamp is ignored, not guessed
  assert.notEqual(torn.epoch, null);
});

// --- reliability notes and the centroid term ------------------------------------------

test("reliability notes: down-weighted tempo is reported, never silently zero", () => {
  const t0 = local(2, 10, 0);
  const library: Library = {
    version: "test",
    tracks: [
      track("K1", { artist: "A1", bpm: 120, tc: 0.35 }),
      track("K2", { artist: "A2", bpm: 122, tc: 0.9 }),
      track("K3", { artist: "A3", bpm: 118, tc: 1 }),
      track("R1", { artist: "A4", bpm: 95, tc: 0.9 }),
      track("R2", { artist: "A5", bpm: 97, tc: 0.9 }),
      track("C", { artist: "A6", bpm: 121, tc: 0.9 }),
    ],
  };
  const events = [
    ev(t0, "love", "K1", { session_id: "s1", scope: "global" }),
    ev(t0 + 1_000, "love", "K2", { session_id: "s1", scope: "global" }),
    ev(t0 + 2_000, "love", "K3", { session_id: "s1", scope: "global" }),
  ];
  const view = deriveEpochPolicy(events, { now: t0 + 60_000, timezone: TZ, library });
  assert.ok(view.reliabilityNotes().some((note) => note === "tempo confidence 0.35 — down-weighted"));
});

test("centroids: the kept band pulls near candidates up; a far candidate stays put; parts stay ≤ 0.5 (P19/P20)", () => {
  const t0 = local(2, 11, 0);
  const library: Library = {
    version: "test",
    tracks: [
      track("K1", { artist: "A1", bpm: 120, tc: 0.9, lufs: -12, crest: 8, onset: 3.0, perc: 0.55 }),
      track("K2", { artist: "A2", bpm: 122, tc: 0.9, lufs: -11, crest: 9, onset: 3.2, perc: 0.6 }),
      track("K3", { artist: "A3", bpm: 118, tc: 1.0, lufs: -13, crest: 7, onset: 2.8, perc: 0.5 }),
      track("R1", { artist: "A4", bpm: 95, tc: 0.9, lufs: -20, crest: 14, onset: 1.5, perc: 0.3 }),
      track("R2", { artist: "A5", bpm: 97, tc: 0.9, lufs: -19, crest: 15, onset: 1.6, perc: 0.32 }),
      track("C", { artist: "A6", bpm: 121, tc: 0.9, lufs: -12, crest: 8, onset: 3.1, perc: 0.55 }),
      track("D", { artist: "A7", bpm: 60, tc: 0.9, lufs: -30, crest: 25, onset: 0.5, perc: 0.05 }),
    ],
  };
  const events = [
    ev(t0, "love", "K1", { session_id: "s1", scope: "global" }),
    ev(t0 + 1_000, "love", "K2", { session_id: "s1", scope: "global" }),
    ev(t0 + 2_000, "love", "K3", { session_id: "s1", scope: "global" }),
    ev(t0 + 3_000, "skip_early", "R1", { session_id: "s1" }),
    ev(t0 + 4_000, "skip_early", "R1", { session_id: "s1" }),
    ev(t0 + 5_000, "skip_early", "R2", { session_id: "s1" }),
    ev(t0 + 6_000, "skip_early", "R2", { session_id: "s1" }),
  ];
  const view = deriveEpochPolicy(events, { now: t0 + 60_000, timezone: TZ, library });
  const candidate = view.adjust("C");
  assert.ok(candidate.parts.some((part) => part.label.includes("tempo")));
  assert.ok(candidate.parts.every((part) => Math.abs(part.value) <= 0.5 + 1e-9));
  assert.ok(candidate.value > 0);
  assert.ok(view.adjust("D").value < candidate.value);
});

test("artist propagation: a single event moves nothing; corroborated artist events move neighbours (P17, capped)", () => {
  const t0 = local(2, 11, 0);
  const library: Library = {
    version: "test",
    tracks: [
      track("B1", { artist: "The Band", bpm: 100, tc: 0.9 }),
      track("B2", { artist: "The Band", bpm: 101, tc: 0.9 }),
      track("B3", { artist: "The Band", bpm: 102, tc: 0.9 }),
      track("Other", { artist: "Solo", bpm: 90, tc: 0.9 }),
    ],
  };
  const one = deriveEpochPolicy([ev(t0, "repeat", "B1", { session_id: "s1" })], { now: t0 + 60_000, timezone: TZ, library });
  assert.equal(one.adjust("B2").value, 0); // min-evidence gate closed

  const many = deriveEpochPolicy(
    [
      ev(t0, "repeat", "B1", { session_id: "s1" }),
      ev(t0 + 1_000, "repeat", "B1", { session_id: "s1" }),
      ev(t0 + 2_000, "repeat", "B2", { session_id: "s1" }),
      ev(t0 + 3_000, "repeat", "B2", { session_id: "s1" }),
    ],
    { now: t0 + 60_000, timezone: TZ, library },
  );
  const b3 = many.adjust("B3");
  assert.ok(b3.value > 0.3 && b3.value <= 0.8); // π-scaled and capped
  assert.ok(b3.parts.some((part) => part.label === "other tracks by The Band this session"));
});
