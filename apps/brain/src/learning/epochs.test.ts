/**
 * Epoch resolution tests (A3 §3.1, mainline decision 2, P1/P2/P4).
 *
 * Fixtures are synthetic timestamps pinned to America/Chicago (CDT in October
 * 2026, UTC−5); they verify the boundary LOGIC, nothing about real listening.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeEpoch,
  activeEpochContext,
  daypartOf,
  epochIdFor,
  IDLE_GAP_MS,
  LIVE_WINDOW_MS,
  localDateOf,
  resolveEpochs,
} from "./epochs.ts";
import type { ListeningEvent, Signal } from "../session/events.ts";

const TZ = "America/Chicago";

/** An instant at local h:mm in America/Chicago (CDT) on 2026-10-<dayOfMonth>. */
const local = (dayOfMonth: number, hour: number, minute = 0, second = 0): number =>
  Date.UTC(2026, 9, dayOfMonth, hour + 5, minute, second);

let seq = 0;
function ev(ts: number, signal: Signal, track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent {
  seq += 1;
  return { id: `c${String(seq).padStart(4, "0")}`, ts, signal, track_id: track, scope: "session", source: "player", policy_version: "test", ...extra };
}

test("a single event forms one epoch with a stable id, daypart and date", () => {
  const events = [ev(local(2, 9), "started", "A", { session_id: "s1" })];
  const epochs = resolveEpochs(events, { timezone: TZ });
  assert.equal(epochs.length, 1);
  const epoch = epochs[0]!;
  assert.match(epoch.id, /^ep1:[0-9a-f]{15}$/);
  assert.equal(epoch.id, epochIdFor(epoch.t_start, epoch.t_end, epoch.first_event_id));
  assert.equal(epoch.event_count, 1);
  assert.deepEqual(epoch.session_ids, ["s1"]);
  assert.equal(epoch.daypart, "morning");
  assert.equal(epoch.date, "2026-10-02");
});

test("resume within 30 min keeps the epoch; 30:01 splits; exactly 30:00 keeps (P1)", () => {
  const t0 = local(2, 9);
  const keep = [ev(t0, "started", "A", { session_id: "s1" }), ev(t0 + IDLE_GAP_MS - 1000, "started", "B", { session_id: "s1" })];
  assert.equal(resolveEpochs(keep, { timezone: TZ }).length, 1);

  const exact = [ev(t0, "started", "A", { session_id: "s1" }), ev(t0 + IDLE_GAP_MS, "started", "B", { session_id: "s1" })];
  assert.equal(resolveEpochs(exact, { timezone: TZ }).length, 1);

  const split = [ev(t0, "started", "A", { session_id: "s1" }), ev(t0 + IDLE_GAP_MS + 1000, "started", "B", { session_id: "s1" })];
  assert.equal(resolveEpochs(split, { timezone: TZ }).length, 2);
});

test("midnight splits the epoch even inside the idle gap (P2)", () => {
  const events = [ev(local(2, 23, 59), "started", "A", { session_id: "s1" }), ev(local(3, 0, 1), "started", "B", { session_id: "s1" })];
  const epochs = resolveEpochs(events, { timezone: TZ });
  assert.equal(epochs.length, 2);
  assert.equal(epochs[0]!.date, "2026-10-02");
  assert.equal(epochs[1]!.date, "2026-10-03");
  assert.equal(epochs[1]!.daypart, "night");
});

test("a session-id change splits; a missing session_id is its own bucket, never merged", () => {
  const change = [ev(local(2, 9), "started", "A", { session_id: "s1" }), ev(local(2, 9, 5), "started", "B", { session_id: "s2" })];
  assert.equal(resolveEpochs(change, { timezone: TZ }).length, 2);

  // A session-less event (e.g. a Subsonic-captured play) never joins a session's epoch.
  const sandwich = [
    ev(local(2, 9), "started", "A", { session_id: "s1" }),
    ev(local(2, 9, 5), "external_play", "B"),
    ev(local(2, 9, 10), "started", "C", { session_id: "s1" }),
  ];
  const epochs = resolveEpochs(sandwich, { timezone: TZ });
  assert.equal(epochs.length, 3);
  assert.deepEqual(epochs.map((epoch) => epoch.session_ids), [["s1"], [], ["s1"]]);

  // Consecutive session-less events chain into one bucket of their own.
  const bucket = [ev(local(2, 9), "external_play", "A"), ev(local(2, 9, 4), "external_play", "B")];
  const bucketEpochs = resolveEpochs(bucket, { timezone: TZ });
  assert.equal(bucketEpochs.length, 1);
  assert.deepEqual(bucketEpochs[0]!.session_ids, []);
});

test("dayparts at the boundaries, America/Chicago (decision 2)", () => {
  assert.equal(daypartOf(local(2, 4, 59), TZ), "night");
  assert.equal(daypartOf(local(2, 5, 0), TZ), "morning");
  assert.equal(daypartOf(local(2, 11, 59), TZ), "morning");
  assert.equal(daypartOf(local(2, 12, 0), TZ), "afternoon");
  assert.equal(daypartOf(local(2, 16, 59), TZ), "afternoon");
  assert.equal(daypartOf(local(2, 17, 0), TZ), "evening");
  assert.equal(daypartOf(local(2, 21, 59), TZ), "evening");
  assert.equal(daypartOf(local(2, 22, 0), TZ), "night");
  assert.equal(localDateOf(local(2, 22), TZ), "2026-10-02");
  assert.equal(localDateOf(local(3, 0, 30), TZ), "2026-10-03");
});

test("the epoch's daypart and date come from its START, not its end", () => {
  const events = [ev(local(2, 4, 50), "started", "A", { session_id: "s1" }), ev(local(2, 5, 10), "started", "B", { session_id: "s1" })];
  const epochs = resolveEpochs(events, { timezone: TZ });
  assert.equal(epochs.length, 1);
  assert.equal(epochs[0]!.daypart, "night");
});

test("insertion order does not matter; ties break on id (determinism)", () => {
  const t = local(2, 9);
  const events: ListeningEvent[] = [
    ev(t, "started", "A", { session_id: "s1", id: "b000" }),
    ev(t, "started", "B", { session_id: "s1", id: "a000" }),
  ];
  assert.deepEqual(resolveEpochs(events, { timezone: TZ }), resolveEpochs([...events].reverse(), { timezone: TZ }));
  assert.equal(resolveEpochs(events, { timezone: TZ })[0]!.first_event_id, "a000");
});

test("activeEpoch: the last epoch within the live window (inclusive), else null (P4)", () => {
  const t0 = local(2, 9);
  const epochs = resolveEpochs([ev(t0, "started", "A", { session_id: "s1" })], { timezone: TZ });
  assert.equal(activeEpoch(epochs, t0 + LIVE_WINDOW_MS)?.id, epochs[0]!.id);
  assert.equal(activeEpoch(epochs, t0 + LIVE_WINDOW_MS + 1), null);
  assert.equal(activeEpoch([], t0), null);

  const context = activeEpochContext(epochs, t0 + 60_000);
  assert.equal(context.epoch?.id, epochs[0]!.id);
  assert.equal(context.minutes_since_activity, 1);
  assert.equal(context.daypart, "morning");
  assert.equal(activeEpochContext(epochs, t0 + LIVE_WINDOW_MS + 1).note, "no active session — learning is paused");
});

test("an epoch that starts after `now` is never active (future events stay out)", () => {
  const t0 = local(2, 9);
  const events = [
    ev(t0, "started", "A", { session_id: "s1" }),
    ev(t0 + 2 * 3_600_000, "started", "B", { session_id: "s2" }),
  ];
  const epochs = resolveEpochs(events, { timezone: TZ });
  assert.equal(epochs.length, 2);
  assert.equal(activeEpoch(epochs, t0 + 60_000)?.id, epochs[0]!.id);
});
