/**
 * Fixture tests for the query layer (AGENT-ROADMAP P2 exit criteria).
 *
 * These prove the *logic*: exclusions hold, unknowns stay unknown, tiers stay
 * separate, hashes are stable. They are NOT evidence that any classifier is
 * accurate on real music — the fixture values are hand-written.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { draftPlan } from "./draft.ts";
import { evaluatePlan } from "./evaluate.ts";
import type { Library, LibraryTrack } from "./evaluate.ts";
import { LibrarySource } from "./library.ts";
import { encoderText, validatePlan } from "./plan.ts";
import type { ValidatedPlan } from "./plan.ts";
import { ALIASES, SIGNALS } from "./signals.ts";

const FLAGSHIP = "I need to focus. no words, no piano, nothing too slow/relaxing.";

function track(id: string, signals: LibraryTrack["signals"], extra: Partial<LibraryTrack> = {}): LibraryTrack {
  return { id, title: `Track ${id}`, artist: `Artist ${id}`, album: `Album ${id}`, ...extra,
    signals: { bpm: 110, pulse_clarity: 0.6, arousal: 0.5, vocal_fraction: 0.02, instrumental: 0.95, "instruments.piano": 0.05, ...signals } };
}

const library: Library = {
  version: "fixture-1",
  tracks: [
    track("ok", {}, { embedding: [1, 0, 0] }),
    track("ok2", { arousal: 0.45 }, { embedding: [0.9, 0.1, 0] }),
    track("piano-heavy", { "instruments.piano": 0.7 }),
    track("piano-close", { "instruments.piano": 0.31 }),
    track("sung", { vocal_fraction: 0.5, instrumental: 0.3 }),
    track("barely-sung", { vocal_fraction: 0.15, instrumental: 0.72 }),
    track("bit-slow", { bpm: 85 }),
    track("ballad", { bpm: 60 }),
    track("piano-unmeasured", { "instruments.piano": null }),
    track("tagged-relaxing", { mood: "relaxing" }),
    track("twin-with-piano", { "instruments.piano": 0.9 }, { embedding: [1, 0.01, 0] }),
  ],
};

function valid(input: unknown): ValidatedPlan {
  const result = validatePlan(input);
  if (!result.ok) assert.fail(JSON.stringify(result.errors, null, 2));
  return result;
}

function basePlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "2.0", intent: { query_type: "exclusion" }, target_size: 10,
    constraints: [{ id: "no_piano", source_phrase: "no piano", hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.8,
      where: { field: "instruments.piano", op: "lt", value: 0.2 } }],
    ranking: { signals: [] },
    relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
    ...overrides,
  };
}

const ids = (list: Array<{ id: string }>) => list.map((item) => item.id).sort();

test("flagship prompt drafts a valid plan with every exclusion protected", () => {
  const draft = draftPlan(FLAGSHIP, library);
  const plan = valid(draft.plan).plan;
  const constraintIds = plan.constraints.map((item) => item.id);
  for (const id of ["no_words", "no_piano", "not_slow", "not_relaxing"]) assert.ok(constraintIds.includes(id), `missing ${id}`);
  for (const id of ["no_words", "no_piano", "not_slow", "not_relaxing"]) assert.ok(plan.relaxation.require_confirmation_for.includes(id));
  assert.ok(plan.constraints.some((item) => item.id === "focus_pulse" && !item.hard));
  assert.equal(plan.sequencing?.arc, "flat");
  assert.ok(plan.assumptions?.some((item) => item.includes("Focus")));
});

test("negations never reach the encoder-bound text", () => {
  const draft = draftPlan(FLAGSHIP, library);
  for (const banned of ["piano", "words", "slow", "relaxing", "no", "nothing"]) {
    assert.ok(!new RegExp(`\\b${banned}\\b`, "i").test(draft.encoder_text), `“${banned}” leaked into “${draft.encoder_text}”`);
  }
  assert.match(draft.encoder_text, /focus/i);
  // Defence in depth: even a parser that writes negations into retrieval text is stripped.
  assert.equal(encoderText("warm ambient pads, without piano or any vocals. late night"), "warm ambient pads. late night");
  assert.equal(encoderText("upbeat but don't add drums"), "upbeat but");
});

test("flagship evaluation obeys every exclusion and keeps near misses separate", () => {
  const plan = valid(draftPlan(FLAGSHIP, library).plan);
  const result = evaluatePlan(plan, library);
  assert.deepEqual(ids(result.strict), ["ok", "ok2"]);
  const near = new Map(result.near_miss.map((item) => [item.id, item.near_miss!]));
  assert.deepEqual([...near.keys()].sort(), ["barely-sung", "bit-slow", "piano-close", "piano-unmeasured"]);
  assert.equal(near.get("piano-close")!.constraint, "no_piano");
  assert.match(near.get("piano-unmeasured")!.label, /not measured/);
  assert.match(near.get("bit-slow")!.label, /bpm 85/);
  for (const far of ["piano-heavy", "ballad", "sung", "tagged-relaxing", "twin-with-piano"]) {
    assert.ok(!near.has(far) && !result.strict.some((item) => item.id === far), `${far} should be excluded outright`);
  }
  assert.equal(result.counts.excluded_by.no_piano, 4);
  assert.equal(result.counts.unknown_by.no_piano, 1);
  // Mood is unmeasured on most fixtures: they pass, but the rule is marked unverified.
  assert.ok(result.strict[0]!.unverified.some((item) => item.includes("mood")));
  assert.ok(result.strict[0]!.reasons.some((item) => item.startsWith("“no piano”") && item.includes("instruments.piano 0.05")));
  // Two strict tracks against a min_results of 10: reported, not padded.
  assert.equal(result.underfilled, true);
});

test("the similarity channel cannot smuggle a track past a hard guard", () => {
  const plan = valid(basePlan({ ranking: { signals: [{ name: "exemplar_pos", weight: 1 }], exemplars: { positive: ["ok"] } } }));
  const result = evaluatePlan(plan, library);
  assert.equal(result.counts.candidates.similar, 3);
  assert.ok(!result.strict.some((item) => item.id === "twin-with-piano"));
  assert.equal(result.strict[0]!.id, "ok");
  assert.deepEqual(result.strict[1]!.channels, ["filter", "similar"]);
  assert.ok(result.strict[1]!.reasons.some((item) => item.startsWith("sounds like")));
});

test("unknown never quietly passes an explicit exclusion", () => {
  const result = validatePlan(basePlan({ constraints: [{ id: "no_piano", source_phrase: "no piano", hard: true, explicit_exclusion: true,
    unknown_policy: "include", confidence: 0.8, where: { field: "instruments.piano", op: "lt", value: 0.2 } }] }));
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(!result.ok && result.errors), /cannot pass an explicit exclusion/);
});

test("relaxation never crosses a protected rule; permitted widening is recorded", () => {
  const ignore = validatePlan(basePlan({ relaxation: { min_results: 5, tiers: "strict", ladder: [{ step: 1, action: "ignore_never_relax", target: "no_piano" }] } }));
  assert.equal(ignore.ok, false);
  assert.match(JSON.stringify(!ignore.ok && ignore.errors), /never overridden/);
  const widenExclusion = validatePlan(basePlan({ relaxation: { min_results: 5, tiers: "strict", ladder: [{ step: 1, action: "widen_numeric", target: "no_piano", by: 0.2 }] } }));
  assert.equal(widenExclusion.ok, false);

  const tempo = { id: "tempo", source_phrase: "around 108 bpm", hard: true, unknown_policy: "exclude", confidence: 0.6, where: { field: "bpm", op: "between", value: [105, 112] } };
  const plan = valid(basePlan({
    constraints: [...(basePlan().constraints as unknown[]), tempo],
    relaxation: { min_results: 7, tiers: "strict", ladder: [{ step: 1, action: "widen_numeric", target: "tempo", by: 30 }] },
  }));
  const result = evaluatePlan(plan, library);
  assert.deepEqual(result.relaxations_applied.map((item) => item.detail), ["bpm within 105–112 → 75–142"]);
  assert.ok(result.strict.some((item) => item.id === "bit-slow"));
  assert.ok(!result.strict.some((item) => item.id.startsWith("piano")), "the protected rule still holds after widening");
  assert.deepEqual(result.near_miss, [], "strict tier only, as requested");
});

test("zero and two results are reported honestly, without padding", () => {
  const plan = valid(basePlan({ target_size: 10, relaxation: { min_results: 5, tiers: "strict_plus_near_miss", ladder: [] },
    constraints: [...(basePlan().constraints as unknown[]), { id: "fast", source_phrase: "over 200 bpm", hard: true, unknown_policy: "exclude", confidence: 0.9, where: { field: "bpm", op: "gte", value: 200 } }] }));
  const result = evaluatePlan(plan, library);
  assert.equal(result.strict.length, 0);
  assert.equal(result.underfilled, true);
  const two = evaluatePlan(valid(basePlan({ relaxation: { min_results: 5, tiers: "strict", ladder: [] },
    constraints: [{ id: "only", source_phrase: "just those", hard: true, unknown_policy: "exclude", confidence: 1, where: { field: "artist", op: "in", value: ["Artist ok", "Artist ok2"] } }] })), library);
  assert.deepEqual(ids(two.strict), ["ok", "ok2"]);
  assert.equal(two.underfilled, true);
});

test("a missing genre tag is not evidence of absence", () => {
  const lib: Library = { version: "g", tracks: [
    track("punk", {}, { genre: ["Punk"] }), track("folk", {}, { genre: ["folk"] }), track("untagged", {}),
  ] };
  const draft = draftPlan("exclude punk or country", lib);
  const plan = valid(draft.plan);
  const result = evaluatePlan(plan, lib);
  assert.deepEqual(ids(result.strict), ["folk", "untagged"]);
  assert.equal(result.strict.find((item) => item.id === "untagged")!.unverified.length, 1);
  assert.equal(result.strict.find((item) => item.id === "folk")!.unverified.length, 0);
  assert.ok(result.unsupported.some((item) => item.ask.includes("punk")));
});

test("unsupported fields become structured asks, and hard ones are flagged unenforced", () => {
  const result = valid(basePlan({ constraints: [...(basePlan().constraints as unknown[]),
    { id: "nopunk", source_phrase: "no punk", hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.5, where: { field: "punk_proxy", op: "lt", value: 0.3 } }] }));
  assert.deepEqual(result.plan.constraints.map((item) => item.id), ["no_piano"]);
  assert.equal(result.plan.unsupported?.[0]?.unenforced, true);
  assert.match(result.plan.unsupported![0]!.reason, /punk_proxy/);
  assert.equal(evaluatePlan(result, library).unenforced.length, 1);
  const unknown = draftPlan("no kazoo", library);
  assert.ok((unknown.plan.unsupported as Array<{ ask: string }>).some((item) => item.ask === "no kazoo"));
});

test("aliases round-trip to canonical fields and the same hash", () => {
  const aliased = valid(basePlan({ constraints: [{ id: "no_piano", source_phrase: "no piano", hard: true, explicit_exclusion: true, unknown_policy: "exclude",
    confidence: 0.8, where: { all: [{ field: "instrument.piano", op: "lt", value: 0.2 }] } }] }));
  const canonical = valid(basePlan());
  assert.equal(aliased.hash, canonical.hash);
  assert.equal((aliased.plan.constraints[0]!.where as { field: string }).field, "instruments.piano");
  for (const [alias, target] of Object.entries(ALIASES)) assert.ok(SIGNALS.has(target), `${alias} → ${target} is not registered`);
  assert.equal(validatePlan(basePlan({ constraints: [{ id: "x", source_phrase: "x", hard: true, unknown_policy: "exclude", confidence: 1,
    where: { field: "instrument_piano", op: "lt", value: 0.2 } }] })).ok, false, "near-miss spellings are not guessed");
});

test("the hash ignores key order but not meaning", () => {
  const a = valid(basePlan());
  const reordered = Object.fromEntries(Object.entries(basePlan()).reverse());
  assert.equal(valid(reordered).hash, a.hash);
  assert.notEqual(valid(basePlan({ target_size: 11 })).hash, a.hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
});

test("malformed plans fail with paths", () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [basePlan({ sql: "DROP TABLE" }), /\$\.sql/],
    [basePlan({ target_size: 9000 }), /target_size/],
    [basePlan({ constraints: [{ id: "t", source_phrase: "t", hard: true, unknown_policy: "exclude", confidence: 1, where: { field: "bpm", op: "in", value: ["fast"] } }] }), /not valid for bpm/],
    [basePlan({ constraints: [{ id: "t", source_phrase: "t", hard: true, unknown_policy: "exclude", confidence: 1, where: { field: "bpm", op: "gte", value: 9999 } }] }), /within 20…300/],
    [basePlan({ constraints: [{ id: "t", source_phrase: "t", hard: false, unknown_policy: "neutral", confidence: 1, where: { field: "mood", op: "in", value: ["groovy"] } }] }), /vocabulary/],
    [basePlan({ version: "1.0" }), /version/],
  ];
  for (const [input, pattern] of cases) {
    const result = validatePlan(input);
    assert.equal(result.ok, false);
    assert.match(JSON.stringify(!result.ok && result.errors), pattern);
  }
});

test("timing predicates require an eligible beat status — null is never zero", () => {
  const lib: Library = { version: "t", tracks: [
    track("tight", { microtiming_signed: 0.5 }, { beat_status: "tracked", timing_status: "measured_relative_to_fitted_grid" }),
    track("abstained", { microtiming_signed: 0 }, { beat_status: "tracked", timing_status: "unstable_reference" }),
    track("not-run", {}),
  ] };
  const plan = valid(basePlan({ constraints: [{ id: "laidback", source_phrase: "laid back", hard: true, unknown_policy: "exclude", confidence: 0.4,
    where: { field: "microtiming_signed", op: "between", value: [-5, 5] } }] }));
  const result = evaluatePlan(plan, lib);
  assert.deepEqual(ids(result.strict), ["tight"]);
  assert.match(result.near_miss.find((item) => item.id === "abstained")!.near_miss!.label, /timing_status is unstable_reference/);
});

test("diversity caps hold and are counted", () => {
  const lib: Library = { version: "c", tracks: ["a", "b", "c", "d"].map((id) => track(id, {}, { artist: "Same", album: id < "c" ? "One" : "Two" })) };
  const plan = valid(basePlan({ ranking: { signals: [], diversity: { max_per_artist: 3, max_per_album: 1 } } }));
  const result = evaluatePlan(plan, lib);
  assert.deepEqual(ids(result.strict), ["a", "c"]);
  assert.equal(result.counts.capped, 2);
});

test("exemplar titles resolve against the library or are reported", () => {
  const lib: Library = { version: "e", tracks: [track("x", {}, { title: "Fire Door", embedding: [1, 0] }), track("y", {}, { title: "Other", embedding: [0, 1] })] };
  const draft = draftPlan("sounds like Fire Door + Hat Shaped Hat", lib);
  const plan = valid(draft.plan).plan;
  assert.deepEqual(plan.ranking.exemplars?.positive, ["x"]);
  assert.ok(plan.unsupported?.some((item) => item.ask.includes("Hat Shaped Hat")));
});

test("every produced registry field exists on the analyzer's AnalysisResult", () => {
  const models = readFileSync(new URL("../../../../services/analyzer/src/synamp_analyzer/models.py", import.meta.url), "utf8");
  const declared = new Set([...models.matchAll(/^    ([a-z_]+): /gm)].map((match) => match[1]!));
  for (const spec of SIGNALS.values()) {
    if (spec.status === "metadata") continue;
    const root = spec.field.split(".")[0]!;
    assert.ok(declared.has(root), `${spec.field} is not declared in AnalysisResult`);
  }
});

test("a saved plan picks up a newly analysed track from the library file", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-lib-"));
  try {
    const path = join(dir, "library.json");
    writeFileSync(path, JSON.stringify({ tracks: [track("first", {})] }));
    const source = new LibrarySource(path);
    const plan = valid(basePlan());
    const before = evaluatePlan(plan, source.get());
    assert.deepEqual(ids(before.strict), ["first"]);
    writeFileSync(path, JSON.stringify({ tracks: [track("first", {}), track("second-new", {}), { title: "no id" }] }));
    const after = evaluatePlan(plan, source.get());
    assert.deepEqual(ids(after.strict), ["first", "second-new"]);
    assert.notEqual(after.library_version, before.library_version);
    assert.equal(after.plan_hash, before.plan_hash, "same plan, new membership");
    assert.equal(source.rejected, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("every signal the analyzer exports is registered here", () => {
  const exporter = readFileSync(new URL("../../../../services/analyzer/src/synamp_analyzer/export.py", import.meta.url), "utf8");
  const start = exporter.indexOf("EXPORTED_SIGNALS: dict");
  const block = exporter.slice(start, exporter.indexOf("STATUS_FIELDS: dict", start));
  const names = [...block.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!).filter((name) => !["dsp_core", "beat"].includes(name));
  assert.ok(names.length > 10, "parsed the exporter's field list");
  for (const name of names) {
    assert.ok(SIGNALS.has(name), `${name} is exported by the analyzer but not in the registry`);
    assert.equal(SIGNALS.get(name)!.status, "produced", `${name} is exported, so it should be marked produced`);
  }
});

test("the library reader accepts analyzer exports and refuses unknown formats", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-fmt-"));
  try {
    const path = join(dir, "library.json");
    writeFileSync(path, JSON.stringify({ format: "synamp.library-signals/1", tracks: [
      { id: "p:abc", path: "A/B/01 X.flac", title: "X", artist: "A", metadata_source: "path", beat_status: "tracked",
        stages_done: ["beat", "dsp_core"], signals: { bpm: 120, pulse_clarity: 0.7 } },
    ] }));
    const lib = new LibrarySource(path).get();
    const plan = valid(basePlan({ constraints: [{ id: "fast", source_phrase: "over 100 bpm", hard: true, unknown_policy: "exclude", confidence: 1,
      where: { field: "bpm", op: "gte", value: 100 } }] }));
    assert.deepEqual(ids(evaluatePlan(plan, lib).strict), ["p:abc"]);
    writeFileSync(path, JSON.stringify({ format: "synamp.library-signals/9", tracks: [] }));
    assert.throws(() => new LibrarySource(path).get(), /unsupported format/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
