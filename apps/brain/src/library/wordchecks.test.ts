import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WordChecks } from "./wordchecks.ts";
import type { Library } from "../query/evaluate.ts";

const library: Library = {
  version: "v1",
  tracks: [
    { id: "sung", title: "Buried Voice", artist: "Eno", signals: { vocal_fraction: 0, instrumental: 1, voice_peak: 0.07 } },
    { id: "ambient", title: "An Ending", signals: { vocal_fraction: 0.2, instrumental: 0.8, voice_peak: 0.2 } },
    { id: "other", title: "Untouched", signals: { vocal_fraction: 0.5, instrumental: 0.5 } },
  ],
} as Library;

test("your answer about words replaces the Mac's guess, survives a restart, and can be taken back", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-words-"));
  try {
    const path = join(dir, "wordchecks.json");
    const checks = new WordChecks(path);
    assert.equal(checks.apply(library), library, "nothing answered: same library");
    const answer = checks.record(library.tracks[0]!, "has_words", 5);
    assert.deepEqual(answer, { words: "has_words", at: 5, measured_vocal_fraction: 0, measured_voice_peak: 0.07, title: "Buried Voice", artist: "Eno" });
    checks.record(library.tracks[1]!, "no_words");
    assert.throws(() => checks.record(library.tracks[2]!, "maybe"), /words must be one of/);

    const reopened = new WordChecks(path);
    const applied = reopened.apply(library);
    assert.notEqual(applied.version, library.version, "the library version moves so cached results refresh");
    assert.deepEqual(applied.tracks[0]!.signals, { vocal_fraction: 1, instrumental: 0, voice_peak: 0.07 });
    assert.deepEqual(applied.tracks[1]!.signals, { vocal_fraction: 0, instrumental: 1, voice_peak: 0.2 });
    assert.equal(applied.tracks[2], library.tracks[2]);
    assert.deepEqual(reopened.summary(), { answered: 2, has_words: 1, no_words: 1, missed_voices: 1, false_voices: 1 });

    reopened.forget("sung");
    assert.equal(reopened.apply(library).tracks[0], library.tracks[0]);
    assert.throws(() => reopened.forget("sung"), /No answer about words/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
