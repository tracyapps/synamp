/**
 * C1 probe 5 — wave-bug integration repro through PlaylistStore.resolve (the same
 * surface index.ts uses for GET /playlists/:id/resolve and the session queue build).
 *
 * Writes only to a fresh mkdtemp dir under /tmp; never touches repo or dev data.
 * Run: node --experimental-strip-types p5-wave-integration.mts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaylistStore } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/playlists.ts";
import { evaluatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";
import { sequenceTracks } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/sequence.ts";
import { validatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/plan.ts";
import type { Library, LibraryTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";

const mk = (id: string, bpm: number): LibraryTrack => ({ id, title: id, artist: `Band ${id}`, signals: { bpm, tempo_confidence: 0.9, onset_rate: 4, percussiveness: 0.5, lufs_integrated: -14 } });
const library: Library = { version: "t", tracks: [mk("one", 100), mk("two", 120), mk("three", 140)] }; // 3 measured → odd

const checked = validatePlan({
  version: "2.0", intent: { query_type: "attribute" }, target_size: 10,
  constraints: [{ id: "c1", source_phrase: "x", hard: false, weight: 0.5, unknown_policy: "include", confidence: 0.6, where: { field: "lufs_integrated", op: "gte", value: -70 } }],
  ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  sequencing: { arc: "wave" },
});
if (!checked.ok) { console.log("plan invalid:", JSON.stringify(checked.errors)); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), "c1-wave-repro-"));
try {
  const store = new PlaylistStore(join(dir, "playlists.json"), {
    // Mirrors index.ts evaluateSaved→applySequencing: re-validate, evaluate, sequence, hand out strict.
    resolveSmart: (plan, _hash, playlistId) => {
      const re = validatePlan(plan);
      if (!re.ok) throw new Error("stored plan invalid");
      const evaluation = evaluatePlan(re, library, { playlistId });
      return sequenceTracks(evaluation.strict, re.plan, { library }).tracks as never;
    },
  });
  const node = store.create({ name: "wave test", type: "smart", plan: checked.plan } as never);
  const tracks = store.resolve(node.id) as Array<{ id: string } | undefined>;
  console.log("resolved tracks:", JSON.stringify(tracks.map((t) => t?.id ?? null)));
  console.log("contains undefined:", tracks.some((t) => t === undefined));
  console.log("GET /resolve payload would serialize as:", JSON.stringify({ tracks: tracks.map((t) => (t === undefined ? null : t.id)) }));

  try {
    const queue = tracks.slice(0, 2000).map((track, rank) => ({ rank, track_id: track!.id })); // replaceQueue's mapping
    console.log("queue build ok (unexpected):", JSON.stringify(queue));
  } catch (error) {
    console.log("queue build CRASHES:", (error as Error).name + ": " + (error as Error).message);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
