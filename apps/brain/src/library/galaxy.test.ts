import { test } from "node:test";
import assert from "node:assert/strict";
import { galaxy, galaxyArtist, galaxyRandom } from "./galaxy.ts";
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
