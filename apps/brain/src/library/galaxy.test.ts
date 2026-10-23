import { test } from "node:test";
import assert from "node:assert/strict";
import { galaxy, galaxyArtist, galaxyMap, galaxyRandom } from "./galaxy.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

const song = (id: string, artist: string, path = `${artist}/Album/${id}.mp3`, extra: Partial<LibraryTrack> = {}): LibraryTrack => ({ id, title: id, artist, path, ...extra });
const fixture: Library = { version: "galaxy-fixture", tracks: [
  song("solo", "2Pac", "2Pac/Shared/02.mp3", { track_no: 2 }),
  song("collab", "2Pac feat. Jodeci", "2Pac feat. Jodeci/Shared/01.mp3", { track_no: 1 }),
  song("band", "Earth, Wind & Fire"), song("acdc", "AC/DC"), song("joint", "Simon and Garfunkel"),
  song("root", "2Pac", "Loose.mp3"), song("guest", "Someone else", "2Pac/Shared/01.mp3"),
] };

test("Galaxy groups only explicit featured-credit candidates, retains punctuation band identities and source folders", () => {
  const found = galaxy(fixture);
  assert.equal(found.total, 5);
  const pac = found.nodes.find(node => node.name === "2Pac")!;
  assert.equal(pac.tracks, 3); assert.equal(pac.albums, 2); assert.equal(pac.parsed_credit, true);
  assert.deepEqual(pac.raw_credits, ["2Pac", "2Pac feat. Jodeci"]);
  assert.ok(found.nodes.some(node => node.name === "Earth, Wind & Fire"));
  assert.ok(found.nodes.some(node => node.name === "AC/DC"));
  assert.ok(found.nodes.some(node => node.name === "Simon and Garfunkel"));
  const details = galaxyArtist(fixture, pac.key);
  assert.equal(details.albums.length, 2); assert.deepEqual(details.loose_tracks.map(track => track.id), ["root"]);
  const base = details.albums.find(album => album.key === "2Pac/Shared")!;
  assert.equal(base.total_tracks, 2); assert.equal(base.tracks, 1);
  assert.deepEqual(base.matching_tracks.map(track => track.id), ["solo"]);
  assert.equal(details.truncated, false);
});

test("Galaxy search spans full artist pool and raw featured credits, random reaches artists beyond first page", () => {
  const lib: Library = { version: "many", tracks: Array.from({ length: 350 }, (_, i) => song(`song${i}`, `Artist ${String(i).padStart(3, "0")}`)) };
  assert.equal(galaxy(lib, { limit: 1000 }).nodes.length, 100);
  const random = galaxyRandom(lib, {}, () => 349 / 350);
  assert.equal(random.total, 350); assert.equal(random.node?.name, "Artist 349");
  assert.equal(galaxy(lib, { q: "Artist 349", limit: 1 }).nodes[0]?.name, "Artist 349");
  assert.equal(galaxyRandom(lib, { q: "349" }, () => 0).node?.name, "Artist 349");
  assert.equal(galaxyRandom(lib, { q: "nonexistent" }).node, null);
  assert.equal(galaxy(fixture, { q: "jodeci" }).nodes[0]?.name, "2Pac");
});

test("Galaxy sort count, finite bounds and same-version independent library isolation", () => {
  assert.equal(galaxy(fixture, { sort: "count", limit: NaN, offset: NaN }).nodes[0]?.name, "2Pac");
  const other = { version: fixture.version, tracks: [song("other", "Björk")] };
  assert.equal(galaxy(other, { q: "bjork" }).nodes[0]?.name, "Björk");
  assert.throws(() => galaxyArtist(other, "missing"), { status: 404 });
});

test("Galaxy map aggregates grouping facets, averages signals, and keeps band names whole", () => {
  const lib: Library = { version: "map-fixture", tracks: [
    song("a1", "Astral Crew", "Astral Crew/Set/01.mp3", { genre: ["rock"], year: 1991, signals: { bpm: 100, valence: .2, arousal: .3 } }),
    song("a2", "Astral Crew", "Astral Crew/Set/02.mp3", { genre: ["rock", "live"], year: 1993, signals: { bpm: 110, valence: .4, arousal: .5 } }),
    song("a3", "Astral Crew", "Astral Crew/Set/03.mp3", { genre: ["rock"], year: 1993 }),
    song("b1", "Beacon", "Beacon/Set/01.mp3", { genre: ["jazz"], year: 2004 }),
    song("z1", "50 Blessings", "50 Blessings/Set/01.mp3", { year: 1985 }),
    song("u1", "Untitled", "Loose.mp3"),
  ] };
  const map = galaxyMap(lib);
  assert.equal(map.total_tracks, 6); assert.equal(map.version, "map-fixture");
  const astral = map.artists.find(node => node.name === "Astral Crew")!;
  assert.equal(astral.tracks, 3); assert.equal(astral.albums, 1);
  assert.deepEqual(astral.genres, ["rock", "live"]);
  assert.equal(astral.decade, 1990); assert.equal(astral.year_first, 1991); assert.equal(astral.year_last, 1993);
  assert.equal(astral.letter, "A");
  assert.deepEqual(astral.signals, { bpm: 105, valence: .3, arousal: .4 });
  assert.equal(map.artists.find(node => node.name === "50 Blessings")!.letter, "#");
  const untitled = map.artists.find(node => node.name === "Untitled")!;
  assert.equal(untitled.decade, undefined); assert.equal(untitled.genres.length, 0); assert.equal(untitled.signals, undefined);
});

test("Galaxy map builds collaboration edges from featured credits and promotes repeat guests only", () => {
  const lib: Library = { version: "web-fixture", tracks: [
    song("v1", "Vela Nine", "Vela Nine/Set/01.mp3"),
    song("c1", "Beacon feat. Vela Nine", "Beacon/Set/01.mp3"),
    song("c2", "Beacon ft. Vela Nine & Ilo Karu", "Beacon/Set/02.mp3"),
    song("c3", "Beacon feat. Ilo Karu", "Beacon/Set/03.mp3"),
    song("c4", "Beacon feat. One-Hit Guest", "Beacon/Set/04.mp3"),
    song("c5", "Beacon featuring Vela Nine (Remix)", "Beacon/Set/05.mp3"),
    song("d1", "Deputy feat. Ilo Karu", "Deputy/Set/01.mp3"),
  ] };
  const map = galaxyMap(lib);
  const beacon = map.artists.find(node => node.name === "Beacon")!;
  const vela = map.artists.find(node => node.name === "Vela Nine")!;
  const ilo = map.artists.find(node => node.name === "Ilo Karu");
  const pair = (a: string, b: string) => map.edges.find(edge => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
  assert.equal(pair(beacon.key, vela.key)?.tracks, 3);
  assert.ok(ilo?.guest); assert.equal(ilo?.appearances, 3);
  assert.equal(pair(beacon.key, ilo!.key)?.tracks, 2);
  assert.equal(pair(map.artists.find(node => node.name === "Deputy")!.key, ilo!.key)?.tracks, 1);
  assert.equal(map.artists.some(node => node.name === "One-Hit Guest"), false);
  assert.equal(map.edges.some(edge => edge.a === ilo!.key && edge.b === ilo!.key), false);
  // The planet list still reports the raw credits without inventing artists.
  assert.equal(galaxy(lib, { q: "vela" }).nodes[0]?.name, "Beacon");
});

test("Galaxy map credits keep whole band names when the guest matches a lead artist exactly", () => {
  const lib: Library = { version: "band-guest", tracks: [
    song("e1", "Earth, Wind & Fire", "Earth, Wind & Fire/Set/01.mp3"),
    song("e2", "Benson feat. Earth, Wind & Fire", "Benson/Set/01.mp3"),
  ] };
  const map = galaxyMap(lib);
  const benson = map.artists.find(node => node.name === "Benson")!;
  const ewf = map.artists.find(node => node.name === "Earth, Wind & Fire")!;
  assert.ok(map.edges.some(edge => (edge.a === benson.key && edge.b === ewf.key) || (edge.a === ewf.key && edge.b === benson.key)));
  assert.equal(map.artists.some(node => node.name === "Earth" || node.name === "Fire"), false);
});

test("Galaxy caps detail track payload and reports truncation while retaining full file counts", () => {
  const lib = { version: "large-artist", tracks: Array.from({ length: 2003 }, (_, i) => song(String(i), "One Artist")) };
  const node = galaxy(lib).nodes[0]!; const detail = galaxyArtist(lib, node.key);
  assert.equal(node.tracks, 2003); assert.equal(detail.albums[0]?.tracks, 2003);
  assert.equal(detail.albums[0]?.matching_tracks.length, 2000); assert.equal(detail.truncated, true);
});

test("Unicode artist searches retain their script, reject oversized searches, and leave raw identities separate", () => {
  const lib: Library = { version: "unicode", tracks: [song("a", "你好"), song("b", "Other"), song("c", "Björk"), song("d", "Bjork")] };
  assert.deepEqual(galaxy(lib, { q: "你好" }).nodes.map(node => node.name), ["你好"]);
  assert.equal(galaxy(lib, { q: "陌生" }).total, 0);
  assert.equal(galaxyRandom(lib, { q: "陌生" }).node, null);
  assert.equal(galaxy(lib, { q: "bjork" }).total, 2);
  assert.throws(() => galaxy(lib, { q: "a".repeat(161) }), { status: 400 });
  assert.throws(() => galaxyRandom(lib, { q: "a".repeat(161) }), { status: 400 });
});
