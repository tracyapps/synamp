/** Import (LIBRARY-CARE step 5): tag reading, the incoming scan, and the "new music" proposals. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { buildImport, IncomingScanner } from "./import.ts";
import type { IncomingFile, IncomingScan } from "./import.ts";
import { DEFAULT_SETTINGS } from "./organise.ts";
import { readTags } from "./tags.ts";
import type { FileTags } from "./tags.ts";

// --- synthetic files with real tag layouts -------------------------------------------

const syncsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
function id3(major: 3 | 4, frames: Array<[string, Buffer]>): Buffer {
  const body = Buffer.concat(frames.map(([id, data]) => {
    const size = major === 4 ? syncsafe(data.length) : Buffer.from([0, 0, 0, 0].map((_, i) => (data.length >> (24 - 8 * i)) & 0xff));
    return Buffer.concat([Buffer.from(id, "latin1"), size, Buffer.from([0, 0]), data]);
  }));
  const padded = Buffer.concat([body, Buffer.alloc(64)]);
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([major, 0, 0]), syncsafe(padded.length), padded]);
}
const latin1 = (text: string) => Buffer.concat([Buffer.from([0]), Buffer.from(text, "latin1")]);
const utf8 = (text: string) => Buffer.concat([Buffer.from([3]), Buffer.from(text, "utf8")]);
const utf16 = (text: string) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, "utf16le"), Buffer.from([0, 0])]);

function flac(comments: string[]): Buffer {
  const vendor = Buffer.from("test", "utf8");
  const parts = [Buffer.from([vendor.length, 0, 0, 0]), vendor, Buffer.from([comments.length, 0, 0, 0])];
  for (const comment of comments) { const c = Buffer.from(comment, "utf8"); parts.push(Buffer.from([c.length & 0xff, c.length >> 8, 0, 0]), c); }
  const vorbis = Buffer.concat(parts);
  const header = (type: number, length: number, last: boolean) => Buffer.from([(last ? 0x80 : 0) | type, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  return Buffer.concat([Buffer.from("fLaC", "latin1"), header(0, 34, false), Buffer.alloc(34), header(4, vorbis.length, true), vorbis, Buffer.alloc(100)]);
}

function atom(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length + 8);
  return Buffer.concat([size, Buffer.from(type, "latin1"), body]);
}
const data = (flags: number, value: Buffer) => atom("data", Buffer.from([0, 0, 0, flags, 0, 0, 0, 0]), value);
function m4a(items: Buffer[]): Buffer {
  return Buffer.concat([
    atom("ftyp", Buffer.from("M4A \0\0\0\0", "latin1")),
    atom("moov", atom("mvhd", Buffer.alloc(100)), atom("udta", atom("meta", Buffer.alloc(4), atom("hdlr", Buffer.alloc(25)), atom("ilst", ...items)))),
    atom("mdat", Buffer.alloc(200)),
  ]);
}
const pair = (no: number, total: number) => Buffer.from([0, 0, no >> 8, no & 0xff, total >> 8, total & 0xff, 0, 0]);

function tempDir(): string { return mkdtempSync(join(tmpdir(), "synamp-import-")); }
function put(root: string, path: string, content: Buffer | string, ageMs = 120_000): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
  const when = (Date.now() - ageMs) / 1000;
  utimesSync(join(root, path), when, when);
}

test("tags: ID3v2.3 / 2.4 (Latin-1, UTF-8, UTF-16), ID3v1, FLAC, M4A — and junk never throws", () => {
  const dir = tempDir();
  try {
    put(dir, "a.mp3", Buffer.concat([id3(3, [["TIT2", latin1("Gravel")], ["TPE1", latin1("Ani DiFranco")], ["TALB", latin1("Little Plastic Castle")],
      ["TRCK", latin1("3/12")], ["TPOS", latin1("1/1")], ["TYER", latin1("1998")], ["TXXX", latin1("MusicBrainz Album Id\u000011111111-1111-1111-1111-111111111111")]]), Buffer.alloc(500)]));
    assert.deepEqual(readTags(join(dir, "a.mp3")), { title: "Gravel", artist: "Ani DiFranco", album: "Little Plastic Castle", track_no: 3, track_total: 12,
      disc_no: 1, disc_total: 1, year: 1998, mb_albumid: "11111111-1111-1111-1111-111111111111" } satisfies FileTags);
    put(dir, "b.mp3", Buffer.concat([id3(4, [["TIT2", utf8("Björk’s Song")], ["TPE2", utf16("Various Artists")], ["TCMP", latin1("1")], ["TDRC", utf8("2001-05-01")]]), Buffer.alloc(10)]));
    assert.deepEqual(readTags(join(dir, "b.mp3")), { title: "Björk’s Song", album_artist: "Various Artists", compilation: true, year: 2001 });
    const v1 = Buffer.alloc(128);
    v1.write("TAG", 0, "latin1"); v1.write("Old Song", 3, "latin1"); v1.write("Old Band", 33, "latin1"); v1.write("Old Album", 63, "latin1"); v1.write("1987", 93, "latin1"); v1[126] = 5;
    put(dir, "c.mp3", Buffer.concat([Buffer.alloc(300), v1]));
    assert.deepEqual(readTags(join(dir, "c.mp3")), { title: "Old Song", artist: "Old Band", album: "Old Album", year: 1987, track_no: 5 });
    put(dir, "d.flac", flac(["TITLE=Hey You", "ARTIST=Pink Floyd", "ALBUMARTIST=Pink Floyd", "ALBUM=The Wall", "TRACKNUMBER=1", "TRACKTOTAL=13", "DISCNUMBER=2", "DISCTOTAL=2", "DATE=1979-11-30"]));
    assert.deepEqual(readTags(join(dir, "d.flac")), { title: "Hey You", artist: "Pink Floyd", album_artist: "Pink Floyd", album: "The Wall", track_no: 1, track_total: 13, disc_no: 2, disc_total: 2, year: 1979 });
    put(dir, "e.m4a", m4a([atom("©nam", data(1, Buffer.from("Fuel"))), atom("©ART", data(1, Buffer.from("Ani DiFranco"))), atom("aART", data(1, Buffer.from("Ani DiFranco"))),
      atom("©alb", data(1, Buffer.from("Little Plastic Castle"))), atom("trkn", data(0, pair(2, 12))), atom("disk", data(0, pair(1, 1))),
      atom("©day", data(1, Buffer.from("1998-02-17T08:00:00Z"))), atom("cpil", data(21, Buffer.from([0])))]));
    assert.deepEqual(readTags(join(dir, "e.m4a")), { title: "Fuel", artist: "Ani DiFranco", album_artist: "Ani DiFranco", album: "Little Plastic Castle",
      track_no: 2, track_total: 12, disc_no: 1, disc_total: 1, year: 1998, compilation: false });
    put(dir, "junk.mp3", Buffer.from("ID3\u0004\u0000\u0000\u007f\u007f\u007f\u007fnot really", "latin1"));
    put(dir, "junk.m4a", Buffer.from("garbage garbage garbage"));
    put(dir, "junk.flac", Buffer.alloc(0));
    for (const name of ["junk.mp3", "junk.m4a", "junk.flac", "missing.mp3"]) assert.deepEqual(readTags(join(dir, name)), {}, name);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("incoming scan: waits for files still arriving, skips set-asides and dotfiles, caches tags", () => {
  const dir = tempDir();
  try {
    put(dir, "Ani DiFranco/Little Plastic Castle/03 Gravel.mp3", id3(3, [["TIT2", latin1("Gravel")]]));
    put(dir, "Ani DiFranco/Little Plastic Castle/cover.jpg", "art");
    put(dir, "Fresh/Album/01 New.mp3", "x", 1_000);
    put(dir, "_web/abcdef/01 Song.mp3", "x", 0);
    put(dir, "_web/abcdef/02 Half.mp3.synamp-part-1234", "x");
    put(dir, "_duplicates/x/a.mp3", "x");
    put(dir, ".DS_Store", "junk");
    put(dir, "notes.docx", "?");
    const scan = new IncomingScanner(dir).scan();
    assert.deepEqual(scan.files.map((f) => f.path), ["Ani DiFranco/Little Plastic Castle/03 Gravel.mp3", "_web/abcdef/01 Song.mp3"]);
    assert.equal(scan.files[0]!.tags.title, "Gravel");
    assert.equal(scan.arriving, 1);
    assert.equal(scan.ignored, 1);
    assert.equal(scan.set_aside, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const file = (path: string, tags: FileTags, size = 100): IncomingFile => ({ path, size, mtime: 0, tags });
const scanOf = (files: IncomingFile[]): IncomingScan => ({ files, arriving: 0, ignored: 0, set_aside: 0, scanned_at: 0, truncated: false });
const tr = (id: string, path: string, extra: Partial<LibraryTrack> = {}): LibraryTrack => ({ id, path, title: "x", ...extra });
const ctx = { incomingRoot: "/incoming", libraryRoot: "/library", identical: () => undefined };

test("new music: named to the standard, filed beside what's there, gaps filled", () => {
  const library: Library = { version: "1", tracks: [
    tr("1", "Ani DiFranco/Little Plastic Castle (1998)/01 - Little Plastic Castle.mp3"),
    tr("2", "Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3"),
  ] };
  const plan = buildImport(scanOf([
    file("ani/lpc/Gravel.mp3", { title: "Gravel", artist: "Ani Difranco", album: "Little Plastic Castle", track_no: 3, year: 1998 }),
    file("ani/lpc/Fuel.mp3", { title: "Fuel", artist: "Ani Difranco", album: "Little Plastic Castle", track_no: 2, year: 1998 }),
    file("ani/Evolve/01 Promised Land.flac", { title: "Promised Land", artist: "ani difranco", album: "Evolve", year: 2003 }),
    file("Pink Floyd/The Wall (1979)/CD2/01 Hey You.flac", {}),
    file("_web/abc123/Now 42 - Song.mp3", { title: "Song: Part 1", artist: "Someone", album: "Now 42", album_artist: "Various Artists", track_no: 1, year: 1999 }),
    file("_web/abc123/mystery.mp3", {}),
  ]), library, DEFAULT_SETTINGS, ctx);
  const by = (title: string) => plan.find((d) => d.title === title)!;
  const lpc = by("New: Ani Difranco — Little Plastic Castle");
  assert.deepEqual(lpc.moves.map((m) => [m.from, m.to, m.from_area]), [
    ["ani/lpc/Fuel.mp3", "Ani DiFranco/Little Plastic Castle (1998)/02 - Fuel.mp3", "incoming"],
    ["ani/lpc/Gravel.mp3", "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3", "incoming"],
  ], "into the existing folder, existing artist spelling");
  assert.ok(lpc.changes[0]!.includes("fills in the album"));
  assert.deepEqual(lpc.folders, [{ from: "ani/lpc", to: "Ani DiFranco/Little Plastic Castle (1998)", from_area: "incoming" }]);
  const evolve = by("New: ani difranco — Evolve");
  assert.equal(evolve.moves[0]!.to, "Ani DiFranco/Evolve (2003)/01 - Promised Land.flac", "number from the file name; a new folder with the year");
  assert.ok(evolve.changes.some((c) => /already in your library/.test(c)));
  const wall = plan.find((d) => d.title.includes("The Wall"))!;
  assert.equal(wall.title, "New: Pink Floyd — The Wall", "no tags: names from the folders");
  assert.equal(wall.moves[0]!.to, "Pink Floyd/The Wall (1979)/2-01 - Hey You.flac", "disc number from the CD2 folder");
  assert.deepEqual(wall.folders.map((f) => f.from), ["Pink Floyd/The Wall (1979)"]);
  const now = by("New: Various Artists — Now 42");
  assert.equal(now.moves[0]!.to, "Various Artists/Now 42 (1999)/01 - Song - Part 1.mp3");
  assert.deepEqual(now.folders, [], "two albums in one upload: the artwork can't know where it belongs");
  const mystery = plan.find((d) => d.title.includes("Unknown"))!;
  assert.match(mystery.conflicts[0]!, /Can’t tell the artist and album/);
  assert.ok(plan.every((d) => d.kind === "import" && d.id.startsWith("import:")));
});

test("new music: identical copies are set aside (never deleted); other versions kept as (2)", () => {
  const library: Library = { version: "1", tracks: [tr("1", "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3")] };
  const plan = buildImport(scanOf([
    file("again/Gravel.mp3", { title: "Gravel", artist: "Ani DiFranco", album: "Little Plastic Castle", track_no: 3 }),
    file("again/Gravel live.mp3", { title: "Gravel", artist: "Ani DiFranco", album: "Little Plastic Castle", track_no: 3 }),
  ]), library, DEFAULT_SETTINGS, {
    ...ctx, identical: (path: string) => (path === "again/Gravel.mp3" ? "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3" : undefined),
  });
  const [decision] = plan;
  assert.deepEqual(decision!.moves.map((m) => [m.from, m.to, m.to_area ?? "library"]), [
    ["again/Gravel live.mp3", "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel (2).mp3", "library"],
    ["again/Gravel.mp3", "_duplicates/again/Gravel.mp3", "incoming"],
  ]);
  assert.ok(decision!.changes.some((c) => /set aside/.test(c)));
  assert.ok(decision!.changes.some((c) => /kept as “\(2\)”/.test(c)));
});

test("new music: one album uploaded as loose files still takes its artwork along", () => {
  const plan = buildImport(scanOf([file("_web/up1/a.mp3", { title: "A", artist: "X", album: "Y", track_no: 1 })]), { version: "1", tracks: [] }, DEFAULT_SETTINGS, ctx);
  assert.deepEqual(plan[0]!.folders, [{ from: "_web/up1", to: "X/Y", from_area: "incoming" }]);
});
