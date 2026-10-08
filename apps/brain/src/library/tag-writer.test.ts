/** Writing song details: only the details change; cover art, other frames and the audio stay byte for byte. */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { test } from "node:test";
import { readTags } from "./tags.ts";
import { join, rewrite, sha256, splitParts, TagWriteError } from "./tag-writer.ts";

const syncsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
function frame(id: string, body: Buffer, major = 3): Buffer {
  const header = Buffer.alloc(10);
  header.write(id, 0, "latin1");
  if (major === 4) syncsafe(body.length).copy(header, 4); else header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}
const text = (value: string) => Buffer.concat([Buffer.from([0]), Buffer.from(value, "latin1")]);
function id3(frames: Buffer[], major = 3, padding = 200, flags = 0): Buffer {
  const body = Buffer.concat([...frames, Buffer.alloc(padding)]);
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, major, 0, flags]), syncsafe(body.length), body]);
}
function v1(title: string, track: number): Buffer {
  const tag = Buffer.alloc(128);
  tag.write("TAG", 0, "latin1"); tag.write(title, 3, "latin1"); tag[126] = track;
  return tag;
}
const audio = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), randomBytes(40_000)]);
const cover = frame("APIC", Buffer.concat([Buffer.from([0]), Buffer.from("image/jpeg\0", "latin1"), Buffer.from([3, 0]), randomBytes(5000)]));
const private_ = frame("PRIV", Buffer.concat([Buffer.from("WM/Provider\0", "latin1"), randomBytes(30)]));
const comment = frame("COMM", Buffer.concat([Buffer.from([0]), Buffer.from("eng\0Ripped by me", "latin1")]));

function tagsOf(bytes: Buffer, name: string) {
  const dir = mkdtempSync(joinPath(tmpdir(), "synamp-tags-"));
  try { const file = joinPath(dir, name); writeFileSync(file, bytes); return readTags(file); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test("MP3 (ID3v2.3): changes only the asked-for details, keeps cover art, other frames, ID3v1 in step and the audio", () => {
  const original = Buffer.concat([id3([frame("TIT2", text("Untitled")), frame("TPE1", text("Ani DiFranco")), frame("TRCK", text("3/12")), cover, private_, comment]), audio, v1("Untitled", 3)]);
  const parts = rewrite(original, "mp3", { title: "Gravel", track_no: 4, album: "Little Plastic Castle", year: 1998 });
  const written = join(parts);
  assert.equal(sha256(splitParts(written, "mp3").audio), sha256(audio), "audio untouched");
  assert.equal(parts.head.length, splitParts(original, "mp3").head.length, "fits in the old tag's padding: same size, audio where it was");
  for (const keep of [cover, private_, comment]) assert.ok(written.includes(keep), "kept byte for byte");
  const tags = tagsOf(written, "a.mp3");
  assert.equal(tags.title, "Gravel");
  assert.equal(tags.artist, "Ani DiFranco");
  assert.equal(tags.album, "Little Plastic Castle");
  assert.equal(tags.track_no, 4);
  assert.equal(tags.track_total, 12, "the total that was there stays");
  assert.equal(tags.year, 1998);
  assert.equal(splitParts(written, "mp3").tail.toString("latin1", 3, 9), "Gravel", "ID3v1 updated too");
  // Undo: the old tag parts plus the (identical) audio make the original again.
  const old = splitParts(original, "mp3");
  assert.ok(join({ ...old, audio: splitParts(written, "mp3").audio }).equals(original));
});

test("MP3: text beyond Latin-1, a new tag when there was none, a bigger tag when it doesn't fit, ID3v2.4", () => {
  const bare = Buffer.concat([audio]);
  const fresh = join(rewrite(bare, "mp3", { title: "Jóga — 坂本", artist: "Björk" }));
  assert.deepEqual([tagsOf(fresh, "b.mp3").title, tagsOf(fresh, "b.mp3").artist], ["Jóga — 坂本", "Björk"]);
  assert.equal(sha256(splitParts(fresh, "mp3").audio), sha256(audio));
  const tight = Buffer.concat([id3([frame("TIT2", text("x"))], 3, 0), audio]);
  const grown = join(rewrite(tight, "mp3", { album: "A much longer album title than there was room for" }));
  assert.equal(tagsOf(grown, "c.mp3").album, "A much longer album title than there was room for");
  assert.equal(tagsOf(grown, "c.mp3").title, "x");
  const v24 = Buffer.concat([id3([frame("TIT2", text("Old"), 4), frame("TDRC", text("2001"), 4)], 4), audio]);
  const out = join(rewrite(v24, "mp3", { title: "Ünïcode", year: 2002 }));
  assert.equal(out[3], 4, "stays ID3v2.4");
  assert.deepEqual([tagsOf(out, "d.mp3").title, tagsOf(out, "d.mp3").year], ["Ünïcode", 2002]);
});

test("MP3: tags SynAmp can't rebuild safely are refused, never guessed at", () => {
  assert.throws(() => rewrite(Buffer.concat([id3([v22("XYZ", text("x"))], 2), audio]), "mp3", { title: "y" }), /“XYZ” frame/);
  assert.throws(() => rewrite(Buffer.concat([id3([frame("TIT2", text("x"))], 3, 10, 0x80), audio]), "mp3", { title: "y" }), /unsynchronisation/);
  const junk = Buffer.concat([id3([frame("TIT2", text("x"))], 3, 0), audio]);
  junk.write("zz", 10, "latin1");
  assert.throws(() => rewrite(junk, "mp3", { title: "y" }), TagWriteError);
  assert.throws(() => rewrite(Buffer.concat([id3([]), audio]), "mp3", { title: "bad\nline" }), /unusable text/);
  assert.throws(() => rewrite(Buffer.concat([id3([]), audio]), "mp3", { track_no: 0 }), /unusable number/);
  assert.throws(() => rewrite(Buffer.concat([id3([]), Buffer.from("RIFF"), randomBytes(100)]), "mp3", { title: "y" }), /isn't plain MP3 inside/);
});

function v22(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(6);
  header.write(id, 0, "latin1");
  header.writeUIntBE(body.length, 3, 3);
  return Buffer.concat([header, body]);
}

test("MP3: an old ID3v2.2 tag (older iTunes rips) is carried over to ID3v2.3, cover art and all", () => {
  const art = randomBytes(4000);
  const pic = v22("PIC", Buffer.concat([Buffer.from([0]), Buffer.from("JPG", "latin1"), Buffer.from([3]), Buffer.from("\0", "latin1"), art]));
  const norm = v22("COM", Buffer.concat([Buffer.from([0]), Buffer.from("engiTunNORM\0 0000044A", "latin1")]));
  const original = Buffer.concat([id3([v22("TT2", text("Old")), v22("TP1", text("Madonna")), v22("TRK", text("1/12")), pic, norm], 2), audio]);
  const written = join(rewrite(original, "mp3", { title: "Girl Gone Wild" }));
  assert.equal(written[3], 3, "now ID3v2.3");
  const tags = tagsOf(written, "e.mp3");
  assert.deepEqual([tags.title, tags.artist, tags.track_no, tags.track_total], ["Girl Gone Wild", "Madonna", 1, 12]);
  assert.ok(written.includes(Buffer.concat([Buffer.from("image/jpeg\0", "latin1"), Buffer.from([3]), Buffer.from("\0", "latin1"), art])), "cover art carried over");
  assert.ok(written.includes(Buffer.from("COMM", "latin1")) && written.includes(Buffer.from("iTunNORM", "latin1")));
  assert.equal(sha256(splitParts(written, "mp3").audio), sha256(audio));
});

function block(type: number, data: Buffer, last = false): Buffer {
  const header = Buffer.alloc(4);
  header[0] = (last ? 0x80 : 0) | type;
  header.writeUIntBE(data.length, 1, 3);
  return Buffer.concat([header, data]);
}
function vorbis(entries: string[]): Buffer {
  const vendor = Buffer.from("reference libFLAC 1.3.2");
  const parts = [Buffer.alloc(4), vendor, Buffer.alloc(4)];
  parts[0]!.writeUInt32LE(vendor.length);
  parts[2]!.writeUInt32LE(entries.length);
  for (const entry of entries) { const b = Buffer.from(entry, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); parts.push(l, b); }
  return Buffer.concat(parts);
}

test("FLAC: comments rewritten, picture and stream info kept, padding absorbs the change so the audio stays put", () => {
  const streaminfo = block(0, randomBytes(34));
  const picture = block(6, randomBytes(3000));
  const frames = Buffer.concat([Buffer.from([0xff, 0xf8]), randomBytes(50_000)]);
  const original = Buffer.concat([Buffer.from("fLaC"), streaminfo, block(4, vorbis(["TITLE=Old", "TRACKNUMBER=3/12", "REPLAYGAIN_TRACK_GAIN=-6.1 dB", "ALBUM ARTIST=Someone"])), picture, block(1, Buffer.alloc(4096), true), frames]);
  const parts = rewrite(original, "flac", { title: "Fuel", track_no: 2, album_artist: "Ani DiFranco" });
  const written = join(parts);
  assert.equal(parts.head.length, splitParts(original, "flac").head.length, "same size: the padding took it");
  assert.equal(sha256(splitParts(written, "flac").audio), sha256(frames));
  assert.ok(written.includes(picture.subarray(4)) && written.includes(streaminfo), "picture and stream info kept");
  const tags = tagsOf(written, "a.flac");
  assert.deepEqual([tags.title, tags.track_no, tags.track_total, tags.album_artist], ["Fuel", 2, 12, "Ani DiFranco"]);
  assert.ok(written.includes(Buffer.from("REPLAYGAIN_TRACK_GAIN=-6.1 dB")), "other comments kept");
  assert.ok(!written.includes(Buffer.from("ALBUM ARTIST=Someone")), "the old spelling of the key goes");
  // No comments block at all: one is added after the stream info.
  const bare = Buffer.concat([Buffer.from("fLaC"), block(0, randomBytes(34), true), frames]);
  const fresh = join(rewrite(bare, "flac", { album: "Dilate", year: 1996 }));
  assert.deepEqual([tagsOf(fresh, "b.flac").album, tagsOf(fresh, "b.flac").year], ["Dilate", 1996]);
  assert.equal(sha256(splitParts(fresh, "flac").audio), sha256(frames));
  assert.throws(() => rewrite(Buffer.concat([id3([]), original]), "flac", { title: "x" }), /ID3 tag in front/);
});
