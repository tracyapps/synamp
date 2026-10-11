import assert from "node:assert/strict";
import { test } from "node:test";
import { continuationTracks } from "./continuation.ts";
import type { Library } from "../query/evaluate.ts";
import type { ListeningEvent } from "./events.ts";
import { validatePlan } from "../query/plan.ts";
import { draftPlan } from "../query/draft.ts";
const library: Library = { version: "test", tracks: [
  { id: "seed", title: "Seed", embedding: [1, 0] },
  { id: "a", title: "A", embedding: [1, .1] },
  { id: "b", title: "B", embedding: [.1, 1] },
  { id: "loved", title: "Loved", embedding: [0, 1] },
  { id: "piano", title: "Piano", embedding: [0, 1], signals: { "instruments.piano": .9 } },
].map(t => ({ ...t, signals: { "instruments.piano": 0, ...t.signals }, path: `${t.id}.wav` })) };
const event = (signal: ListeningEvent["signal"], track_id: string): ListeningEvent => ({ id: signal + track_id, ts: 1, signal, track_id, scope: "playlist", scope_id: "focus", playlist_id: "focus", session_id: "session", source: "player", policy_version: "test" });
const options = { seeds: ["seed"], excluded: new Set(["seed", "loved", "piano"]), recent: [], events: [] as ListeningEvent[], playable: () => true, count: 1 };
test("continuation uses saved seeds, then follows a love immediately for newly selected music", () => {
  assert.equal(continuationTracks(library, options).tracks[0]?.id, "a");
  assert.equal(continuationTracks(library, { ...options, events: [event("love", "loved")] }).tracks[0]?.id, "b");
});
test("continuation searches beyond the original target size and keeps hard rules without relaxing", () => {
  const checked = validatePlan(draftPlan("no piano", library).plan);
  assert.ok(checked.ok);
  const plan = checked.plan;
  plan.target_size = 1;
  const result = continuationTracks(library, { ...options, plan, excluded: new Set(["seed", "a", "loved"]), events: [event("love", "loved")] });
  assert.deepEqual(result.tracks.map(t => t.id), ["b"]);
});
test("recent music is avoided until the eligible pool cycles; rejected songs never fill a shortage", () => {
  const recent = ["b", "a"];
  const result = continuationTracks(library, { ...options, recent });
  assert.equal(result.tracks[0]?.id, "b", "least recently played returns first");
  assert.equal(result.recycled, true);
  assert.deepEqual(continuationTracks(library, { ...options, events: [event("thumb_down", "a"), event("remove", "b")] }).tracks, []);
});
test("errors exclude broken files without teaching a dislike; missing analysis permits rules-based continuation", () => {
  assert.equal(continuationTracks(library, { ...options, events: [event("playback_error", "a")] }).tracks[0]?.id, "b");
  assert.equal(continuationTracks({ ...library, tracks: library.tracks.map(t => ({ ...t, embedding: undefined })) }, options).tracks.length, 1);
  assert.deepEqual(continuationTracks(library, { ...options, playable: () => false }).tracks, []);
});

test("unavailable high ranked files and duplicate recordings do not consume the continuation slots", () => {
  const extended: Library = { ...library, tracks: [...library.tracks, { id: "copy", title: "Copy", path: "copy.wav", embedding: [1, .1], audio_hash: "recording" }].map(t => t.id === "a" ? { ...t, audio_hash: "recording" } : t) };
  const result = continuationTracks(extended, { ...options, count: 2, playable: t => t.id !== "copy" });
  assert.deepEqual(new Set(result.tracks.map(t => t.id)), new Set(["a", "b"]));
  const recent = continuationTracks(extended, { ...options, recent: ["a"] });
  assert.equal(recent.tracks[0]?.id, "b", "a duplicate file is not fresh music");
  const blocked = continuationTracks(extended, { ...options, events: [event("remove", "a")] });
  assert.equal(blocked.tracks[0]?.id, "b");
});

test("restoring a removal makes it eligible, and forgetting the epoch clears skip-derived similarity", () => {
  const removed = event("remove", "a");
  assert.equal(continuationTracks(library, { ...options, events: [removed] }).tracks[0]?.id, "b");
  assert.equal(continuationTracks(library, { ...options, events: [removed, event("restore", "a")] }).tracks[0]?.id, "a");
  const reset = continuationTracks(library, { ...options, events: [event("skip_early", "a"), event("learning_reset", "")] });
  assert.equal(reset.tracks[0]?.id, "a");
});
