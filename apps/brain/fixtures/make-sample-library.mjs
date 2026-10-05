// Regenerates fixtures/library.sample.json — a SYNTHETIC library for exercising
// smart playlists before the analyzer → brain export exists.
//
//   node apps/brain/fixtures/make-sample-library.mjs
//
// Every artist, album and title is invented. Values are drawn from a seeded
// generator, so the file is reproducible. Roughly a fifth of tracks leave the
// "declared" fields (voice, instruments, mood) unmeasured on purpose, because a
// real library will be partly analysed and the UI has to show that honestly.

import { writeFileSync } from "node:fs";

let seed = 20261001;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (list) => list[Math.floor(rand() * list.length)];
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const between = (low, high) => low + rand() * (high - low);

const ARTISTS = [
  ["Lumen Atlas", ["ambient", "electronic"], { arousal: 0.45, piano: 0.1, vocal: 0.03, bpm: 112 }],
  ["Quiet Harbor", ["ambient"], { arousal: 0.2, piano: 0.75, vocal: 0.02, bpm: 70 }],
  ["Paper Satellites", ["indie", "rock"], { arousal: 0.65, piano: 0.15, vocal: 0.6, bpm: 128 }],
  ["Marigold Unit", ["electronic", "techno"], { arousal: 0.75, piano: 0.05, vocal: 0.05, bpm: 124 }],
  ["The Low Fences", ["country", "folk"], { arousal: 0.4, piano: 0.2, vocal: 0.7, bpm: 96 }],
  ["Static Orchard", ["punk"], { arousal: 0.9, piano: 0.02, vocal: 0.65, bpm: 170 }],
  ["Vera Okonkwo Trio", ["jazz"], { arousal: 0.45, piano: 0.85, vocal: 0.0, bpm: 104 }],
  ["Halftone Weather", [], { arousal: 0.55, piano: 0.12, vocal: 0.04, bpm: 100 }],
  ["Glass Canal", ["soundtrack"], { arousal: 0.35, piano: 0.35, vocal: 0.01, bpm: 88 }],
  ["Northbound Choir", ["gospel"], { arousal: 0.5, piano: 0.4, vocal: 0.9, bpm: 92 }],
  ["Copper Lanterns", ["lo-fi"], { arousal: 0.38, piano: 0.3, vocal: 0.02, bpm: 84 }],
  ["Kite Theory", ["electronic"], { arousal: 0.6, piano: 0.08, vocal: 0.08, bpm: 118 }],
];
const WORDS = ["Harbor", "Signal", "Lanterns", "Drift", "Engine", "Paper", "Echo", "Northern", "Glass", "Static", "Morning",
  "Circuit", "Field", "Tide", "Window", "Orbit", "Quiet", "Ember", "Meridian", "Copper", "Lattice", "Hollow", "Velvet", "Thread"];

const tracks = [];
let n = 0;
for (const [artist, genre, base] of ARTISTS) {
  const albums = [`${pick(WORDS)} ${pick(WORDS)}`, `${pick(WORDS)} Sessions`];
  const centre = Array.from({ length: 8 }, () => between(-1, 1));
  for (let i = 0; i < 5; i++) {
    n++;
    const partial = rand() < 0.2; // voice / instrument / semantic stages not run yet
    const tracked = rand() > 0.15;
    const timed = tracked && rand() > 0.3;
    const vocal = Math.min(1, Math.max(0, base.vocal + between(-0.08, 0.12)));
    const arousal = Math.min(1, Math.max(0, base.arousal + between(-0.15, 0.15)));
    const bpm = round(base.bpm + between(-10, 10), 1);
    tracks.push({
      id: `sample-${String(n).padStart(3, "0")}`,
      title: `${pick(WORDS)} ${pick(WORDS)}`,
      artist,
      album: albums[i < 3 ? 0 : 1],
      ...(genre.length && rand() > 0.15 ? { genre } : {}),
      year: 1995 + Math.floor(rand() * 30),
      duration_s: Math.round(between(150, 420)),
      beat_status: tracked ? "tracked" : "insufficient_pulse_evidence",
      timing_status: tracked ? (timed ? "measured_relative_to_fitted_grid" : "unstable_reference") : "no_reliable_grid",
      signals: {
        bpm,
        tempo_confidence: round(between(0.4, 0.95)),
        pulse_clarity: round(Math.min(1, Math.max(0, arousal * 0.6 + between(0.05, 0.35)))),
        onset_rate: round(between(1, 6)),
        percussiveness: round(between(0.1, 0.8)),
        lufs_integrated: round(between(-20, -7), 1),
        loudness_range: round(between(3, 14), 1),
        crest_factor: round(between(8, 20), 1),
        microtiming_signed: timed ? round(between(-12, 12), 1) : null,
        microtiming_tightness: timed ? round(between(4, 25), 1) : null,
        ...(partial ? {} : {
          vocal_fraction: round(vocal),
          instrumental: round(Math.min(1, Math.max(0, 1 - vocal * 1.3 + between(-0.05, 0.05)))),
          "instruments.piano": round(Math.min(1, Math.max(0, base.piano + between(-0.15, 0.15)))),
          "instruments.synthesizer": round(between(0, 0.9)),
          arousal: round(arousal),
          valence: round(between(0.2, 0.8)),
          ...(rand() > 0.5 ? { mood: arousal < 0.33 ? "relaxing" : arousal > 0.7 ? "party" : pick(["happy", "melancholic", "dark", "uplifting"]) } : {}),
        }),
      },
      embedding: centre.map((value) => round(value + between(-0.35, 0.35), 3)),
    });
  }
}

const out = new URL("./library.sample.json", import.meta.url);
writeFileSync(out, JSON.stringify({
  _note: "SYNTHETIC sample library (invented artists and values). Regenerate with make-sample-library.mjs. Not evidence about real music.",
  tracks,
}, null, 1) + "\n");
console.log(`wrote ${tracks.length} tracks to ${out.pathname}`);
