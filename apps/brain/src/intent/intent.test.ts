/**
 * Intent layer tests — goal interpreter + lexicon (B1).
 *
 * Fixture values are synthetic. These tests prove the *logic*: composition with
 * draftPlan, supersession, contradiction readings, honest fallbacks, soft-only
 * constraints, determinism. They are NOT evidence that any classifier or band
 * is accurate on real music.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretGoal } from "./interpret.ts";
import type { GoalInterpretation } from "./interpret.ts";
import { FAST_CALM_PAIR, GOAL_BY_ID, GOALS, SHARED_ASSUMPTIONS, emittedBundleWeights, resolveLexConstraint } from "./lexicon.ts";
import type { GoalId } from "./lexicon.ts";
import { validatePlan } from "../query/plan.ts";
import type { QueryPlan } from "../query/plan.ts";
import { SIGNALS } from "../query/signals.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

const FLAGSHIP = "I need to focus. no words, no piano, nothing too slow/relaxing.";

/** Eight synthetic tracks with a full spread of produced fields (quantiles need ≥3). */
function fixtureLibrary(): Library {
  const tracks: LibraryTrack[] = [];
  for (let i = 0; i < 8; i++) {
    tracks.push({
      id: `t${i + 1}`,
      title: `Track ${i + 1}`,
      signals: {
        bpm: 70 + i * 10,
        tempo_confidence: 0.8,
        onset_rate: 1 + i,
        percussiveness: 0.2 + i * 0.08,
        lufs_integrated: -22 + i * 2,
        loudness_range: 3 + i,
        spectral_centroid: 800 + i * 400,
        spectral_flatness: 0.1 + i * 0.05,
        pulse_clarity: 0.4 + i * 0.05,
        beat_interval_cv: 0.02 + i * 0.005,
        dynamic_complexity: 3 + i,
        vocal_fraction: 0.02,
        instrumental: 0.95,
        arousal: 0.3 + i * 0.05,
        valence: 0.5,
        danceability: 0.5,
      },
    });
  }
  return { version: "intent-fixture", tracks };
}

const library = fixtureLibrary();

test("unrecognised numbers remain visible rather than making a request look specific", () => {
  for (const prompt of ["nostalgia 1990–2005", "focus 17", "focus 0.7", "focus 90–120"]) {
    const result = interpretGoal(prompt, { library });
    assert.equal(result.accuracy, "partial", prompt);
    assert.ok(result.audit.some((entry) => entry.kind === "unparsed" && /\d/.test(entry.phrase)), prompt);
    assert.ok(result.asks.length > 0, prompt);
  }
  const supported = interpretGoal("focus between 90 and 120 bpm", { library });
  assert.equal(supported.accuracy, "specific");
  assert.ok(!supported.audit.some((entry) => entry.kind === "unparsed" && /\d/.test(entry.phrase)));
});

test("reading notes follow the goals actually applied to each reading", () => {
  const focus = interpretGoal("focus", { library }).readings[0]!;
  assert.deepEqual(focus.caveats, GOAL_BY_ID.get("focus")!.caveats);
  assert.ok(focus.culture_notes.some((line) => line.includes("Western metre/tempo")));
  assert.ok(focus.culture_notes.includes(GOAL_BY_ID.get("focus")!.culture[0]!));
  const phases = interpretGoal("workout then sleep", { library }).readings[0]!;
  assert.ok(phases.caveats.includes(GOAL_BY_ID.get("pump_up")!.caveats[0]!));
  assert.ok(!phases.caveats.includes(GOAL_BY_ID.get("sleep")!.caveats[0]!));
  assert.deepEqual(interpretGoal("between 90 and 120 bpm", { library }).readings[0]!.culture_notes, []);
});

function validated(plan: unknown): QueryPlan {
  const result = validatePlan(plan);
  if (!result.ok) assert.fail(`plan failed validation: ${JSON.stringify(result.errors)}`);
  return result.plan;
}

function collectFields(expr: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.field === "string") {
      out.push(record.field);
      return;
    }
    for (const key of ["all", "any"]) {
      if (Array.isArray(record[key])) (record[key] as unknown[]).forEach(walk);
    }
  };
  walk(expr);
  return out;
}

/** House rules: every reading validates; lexicon terms are soft & neutral; no non-explicit hard rules on declared fields. */
function assertSane(out: GoalInterpretation): void {
  for (const reading of out.readings) {
    const plan = validated(reading.plan);
    for (const constraint of plan.constraints) {
      if (constraint.id.startsWith("goal_") || constraint.id.startsWith("mod_")) {
        assert.equal(constraint.hard, false, `${constraint.id} must be soft`);
        assert.equal(constraint.unknown_policy, "neutral", `${constraint.id} must be neutral`);
      }
      if (constraint.hard === true && constraint.explicit_exclusion !== true) {
        for (const field of collectFields(constraint.where)) {
          assert.notEqual(
            SIGNALS.get(field)?.status, "declared",
            `${constraint.id} is a non-explicit hard rule on declared field ${field}`,
          );
        }
      }
    }
  }
  if (out.readings.length) {
    assert.ok(out.chosen_index >= 0 && out.chosen_index < out.readings.length, "chosen_index in range");
  } else {
    assert.equal(out.chosen_index, -1, "no readings ⇒ chosen_index -1");
  }
  assert.ok(out.asks.length <= 3, "at most 3 asks");
  assert.equal(out.parser, "intent-v2 (rule-based: draftPlan + goal lexicon; no LLM)");
}

test("flagship focus prompt — specific, one valid reading carrying the research bundle", () => {
  const out = interpretGoal(FLAGSHIP, { library });
  assert.equal(out.accuracy, "specific");
  assert.equal(out.readings.length, 1);
  assert.equal(out.chosen_index, 0);
  assert.deepEqual(out.asks, []);

  const plan = validated(out.readings[0]!.plan);
  const ids = plan.constraints.map((item) => item.id);
  assert.ok(ids.includes("goal_focus_1"), "F1 (no-lyrics lever) present");
  assert.ok(ids.includes("goal_focus_10"), "F10 (arousal band) present");
  assert.ok(!ids.includes("focus_arousal") && !ids.includes("focus_pulse"), "draft proxies superseded, never kept twice");
  assert.equal(plan.sequencing?.arc, "flat");

  const vocal = plan.constraints.find((item) => item.id === "goal_focus_1")!;
  assert.equal(vocal.hard, false);
  assert.equal(vocal.unknown_policy, "neutral");
  assert.ok(plan.assumptions?.some((line) => line.includes("no producer yet — inert on real data")), "inert note surfaced");

  assert.ok(out.audit.some((entry) => entry.kind === "goal" && entry.phrase.includes("focus")));
  assert.ok(out.audit.some((entry) => entry.kind === "note" && entry.becomes.includes("focus_arousal")));
  assertSane(out);
});

test("each user example phrase fires its goal with a valid reading", () => {
  const cases: Array<[string, string]> = [
    ["i need to focus", "goal_focus_1"],
    ["pump me up to do this task / win this game", "goal_pump_up_1"],
    ["i want to dance", "goal_dance_1"],
  ];
  for (const [text, expected] of cases) {
    const out = interpretGoal(text, { library });
    assert.ok(out.readings.length >= 1, text);
    const plan = validated(out.readings[out.chosen_index]!.plan);
    assert.ok(plan.constraints.some((item) => item.id === expected), `${text} → ${expected}`);
    assert.ok(out.accuracy === "specific" || out.accuracy === "partial", text);
    assertSane(out);
  }
  const pump = interpretGoal("pump me up to do this task / win this game", { library });
  assert.equal(validated(pump.readings[pump.chosen_index]!.plan).sequencing?.arc, "build");
  const dance = interpretGoal("i want to dance", { library });
  assert.equal(validated(dance.readings[dance.chosen_index]!.plan).sequencing?.arc, "peak");
});

test("vague request — no readings, asks carry the next step (nothing fabricated)", () => {
  const out = interpretGoal("something good for later idk", { library });
  assert.equal(out.accuracy, "vague");
  assert.deepEqual(out.readings, []);
  assert.equal(out.chosen_index, -1);
  assert.ok(out.asks.length >= 1 && out.asks.length <= 3);
  assert.ok(out.asks[0]!.ask.length > 0 && out.asks[0]!.reason.length > 0);
  assertSane(out);
});

// Harness cross-check regression: surface verbs (“play”, “put on”, “queue up”,
// “start”) are glue, not content — they used to survive into the residue and
// flip `vague` to `impossible` via hasContentClaims().
test("surface verbs stay glue: “play me something good” stays vague", () => {
  for (const text of ["play me something good", "put on something for later", "queue up something nice", "start me something"]) {
    const out = interpretGoal(text, { library });
    assert.equal(out.accuracy, "vague", text);
    assert.deepEqual(out.readings, [], text);
    assert.equal(out.chosen_index, -1, text);
    assert.ok(out.asks.length >= 1 && out.asks.length <= 3, text);
    assertSane(out);
  }
});

test("contradictory “fast relaxing bangers” — the documented pair yields two readings", () => {
  const out = interpretGoal("fast relaxing bangers", { library });
  assert.equal(out.accuracy, "contradictory");
  assert.equal(out.readings.length, 2);
  assert.equal(out.chosen_index, 0, "ties resolve to the first reading");
  assert.ok(out.asks.length >= 1 && out.asks.length <= 3);

  const [a, b] = out.readings;
  assert.equal(a!.label, FAST_CALM_PAIR.sideA.label);
  assert.equal(b!.label, FAST_CALM_PAIR.sideB.label);
  const planA = validated(a!.plan);
  const planB = validated(b!.plan);
  assert.ok(planA.constraints.some((item) => item.id === "mod_fast"), "A keeps the fast side");
  assert.ok(planA.constraints.some((item) => item.id === "goal_fastsoft_1" && item.hard === false), "A adds soft texture terms");
  assert.ok(!planA.constraints.some((item) => item.id.startsWith("goal_calm_")), "A drops the calm bundle");
  assert.ok(planB.constraints.some((item) => item.id.startsWith("goal_calm_")), "B keeps the calm bundle");
  assert.ok(!planB.constraints.some((item) => item.id === "mod_fast"), "B drops the fast side");
  assert.ok(out.audit.some((entry) => entry.kind === "note" && entry.phrase.includes("fast + calm")), "the documented pair is reported");
  assertSane(out);
});

test("impossible / hyper-specific asks stay honest", () => {
  const throat = interpretGoal("90s Mongolian throat singing only", { library });
  assert.equal(throat.accuracy, "impossible");
  assert.deepEqual(throat.readings, []);
  assert.equal(throat.chosen_index, -1);
  assert.ok(throat.asks.length >= 1 && throat.asks.length <= 3);
  assert.match(JSON.stringify(throat.asks), /Mongolian|throat/i);

  const four = interpretGoal("not four-on-the-floor", { library });
  assert.equal(four.accuracy, "impossible");
  assert.deepEqual(four.readings, []);
  assert.ok(four.asks.length >= 1 && four.asks.length <= 3);
  assert.match(JSON.stringify(four.asks), /four-on-the-floor/i, "the ask names the unmappable phrase");
  assertSane(four);
});

test("determinism: identical inputs produce deep-equal interpretations", () => {
  for (const text of [FLAGSHIP, "fast relaxing bangers", "something good for later idk", "i want to dance"]) {
    assert.deepEqual(interpretGoal(text, { library }), interpretGoal(text, { library }), text);
  }
});

test("user exclusions survive supersession and stay hard", () => {
  const out = interpretGoal("pump me up, nothing too slow", { library });
  const plan = validated(out.readings[out.chosen_index]!.plan);
  const notSlow = plan.constraints.find((item) => item.id === "not_slow")!;
  assert.equal(notSlow.hard, true);
  assert.equal(notSlow.explicit_exclusion, true);
  assert.ok(plan.constraints.some((item) => item.id === "goal_pump_up_1"));
  assertSane(out);
});

test("lexicon: nine goals, soft-only bundles ≤ 1.0 emitted total (≤ 0.5 per term), refs everywhere", () => {
  assert.deepEqual(
    GOALS.map((goal) => goal.id).sort(),
    ["calm", "catharsis", "chores", "dance", "drive", "focus", "nostalgia", "pump_up", "sleep"],
  );
  for (const goal of GOALS) {
    assert.ok(goal.triggers.length > 0, goal.id);
    assert.ok(goal.constraints.length > 0, goal.id);
    assert.ok(["flat", "build", "cooldown", "peak", "wave"].includes(goal.arc), goal.id);
    for (const c of goal.constraints) {
      assert.ok(c.researchWeight <= 0.5, `${goal.id}:${c.n} research weight ≤ 0.5`);
      assert.ok(c.refs.length > 0, `${goal.id}:${c.n} needs refs`);
      assert.ok(c.mechanism.length > 0, `${goal.id}:${c.n} needs a mechanism note`);
      if (c.declared) assert.ok(c.mechanism.includes("no producer yet — inert on real data"), `${goal.id}:${c.n} inert marker`);
    }
    const total = emittedBundleWeights(goal).reduce((sum, weight) => sum + weight, 0);
    assert.ok(total <= 1.0 + 1e-9, `${goal.id} emitted bundle total ${total} > 1.0`);
  }
  const pairs: Array<[GoalId, GoalId]> = [["pump_up", "calm"], ["dance", "sleep"]];
  for (const [a, b] of pairs) {
    assert.ok(GOAL_BY_ID.get(a)!.opposes?.includes(b), `${a} opposes ${b}`);
    assert.ok(GOAL_BY_ID.get(b)!.opposes?.includes(a), `${b} opposes ${a}`);
  }
  assert.ok(FAST_CALM_PAIR.note.length > 0, "the fast+calm pair is documented in the lexicon");
  assert.equal(FAST_CALM_PAIR.sideA.label, "energetic but soft");
});

test("opposing goals yield two readings; the dropped side's draft proxies are set aside", () => {
  const out = interpretGoal("pump me up but keep it calm", { library });
  assert.equal(out.accuracy, "contradictory");
  assert.equal(out.readings.length, 2);
  const planA = validated(out.readings[0]!.plan);
  const planB = validated(out.readings[1]!.plan);
  assert.ok(planA.constraints.some((item) => item.id === "goal_pump_up_1"));
  assert.ok(!planA.constraints.some((item) => item.id === "calm"), "the calm side is gone from the pump reading");
  assert.ok(planB.constraints.some((item) => item.id.startsWith("goal_calm_")));
  assert.ok(!planB.constraints.some((item) => item.id.startsWith("goal_pump_up_")), "the pump side is gone from the calm reading");
  assertSane(out);
});

test("blend: calm + sleep merge into one reading with a cooldown arc", () => {
  const out = interpretGoal("calm sleepy music for bed", { library });
  assert.ok(out.readings.length >= 1);
  const plan = validated(out.readings[out.chosen_index]!.plan);
  const ids = plan.constraints.map((item) => item.id);
  assert.ok(ids.includes("goal_calm_1") && ids.includes("goal_sleep_1"));
  assert.equal(plan.sequencing?.arc, "cooldown");
  assertSane(out);
});

// --- C3 psych-review hotfixes (F-A1-1/2/3/4, F-COPY-1, C2 F9) ----------------

test("drive keeps its medium feel: the draft “energetic” arousal proxy is superseded, never kept twice", () => {
  const out = interpretGoal("I'm driving to work", { library });
  assert.ok(out.readings.length >= 1);
  const plan = validated(out.readings[out.chosen_index]!.plan);
  const ids = plan.constraints.map((item) => item.id);
  assert.ok(ids.includes("goal_drive_1"), "drive bundle present");
  assert.ok(!ids.includes("energetic"), "draft energy proxy replaced by the drive rules");
  assert.ok(!(plan.assumptions ?? []).some((line) => line.includes("“Energy” was read as arousal")), "superseded assumption line dropped");
  assert.ok(out.audit.some((entry) => entry.kind === "note" && entry.becomes.includes("energetic")), "the supersession is reported in the audit");
  assertSane(out);
});

test("genre context guard: “the house” is a room, “house music” is a genre", () => {
  const room = interpretGoal("cleaning the house", { library });
  const roomPlan = validated(room.readings[room.chosen_index]!.plan);
  assert.ok(roomPlan.constraints.some((item) => item.id === "goal_chores_1"), "chores reading still built");
  assert.ok(!roomPlan.constraints.some((item) => item.id === "genre_hint"), "no genre hint from the room");
  assert.ok(room.audit.some((entry) => entry.kind === "note" && entry.becomes.includes("ordinary word")), "the correction is explained");

  const genre = interpretGoal("house music for cleaning", { library });
  const genrePlan = validated(genre.readings[genre.chosen_index]!.plan);
  const hint = genrePlan.constraints.find((item) => item.id === "genre_hint");
  assert.ok(hint, "explicit genre ask survives");
  assert.deepEqual((hint!.where as unknown as { value: string[] }).value, ["house"]);

  // Idiomatic “the blues” must NOT be caught by the determiner guard.
  const blues = interpretGoal("play me the blues", { library });
  const bluesPlan = validated(blues.readings[blues.chosen_index]!.plan);
  assert.ok(bluesPlan.constraints.some((item) => item.id === "genre_hint"), "“the blues” still reads as the genre");
  assertSane(room);
  assertSane(genre);
  assertSane(blues);
});

test("“workout then sleep” builds the first phase only and asks about the second", () => {
  const out = interpretGoal("music for my workout then sleep", { library });
  assert.equal(out.accuracy, "partial");
  assert.equal(out.readings.length, 1, "one reading — not a merged cancelling wash");
  assert.equal(out.readings[0]!.label, "pump up");
  const plan = validated(out.readings[0]!.plan);
  const ids = plan.constraints.map((item) => item.id);
  assert.ok(ids.some((id) => id.startsWith("goal_pump_up_")), "first phase built");
  assert.ok(!ids.some((id) => id.startsWith("goal_sleep_")), "the sleep side is not merged in");
  assert.equal(plan.sequencing?.arc, "build");
  assert.ok(out.asks.length >= 1 && out.asks.length <= 3);
  assert.match(out.asks[0]!.ask, /^Two moods in one ask/);
  assert.match(out.asks[0]!.ask, /sleep/);
  assert.ok(out.audit.some((entry) => entry.kind === "note" && entry.becomes.includes("sequence cue")), "the cue is reported");
  assertSane(out);
});

test("catharsis covers angry language too (A1 §2.1 C): angry/anger/furious/rage", () => {
  for (const text of ["i'm angry", "full of anger", "i am furious", "need to rage"]) {
    const out = interpretGoal(text, { library });
    assert.ok(out.readings.length >= 1, text);
    const plan = validated(out.readings[out.chosen_index]!.plan);
    assert.ok(plan.constraints.some((item) => item.id === "goal_catharsis_1"), `${text} → catharsis bundle`);
    assertSane(out);
  }
  // Word-boundary guard: “rage” inside “garage” is not anger language.
  const garage = interpretGoal("cleaning out the garage", { library });
  const garagePlan = validated(garage.readings[garage.chosen_index]!.plan);
  assert.ok(!garagePlan.constraints.some((item) => item.id.startsWith("goal_catharsis_")), "“garage” is not anger");
  assert.ok(garagePlan.constraints.some((item) => item.id === "goal_chores_1"), "chores still fires");
});

test("copy corrections (C3 F-COPY-1): softened claims, no broken year example, no “lift me” promise", () => {
  const json = JSON.stringify([GOALS, SHARED_ASSUMPTIONS, FAST_CALM_PAIR]);
  assert.ok(!json.includes("1990"), "the unsupported “years 1990–2005” example is gone");
  assert.ok(!json.includes("lift me"), "the unparsed “then lift me” instruction is gone");
  assert.ok(!json.includes("medicate"), "the clinical-adjacent sleep wording is gone");
  assert.ok(!json.includes("move the list more than"), "the feedback-magnitude overclaim is gone");
  assert.ok(json.includes("kept deliberately bounded"), "pump-up copy softened");
  assert.ok(json.includes("one driving study found"), "drive copy hedged");
  assert.ok(json.includes("treats a sleep problem"), "sleep copy softened");
  assert.ok(SHARED_ASSUMPTIONS.calibration.includes("stay soft and learn"), "calibration line updated");

  const nostalgiaYear = GOAL_BY_ID.get("nostalgia")!.constraints.find((c) => c.field === "year")!;
  const resolved = resolveLexConstraint(nostalgiaYear, undefined);
  assert.equal(resolved.ok, false);
  assert.ok(!resolved.ok && resolved.note.includes("aren't supported yet"), "cohort skip note no longer promises year windows");
});

test("lexicon regressions: drive supersedes the energy proxy; angry words are catharsis triggers", () => {
  assert.deepEqual(GOAL_BY_ID.get("drive")!.supersedes, ["energetic"]);
  const catharsis = GOAL_BY_ID.get("catharsis")!;
  for (const word of ["angry", "anger", "furious", "rage"]) {
    assert.ok(catharsis.triggers.includes(word), `“${word}” triggers catharsis`);
  }
});
