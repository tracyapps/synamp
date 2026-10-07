/** Scratch check of current wave behavior — runs against repo code read-only. */
import { sequenceTracks } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/sequence.ts";
import { validatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/plan.ts";
import type { Library, LibraryTrack, ResultTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";

const mk = (id: string, bpm: number): LibraryTrack => ({ id, title: id, signals: { bpm, tempo_confidence: 0.9 } });
const rt = (id: string): ResultTrack => ({ id, title: id, score: 0, channels: [], reasons: [], unverified: [] });

const checked = validatePlan({
  version: "2.0", intent: { query_type: "attribute" }, target_size: 10,
  constraints: [{ id: "c1", source_phrase: "x", hard: false, weight: 0.5, unknown_policy: "include", confidence: 0.6, where: { field: "lufs_integrated", op: "gte", value: -70 } }],
  ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  sequencing: { arc: "wave" },
});
if (!checked.ok) { console.log("invalid", checked.errors); process.exit(2); }

// Case 1: w1..w4 ascending like the repo test (80,100,120,140)
{
  const lib: Library = { version: "t", tracks: [mk("w1", 80), mk("w2", 100), mk("w3", 120), mk("w4", 140)] };
  const out = sequenceTracks(["w1", "w2", "w3", "w4"].map(rt), checked.plan, { library: lib });
  console.log("even n=4 ascending fixture -> [" + out.tracks.map((t: any) => t?.id ?? "UNDEFINED").join(", ") + "]");
}
// Case 2: a..e ascending 100..180, n=1..5
{
  const lib: Library = { version: "t", tracks: [mk("a", 100), mk("b", 120), mk("c", 140), mk("d", 160), mk("e", 180)] };
  for (const n of [1, 2, 3, 4, 5]) {
    const out = sequenceTracks(["a", "b", "c", "d", "e"].slice(0, n).map(rt), checked.plan, { library: lib });
    console.log(`n=${n} -> [` + out.tracks.map((t: any) => t?.id ?? "UNDEFINED").join(", ") + `] len=${out.tracks.length}`);
  }
}
// Case 3: shuffled input order, n=5 (intensity order b<d<c<e<a)
{
  const lib: Library = { version: "t", tracks: [mk("a", 150), mk("b", 90), mk("c", 120), mk("d", 105), mk("e", 135)] };
  for (const n of [1, 3, 5]) {
    const out = sequenceTracks(["a", "b", "c", "d", "e"].slice(0, n).map(rt), checked.plan, { library: lib });
    console.log(`shuffled n=${n} -> [` + out.tracks.map((t: any) => t?.id ?? "UNDEFINED").join(", ") + `] len=${out.tracks.length}`);
  }
}
