import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dueArtists, enrichArtist, GalaxyMbStore, mbRelationEdges, RECHECK_AFTER_MS } from "./galaxy-mb.ts";
import { MusicBrainz } from "./musicbrainz.ts";
import type { MbArtist, MbRelation } from "./musicbrainz.ts";
import { galaxyMap, galaxyNameKeys } from "./galaxy.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { artistKey } from "./naming.ts";

const song = (id: string, artist: string, path = `${artist}/Album/${id}.mp3`): LibraryTrack => ({ id, title: id, artist, path });
const fixture: Library = { version: "mb-fixture", tracks: [
  song("a1", "Astral Crew"), song("a2", "Astral Crew"),
  song("b1", "Beacon"), song("c1", "Comet Tale"), song("d1", "Driftwood"),
] };

/** A MusicBrainz that answers from canned data — no network, no waiting. */
function fakeMb(artists: Record<string, MbArtist[]>, relations: Record<string, MbRelation[]>) {
  return {
    searchArtists: async (name: string) => artists[name] ?? [],
    artistRelations: async (mbid: string) => relations[mbid] ?? [],
  } as unknown as MusicBrainz;
}

test("galaxy-mb store persists by normalised name and reports due artists by priority", () => {
  const dir = join(tmpdir(), `galaxy-mb-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "galaxy-mb.json");
  const store = new GalaxyMbStore(path);
  const now = Date.now();
  store.set({ name: "astral crew", status: "matched", checked_at: now, relations: [] }); // normalises to Astral Crew
  assert.equal(store.byName("Astral Crew")?.name, "astral crew");
  store.set({ name: "Beacon", status: "matched", checked_at: now, relations: [] });
  const names = [{ name: "Astral Crew", priority: 1 }, { name: "Beacon", priority: 5 }, { name: "Comet Tale", priority: 3 }];
  assert.deepEqual(dueArtists(names, store, now).map(entry => entry.name), ["Comet Tale"]); // fresh ones are not due
  const stale = new GalaxyMbStore(path);
  stale.set({ name: "Astral Crew", status: "matched", checked_at: now - RECHECK_AFTER_MS - 1, relations: [] });
  stale.set({ name: "Beacon", status: "error", checked_at: now - 2 * 86_400_000, relations: [] });
  assert.deepEqual(dueArtists(names, stale, now).map(entry => entry.name), ["Beacon", "Comet Tale", "Astral Crew"]); // errors retry sooner, then priority order
  assert.equal(new GalaxyMbStore(path).byName("Beacon")?.status, "error"); // reload keeps state
  rmSync(dir, { recursive: true, force: true });
});

test("galaxy-mb enrichArtist: seed wins, search must be unambiguous, only musical relations survive", async () => {
  const crew = { id: "11111111-1111-1111-1111-111111111111", name: "Astral Crew", score: 100 };
  const mb = fakeMb(
    { "Astral Crew": [crew], "Driftwood": [{ id: "22222222-2222-2222-2222-222222222222", name: "Driftwood", score: 95 }, { id: "33333333-3333-3333-3333-333333333333", name: "Driftwood", disambiguation: "another one", score: 95 }] },
    {
      [crew.id]: [
        { type: "collaborator", direction: "forward", mbid: "44444444-4444-4444-4444-444444444444", name: "Comet Tale" },
        { type: "member of", direction: "forward", mbid: "55555555-5555-5555-5555-555555555555", name: "Beacon" },
        { type: "married", direction: "forward", mbid: "66666666-6666-6666-6666-666666666666", name: "Someone" },
        { type: "teacher", direction: "forward", mbid: "77777777-7777-7777-7777-777777777777", name: "Mentor" },
      ],
    },
  );
  const seeded = await enrichArtist("Astral Crew", mb, { mbid: "seeded", name: "Astral Crew" });
  assert.equal(seeded.status, "matched"); assert.equal(seeded.mbid, "seeded"); assert.equal(seeded.relations.length, 0);
  const searched = await enrichArtist("Astral Crew", mb, undefined);
  assert.equal(searched.mbid, crew.id);
  assert.deepEqual(searched.relations.map(relation => [relation.target, relation.type]), [["Comet Tale", "collaborator"], ["Beacon", "band member"]]);
  assert.equal((await enrichArtist("Driftwood", mb, undefined)).status, "ambiguous"); // two same-name candidates: no guess
  assert.equal((await enrichArtist("Nobody", mb, undefined)).status, "not_found");
});

test("galaxy-mb relations become edges only between library artists, pair-normalised", () => {
  const dir = join(tmpdir(), `galaxy-mb-edges-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const store = new GalaxyMbStore(join(dir, "galaxy-mb.json"));
  store.set({ name: "Astral Crew", status: "matched", checked_at: Date.now(),
    relations: [
      { target: "Comet Tale", type: "collaborator", mbid: "44444444-4444-4444-4444-444444444444" }, // in library
      { target: "Not In Library", type: "collaborator", mbid: "88888888-8888-8888-8888-888888888888" }, // dropped
      { target: "astral crew", type: "collaborator", mbid: "11111111-1111-1111-1111-111111111111" }, // self, dropped
    ] });
  store.set({ name: "Driftwood", status: "ambiguous", checked_at: Date.now(), relations: [] }); // not matched: skipped
  const nameKeys = galaxyNameKeys(fixture);
  const edges = mbRelationEdges(store, nameKeys, artistKey);
  const crew = nameKeys.get(artistKey("Astral Crew"))!;
  const comet = nameKeys.get(artistKey("Comet Tale"))!;
  assert.deepEqual(edges, [{ a: crew < comet ? crew : comet, b: crew < comet ? comet : crew, type: "collaborator" }]);
  rmSync(dir, { recursive: true, force: true });
});

test("galaxy map merges MusicBrainz edges: corroboration keeps counts, standalone links carry zero songs", () => {
  const lib: Library = { version: "mb-merge", tracks: [
    song("a1", "Astral Crew"), song("a2", "Astral Crew"),
    song("b1", "Beacon feat. Astral Crew"), song("c1", "Comet Tale"),
  ] };
  const base = galaxyMap(lib);
  const crew = base.artists.find(artist => artist.name === "Astral Crew")!.key;
  const beacon = base.artists.find(artist => artist.name === "Beacon")!.key;
  const comet = base.artists.find(artist => artist.name === "Comet Tale")!.key;
  const merged = galaxyMap({ ...lib, version: "mb-merge-2" }, undefined, { revision: 1, edges: [
    { a: beacon, b: crew, type: "collaborator" },
    { a: crew, b: comet, type: "band member" },
  ] });
  const pair = (a: string, b: string) => merged.edges.find(edge => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
  const corroborated = pair(beacon, crew)!;
  assert.equal(corroborated.tracks, 1); assert.equal(corroborated.credit, true); assert.equal(corroborated.mb, "collaborator");
  const standalone = pair(crew, comet)!;
  assert.equal(standalone.tracks, 0); assert.equal(standalone.credit, undefined); assert.equal(standalone.mb, "band member");
  // Credit-only edges stay exactly as they were.
  const plain = galaxyMap(lib);
  assert.deepEqual(plain.edges.map(edge => edge.credit), [true]);
});
