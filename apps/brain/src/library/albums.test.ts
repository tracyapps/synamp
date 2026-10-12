import { test } from "node:test";
import assert from "node:assert/strict";
import { albumCredit, groupAlbums } from "./albums.ts";
import type { LibraryTrack } from "../query/evaluate.ts";

const t = (n: number, folder: string, extra: Partial<LibraryTrack> = {}): LibraryTrack =>
  ({ id: `${folder}#${n}`, title: `Song ${n}`, path: `${folder}/${String(n).padStart(2, "0")} - Song ${n}.mp3`, ...extra });

test("a compilation isn't credited to the few songs that carry their own album-artist tag", () => {
  // The real case: a 486-song folder from 251 artists, 33 songs with album-artist tags, the biggest group just 2.
  const folder = "Various Artists/The 90's (1994)";
  const tracks = Array.from({ length: 40 }, (_, i) => t(i + 1, folder, {
    artist: `Artist ${i % 20}`,
    ...(i < 2 ? { album_artist: "Naughty by Nature" } : i < 8 ? { album_artist: `Artist ${i}` } : {}),
  }));
  assert.equal(albumCredit(folder, tracks), "Various Artists");
  assert.equal(groupAlbums({ version: "v", tracks })[0]!.artist, "Various Artists");
});

test("a mixed folder outside a compilations folder is still Various Artists", () => {
  const folder = "Mixes/Summer";
  const tracks = Array.from({ length: 6 }, (_, i) => t(i + 1, folder, { artist: `Artist ${i}`, ...(i === 0 ? { album_artist: "Artist 0" } : {}) }));
  assert.equal(albumCredit(folder, tracks), "Various Artists");
});

test("album-artist tags that agree still win, even when only some songs have them", () => {
  const folder = "Kanye West/Graduation (2007)";
  const tracks = Array.from({ length: 12 }, (_, i) => t(i + 1, folder, {
    artist: i % 2 ? "Kanye West" : `Kanye West feat. Guest ${i}`,
    ...(i < 4 ? { album_artist: "Kanye West" } : {}),
  }));
  assert.equal(albumCredit(folder, tracks), "Kanye West");
});

test("a fully tagged album keeps its album artist; 'VA' tags read as Various Artists", () => {
  const folder = "Björk/Vespertine (2001)";
  assert.equal(albumCredit(folder, [1, 2, 3].map((n) => t(n, folder, { artist: "Björk", album_artist: "Björk" }))), "Björk");
  const va = "Compilations/Lost in Iceland";
  assert.equal(albumCredit(va, [1, 2, 3].map((n) => t(n, va, { artist: `A${n}`, album_artist: "VA" }))), "Various Artists");
});

test("without album-artist tags: the main artist, then the folder", () => {
  const folder = "Fleetwood Mac/Rumours (1977)";
  assert.equal(albumCredit(folder, [1, 2, 3].map((n) => t(n, folder, { artist: "Fleetwood Mac" }))), "Fleetwood Mac");
  assert.equal(albumCredit(folder, [t(1, folder)]), "Fleetwood Mac");
});

test("grouping is worked out once per library list", () => {
  const folder = "Fleetwood Mac/Rumours (1977)";
  const lib = { version: "v1", tracks: [1, 2].map((n) => t(n, folder, { artist: "Fleetwood Mac" })) };
  assert.equal(groupAlbums(lib), groupAlbums(lib));
  const changed = { version: "v2", tracks: [...lib.tracks, t(3, folder, { artist: "Fleetwood Mac" })] };
  assert.equal(groupAlbums(changed)[0]!.tracks.length, 3);
});
