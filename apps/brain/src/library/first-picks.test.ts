/** "Listen to these first": which files the picks are, and how far they've got. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Library } from "../query/evaluate.ts";
import { firstProgress, neededStages, pathsForIds } from "./first-picks.ts";

const lib = (tracks: Array<{ id: string; path?: string; stages_done?: string[] }>): Library =>
  ({ version: "t", tracks: tracks.map((t) => ({ title: t.id, signals: {}, ...t })) }) as unknown as Library;

test("picked songs become file paths, in the order picked, once each", () => {
  const library = lib([{ id: "a", path: "A/1.flac" }, { id: "b", path: "B/2.flac" }, { id: "c" }]);
  assert.deepEqual(pathsForIds(library, ["b", "a", "b", "c", "zzz"]), ["B/2.flac", "A/1.flac"]);
});

test("a pick counts as listened to once tempo/energy (and singing, when the library has it) are done", () => {
  const without = lib([{ id: "a", path: "A/1.flac", stages_done: ["identity", "dsp_core"] }, { id: "b", path: "B/2.flac", stages_done: ["identity"] }]);
  assert.deepEqual(neededStages(without), ["dsp_core"], "no listening model on this Mac: voice is never asked for");
  assert.deepEqual(firstProgress(without, ["A/1.flac", "B/2.flac", "gone.flac"]), { count: 3, listened: 1, gone: 1, ready_ids: ["a"] });

  const withVoice = lib([
    { id: "a", path: "A/1.flac", stages_done: ["dsp_core"] },
    { id: "b", path: "B/2.flac", stages_done: ["dsp_core", "voice"] },
  ]);
  assert.deepEqual(firstProgress(withVoice, ["A/1.flac", "B/2.flac"]), { count: 2, listened: 1, gone: 0, ready_ids: ["b"] });
});
