/* H1 edge sweep — post-fix behaviors for adjacent cases. */
import { interpretGoal } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/intent/interpret.ts";
import type { Library, LibraryTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";

function fixtureLibrary(): Library {
  const tracks: LibraryTrack[] = [];
  for (let i = 0; i < 8; i++) {
    tracks.push({ id: `t${i + 1}`, title: `Track ${i + 1}`, signals: {
      bpm: 70 + i * 10, tempo_confidence: 0.8, onset_rate: 1 + i, percussiveness: 0.2 + i * 0.08,
      lufs_integrated: -22 + i * 2, loudness_range: 3 + i, spectral_centroid: 800 + i * 400,
      spectral_flatness: 0.1 + i * 0.05, pulse_clarity: 0.4 + i * 0.05, beat_interval_cv: 0.02 + i * 0.005,
      dynamic_complexity: 3 + i, vocal_fraction: 0.02, instrumental: 0.95, arousal: 0.3 + i * 0.05,
      valence: 0.5, danceability: 0.5,
    } });
  }
  return { version: "intent-fixture", tracks };
}
const library = fixtureLibrary();

const cases = [
  "relax after my workout",
  "I left my keys in the house",
  "play some house",
  "cleaning house",
  "house work and laundry",
  "dance then sleep",
  "focus then chores",
  "throwback but nothing too loud",
];

for (const text of cases) {
  const out = interpretGoal(text, { library });
  const chosen = out.chosen_index >= 0 ? out.readings[out.chosen_index]! : undefined;
  const plan = chosen?.plan as { constraints?: Array<{ id: string; where?: { value?: unknown } }>; sequencing?: { arc?: string } } | undefined;
  console.log(`\n=== ${JSON.stringify(text)} ===`);
  console.log("accuracy:", out.accuracy, "| readings:", out.readings.map((r) => r.label).join(" | ") || "(none)");
  console.log("ids:", plan?.constraints?.map((c) => c.id).join(", ") ?? "(none)");
  const gh = plan?.constraints?.find((c) => c.id === "genre_hint");
  if (gh) console.log("genre_hint value:", JSON.stringify(gh.where?.value));
  console.log("arc:", plan?.sequencing?.arc ?? "(none)");
  console.log("asks:", JSON.stringify(out.asks.map((a) => a.ask)));
}
