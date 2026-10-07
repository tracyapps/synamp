/**
 * The hide union at the evaluate seam (B5 / decision 4):
 *
 *   hidden = feedback.removed(playlistId ?? "") ∪ adaptive?.epochHides?.()
 *
 * Covered here:
 *   1. Epoch hides (skip_early ×2, not_now) apply to every resolve while their session
 *      is live — also WITHOUT a playlistId (that is what the union exists for).
 *   2. Persistent removes stay playlist-scoped: they need the matching playlistId; bare
 *      `removed("")` is empty by construction.
 *   3. Legacy behaviour is unchanged: with the heuristic-v1 view and no adaptive hook the
 *      result is exactly the old `feedback.removed(playlistId)` semantics.
 *   4. Hard-rule inviolability stays: a strong boost cannot carry a track past an
 *      explicit exclusion (mirrors session.test.ts "feedback re-ranks but cannot break
 *      a hard rule"), and hidden tracks leave both strict and the counts.
 *   5. The display split (C2 F4): `hidden` / counts.hidden_by_you list persistent removes
 *      only (Restore works on those); epoch hides are still excluded from strict but are
 *      counted as counts.hidden_by_session instead of masquerading as "Removed by you".
 *
 * Fixtures are synthetic; this is not evidence about real music.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePlan } from "./evaluate.ts";
import type { Library, LibraryTrack } from "./evaluate.ts";
import { validatePlan } from "./plan.ts";
import type { ValidatedPlan } from "./plan.ts";
import { deriveEpochPolicy } from "../learning/derive.ts";
import { deriveFeedback } from "../session/feedback.ts";
import type { ListeningEvent } from "../session/events.ts";

const NOW = Date.parse("2026-10-06T22:00:00-05:00");
const MIN = 60_000;

function lib(): Library {
  const t = (id: string, piano: number): LibraryTrack => ({ id, title: id.toUpperCase(), artist: `Artist ${id}`,
    signals: { "instruments.piano": piano, bpm: 110, pulse_clarity: 0.6 } });
  return { version: "hide-union", tracks: [t("a", 0.05), t("b", 0.05), t("c", 0.05), t("pianist", 0.9), t("skipme", 0.05)] };
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

let seq = 0;
const ev = (signal: ListeningEvent["signal"], track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent => ({
  id: `h${String(++seq).padStart(4, "0")}`, ts: NOW - 10 * MIN, signal, track_id: track,
  scope: "session", session_id: "s1", source: "player", policy_version: "test", ...extra,
});

/** A live epoch with two skip_early for "skipme" (→ hide), a not_now for "b" (→ hide). */
function liveEpochEvents(): ListeningEvent[] {
  return [
    ev("skip_early", "skipme", { ts: NOW - 10 * MIN }),
    ev("skip_early", "skipme", { ts: NOW - 9 * MIN }),
    ev("thumb_down", "b", { ts: NOW - 8 * MIN, reason: "not_now" }),
  ];
}

test("epoch hides apply without a playlistId; persistent removes still require one", () => {
  const events = [
    ...liveEpochEvents(),
    ev("remove", "a", { scope: "playlist", scope_id: "focus", ts: NOW - 7 * MIN }),
  ];
  const view = deriveEpochPolicy(events, { now: NOW, library: lib() });
  assert.deepEqual([...view.epochHides()].sort(), ["b", "skipme"], "fixture premise: the epoch hides b and skipme");
  assert.deepEqual([...view.removed("focus")], ["a"]);

  // 1. No playlistId at all: epoch hides still apply (the union's whole point).
  const bare = evaluatePlan(plan(), lib(), { feedback: view, adaptive: view });
  assert.equal(bare.hidden.length, 0, "no persistent removes in a bare resolve — nothing to restore");
  assert.equal(bare.counts.hidden_by_you, 0);
  assert.equal(bare.counts.hidden_by_session, 2, "both epoch hides are reported as session hides");
  assert.ok(!order(bare).includes("skipme") && !order(bare).includes("b"), "hidden tracks leave strict");
  assert.ok(order(bare).includes("a"), "the remove needs its playlist; it does not leak into a bare resolve");

  // 2. With the playlist: persistent removes join the union (and are the only `hidden` entries).
  const focus = evaluatePlan(plan(), lib(), { feedback: view, adaptive: view, playlistId: "focus" });
  assert.deepEqual(focus.hidden.map((track) => track.id), ["a"]);
  assert.equal(focus.counts.hidden_by_you, 1);
  assert.equal(focus.counts.hidden_by_session, 2);
  assert.ok(!order(focus).includes("a"));

  // 3. Another playlist: the remove stays behind; the epoch hides follow the session.
  const other = evaluatePlan(plan(), lib(), { feedback: view, adaptive: view, playlistId: "workout" });
  assert.equal(other.hidden.length, 0);
  assert.equal(other.counts.hidden_by_session, 2);
  assert.ok(order(other).includes("a"));

  // 4. The same view passed as feedback only (no adaptive hook) keeps old hide behaviour —
  //    the union is applied by the caller, exactly once.
  const feedbackOnly = evaluatePlan(plan(), lib(), { feedback: view, playlistId: "focus" });
  assert.deepEqual(feedbackOnly.hidden.map((track) => track.id), ["a"]);
  assert.equal(feedbackOnly.counts.hidden_by_session, 0, "no epoch hides without the adaptive hook");
  assert.ok(order(feedbackOnly).includes("skipme"), "without the adaptive hook the epoch stays unhidden");
});

test("hidden split (C2 F4): persistent removes are 'Removed by you'; epoch hides are session counts only", () => {
  const events = [
    ...liveEpochEvents(), // hides "b" (not_now) and "skipme" (skip ×2) for this session
    ev("remove", "a", { scope: "playlist", scope_id: "focus", ts: NOW - 7 * MIN }),
    ev("remove", "skipme", { scope: "playlist", scope_id: "focus", ts: NOW - 6 * MIN }), // persistent AND epoch-hidden
  ];
  const view = deriveEpochPolicy(events, { now: NOW, library: lib() });
  assert.deepEqual([...view.removed("focus")].sort(), ["a", "skipme"], "fixture premise: both removes are persistent");
  assert.deepEqual([...view.epochHides()].sort(), ["b", "skipme"]);

  const focus = evaluatePlan(plan(), lib(), { feedback: view, adaptive: view, playlistId: "focus" });
  // skipme is both: reported once, under the lasting cause (a restore CAN undo the remove).
  assert.deepEqual(focus.hidden.map((track) => track.id).sort(), ["a", "skipme"]);
  assert.equal(focus.counts.hidden_by_you, 2);
  assert.equal(focus.counts.hidden_by_session, 1, "only b is a session-only hide (skipme is reported under Removed by you)");
  assert.ok(!order(focus).includes("a") && !order(focus).includes("b") && !order(focus).includes("skipme"));

  // Bare resolve: no playlist, so no persistent removes — both epoch hides are session counts.
  const bare = evaluatePlan(plan(), lib(), { feedback: view, adaptive: view });
  assert.equal(bare.hidden.length, 0);
  assert.equal(bare.counts.hidden_by_you, 0);
  assert.equal(bare.counts.hidden_by_session, 2);

  // Restoring the persistent remove while the session lives: the remove is undone, but the
  // epoch hide survives — so the split is what keeps both counts honest.
  const restored = deriveEpochPolicy([...events, ev("restore", "skipme", { scope: "playlist", scope_id: "focus", ts: NOW - 5 * MIN })], { now: NOW, library: lib() });
  const afterRestore = evaluatePlan(plan(), lib(), { feedback: restored, adaptive: restored, playlistId: "focus" });
  assert.deepEqual(afterRestore.hidden.map((track) => track.id), ["a"]);
  assert.equal(afterRestore.counts.hidden_by_you, 1);
  assert.equal(afterRestore.counts.hidden_by_session, 2, "skipme is a session hide again once its remove is restored");
  assert.ok(!order(afterRestore).includes("skipme"), "the epoch hide survives the restore — hence the split");
});

test("legacy view unchanged: silent on skips, hides only the removed playlist", () => {
  const events = [
    ...liveEpochEvents(),
    ev("remove", "a", { scope: "playlist", scope_id: "focus", ts: NOW - 7 * MIN }),
  ];
  const v1 = deriveFeedback(events, NOW);
  assert.equal(v1.adjust("skipme", "focus").value, 0, "v1 skips without a playlist context never score");

  // Old branch: no playlistId → no hides, even though the log carries skips and a remove.
  const bare = evaluatePlan(plan(), lib(), { feedback: v1 });
  assert.equal(bare.hidden.length, 0);
  assert.equal(bare.counts.hidden_by_you, 0);
  assert.equal(bare.counts.hidden_by_session, 0);
  assert.ok(order(bare).includes("a") && order(bare).includes("skipme"));

  // With the playlist: exactly the persistent remove, nothing from the epoch.
  const focus = evaluatePlan(plan(), lib(), { feedback: v1, playlistId: "focus" });
  assert.deepEqual(focus.hidden.map((track) => track.id), ["a"]);
  assert.ok(order(focus).includes("skipme") && order(focus).includes("b"));
});

test("the epoch boost cannot break a hard rule (mirrors the v1 guarantee)", () => {
  const events = [
    ev("love", "pianist", { scope: "global", ts: NOW - 10 * MIN }),
    ev("love", "c", { scope: "global", ts: NOW - 9 * MIN }),
  ];
  const view = deriveEpochPolicy(events, { now: NOW, library: lib() });
  assert.ok(view.adjust("pianist").value > 0, "fixture premise: the epoch boosts the piano track");

  const result = evaluatePlan(plan(), lib(), { feedback: view, adaptive: view, playlistId: "focus" });
  assert.ok(!order(result).includes("pianist"), "a boosted piano track still cannot pass “no piano”");
  assert.equal(order(result)[0], "c", "the boosted admissible track moves up");
  const top = result.strict[0]!;
  assert.ok(top.score_breakdown && top.score_breakdown.feedback > 0 && top.score_breakdown.feedback <= 0.15,
    "one saturated, bounded bonus — same 0.15·tanh as v1");
  assert.ok(top.reasons.some((reason) => reason.startsWith("your listening: you loved this")));
});
