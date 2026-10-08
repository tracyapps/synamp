import { test } from "node:test";
import assert from "node:assert/strict";
import { explore } from "./explore.ts";
import type { Library } from "../query/evaluate.ts";

const lib: Library = { version: "explore-fixture", tracks: [
  { id: "a", path: "2Pac/Mix/01.mp3", title: "Changes", artist: "2Pac feat. Jodeci", album_artist: "2Pac", album: "Mix", year: 2003, genre: ["Hip-Hop"], duration_s: 60 },
  { id: "b", path: "2Pac/Mix/02.mp3", title: "Other", artist: "2Pac feat. Scarface", album_artist: "2Pac", album: "Mix", year: 2003, duration_s: 90 },
  { id: "c", path: "Björk/Debut/01.mp3", title: "Human Behaviour", artist: "Björk", album: "Debut", year: 1993, genre: ["Pop", "Electronic"] },
  { id: "d", path: "Soundtracks/Mix/01.mp3", title: "Theme", artist: "Other Band", album_artist: "Various Artists", album: "Mix" },
  { id: "loose", title: "Loose song", artist: "AC/DC" },
] };

test("album identity keeps folders separate but searches every track credit", () => {
  const result = explore(lib, { types: "album", q: "jodeci" });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0]!.count, 2);
  assert.equal(result.rows[0]!.artist, "2Pac");
  assert.equal(explore(lib, { types: "album", q: "Mix" }).total, 2);
});
test("all entity types include loose songs and artist summaries keep full credits separate", () => {
  assert.equal(explore(lib, { types: "song" }).total, 5);
  const artists = explore(lib, { types: "artist" }).rows;
  assert(artists.some(row => row.title === "AC/DC"));
  assert(artists.some(row => row.title === "2Pac feat. Jodeci"));
  assert(!artists.some(row => row.title === "DC"));
});
test("exact matching is normalized whole field, glob is anchored with literal punctuation", () => {
  assert.equal(explore(lib, { types: "song", q: "bjork", mode: "exact" }).total, 1);
  assert.equal(explore(lib, { types: "song", q: "jodeci", mode: "exact" }).total, 0);
  assert.equal(explore(lib, { types: "song", q: "2pac feat.*", mode: "glob" }).total, 2);
  assert.equal(explore(lib, { types: "song", q: "AC/DC", mode: "glob" }).total, 1);
  assert.equal(explore(lib, { types: "song", q: "[.*", mode: "glob" }).total, 0);
});
test("fuzzy matching catches bounded misspellings without broad short-token guesses", () => {
  assert.equal(explore(lib, { types: "song", q: "bjorkk", mode: "fuzzy" }).total, 1);
  assert.equal(explore(lib, { types: "song", q: "cat", mode: "fuzzy" }).total, 0);
});
test("AND/OR rule logic and exclusions have explicit semantics", () => {
  const rules = JSON.stringify([{ field: "artist", value: "2pac", mode: "contains" }, { field: "title", value: "Theme", mode: "exact" }]);
  assert.equal(explore(lib, { types: "song", rules, logic: "and" }).total, 0);
  assert.equal(explore(lib, { types: "song", rules, logic: "or" }).total, 3);
  const exclude = JSON.stringify([{ field: "artist", value: "2pac", mode: "contains", not: true }]);
  assert.equal(explore(lib, { types: "song", rules: exclude }).total, 3);
});
test("year range always intersects text logic, excludes missing dates, validates bounds", () => {
  assert.equal(explore(lib, { types: "song", from: "1990", to: "2000" }).total, 1);
  assert.throws(() => explore(lib, { from: "2000", to: "1990" }), /range/);
  assert.throws(() => explore(lib, { from: "oops" }), /year/);
});
test("group totals cover all matches before paging; multi-genre memberships are explicit", () => {
  const result = explore(lib, { types: "song", group: "album_artist", limit: "1" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.groups.find(g => g.label === "2Pac")!.count, 2);
  const genre = explore(lib, { types: "song", group: "genre" });
  assert.equal(genre.total, 5);
  assert.equal(genre.groups.reduce((sum, g) => sum + g.count, 0), 6);
  assert.equal(explore(lib, { types: "song", group: "genre", group_key: "Electronic" }).total, 1);
});
test("sort and pagination are deterministic and bounded", () => {
  assert.equal(explore(lib, { types: "album", sort: "count", direction: "desc" }).rows[0]!.count, 2);
  assert.equal(explore(lib, { types: "song", offset: "2", limit: "1" }).rows.length, 1);
  assert.throws(() => explore(lib, { offset: "NaN" }), /offset/);
  assert.throws(() => explore(lib, { types: "planet" }), /type/);
  assert.equal(explore(lib, { types: "" }).total, 0);
});
test("every table field sorts globally in both directions before pagination", () => {
  for (const sort of ["title", "type", "artist", "album_artist", "album", "year", "count", "duration", "genre"]) {
    for (const direction of ["asc", "desc"]) {
      const all = explore(lib, { types: "song,album,artist", sort, direction, limit: "200" }).rows;
      assert.deepEqual(explore(lib, { types: "song,album,artist", sort, direction, offset: "2", limit: "2" }).rows, all.slice(2, 4));
    }
  }
  assert.equal(explore(lib, { types: "song", sort: "album", direction: "asc" }).rows[0]!.key, "c");
  assert.equal(explore(lib, { types: "song", sort: "album_artist", direction: "desc" }).rows[0]!.key, "d");
  assert.equal(explore(lib, { types: "song", sort: "genre", direction: "asc" }).rows[0]!.key, "a");
});
test("missing dates and durations sort last in either direction", () => {
  for (const direction of ["asc", "desc"]) {
    const years = explore(lib, { types: "song", sort: "year", direction }).rows;
    assert(years.slice(0, 3).every(row => row.year));
    assert(years.slice(3).every(row => row.year === undefined));
    const duration = explore(lib, { types: "song", sort: "duration", direction }).rows;
    assert(duration.slice(0, 2).every(row => row.duration_s));
    assert(duration.slice(2).every(row => row.duration_s === undefined));
  }
  const aggregate = explore(lib, { types: "album,artist", sort: "duration", direction: "asc" }).rows;
  assert.equal(aggregate[0]!.duration_s, 60);
  assert(aggregate.filter(row => row.title === "Debut" || row.title === "Björk").every(row => row.duration_s === undefined));
});
test("invalid rules fail plainly and never become an unrestricted search", () => {
  assert.throws(() => explore(lib, { rules: "bad" }), /rules/);
  assert.throws(() => explore(lib, { rules: '[{"field":"password","value":"x"}]' }), /field/);
  assert.throws(() => explore(lib, { rules: '[{"field":"artist","value":"x","not":"false"}]' }), /not/);
});
test("year text stays searchable and non-Latin queries never collapse to empty", () => {
  assert.equal(explore(lib, { types: "song", q: "2pac 2003" }).total, 2);
  assert.equal(explore(lib, { types: "song", q: "你好" }).total, 0);
  assert.equal(explore({ version: "unicode", tracks: [{ id: "z", title: "你好 世界" }] }, { types: "song", q: "你好" }).total, 1);
});
test("wildcards cannot create regex backtracking and ? matches one Unicode character", () => {
  const long: Library = { version: "long-glob", tracks: [{ id: "e", title: "a".repeat(2000) }, { id: "emoji", title: "🌙" }] };
  assert.equal(explore(long, { types: "song", q: "*a".repeat(60) + "b", mode: "glob" }).total, 0);
  assert.equal(explore(long, { types: "song", q: "?", mode: "glob" }).total, 1);
});

test("long lists: pages of one view line up exactly, and a changed library or filter is never served from memory", () => {
  const many: Library = { version: "many-1", tracks: Array.from({ length: 450 }, (_, i) => ({
    id: `m${i}`, title: `Song ${String(i).padStart(3, "0")}`, artist: `Artist ${i % 7}`, album: `Album ${i % 30}`, path: `A${i % 7}/B${i % 30}/${i}.mp3`, year: 1990 + (i % 20),
  })) };
  const options = { types: "song", sort: "title" };
  const all = explore(many, { ...options, limit: "200" }).rows.concat(explore(many, { ...options, offset: "200", limit: "200" }).rows, explore(many, { ...options, offset: "400", limit: "200" }).rows);
  assert.equal(all.length, 450);
  assert.equal(new Set(all.map((row) => row.key)).size, 450, "no row twice, none missing");
  assert.deepEqual(all.slice(0, 2).map((row) => row.title), ["Song 000", "Song 001"]);
  assert.equal(explore(many, { ...options, direction: "desc", limit: "1" }).rows[0]!.title, "Song 449", "another sort is its own list");
  assert.equal(explore(many, { ...options, q: "Song 44", limit: "200" }).total, 14, "044, 144, 244, 344 and 440–449");
  const changed: Library = { version: "many-2", tracks: many.tracks.slice(0, 10) };
  assert.equal(explore(changed, options).total, 10, "a new library is filtered afresh");
});
