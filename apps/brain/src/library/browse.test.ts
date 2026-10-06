import { test } from "node:test";
import assert from "node:assert/strict";
import { albumTracks, fold, listAlbums, searchTracks, shuffled } from "./browse.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

const t = (id: string, path: string, extra: Partial<LibraryTrack> = {}): LibraryTrack => ({ id, title: id, path, ...extra });
const library = (version: string, tracks: LibraryTrack[]): Library => ({ version, tracks });

const LIB = library("v1", [
  t("Dreams", "Fleetwood Mac/Rumours (1977)/02 - Dreams.mp3", { artist: "Fleetwood Mac", album: "Rumours", year: 1977, track_no: 2, duration_s: 257 }),
  t("Second Hand News", "Fleetwood Mac/Rumours (1977)/01 - Second Hand News.mp3", { artist: "Fleetwood Mac", album: "Rumours", year: 1977, track_no: 1, duration_s: 163 }),
  t("Pagan Poetry", "Björk/Vespertine (2001)/05 - Pagan Poetry.mp3", { artist: "Björk", album: "Vespertine", year: 2001, track_no: 5 }),
  t("Hidden Place", "Björk/Vespertine (2001)/01 - Hidden Place.mp3", { artist: "Björk", album: "Vespertine", year: 2001, track_no: 1 }),
  t("Come Together", "The Beatles/Abbey Road (1969)/01 - Come Together.mp3", { artist: "The Beatles", album: "Abbey Road", year: 1969, track_no: 1 }),
  t("Something", "The Beatles/Abbey Road (1969)/CD1/02 - Something.mp3", { artist: "The Beatles", album: "Abbey Road", year: 1969, track_no: 2 }),
]);

test("fold drops accents, case and punctuation", () => {
  assert.equal(fold("Björk — Pagan Poetry!"), "bjork pagan poetry");
  assert.equal(fold("Simon & Garfunkel"), "simon and garfunkel");
});

test("albums sort by artist (ignoring 'The'), then year; title and year sorts work", () => {
  assert.deepEqual(listAlbums(LIB).albums.map((a) => a.title), ["Abbey Road", "Vespertine", "Rumours"]);
  assert.deepEqual(listAlbums(LIB, { sort: "title" }).albums.map((a) => a.title), ["Abbey Road", "Rumours", "Vespertine"]);
  assert.deepEqual(listAlbums(LIB, { sort: "year" }).albums.map((a) => a.year), [2001, 1977, 1969]);
});

test("album search matches every word across title, artist and year, accents ignored", () => {
  assert.deepEqual(listAlbums(LIB, { q: "bjork" }).albums.map((a) => a.title), ["Vespertine"]);
  assert.deepEqual(listAlbums(LIB, { q: "fleetwood 1977" }).albums.map((a) => a.title), ["Rumours"]);
  assert.equal(listAlbums(LIB, { q: "fleetwood 2001" }).total, 0);
});

test("album paging and summary", () => {
  const page = listAlbums(LIB, { offset: 1, limit: 1 });
  assert.equal(page.total, 3);
  assert.equal(page.albums.length, 1);
  const rumours = listAlbums(LIB, { q: "rumours" }).albums[0]!;
  assert.equal(rumours.tracks, 2);
  assert.equal(rumours.duration_s, 420);
});

test("an album's tracks come back in play order; disc folders fold into the album", () => {
  assert.deepEqual(albumTracks(LIB, "Fleetwood Mac/Rumours (1977)").tracks.map((x) => x.id), ["Second Hand News", "Dreams"]);
  assert.deepEqual(albumTracks(LIB, "The Beatles/Abbey Road (1969)").tracks.map((x) => x.id), ["Come Together", "Something"]);
  assert.throws(() => albumTracks(LIB, "Nobody/Nothing"), /isn't in the library/);
});

test("track search ranks title matches first and needs every word", () => {
  const found = searchTracks(LIB, "something");
  assert.deepEqual(found.tracks.map((x) => x.id), ["Something"]);
  const beatles = searchTracks(LIB, "beatles");
  assert.equal(beatles.total, 2);
  const mixed = searchTracks(library("v2", [
    t("Song About Dreams", "a/b/1.mp3", { artist: "X", album: "Dreams" }),
    t("Other", "a/b/2.mp3", { artist: "Dreams Band" }),
    t("Dreams", "a/b/3.mp3", { artist: "Y" }),
  ]), "dreams");
  assert.deepEqual(mixed.tracks.map((x) => x.id), ["Dreams", "Song About Dreams", "Other"]);
  assert.equal(searchTracks(LIB, "  ").total, 0);
});

test("shuffled keeps every item and leaves the input alone", () => {
  const input = [1, 2, 3, 4, 5];
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = shuffled(input, random);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.notDeepEqual(out, input);
});
