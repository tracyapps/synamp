/** "Check the measurements": tempo answers, accuracy, and corrections. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library } from "../query/evaluate.ts";
import { SpotChecks, verdictFromTap } from "./spotcheck.ts";

const lib = (bpms: Array<[string, number | null, number?]>, version = "v1"): Library => ({
  version,
  tracks: bpms.map(([id, bpm, confidence]) => ({
    id, title: `Song ${id}`, path: `A/${id}.flac`,
    signals: { ...(bpm !== null ? { bpm } : {}), ...(confidence !== undefined ? { tempo_confidence: confidence } : {}) },
  })),
});

test("tapping along: close enough counts, octave errors are recognised", () => {
  assert.equal(verdictFromTap(120, 123), "right");
  assert.equal(verdictFromTap(120, 61), "half", "the real tempo is half the measured one");
  assert.equal(verdictFromTap(70, 141), "double");
  assert.equal(verdictFromTap(180, 60), "other_level", "6/8: the big beats against all six eighths");
  assert.equal(verdictFromTap(120, 80), "other_level", "a three-against-two count");
  assert.equal(verdictFromTap(120, 97), "wrong");
});

test("answers count towards accuracy, correct the track, and give way to a new measurement", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-spotcheck-"));
  try {
    const checks = new SpotChecks(join(dir, "spotchecks.json"));
    const library = lib([["a", 120, 0.9], ["b", 180, 0.2], ["c", 64, 0.3], ["d", null], ["e", 100, 0.8]]);
    const track = (id: string) => library.tracks.find((t) => t.id === id)!;

    assert.equal(checks.next(library, () => 0)!.id, "a");
    assert.ok(!["d"].includes(checks.next(library, () => 0.99)!.id), "unanalysed tracks aren't offered");

    checks.record(track("a"), { verdict: "right" }, 1);
    checks.record(track("b"), { verdict: "half" }, 2);
    checks.record(track("c"), { tapped_bpm: 129 }, 3); // tapped: the real tempo is double
    checks.record(track("e"), { verdict: "no_beat" }, 4);
    assert.throws(() => checks.record(track("d"), { verdict: "right" }), /no measured tempo/);
    assert.throws(() => checks.record(track("a"), { verdict: "maybe" }), /verdict must be/);
    assert.throws(() => checks.record(track("a"), { tapped_bpm: 900 }), /between 20 and 300/);
    assert.equal(checks.next(library), null, "everything with a tempo has an answer");

    const corrected = checks.apply(library);
    const bpm = (id: string) => corrected.tracks.find((t) => t.id === id)!.signals!.bpm;
    assert.deepEqual([bpm("a"), bpm("b"), bpm("c"), bpm("e")], [120, 90, 128, 100]);
    assert.equal(corrected.tracks.find((t) => t.id === "e")!.signals!.tempo_confidence, 0, "no steady beat: don't trust the number");
    assert.equal(corrected.tracks.find((t) => t.id === "b")!.signals!.tempo_confidence, 1);
    assert.equal(checks.apply(library), corrected, "cached until something changes");

    const summary = checks.summary(library);
    assert.deepEqual([summary.checked, summary.right, summary.half, summary.double, summary.no_beat], [3, 1, 1, 1, 1]);
    assert.equal(summary.pulse_found, 1, "every one found the pulse, at some count");
    assert.equal(summary.confident.accuracy, 1, "the confident one was right");
    assert.equal(summary.unsure.accuracy, 0, "the unsure ones were octave errors");
    assert.equal(summary.corrections, 2);

    // Re-analysed with a better tempo: the correction no longer applies and the track can be checked again.
    const remeasured = lib([["a", 120, 0.9], ["b", 91, 0.7], ["c", 64, 0.3], ["d", null], ["e", 100, 0.8]], "v2");
    assert.equal(checks.apply(remeasured).tracks.find((t) => t.id === "b")!.signals!.bpm, 91);
    assert.equal(checks.next(remeasured)!.id, "b");

    const saved = new SpotChecks(join(dir, "spotchecks.json"));
    assert.equal(saved.corrected(track("c")), 128);
    saved.forget("c");
    assert.equal(saved.corrected(track("c")), null);
    assert.throws(() => saved.forget("c"), /hasn't been checked/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
