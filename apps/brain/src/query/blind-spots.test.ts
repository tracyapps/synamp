import { strict as assert } from "node:assert";
import { test } from "node:test";
import { blindSpots } from "./evaluate.ts";

test("rules on signals nothing measures yet are named in plain words, grouped by stage", () => {
  const spots = blindSpots([
    { source_phrase: "happy", hard: true, where: { any: [{ field: "valence", op: "gte", value: 0.6 }, { field: "mood", op: "in", value: ["happy"] }] } },
    { source_phrase: "focus", hard: false, where: { field: "arousal", op: "between", value: [0.3, 0.65] } },
    { source_phrase: "in a minor key", hard: false, where: { field: "mode", op: "in", value: ["minor"] } },
    { source_phrase: "focus", hard: false, where: { field: "vocal_fraction", op: "lte", value: 0.1 } },
    { source_phrase: "focus", hard: false, where: { field: "bpm", op: "between", value: [85, 125] } },
  ]);
  assert.deepEqual(spots, [
    { stage: "semantic", about: "a song’s mood and energy", phrases: ["happy", "focus"], hard: true },
    { stage: "tonal", about: "key, chords and harmony", phrases: ["in a minor key"], hard: false },
  ], "singing is measured now (voice stage), so it isn't a blind spot");
});

test("rules on measured signals have no blind spots", () => {
  assert.deepEqual(blindSpots([{ source_phrase: "fast", hard: true, where: { field: "bpm", op: "gte", value: 140 } }]), []);
});
