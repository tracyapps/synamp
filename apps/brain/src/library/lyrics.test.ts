/** Lyrics: read from the files themselves, then (only when switched on) from LRCLIB. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { Library } from "../query/evaluate.ts";
import { BACK_OFF_MS, LOOKUP_GAP_MS, lrclib, type Lookup, LyricsStore, LyricsWorker } from "./lyrics.ts";
import { cleanLyrics, readTags } from "./tags.ts";

// --- synthetic files (same layouts as import.test.ts) -----------------------------------------

const syncsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
function id3(frames: Array<[string, Buffer]>): Buffer {
  const body = Buffer.concat(frames.map(([id, data]) => Buffer.concat([Buffer.from(id, "latin1"), syncsafe(data.length), Buffer.from([0, 0]), data])));
  const padded = Buffer.concat([body, Buffer.alloc(32)]);
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([4, 0, 0]), syncsafe(padded.length), padded]);
}
const uslt = (encoding: 0 | 1 | 3, description: string, text: string) => {
  const enc = (value: string) => encoding === 1 ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(value, "utf16le")]) : Buffer.from(value, encoding === 3 ? "utf8" : "latin1");
  const end = encoding === 1 ? Buffer.from([0, 0]) : Buffer.from([0]);
  return Buffer.concat([Buffer.from([encoding]), Buffer.from("eng", "latin1"), enc(description), end, enc(text)]);
};
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
const data = (value: Buffer) => atom("data", Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]), value);
const m4a = (items: Buffer[]) => Buffer.concat([
  atom("ftyp", Buffer.from("M4A \0\0\0\0", "latin1")),
  atom("moov", atom("mvhd", Buffer.alloc(100)), atom("udta", atom("meta", Buffer.alloc(4), atom("hdlr", Buffer.alloc(25)), atom("ilst", ...items)))),
  atom("mdat", Buffer.alloc(200)),
]);

function put(root: string, path: string, bytes: Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}

test("lyrics in MP3 (Latin-1, UTF-8, UTF-16), FLAC and M4A — read only when asked for", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-lyrics-tags-"));
  try {
    put(dir, "a.mp3", Buffer.concat([id3([["TIT2", Buffer.from("\u0000Gravel", "latin1")], ["USLT", uslt(0, "", "Line one\r\nLine two")]]), Buffer.alloc(200)]));
    put(dir, "b.mp3", Buffer.concat([id3([["USLT", uslt(3, "words", "Björk sings\nhere")]]), Buffer.alloc(200)]));
    put(dir, "c.mp3", Buffer.concat([id3([["USLT", uslt(1, "desc", "Wide words\nsecond line")]]), Buffer.alloc(200)]));
    put(dir, "d.flac", flac(["TITLE=Hey You", "UNSYNCEDLYRICS=Hey you\nout there in the cold"]));
    put(dir, "e.m4a", m4a([atom("©nam", data(Buffer.from("Fuel"))), atom("©lyr", data(Buffer.from("Fuel words\rnext")))]));
    assert.equal(readTags(join(dir, "a.mp3"), { lyrics: true }).lyrics, "Line one\nLine two");
    assert.equal(readTags(join(dir, "a.mp3")).lyrics, undefined, "not read unless asked for");
    assert.equal(readTags(join(dir, "a.mp3")).title, "Gravel");
    assert.equal(readTags(join(dir, "b.mp3"), { lyrics: true }).lyrics, "Björk sings\nhere");
    assert.equal(readTags(join(dir, "c.mp3"), { lyrics: true }).lyrics, "Wide words\nsecond line");
    assert.equal(readTags(join(dir, "d.flac"), { lyrics: true }).lyrics, "Hey you\nout there in the cold");
    assert.equal(readTags(join(dir, "d.flac"), { lyrics: true }).title, "Hey You");
    assert.equal(readTags(join(dir, "e.m4a"), { lyrics: true }).lyrics, "Fuel words\nnext");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("cleaning: timestamps, LRC headers and long blank runs go; nothing left means nothing", () => {
  assert.equal(cleanLyrics("[ar:Someone]\n[00:12.34]First\n[00:15.00][01:15.00]Chorus\n\n\n\nLast  "), "First\nChorus\n\nLast");
  assert.equal(cleanLyrics("  \n\n "), undefined);
  assert.equal(cleanLyrics("x".repeat(30_000))!.length, 20_000);
});

function library(): Library {
  return { version: "v1", tracks: [
    { id: "has-words", title: "Gravel", artist: "Ani DiFranco", album: "Little Plastic Castle", duration_s: 211, path: "a.mp3", signals: { vocal_fraction: 0.8 } },
    { id: "bare", title: "Fire Door", artist: "Ani DiFranco", album: "Ani DiFranco", duration_s: 190.4, path: "bare.mp3", signals: { vocal_fraction: 0.7 } },
    { id: "eno", title: "1/1", artist: "Brian Eno", album: "Music for Airports", path: "eno.flac", signals: { vocal_fraction: 0 } },
    { id: "nameless", title: "Track 01", path: "nameless.mp3" },
    { id: "gone", title: "Gone", artist: "X", path: "missing.mp3" },
  ] };
}

test("files first; LRCLIB only when switched on, only for songs with a voice, politely, and it backs off", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-lyrics-"));
  try {
    const root = join(dir, "music");
    put(root, "a.mp3", Buffer.concat([id3([["USLT", uslt(3, "", "Words from the file")]]), Buffer.alloc(100)]));
    put(root, "bare.mp3", Buffer.alloc(300));
    put(root, "eno.flac", flac(["TITLE=1/1"]));
    put(root, "nameless.mp3", Buffer.alloc(300));
    let clock = 1_000_000;
    const asked: string[] = [];
    let reply: Awaited<ReturnType<Lookup>> = { kind: "found", text: "[00:01.00]Words from LRCLIB\n" };
    const lookup: Lookup = async (track) => { asked.push(`${track.artist} — ${track.title} (${track.album}, ${track.duration_s})`); return reply; };
    const store = new LyricsStore(join(dir, "lyrics"));
    const worker = new LyricsWorker({ store, root, library, lookup, now: () => clock });

    while (await worker.step()) { /* read every file */ }
    let progress = worker.progress();
    assert.equal(progress.from_files, 1);
    assert.equal(store.text("has-words"), "Words from the file");
    assert.equal(progress.lookup, false);
    assert.equal(progress.to_look_up, 1, "Fire Door would be looked up; Eno (no voice), the nameless track and the missing file wouldn't");
    assert.equal(progress.no_voice, 1);
    assert.deepEqual(asked, [], "nothing leaves the NAS while the switch is off");

    worker.setLookup(true);
    assert.equal(await worker.step(), true);
    assert.deepEqual(asked, ["Ani DiFranco — Fire Door (Ani DiFranco, 190.4)"]);
    assert.equal(store.text("bare"), "Words from LRCLIB");
    progress = worker.progress();
    assert.equal(progress.from_lrclib, 1);
    assert.equal(progress.to_look_up, 0);

    // Asked again only after a long while, and never faster than the gap.
    store.put("bare", { status: "none", file_sig: store.state.entries.bare!.file_sig!, looked_up: clock, at: clock });
    worker.setLookup(true);
    assert.equal(await worker.step(), false, "LRCLIB didn't know it a moment ago: not asked again yet");

    // An outage: wait, then carry on where it left off.
    store.put("bare", { status: "none", file_sig: store.state.entries.bare!.file_sig!, at: clock });
    worker.setLookup(true);
    reply = { kind: "problem", message: "LRCLIB answered 503", retryable: true };
    await worker.step();
    assert.equal(worker.progress().problem, "LRCLIB answered 503");
    assert.equal(worker.progress().waiting_until, clock + BACK_OFF_MS);
    assert.equal(await worker.step(), false, "waits out the back-off");
    clock += BACK_OFF_MS;
    reply = { kind: "instrumental" };
    assert.equal(await worker.step(), true);
    assert.equal(worker.progress().instrumental, 1);
    assert.equal(worker.progress().problem, null);
    assert.equal(asked.length, 3);

    // Switching off stops lookups straight away; what was found stays.
    worker.setLookup(false);
    store.put("bare", { status: "none", file_sig: store.state.entries.bare!.file_sig!, at: clock });
    clock += LOOKUP_GAP_MS;
    assert.equal(await worker.step(), false);
    assert.equal(asked.length, 3);
    store.flush();

    const reloaded = new LyricsStore(join(dir, "lyrics"));
    assert.equal(reloaded.state.lookup, false);
    assert.equal(reloaded.text("has-words"), "Words from the file", "survives a restart");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the LRCLIB call: the right question, and every kind of answer", async () => {
  const seen: Array<{ url: string; agent: string }> = [];
  const respond = (status: number, body: unknown): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), agent: (init?.headers as Record<string, string>)["user-agent"]! });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  const ask = (status: number, body: unknown) => lrclib("SynAmp/test (https://synamp.app)", respond(status, body))({ title: "Hat Shaped Hat", artist: "Ani DiFranco", album: "Up Up Up Up Up Up", duration_s: 486.6 });

  assert.deepEqual(await ask(200, { plainLyrics: "Some words", syncedLyrics: null, instrumental: false }), { kind: "found", text: "Some words" });
  const url = new URL(seen[0]!.url);
  assert.equal(url.origin + url.pathname, "https://lrclib.net/api/get");
  assert.equal(url.searchParams.get("track_name"), "Hat Shaped Hat");
  assert.equal(url.searchParams.get("artist_name"), "Ani DiFranco");
  assert.equal(url.searchParams.get("album_name"), "Up Up Up Up Up Up");
  assert.equal(url.searchParams.get("duration"), "487");
  assert.equal(seen[0]!.agent, "SynAmp/test (https://synamp.app)");
  assert.deepEqual(await ask(200, { plainLyrics: null, syncedLyrics: "[00:01.00]Only synced" }), { kind: "found", text: "Only synced" });
  assert.deepEqual(await ask(200, { instrumental: true }), { kind: "instrumental" });
  assert.deepEqual(await ask(404, { message: "not found" }), { kind: "none" });
  assert.deepEqual(await ask(429, "slow down"), { kind: "problem", message: "LRCLIB answered 429", retryable: true });
  assert.deepEqual(await ask(400, "bad"), { kind: "problem", message: "LRCLIB answered 400", retryable: false });
  assert.equal((await ask(200, "<html>")).kind, "problem");
});
