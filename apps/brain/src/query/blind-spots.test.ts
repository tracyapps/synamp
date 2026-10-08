import { strict as assert } from "node:assert";
import { test } from "node:test";
import { blindSpots } from "./evaluate.ts";

test("rules on signals nothing measures yet are named in plain words, grouped by stage", () => {
  const spots = blindSpots([
    { source_phrase: "no words", hard: true, where: { any: [{ field: "vocal_fraction", op: "lte", value: 0.1 }, { field: "instrumental", op: "gte", value: 0.8 }] } },
    { source_phrase: "focus", hard: false, where: { field: "vocal_fraction", op: "lte", value: 0.1 } },
    { source_phrase: "focus", hard: false, where: { field: "arousal", op: "between", value: [0.3, 0.65] } },
    { source_phrase: "focus", hard: false, where: { field: "bpm", op: "between", value: [85, 125] } },
  ]);
  assert.deepEqual(spots, [
    { stage: "voice", about: "whether a song has singing or words", phrases: ["no words", "focus"], hard: true },
    { stage: "semantic", about: "a song’s mood and energy", phrases: ["focus"], hard: false },
  ]);
});

test("rules on measured signals have no blind spots", () => {
  assert.deepEqual(blindSpots([{ source_phrase: "fast", hard: true, where: { field: "bpm", op: "gte", value: 140 } }]), []);
});
