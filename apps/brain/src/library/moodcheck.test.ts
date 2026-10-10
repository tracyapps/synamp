/** "How does this feel?": mood answers, spread across the range, and agreement. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library } from "../query/evaluate.ts";
import { firstGuess, MoodChecks, rankAgreement } from "./moodcheck.ts";

const moods = (happy: number, sad: number, exciting: number, tender: number) =>
  ({ "moods.happy": happy, "moods.funny": 0, "moods.sad": sad, "moods.tender": tender, "moods.exciting": exciting, "moods.angry": 0, "moods.scary": 0 });

function library(): Library {
  const tracks = [];
  for (let i = 0; i < 30; i++) {
    const happy = (i % 5) / 10;
    const exciting = Math.floor(i / 5) / 10;
    tracks.push({ id: `t${i}`, title: `Song ${i}`, path: `A/${i}.flac`, signals: { ...moods(happy, 0.5 - happy, exciting, 0.5 - exciting), lufs_integrated: -10 - i } });
  }
  tracks.push({ id: "old", title: "Not listened to for moods", path: "A/old.flac", signals: { vocal_fraction: 0.5 } });
  return { version: "v1", tracks };
}

test("rank agreement: 1 when the reading rises with you, −1 when it falls, ties shared", () => {
  assert.equal(rankAgreement([1, 2, 3, 4], [1, 2, 3, 5]), 1);
  assert.equal(rankAgreement([1, 2, 3, 4], [5, 4, 2, 1]), -1);
  assert.ok(Math.abs(rankAgreement([1, 2, 3, 4], [1, 1, 2, 2])! - 0.894) < 0.01);
  assert.equal(rankAgreement([1, 2], [1, 2]), null, "too few to say");
  assert.equal(rankAgreement([1, 1, 1], [1, 2, 3]), null, "a flat reading says nothing");
});

test("the first guess: sad and tender read calmer and sadder than exciting and happy", () => {
  const calmSad = firstGuess({ happy: 0, funny: 0, sad: 0.4, tender: 0.3, exciting: 0, angry: 0, scary: 0 });
  const livelyHappy = firstGuess({ happy: 0.4, funny: 0, sad: 0, tender: 0, exciting: 0.4, angry: 0, scary: 0 });
  assert.ok(calmSad.lively < livelyHappy.lively && calmSad.happy < livelyHappy.happy);
});

test("questions cover the range, answers keep the measurements, agreement appears once there are enough", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-moodcheck-"));
  try {
    const checks = new MoodChecks(join(dir, "moodchecks.json"));
    const lib = library();
    const seen = new Set<string>();
    const cells = new Set<string>();
    for (let i = 0; i < 9; i++) {
      const track = checks.next(lib, () => 0.5)!;
      assert.notEqual(track.id, "old", "songs without mood readings aren't asked about");
      assert.ok(!seen.has(track.id), "never the same song twice");
      seen.add(track.id);
      const guess = firstGuess({ happy: track.signals!["moods.happy"] as number, funny: 0, sad: track.signals!["moods.sad"] as number,
        tender: track.signals!["moods.tender"] as number, exciting: track.signals!["moods.exciting"] as number, angry: 0, scary: 0 });
      cells.add(`${guess.lively > 0 ? "L" : "C"}${guess.happy > 0 ? "H" : "S"}`);
      // You agree with the readings: livelier and happier songs get higher answers.
      const lively = guess.lively < -0.2 ? 1 : guess.lively < 0.2 ? 3 : 5;
      checks.record(track, { lively, happy: guess.happy < 0 ? 2 : 4 }, i);
    }
    assert.equal(cells.size, 4, "the first nine questions reach every corner of the range");
    const answer = checks.state.answers[[...seen][0]!]!;
    assert.equal(typeof answer.signals["moods.sad"], "number");
    assert.equal(typeof answer.signals.lufs_integrated, "number", "the other measurements are kept for fitting later");

    const summary = checks.summary(lib);
    assert.equal(summary.answered, 9);
    assert.equal(summary.with_moods, 30);
    assert.ok(summary.lively.agreement! > 0.8 && summary.happy.agreement! > 0.8);

    const reloaded = new MoodChecks(join(dir, "moodchecks.json"));
    assert.equal(reloaded.summary(lib).answered, 9, "answers survive a restart");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("can't say, skip, undo, and refusals", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-moodcheck-"));
  try {
    const checks = new MoodChecks(join(dir, "moodchecks.json"));
    const lib = library();
    const track = lib.tracks[0]!;
    checks.record(track, { lively: 2 });
    assert.equal(checks.state.answers[track.id]!.happy, null, "left out = can't say");
    assert.equal(checks.summary(lib).happy.answered, 0);
    assert.equal(checks.summary(lib).lively.agreement, null, "too few answers for a figure");

    checks.record(lib.tracks[1]!, { skip: true });
    assert.equal(checks.summary(lib).skipped, 1);
    assert.equal(checks.summary(lib).answered, 1);

    checks.forget(track.id);
    assert.equal(checks.summary(lib).answered, 0);
    assert.throws(() => checks.forget(track.id), /hasn't been answered/);
    assert.throws(() => checks.record(track, {}), /at least one answer/);
    assert.throws(() => checks.record(track, { lively: 7 }), /1 to 5/);
    assert.throws(() => checks.record(lib.tracks.find((t) => t.id === "old")!, { lively: 3 }), /hasn't been listened to/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
