import assert from "node:assert/strict";
import { test } from "node:test";
import { similarNext } from "./similar.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { validatePlan } from "../query/plan.ts";
import { draftPlan } from "../query/draft.ts";
const track = (id: string, embedding?: number[], extra: Partial<LibraryTrack> = {}): LibraryTrack => ({ id, title: id, path: `${id}.mp3`, embedding, ...extra });
const library: Library = { version: "test", tracks: [
  track("anchor", [1, 0], { audio_hash: "same", signals: { "instruments.piano": 0 } }),
  track("copy", [1, 0], { audio_hash: "same", signals: { "instruments.piano": 0 } }),
  track("queued", [1, 0], { signals: { "instruments.piano": 0 } }),
  track("piano", [1, .01], { signals: { "instruments.piano": .9 } }),
  track("closest", [1, .1], { signals: { "instruments.piano": 0 } }),
  track("other", [0, 1], { signals: { "instruments.piano": 0 } }),
] };
const options = { excluded: new Set(["anchor", "queued"]), playable: (t: LibraryTrack) => !!t.path };
test("more like this chooses measured sound similarity and never repeats queued songs or duplicate recordings", () => {
  assert.equal(similarNext(library, "anchor", options).id, "piano");
  assert.equal(similarNext(library, "anchor", { ...options, excluded: new Set([...options.excluded, "piano"]) }).id, "closest");
});
test("more like this preserves smart playlist hard exclusions even when the closest song violates them", () => {
  const checked = validatePlan(draftPlan("no piano", library).plan);
  assert.ok(checked.ok);
  const plan = checked.plan;
  assert.equal(similarNext(library, "anchor", { ...options, plan }).id, "closest");
  assert.throws(() => similarNext(library, "anchor", { ...options, plan, playable: t => t.id === "piano" }), /No unplayed similar song/);
});
test("missing, invalid, incompatible, or unrelated embeddings never produce an invented match", () => {
  assert.throws(() => similarNext({ version: "test", tracks: [track("anchor")] }, "anchor", options), /needs sound analysis/);
  for (const embedding of [[0, 0], [NaN, 1], [1], [-1, 0], [0, 1]]) {
    assert.throws(() => similarNext({ version: "test", tracks: [track("anchor", [1, 0]), track("other", embedding)] }, "anchor", options), /No unplayed similar song/);
  }
});
