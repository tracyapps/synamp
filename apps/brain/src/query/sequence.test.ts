/**
 * Arc sequencing tests (B1) — deterministic re-ordering of a filtered list.
 *
 * Fixture values are synthetic; the intensity proxy is exercised through bpm
 * (all other components held absent), which keeps the expected orders exact.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { sequenceTracks } from "./sequence.ts";
import { validatePlan } from "./plan.ts";
import type { QueryPlan } from "./plan.ts";
import type { Library, LibraryTrack, ResultTrack } from "./evaluate.ts";

function track(id: string, bpm: number | null): LibraryTrack {
  return { id, title: id, signals: bpm === null ? {} : { bpm, tempo_confidence: 0.9 } };
}

function result(id: string): ResultTrack {
  return { id, title: id, score: 1, channels: [], reasons: [], unverified: [] };
}

const idList = (tracks: ResultTrack[]): string[] => tracks.map((item) => item.id);

function planFor(arc?: "flat" | "build" | "cooldown" | "peak" | "wave"): QueryPlan {
  const checked = validatePlan({
    version: "2.0",
    intent: { query_type: "mood" },
    target_size: 25,
    constraints: [{ id: "any", source_phrase: "anything", hard: false, weight: 0.1, unknown_policy: "neutral", confidence: 0.5,
      where: { field: "pulse_clarity", op: "gte", value: 0 } }],
    ranking: { signals: [{ name: "feature_soft", weight: 1 }] },
    relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
    ...(arc ? { sequencing: { arc } } : {}),
  });
  if (!checked.ok) assert.fail(JSON.stringify(checked.errors));
  return checked.plan;
}

/** Five tracks, deliberately shuffled: a=150, b=90, c=120, d=105, e=135. */
function spreadLibrary(): Library {
  return { version: "seq-fixture", tracks: [track("a", 150), track("b", 90), track("c", 120), track("d", 105), track("e", 135)] };
}

test("build ascends by measured intensity — re-orders only, never filters", () => {
  const tracks = ["a", "b", "c", "d", "e"].map(result);
  const out = sequenceTracks(tracks, planFor("build"), { library: spreadLibrary() });
  assert.deepEqual(idList(out.tracks), ["b", "d", "c", "e", "a"]);
  assert.deepEqual([...idList(out.tracks)].sort(), idList(tracks), "same membership");
  assert.match(out.applied[0]!, /^arc build: ordered by measured pace\/energy proxy \(bpm, onsets, percussion, loudness\) — 100% coverage$/);
});

test("cooldown descends by measured intensity", () => {
  const tracks = ["a", "b", "c", "d", "e"].map(result);
  const out = sequenceTracks(tracks, planFor("cooldown"), { library: spreadLibrary() });
  assert.deepEqual(idList(out.tracks), ["a", "e", "c", "d", "b"]);
  assert.match(out.applied[0]!, /arc cooldown: ordered by measured pace\/energy proxy/);
});

test("peak rises then relaxes", () => {
  const library: Library = { version: "peak", tracks: [track("p1", 80), track("p2", 100), track("p3", 120), track("p4", 140), track("p5", 160)] };
  const tracks = ["p1", "p2", "p3", "p4", "p5"].map(result);
  const out = sequenceTracks(tracks, planFor("peak"), { library });
  assert.deepEqual(idList(out.tracks), ["p1", "p3", "p5", "p4", "p2"]);
  const bpms = idList(out.tracks).map((id) => ({ p1: 80, p2: 100, p3: 120, p4: 140, p5: 160 })[id]!);
  assert.ok(bpms[1]! > bpms[0]! && bpms[2]! > bpms[1]!, "rises");
  assert.ok(bpms[3]! < bpms[2]! && bpms[4]! < bpms[3]!, "then relaxes");
});

test("wave alternates deterministically (high/low interleave)", () => {
  const library: Library = { version: "wave", tracks: [track("w1", 80), track("w2", 100), track("w3", 120), track("w4", 140)] };
  const tracks = ["w1", "w2", "w3", "w4"].map(result);
  const out = sequenceTracks(tracks, planFor("wave"), { library });
  assert.deepEqual(idList(out.tracks), ["w3", "w1", "w4", "w2"]);
  const bpms = idList(out.tracks).map((id) => ({ w1: 80, w2: 100, w3: 120, w4: 140 })[id]!);
  assert.ok(bpms[0]! > bpms[1]! && bpms[2]! > bpms[3]!, "alternating high/low");
});

// F1 regression (C1 code review): odd measured counts used to drop one track and
// emit `undefined` (→ `null` in resolve payloads → queue build 500). The wave must
// stay a full permutation for n = 1, 3, 5, and the JSON round-trip the resolve
// path performs must never carry a null/undefined entry.
test("wave with odd counts (n = 1, 3, 5) is a full permutation with no undefined", () => {
  const library: Library = {
    version: "wave-odd",
    tracks: [track("w1", 80), track("w2", 100), track("w3", 120), track("w4", 140), track("w5", 160)],
  };
  const expected: Record<number, string[]> = { 1: ["w1"], 3: ["w3", "w1", "w2"], 5: ["w4", "w1", "w5", "w2", "w3"] };
  for (const n of [1, 3, 5]) {
    const input = ["w1", "w2", "w3", "w4", "w5"].slice(0, n).map(result);
    const out = sequenceTracks(input, planFor("wave"), { library });
    const ids = idList(out.tracks);
    assert.equal(out.tracks.length, n, `n=${n}: same length`);
    assert.ok(out.tracks.every((item) => item !== undefined && typeof item.id === "string"), `n=${n}: no undefined entry`);
    assert.deepEqual([...ids].sort(), idList(input).sort(), `n=${n}: same membership (permutation)`);
    assert.deepEqual(ids, expected[n], `n=${n}: deterministic wave order`);
    // The resolve path concept from C1's p5 probe: the list is JSON-serialised and
    // mapped to queue entries — neither step may see null/undefined.
    const roundTripped = JSON.parse(JSON.stringify(out.tracks)) as Array<{ id: string } | null>;
    assert.ok(roundTripped.every((item) => item !== null && typeof item.id === "string"), `n=${n}: JSON round-trip has no null`);
    const queue = roundTripped.map((item) => item!.id);
    assert.equal(new Set(queue).size, n, `n=${n}: queue build keeps every id exactly once`);
  }
});

test("low coverage falls back to the ranked order with an honest note", () => {
  const library: Library = {
    version: "low",
    tracks: [track("k1", 100), track("k2", 120), track("u1", null), track("u2", null), track("u3", null)],
  };
  const tracks = ["k1", "u1", "k2", "u2", "u3"].map(result);
  const out = sequenceTracks(tracks, planFor("build"), { library });
  assert.deepEqual(idList(out.tracks), idList(tracks), "input order unchanged");
  assert.match(out.applied[0]!, /not enough measured pace\/energy data \(40% coverage\) — kept the ranked order/);
});

test("unknown-intensity tracks keep their position; measured tracks fill the rest", () => {
  const library: Library = {
    version: "mixed",
    tracks: [track("k0", 140), track("k1", 120), track("u", null), track("k2", 160), track("k3", 100), track("k4", 80)],
  };
  const tracks = ["k0", "k1", "u", "k2", "k3", "k4"].map(result);
  const out = sequenceTracks(tracks, planFor("build"), { library });
  assert.deepEqual(idList(out.tracks), ["k4", "k3", "u", "k1", "k0", "k2"]);
  assert.match(out.applied[0]!, /83% coverage, 1 track without measurements kept in place/);
});

test("flat (and absent) arcs are a no-op with no notes", () => {
  const tracks = ["a", "b", "c", "d", "e"].map(result);
  const flat = sequenceTracks(tracks, planFor("flat"), { library: spreadLibrary() });
  assert.deepEqual(idList(flat.tracks), idList(tracks));
  assert.deepEqual(flat.applied, []);
  const absent = sequenceTracks(tracks, planFor(), { library: spreadLibrary() });
  assert.deepEqual(idList(absent.tracks), idList(tracks));
  assert.deepEqual(absent.applied, []);
});

test("determinism: repeated calls are deep-equal and every arc keeps the exact membership", () => {
  const tracks = ["a", "b", "c", "d", "e"].map(result);
  for (const arc of ["build", "cooldown", "peak", "wave"] as const) {
    const once = sequenceTracks(tracks, planFor(arc), { library: spreadLibrary() });
    const twice = sequenceTracks(tracks, planFor(arc), { library: spreadLibrary() });
    assert.deepEqual(once, twice, arc);
    // Permutation assertion (the old loop compared outputs to themselves and could
    // not catch a membership violation like F1's dropped track / undefined slot).
    assert.equal(once.tracks.length, tracks.length, `${arc}: same length`);
    assert.ok(once.tracks.every((item) => item !== undefined), `${arc}: no undefined`);
    assert.deepEqual([...idList(once.tracks)].sort(), idList(tracks), `${arc}: same membership`);
  }
});
