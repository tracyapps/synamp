/** The Library list grouped into collapsible sections, and what a selection in it means. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { exploreSections, pickRows, SEP } from "./explore.ts";
import type { SectionElement } from "./explore.ts";
import { ExplorerSelections } from "./explorer-selection.ts";
import type { Library } from "../query/evaluate.ts";

const t = (id: string, artist: string, album: string, year: number, genre: string[] = []) =>
  ({ id, title: `Song ${id}`, artist, album_artist: artist, album, year, genre, path: `${artist}/${album} (${year})/${id}.flac` });
const lib: Library = { version: "sections", tracks: [
  t("a1", "Ani DiFranco", "Little Plastic Castle", 1998, ["Folk"]),
  t("a2", "Ani DiFranco", "Little Plastic Castle", 1998, ["Folk"]),
  t("a3", "Ani DiFranco", "Up Up Up Up Up Up", 1999, ["Folk"]),
  t("b1", "Björk", "Post", 1995, ["Pop", "Electronic"]),
  t("e1", "Brian Eno", "Music for Airports", 1978, ["Ambient"]),
  { id: "x1", title: "Mystery", artist: "Nobody", path: "Nobody/Untitled/x1.flac" },
] };

const describe = (rows: SectionElement[]) => rows.map((row) => row.type === "group" ? `${"  ".repeat(row.level)}[${row.open ? "-" : "+"}] ${row.label} (${row.count})`
  : row.type === "chunk" ? `    chunk ${row.items.map((item) => item.title).join(", ")}` : `    ${row.title}`);

test("groups start closed: just the headers with their counts, Unknown last", () => {
  const result = exploreSections(lib, { types: "song", group: "decade", sections: "1" });
  assert.deepEqual(describe(result.rows), ["[+] 1970s (1)", "[+] 1990s (4)", "[+] Unknown (1)"]);
  assert.equal(result.items_total, 6);
  assert.equal(result.total, 3, "the list is three lines long while everything is closed");
});

test("opening a group (and a sub-group) shows what's inside, in the list's order", () => {
  const open = JSON.stringify(["1990s", `1990s${SEP}Ani DiFranco`]);
  const result = exploreSections(lib, { types: "song", group: "decade", group2: "album_artist", sections: "1", open, sort: "title" });
  assert.deepEqual(describe(result.rows), [
    "[+] 1970s (1)",
    "[-] 1990s (4)",
    "  [-] Ani DiFranco (3)", "    Song a1", "    Song a2", "    Song a3",
    "  [+] Björk (1)",
    "[+] Unknown (1)",
  ]);
  const items = result.rows.filter((row) => row.type === "song") as Array<{ path: string }>;
  assert.ok(items.every((item) => item.path === `1990s${SEP}Ani DiFranco`), "each row says which group it's in");
});

test("Expand all opens everything; then the list names the ones closed again", () => {
  const all = exploreSections(lib, { types: "album", group: "decade", sections: "1", expand: "all" });
  assert.equal(all.rows.filter((row) => row.type === "group").length, 3);
  assert.equal(all.rows.filter((row) => row.type === "album").length, 5);
  const oneClosed = exploreSections(lib, { types: "album", group: "decade", sections: "1", expand: "all", open: JSON.stringify(["1990s"]) });
  assert.deepEqual(describe(oneClosed.rows).filter((line) => line.startsWith("[")), ["[-] 1970s (1)", "[+] 1990s (3)", "[-] Unknown (1)"]);
});

test("a song with two genres is in both groups; the grid gets rows of cards", () => {
  const result = exploreSections(lib, { types: "song", group: "genre", sections: "1", expand: "all", chunk: "2" });
  const lines = describe(result.rows);
  assert.ok(lines.includes("[-] Electronic (1)") && lines.includes("[-] Pop (1)"));
  assert.deepEqual(lines.slice(lines.indexOf("[-] Folk (3)") + 1, lines.indexOf("[-] Folk (3)") + 3), ["    chunk Song a1, Song a2", "    chunk Song a3"]);
});

test("no grouping: the plain list, in chunks or not", () => {
  assert.equal(exploreSections(lib, { types: "song", sections: "1" }).total, 6);
  assert.equal(exploreSections(lib, { types: "song", sections: "1", chunk: "4" }).total, 2);
  assert.throws(() => exploreSections(lib, { types: "song", group: "decade", group2: "decade", sections: "1" }), /two different/);
  assert.throws(() => exploreSections(lib, { types: "song", sections: "1", open: "nope" }), /open groups/);
});

test("a selection: whole groups minus what's unticked inside, plus single rows, each once", () => {
  const options = { types: "song", group: "decade", group2: "album_artist", sort: "title" };
  const ani = `1990s${SEP}Ani DiFranco`;
  const rows = pickRows(lib, options, { groups: [ani], items: ["song:e1", "song:a1"], excluded: [`${ani}\u0001song:a2`] });
  assert.deepEqual(rows.map((row) => row.key), ["a1", "a3", "e1"]);
  assert.deepEqual(pickRows(lib, options, { groups: ["1990s"] }).map((row) => row.key), ["a1", "a2", "a3", "b1"], "a top group takes its sub-groups");
  assert.deepEqual(pickRows(lib, options, { groups: ["1990s"], excluded: [`${ani}\u0001*`] }).map((row) => row.key), ["b1"], "a sub-group unticked inside a ticked group");
  assert.deepEqual(pickRows(lib, options, { all: true, excluded: ["1970s\u0001*", `${ani}\u0001song:a3`] }).map((row) => row.key), ["x1", "a1", "a2", "b1"], "everything (in the list's order), minus what's unticked");
  assert.deepEqual(pickRows(lib, { types: "song" }, { all: true, excluded: ["\u0001song:x1"] }).length, 5, "ungrouped: everything but one");
  assert.throws(() => pickRows(lib, options, { groups: "1990s" }), /Invalid groups/);
});

test("a picked selection becomes songs: albums and artists bring their songs, in order", () => {
  const selections = new ExplorerSelections();
  const albums = selections.pick(lib, { types: "album" }, { items: ["album:Ani DiFranco/Up Up Up Up Up Up (1999)", "album:Björk/Post (1995)"] });
  assert.equal(albums.track_count, 2);
  assert.equal(albums.album_count, 2);
  const receipt = selections.get(albums.selection_id);
  assert.deepEqual(receipt.tracks.map((track) => track.id), ["a3", "b1"]);
  assert.deepEqual(receipt.rows!.map((row) => row.type), ["album", "album"]);
  const artist = selections.pick(lib, { types: "artist" }, { items: ["artist:ani difranco"] });
  assert.deepEqual(selections.get(artist.selection_id).tracks.map((track) => track.id), ["a1", "a2", "a3"]);
  assert.throws(() => selections.get("nope"), /too old/);
});
