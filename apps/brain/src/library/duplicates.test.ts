/** Duplicate-blocked merges: "same recording?", "which copy is better?", and the plan that sets one aside. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { betterCopy, describeQuality, pairKey, sameRecording, sketchDistance } from "./duplicates.ts";
import { buildPlan, DEFAULT_SETTINGS, OrganiseStore } from "./organise.ts";

/** A deterministic pseudo-random sketch, and a copy with a few bits flipped (another encode of the same audio). */
function sketchValues(seed: number, n = 48): Uint32Array {
  const out = new Uint32Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x; }
  return out;
}
const encode = (values: Uint32Array, start = 240) => {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buffer.writeUInt32LE(v, i * 4));
  return `cp1:${start}:${buffer.toString("base64")}`;
};
const noisy = (values: Uint32Array, flipsPerValue: number) => values.map((v, i) => {
  let out = v;
  for (let b = 0; b < flipsPerValue; b++) out ^= 1 << ((i * 7 + b * 11) % 32);
  return out >>> 0;
});
const shifted = (values: Uint32Array, by: number) => { const out = new Uint32Array(values.length); for (let i = 0; i < values.length; i++) out[i] = values[(i + by) % values.length]!; return out; };

const A = sketchValues(42), B = sketchValues(7);
function track(id: string, path: string, extra: Partial<LibraryTrack> = {}): LibraryTrack {
  return { id, path, title: path.split("/").pop()!.replace(/^\d+ - |\.\w+$/g, ""), metadata_source: "tags", duration_s: 200, ...extra };
}
const lib = (tracks: LibraryTrack[]): Library => ({ version: "1", tracks });
const flac = { format: "flac", lossless: true, bit_depth: 16, sample_rate: 44100 };
const mp3 = (kbps: number) => ({ format: "mp3", lossless: false, bitrate_kbps: kbps });

test("sketches: same recording is close, a different one is far, small shifts are found", () => {
  assert.equal(sketchDistance(encode(A), encode(A)), 0);
  assert.ok(sketchDistance(encode(A), encode(noisy(A, 2)))! < 0.1);
  assert.ok(sketchDistance(encode(A), encode(B))! > 0.35);
  assert.ok(sketchDistance(encode(A), encode(shifted(A, 3)))! < 0.01, "an encoder delay of a few frames lines up");
  assert.equal(sketchDistance(encode(A), "nonsense"), undefined);
  assert.equal(sketchDistance(undefined, encode(A)), undefined);
});

test("same recording: identical audio, or matching sketch and length — otherwise not certain", () => {
  const base = track("a", "x/a.flac", { fp_sketch: encode(A) });
  assert.deepEqual(sameRecording(track("a", "x", { audio_hash: "h" }), track("b", "y", { audio_hash: "h", duration_s: 999 })), { same: true, how: "identical" });
  const twin = sameRecording(base, track("b", "y/a.mp3", { fp_sketch: encode(noisy(A, 2)), duration_s: 201 }));
  assert.equal(twin.same, true);
  assert.equal(twin.same && twin.how, "recording");
  assert.deepEqual(sameRecording(base, track("b", "y", { fp_sketch: encode(A), duration_s: 260 })), { same: false, why: "lengths differ by 60 s" }, "a live take with the same intro");
  assert.deepEqual(sameRecording(base, track("b", "y", { fp_sketch: encode(B) })), { same: false, why: "a different recording" });
  assert.equal(sameRecording(track("a", "x"), track("b", "y")).same, false, "nothing analysed: never guessed");
  assert.match((sameRecording(base, track("b", "y")) as { why: string }).why, /isn’t fingerprinted yet/);
  const noLength = sameRecording(track("a", "x", { fp_sketch: encode(A), duration_s: undefined }), track("b", "y", { fp_sketch: encode(A), duration_s: undefined }));
  assert.equal(noLength.same, false);
  assert.equal(sameRecording(track("a", "x", { fp_sketch: encode(A), duration_s: undefined, audio_duration_s: 200.4 }), track("b", "y", { fp_sketch: encode(A) })).same, true, "the decoded length stands in");
});

test("better copy: lossless, then resolution, then bitrate, then tags; a tie keeps the copy already there", () => {
  const there = track("r", "r.mp3", { quality: mp3(320) });
  assert.equal(betterCopy(there, track("n", "n.flac", { quality: flac })).keep.id, "n");
  assert.equal(betterCopy(track("r", "r.flac", { quality: { ...flac, bit_depth: 24, sample_rate: 96000 } }), track("n", "n.flac", { quality: flac })).keep.id, "r");
  assert.equal(betterCopy(there, track("n", "n.mp3", { quality: mp3(128) })).keep.id, "r");
  assert.equal(betterCopy(track("r", "r.mp3", { quality: mp3(320), metadata_source: "path" }), track("n", "n.mp3", { quality: mp3(320), artist: "A", album: "B", year: 1999 })).keep.id, "n");
  const tie = betterCopy(there, track("n", "n.mp3", { quality: mp3(320) }));
  assert.equal(tie.keep.id, "r");
  assert.match(tie.why, /already there stays/);
  assert.match(betterCopy(there, track("n", "n.flac", { quality: flac })).why, /FLAC, 16-bit 44\.1 kHz, lossless beats MP3, 320 kbps, lossy/);
  assert.equal(describeQuality(undefined), "unknown format");
  assert.equal(pairKey(there, tie.aside), pairKey(tie.aside, there), "either way round");
});

test("plan: a merge blocked by the same recording keeps the better copy and sets the other aside", () => {
  const library = lib([
    track("k1", "Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3", { track_no: 1, year: 1996, artist: "Ani DiFranco", audio_hash: "h1", quality: mp3(192) }),
    track("k2", "DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3", { track_no: 1, year: 1996, artist: "Ani DiFranco", audio_hash: "h1", quality: mp3(192) }),
    track("k3", "Ani DiFranco/Dilate (1996)/02 - Outta Me, Onto You.flac", { track_no: 2, year: 1996, artist: "Ani DiFranco", fp_sketch: encode(A), quality: flac }),
    track("k4", "DiFranco, Ani/Dilate (1996)/02 - Outta Me, Onto You.flac", { track_no: 2, year: 1996, artist: "Ani DiFranco", fp_sketch: encode(noisy(A, 1)), quality: { ...flac, bit_depth: 24, sample_rate: 96000 } }),
    track("k5", "Ani DiFranco/Dilate (1996)/03 - Amazing Grace.mp3", { track_no: 3, year: 1996, artist: "Ani DiFranco" }),
    track("k6", "DiFranco, Ani/Dilate (1996)/03 - Amazing Grace.mp3", { track_no: 3, year: 1996, artist: "Ani DiFranco" }),
  ]);
  const merge = buildPlan(library, {}, DEFAULT_SETTINGS).find((d) => d.kind === "artist")!;
  // Identical twin: the one already there stays; the arriving copy goes aside.
  // A 24-bit FLAC arrives: the 16-bit copy already there goes aside first, then the better one takes its place.
  assert.deepEqual(merge.moves.map((m) => [m.from, m.to, m.to_area ?? ""]), [
    ["DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3", "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3", "incoming"],
    ["Ani DiFranco/Dilate (1996)/02 - Outta Me, Onto You.flac", "_duplicates/Ani DiFranco/Dilate (1996)/02 - Outta Me, Onto You.flac", "incoming"],
    ["DiFranco, Ani/Dilate (1996)/02 - Outta Me, Onto You.flac", "Ani DiFranco/Dilate (1996)/02 - Outta Me, Onto You.flac", ""],
  ]);
  assert.equal(merge.duplicates!.length, 2);
  assert.deepEqual(merge.duplicates!.map((d) => [d.how, d.keep.id, d.aside.id, d.chosen_by]), [["identical", "k1", "k2", "SynAmp"], ["recording", "k4", "k3", "SynAmp"]]);
  // Not analysed: still a conflict, and it says why.
  assert.deepEqual(merge.conflicts, ["“Ani DiFranco/Dilate (1996)/03 - Amazing Grace.mp3” already exists (not analysed yet, so SynAmp can’t tell)"]);
  assert.ok(merge.changes.some((c) => /2 duplicate copies .*incoming\/_duplicates \(not deleted\)/.test(c)));

  // Turned off: back to plain conflicts.
  const off = buildPlan(library, {}, { ...DEFAULT_SETTINGS, set_aside_duplicates: false }).find((d) => d.kind === "artist")!;
  assert.equal(off.conflicts.length, 3);
  assert.equal(off.duplicates, undefined);

  // "Keep this one instead": the 16-bit copy stays, the 24-bit one goes aside; the revision changes so it must be approved again.
  const pair = merge.duplicates![1]!.pair;
  const chosen = buildPlan(library, {}, DEFAULT_SETTINGS, { [pair]: "k3" }).find((d) => d.kind === "artist")!;
  assert.deepEqual(chosen.duplicates![1]!.keep.id, "k3");
  assert.equal(chosen.duplicates![1]!.chosen_by, "you");
  assert.ok(chosen.moves.some((m) => m.from === "DiFranco, Ani/Dilate (1996)/02 - Outta Me, Onto You.flac" && m.to_area === "incoming"));
  assert.notEqual(chosen.rev, merge.rev);
});

test("plan: two copies of one recording in one album folder — the better keeps the name, no “(2)”", () => {
  const library = lib([
    // "Dreams 1.mp3" sorts first and claims the name; the better "Dreams.mp3" then takes it over.
    track("t1", "Fleetwood Mac/Rumours/Dreams.mp3", { track_no: 2, year: 1977, title: "Dreams", fp_sketch: encode(A), quality: mp3(320) }),
    track("t2", "Fleetwood Mac/Rumours/Dreams 1.mp3", { track_no: 2, year: 1977, title: "Dreams", fp_sketch: encode(noisy(A, 1)), quality: mp3(128) }),
    track("t3", "Fleetwood Mac/Rumours/Songbird.mp3", { track_no: 10, year: 1977, title: "Songbird" }),
    track("t4", "Fleetwood Mac/Rumours/Songbird 1.mp3", { track_no: 10, year: 1977, title: "Songbird" }),
  ]);
  const album = buildPlan(library, {}, DEFAULT_SETTINGS).find((d) => d.kind === "album")!;
  const to = Object.fromEntries(album.moves.map((m) => [m.from, `${m.to_area ? `${m.to_area}/` : ""}${m.to}`]));
  assert.equal(to["Fleetwood Mac/Rumours/Dreams 1.mp3"], "incoming/_duplicates/Fleetwood Mac/Rumours/Dreams 1.mp3");
  assert.equal(to["Fleetwood Mac/Rumours/Dreams.mp3"], "Fleetwood Mac/Rumours (1977)/02 - Dreams.mp3");
  // Not analysed: kept side by side as before.
  assert.equal(to["Fleetwood Mac/Rumours/Songbird 1.mp3"], "Fleetwood Mac/Rumours (1977)/10 - Songbird.mp3");
  assert.equal(to["Fleetwood Mac/Rumours/Songbird.mp3"], "Fleetwood Mac/Rumours (1977)/10 - Songbird (2).mp3");
  assert.equal(album.moves[0]!.to_area, "incoming", "set-asides go first");
  assert.equal(album.duplicates!.length, 1);
});

test("store: a keep choice is saved, checked and can be forgotten", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-dupes-"));
  try {
    const store = new OrganiseStore(join(dir, "organise.json"));
    assert.throws(() => store.choose("nope", "k1"), /pair key/);
    assert.throws(() => store.choose("0123456789abcdef", 5), /track ID/);
    store.choose("0123456789abcdef", "k1");
    assert.deepEqual(new OrganiseStore(join(dir, "organise.json")).choices, { "0123456789abcdef": "k1" }, "survives a restart");
    store.choose("0123456789abcdef", null);
    assert.deepEqual(store.choices, {});
    assert.equal(DEFAULT_SETTINGS.set_aside_duplicates, true);
    assert.equal(store.setSettings({ set_aside_duplicates: false }).set_aside_duplicates, false);
    assert.throws(() => store.setSettings({ set_aside_duplicates: "yes" }), /true or false/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
