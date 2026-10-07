/**
 * Reliability weighting tests (A3 §3.3c, dispatch §3): bpm rides on
 * tempo_confidence; everything else is a placeholder 1.0 until producers
 * expose uncertainty; declared/missing fields are unusable and never zero-filled.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { axisReliability, AXIS_META, CENTROID_AXES } from "./reliability.ts";
import type { LibraryTrack } from "../query/evaluate.ts";

const track = (signals: Record<string, number | null | undefined>): LibraryTrack => ({ id: "t1", title: "T", signals });

test("the centroid axis list is the frozen A3 subset", () => {
  assert.deepEqual([...CENTROID_AXES], ["bpm", "lufs_integrated", "crest_factor", "onset_rate", "percussiveness"]);
  assert.deepEqual(AXIS_META.map((meta) => meta.field), [...CENTROID_AXES]);
});

test("bpm uses tempo_confidence: full weight at ≥ 0.5, damped below, unusable at ≤ 0.2 or missing", () => {
  const clear = axisReliability(track({ bpm: 120, tempo_confidence: 0.8 }), "bpm");
  assert.deepEqual(clear, { usable: true, weight: 1, value: 120 });

  const checked = axisReliability(track({ bpm: 120, tempo_confidence: 1 }), "bpm"); // human spot-check correction
  assert.deepEqual(checked, { usable: true, weight: 1, value: 120 });

  const damped = axisReliability(track({ bpm: 126, tempo_confidence: 0.4 }), "bpm");
  assert.equal(damped.usable, true);
  assert.equal(damped.weight, 0.4);
  assert.equal(damped.value, 126);
  assert.equal(damped.note, "tempo confidence 0.4 — down-weighted");

  const tooLow = axisReliability(track({ bpm: 90, tempo_confidence: 0.2 }), "bpm");
  assert.equal(tooLow.usable, false);
  assert.equal(tooLow.weight, 0);
  assert.ok(tooLow.note?.includes("0.2"));

  const missingConfidence = axisReliability(track({ bpm: 90 }), "bpm");
  assert.equal(missingConfidence.usable, false);
  assert.equal(missingConfidence.note, "tempo confidence missing — tempo not used for learning");
});

test("other produced axes are usable at weight 1.0; missing values are unusable, never zero", () => {
  const loudness = axisReliability(track({ lufs_integrated: -14 }), "lufs_integrated");
  assert.deepEqual(loudness, { usable: true, weight: 1, value: -14 });

  const absent = axisReliability(track({}), "lufs_integrated");
  assert.equal(absent.usable, false);
  assert.equal(absent.value, undefined);
});

test("declared fields have no producer and are refused honestly", () => {
  const arousal = axisReliability(track({ arousal: 0.9 }), "arousal");
  assert.equal(arousal.usable, false);
  assert.ok(arousal.note?.includes("no producer"));
  const unknown = axisReliability(track({}), "something_made_up");
  assert.equal(unknown.usable, false);
});
