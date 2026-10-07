/**
 * Proposal generation tests (A3 §3.4, P21–P23).
 *
 * Boundary behaviour is the point: recurrence across epochs AND calendar dates
 * ("mood ≠ habit"), a bounded 30-day scan window, and stable ids so a UI can
 * remember dismissed proposals.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveEpochPolicy } from "./derive.ts";
import type { ListeningEvent, Signal } from "../session/events.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

const TZ = "America/Chicago";

/** An instant at local h:mm in America/Chicago (CDT) on 2026-10-<dayOfMonth>. */
const local = (dayOfMonth: number, hour: number, minute = 0): number => Date.UTC(2026, 9, dayOfMonth, hour + 5, minute);

let seq = 0;
function ev(ts: number, signal: Signal, track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent {
  seq += 1;
  return { id: `p${String(seq).padStart(4, "0")}`, ts, signal, track_id: track, scope: "session", source: "player", policy_version: "test", ...extra };
}

function skipEpoch(day: number, hour: number, track: string, count = 2, playlist = "PL1", session = "s1"): ListeningEvent[] {
  const t0 = local(day, hour);
  return Array.from({ length: count }, (_, index) => ev(t0 + index * 60_000, "skip_early", track, { session_id: session, playlist_id: playlist }));
}

const track = (id: string, artist: string): LibraryTrack => ({ id, title: `Track ${id}`, artist, signals: {} });

test("accepting a negative proposal lowers preference without creating an exclusion", () => {
  const history = [...skipEpoch(1, 9, "T"), ...skipEpoch(1, 14, "T"), ...skipEpoch(2, 9, "T")];
  const now = local(3, 12);
  const proposal = deriveEpochPolicy(history, { now, timezone: TZ }).proposals()[0]!;
  assert.match(proposal.suggested_action, /weigh it lower/);
  assert.match(proposal.suggested_action, /does not exclude/);
  const accepted = ev(now, "thumb_down", "T", { scope: "global", source: "server", detail: { proposal_id: proposal.id } });
  const view = deriveEpochPolicy([...history, accepted], { now, timezone: TZ });
  assert.ok(view.adjust("T").value < 0);
  assert.equal(view.epochHides().has("T"), false);
  assert.equal(view.removed("PL1").has("T"), false);
});

test("boundary: 2 epochs → no proposal; 3 epochs across 2 dates → exactly one (P21)", () => {
  const two = [...skipEpoch(1, 9, "T"), ...skipEpoch(1, 14, "T")];
  assert.equal(deriveEpochPolicy(two, { now: local(2, 12, 0), timezone: TZ }).proposals().length, 0);

  const three = [...skipEpoch(1, 9, "T"), ...skipEpoch(1, 14, "T"), ...skipEpoch(2, 9, "T")];
  const proposals = deriveEpochPolicy(three, { now: local(2, 12, 0), timezone: TZ }).proposals();
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]!.kind, "track_repeat_skip");
  assert.equal(proposals[0]!.subject, "T");
  assert.equal(proposals[0]!.subject_type, "track");
  assert.deepEqual(proposals[0]!.evidence, { epochs: 3, dates: 2, dayparts: ["morning", "afternoon"] });
  assert.ok(proposals[0]!.thesis.includes("track T")); // label resolves best-effort without a library (no title known)
});

test("scan window: evidence older than 30 days proposes nothing (P23)", () => {
  const old = [...skipEpoch(1, 9, "T"), ...skipEpoch(1, 14, "T"), ...skipEpoch(2, 9, "T")];
  const now = local(2, 12, 0) + 31 * 86_400_000;
  assert.equal(deriveEpochPolicy(old, { now, timezone: TZ }).proposals().length, 0);
});

test("not_now pattern needs 3 epochs, 2 dates AND 2 dayparts (P21)", () => {
  const mk = (day: number, hour: number): ListeningEvent[] => [
    ev(local(day, hour), "thumb_down", "N", { session_id: "s1", scope: "global", reason: "not_now" }),
  ];
  const twoDayparts = [...mk(1, 9), ...mk(1, 14), ...mk(2, 9)];
  const proposals = deriveEpochPolicy(twoDayparts, { now: local(2, 12, 0), timezone: TZ }).proposals();
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]!.kind, "not_now_pattern");
  assert.deepEqual(proposals[0]!.evidence.dayparts, ["morning", "afternoon"]);

  const oneDaypart = [...mk(1, 9), ...mk(2, 9), ...mk(3, 9)]; // 3 epochs, 3 dates, but all morning
  assert.equal(deriveEpochPolicy(oneDaypart, { now: local(3, 12, 0), timezone: TZ }).proposals().length, 0);
});

test("positive thresholds: repeats need 4 epochs AND 3 dates; other apps need 5 and 3 (P22)", () => {
  const repeats = (day: number, hour: number): ListeningEvent[] => [ev(local(day, hour), "repeat", "R", { session_id: "s1" })];
  const three = [...repeats(1, 9), ...repeats(2, 9), ...repeats(2, 14)];
  assert.equal(deriveEpochPolicy(three, { now: local(2, 20, 0), timezone: TZ }).proposals().length, 0); // 3 epochs < 4

  const four = [...three, ...repeats(3, 9)];
  const repeated = deriveEpochPolicy(four, { now: local(3, 20, 0), timezone: TZ }).proposals();
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0]!.kind, "repeat_positive");

  const external = (day: number, hour: number): ListeningEvent[] => [ev(local(day, hour), "external_play", "E1", {})];
  const fourEpochs = [...external(1, 9), ...external(1, 14), ...external(2, 9), ...external(2, 14)];
  assert.equal(deriveEpochPolicy(fourEpochs, { now: local(2, 20, 0), timezone: TZ }).proposals().length, 0); // 4 epochs < 5

  const fiveEpochs = [...fourEpochs, ...external(3, 9)];
  const positive = deriveEpochPolicy(fiveEpochs, { now: local(3, 20, 0), timezone: TZ }).proposals();
  assert.equal(positive.length, 1);
  assert.equal(positive[0]!.kind, "external_play_positive");
});

test("artist pattern: ≥ 2 different hidden tracks by one artist across 3 epochs / 2 dates propose", () => {
  const library: Library = { version: "test", tracks: [track("T1", "Band"), track("T2", "Band")] };
  const mk = (day: number, hour: number): ListeningEvent[] => [...skipEpoch(day, hour, "T1"), ...skipEpoch(day, hour, "T2")];
  const events = [...mk(1, 9), ...mk(1, 14), ...mk(2, 9)];
  const proposals = deriveEpochPolicy(events, { now: local(2, 12, 0), timezone: TZ, library }).proposals();
  const artist = proposals.filter((proposal) => proposal.kind === "artist_repeat_skip");
  assert.equal(artist.length, 1);
  assert.equal(artist[0]!.subject, "Band");
  assert.equal(artist[0]!.subject_type, "artist");
});

test("proposal ids are stable across derivations and scan order, and proposals stay sorted", () => {
  const three = [...skipEpoch(1, 9, "T"), ...skipEpoch(1, 14, "T"), ...skipEpoch(2, 9, "T")];
  const now = local(2, 12, 0);
  const a = deriveEpochPolicy(three, { now, timezone: TZ }).proposals();
  const b = deriveEpochPolicy([...three].reverse(), { now, timezone: TZ }).proposals();
  assert.equal(a.length, 1);
  assert.equal(a[0]!.id, b[0]!.id);
  assert.match(a[0]!.id, /^pr1:[0-9a-f]{12}$/);
});
