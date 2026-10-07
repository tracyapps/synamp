/** Minimal repro: wave arc with an odd number of measured tracks. */
import { sequenceTracks } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/sequence.ts";
import { validatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/plan.ts";
import type { Library, LibraryTrack, ResultTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";

const mk = (id: string, bpm: number): LibraryTrack => ({ id, title: id, signals: { bpm, tempo_confidence: 0.9, onset_rate: 4, percussiveness: 0.5, lufs_integrated: -14 } });
const lib: Library = { version: "t", tracks: [mk("a", 100), mk("b", 120), mk("c", 140), mk("d", 160), mk("e", 180)] };
const rt = (id: string): ResultTrack => ({ id, title: id, score: 0, channels: ["filter"], reasons: [], unverified: [] });

const checked = validatePlan({
  version: "2.0", intent: { query_type: "attribute" }, target_size: 10,
  constraints: [{ id: "c1", source_phrase: "x", hard: false, weight: 0.5, unknown_policy: "include", confidence: 0.6, where: { field: "lufs_integrated", op: "gte", value: -70 } }],
  ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  sequencing: { arc: "wave" },
});
if (!checked.ok) { console.log("plan invalid", checked.errors); process.exit(2); }

for (const n of [1, 2, 3, 4, 5]) {
  const tracks = ["a", "b", "c", "d", "e"].slice(0, n).map(rt);
  const out = sequenceTracks(tracks, checked.plan, { library: lib });
  const ids = out.tracks.map((t) => (t as ResultTrack | undefined)?.id ?? "UNDEFINED");
  const hasUndefined = ids.includes("UNDEFINED");
  console.log(`n=${n} → [${ids.join(", ")}]${hasUndefined ? "   <-- BROKEN: undefined entry, length " + ids.length : "   (permutation ok)"}`);
}
const three = ["a", "b", "c"].map(rt);
const out3 = sequenceTracks(three, checked.plan, { library: lib });
console.log("JSON of n=3 output:", JSON.stringify(out3.tracks.map((t) => t?.id ?? null)));
console.log("applied:", out3.applied);
