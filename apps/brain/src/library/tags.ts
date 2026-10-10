/**
 * Just enough tag reading to file new music: names and numbers from MP3
 * (ID3v2.2–2.4, ID3v1), FLAC (Vorbis comments) and M4A/AAC/ALAC (iTunes atoms).
 *
 * Read-only and dependency-free on purpose (the brain has no npm dependencies).
 * It reads headers, not audio, and never throws: a file it can't read simply
 * has no tags, and the import falls back to the folder names.
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export type FileTags = {
  title?: string;
  artist?: string;
  album_artist?: string;
  album?: string;
  track_no?: number;
  track_total?: number;
  disc_no?: number;
  disc_total?: number;
  year?: number;
  compilation?: boolean;
  mb_albumid?: string;
  /** Unsynced lyrics, only when asked for (readTags(path, { lyrics: true })): they can be long. */
  lyrics?: string;
};

/** Lyrics as stored: line breaks normalised, LRC timestamps and blank runs removed. Capped at 20,000 characters. */
export function cleanLyrics(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.replace(/\0+/g, "\n").replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/, "").replace(/^\s*\[(?:ar|ti|al|by|offset|length|re|ve):[^\]]*\]\s*$/i, "").trimEnd())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, 20_000) : undefined;
}

/** USLT / ULT: encoding, 3-letter language, a description ending in a terminator, then the words. */
function decodeUslt(data: Buffer): string | undefined {
  if (data.length < 5) return undefined;
  const encoding = data[0]!;
  const rest = data.subarray(4);
  const wide = encoding === 1 || encoding === 2;
  let end = -1;
  for (let i = 0; i + (wide ? 1 : 0) < rest.length; i += wide ? 2 : 1) {
    if (rest[i] === 0 && (!wide || rest[i + 1] === 0)) { end = i; break; }
  }
  if (end < 0) return undefined;
  return cleanLyrics(decodeText(Buffer.concat([Buffer.from([encoding]), rest.subarray(end + (wide ? 2 : 1))])));
}

const MAX_TAG_BYTES = 16 * 1024 * 1024;

function readAt(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(Math.max(0, length));
  const got = readSync(fd, buffer, 0, buffer.length, position);
  return buffer.subarray(0, got);
}

const clean = (value: string | undefined) => {
  const text = value?.replace(/\0+$/g, "").split("\0")[0]?.trim();
  return text ? text.slice(0, 500) : undefined;
};

/** "3/12" → {no: 3, total: 12}. */
function numberPair(value: string | undefined): { no?: number; total?: number } {
  const match = value?.trim().match(/^(\d{1,4})(?:\s*\/\s*(\d{1,4}))?/);
  if (!match) return {};
  const no = Number(match[1]), total = match[2] ? Number(match[2]) : undefined;
  return { ...(no > 0 ? { no } : {}), ...(total && total > 0 ? { total } : {}) };
}
const yearOf = (value: string | undefined) => {
  const year = Number(value?.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1]);
  return year || undefined;
};
const truthy = (value: string | undefined) => (value === undefined ? undefined : /^(1|true|yes)$/i.test(value.trim()));

function assign(out: FileTags, key: string, raw: string | undefined): void {
  const value = clean(raw);
  if (value === undefined) return;
  switch (key) {
    case "title": out.title ??= value; break;
    case "artist": out.artist ??= value; break;
    case "album_artist": out.album_artist ??= value; break;
    case "album": out.album ??= value; break;
    case "track": { const p = numberPair(value); if (p.no) out.track_no ??= p.no; if (p.total) out.track_total ??= p.total; break; }
    case "track_total": { const n = numberPair(value).no; if (n) out.track_total ??= n; break; }
    case "disc": { const p = numberPair(value); if (p.no) out.disc_no ??= p.no; if (p.total) out.disc_total ??= p.total; break; }
    case "disc_total": { const n = numberPair(value).no; if (n) out.disc_total ??= n; break; }
    case "year": { const y = yearOf(value); if (y) out.year ??= y; break; }
    case "compilation": { const c = truthy(value); if (c !== undefined) out.compilation ??= c; break; }
    case "mb_albumid": if (/^[0-9a-f-]{36}$/i.test(value)) out.mb_albumid ??= value.toLowerCase(); break;
  }
}

// --- ID3 ---------------------------------------------------------------------------

const ID3_FRAMES: Record<string, string> = {
  TIT2: "title", TPE1: "artist", TPE2: "album_artist", TALB: "album", TRCK: "track", TPOS: "disc",
  TYER: "year", TDRC: "year", TORY: "year", TDOR: "year", TCMP: "compilation",
  TT2: "title", TP1: "artist", TP2: "album_artist", TAL: "album", TRK: "track", TPA: "disc", TYE: "year", TCP: "compilation",
};
const syncsafe = (b: Buffer, at: number) => ((b[at]! & 0x7f) << 21) | ((b[at + 1]! & 0x7f) << 14) | ((b[at + 2]! & 0x7f) << 7) | (b[at + 3]! & 0x7f);

function decodeText(data: Buffer): string {
  const encoding = data[0];
  const body = data.subarray(1);
  if (encoding === 1 || encoding === 2) {
    let start = 0;
    let bigEndian = encoding === 2;
    if (body[0] === 0xfe && body[1] === 0xff) { bigEndian = true; start = 2; }
    else if (body[0] === 0xff && body[1] === 0xfe) { bigEndian = false; start = 2; }
    const slice = Buffer.from(body.subarray(start, start + ((body.length - start) & ~1)));
    if (bigEndian) slice.swap16();
    return slice.toString("utf16le");
  }
  return body.toString(encoding === 3 ? "utf8" : "latin1");
}

/** Size of an ID3v2 tag at the start of the file (0 if none), so other readers can skip it. */
function id3Size(head: Buffer): number {
  return head.length >= 10 && head.toString("latin1", 0, 3) === "ID3" ? syncsafe(head, 6) + 10 + (head[5]! & 0x10 ? 10 : 0) : 0;
}

function readId3v2(fd: number, out: FileTags, lyrics = false): void {
  const head = readAt(fd, 0, 10);
  const size = id3Size(head);
  if (!size) return;
  const major = head[3]!;
  const tag = readAt(fd, 10, Math.min(size - 10, MAX_TAG_BYTES));
  let at = 0;
  if (head[5]! & 0x40) at = major === 4 ? syncsafe(tag, 0) : tag.readUInt32BE(0) + 4; // extended header
  const idLength = major === 2 ? 3 : 4;
  const headerLength = major === 2 ? 6 : 10;
  while (at + headerLength <= tag.length) {
    const id = tag.toString("latin1", at, at + idLength);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const frameSize = major === 2 ? tag.readUIntBE(at + 3, 3) : major === 4 ? syncsafe(tag, at + 4) : tag.readUInt32BE(at + 4);
    const start = at + headerLength;
    if (frameSize < 0 || start + frameSize > tag.length) break;
    if (frameSize === 0) { at = start; continue; } // an empty frame (some taggers write them): skip it, read on
    if (lyrics && (id === "USLT" || id === "ULT")) {
      out.lyrics ??= decodeUslt(tag.subarray(start, start + frameSize));
    } else if (id === "TXXX") {
      const text = decodeText(tag.subarray(start, start + frameSize)).split("\0");
      if (/^musicbrainz album id$/i.test(text[0] ?? "")) assign(out, "mb_albumid", text[1]);
    } else if (ID3_FRAMES[id]) {
      assign(out, ID3_FRAMES[id]!, decodeText(tag.subarray(start, start + frameSize)));
    }
    at = start + frameSize;
  }
}

function readId3v1(fd: number, size: number, out: FileTags): void {
  if (size < 128) return;
  const tag = readAt(fd, size - 128, 128);
  if (tag.toString("latin1", 0, 3) !== "TAG") return;
  const text = (from: number, to: number) => tag.toString("latin1", from, to).replace(/\0.*$/s, "").trim();
  assign(out, "title", text(3, 33));
  assign(out, "artist", text(33, 63));
  assign(out, "album", text(63, 93));
  assign(out, "year", text(93, 97));
  if (tag[125] === 0 && tag[126]) assign(out, "track", String(tag[126]));
}

// --- FLAC (Vorbis comments) ------------------------------------------------------------

const VORBIS_KEYS: Record<string, string> = {
  TITLE: "title", ARTIST: "artist", ALBUMARTIST: "album_artist", "ALBUM ARTIST": "album_artist", ALBUM: "album",
  TRACKNUMBER: "track", TRACKTOTAL: "track_total", TOTALTRACKS: "track_total", DISCNUMBER: "disc", DISCTOTAL: "disc_total",
  TOTALDISCS: "disc_total", DATE: "year", ORIGINALDATE: "year", YEAR: "year", COMPILATION: "compilation", MUSICBRAINZ_ALBUMID: "mb_albumid",
};

const VORBIS_LYRICS = new Set(["LYRICS", "UNSYNCEDLYRICS", "UNSYNCED LYRICS"]);

export function parseVorbisComments(block: Buffer, out: FileTags, lyrics = false): void {
  let at = 0;
  const vendor = block.readUInt32LE(at);
  at += 4 + vendor;
  const count = block.readUInt32LE(at);
  at += 4;
  for (let i = 0; i < count && at + 4 <= block.length; i++) {
    const length = block.readUInt32LE(at);
    at += 4;
    const comment = block.toString("utf8", at, at + length);
    at += length;
    const eq = comment.indexOf("=");
    if (eq > 0) {
      const name = comment.slice(0, eq).toUpperCase();
      if (lyrics && VORBIS_LYRICS.has(name)) { out.lyrics ??= cleanLyrics(comment.slice(eq + 1)); continue; }
      const key = VORBIS_KEYS[name];
      if (key) assign(out, key, comment.slice(eq + 1));
    }
  }
}

function readFlac(fd: number, out: FileTags, lyrics = false): void {
  let at = id3Size(readAt(fd, 0, 10));
  if (readAt(fd, at, 4).toString("latin1") !== "fLaC") return;
  at += 4;
  for (let blocks = 0; blocks < 64; blocks++) {
    const header = readAt(fd, at, 4);
    if (header.length < 4) return;
    const last = header[0]! & 0x80, type = header[0]! & 0x7f, length = header.readUIntBE(1, 3);
    if (type === 4) { parseVorbisComments(readAt(fd, at + 4, Math.min(length, MAX_TAG_BYTES)), out, lyrics); return; }
    if (last) return;
    at += 4 + length;
  }
}

// --- MP4 / M4A (iTunes atoms) ------------------------------------------------------------

const MP4_ITEMS: Record<string, string> = {
  "©nam": "title", "©ART": "artist", aART: "album_artist", "©alb": "album", "©day": "year", cpil: "compilation",
};

type Atom = { type: string; start: number; end: number };
function atoms(buffer: Buffer, from: number, to: number): Atom[] {
  const out: Atom[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = buffer.readUInt32BE(at);
    const type = buffer.toString("latin1", at + 4, at + 8);
    let header = 8;
    if (size === 1 && at + 16 <= to) { size = Number(buffer.readBigUInt64BE(at + 8)); header = 16; }
    else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}

function readMp4(fd: number, fileSize: number, out: FileTags, lyrics = false): void {
  // Walk the top-level atoms by their headers; only `moov` is read in full.
  let at = 0;
  let moov: Buffer | undefined;
  for (let i = 0; i < 64 && at + 8 <= fileSize; i++) {
    const header = readAt(fd, at, 16);
    if (header.length < 8) return;
    let size = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    if (i === 0 && type !== "ftyp") return;
    if (size === 1) size = Number(header.readBigUInt64BE(8));
    else if (size === 0) size = fileSize - at;
    if (size < 8) return;
    if (type === "moov") { if (size <= MAX_TAG_BYTES * 4) moov = readAt(fd, at, size); break; }
    at += size;
  }
  if (!moov) return;
  const find = (list: Atom[], type: string) => list.find((a) => a.type === type);
  const udta = find(atoms(moov, 8, moov.length), "udta");
  const meta = udta && find(atoms(moov, udta.start, udta.end), "meta");
  const ilst = meta && find(atoms(moov, meta.start + 4, meta.end), "ilst"); // `meta` is a full box: skip version/flags
  if (!ilst) return;
  for (const item of atoms(moov, ilst.start, ilst.end)) {
    const children = atoms(moov, item.start, item.end);
    const data = find(children, "data");
    if (!data || data.end - data.start < 8) continue;
    const value = moov.subarray(data.start + 8, data.end);
    if (item.type === "trkn" || item.type === "disk") {
      if (value.length >= 6) {
        const no = value.readUInt16BE(2), total = value.readUInt16BE(4);
        if (item.type === "trkn") { if (no) out.track_no ??= no; if (total) out.track_total ??= total; }
        else { if (no) out.disc_no ??= no; if (total) out.disc_total ??= total; }
      }
    } else if (item.type === "©lyr") {
      if (lyrics) out.lyrics ??= cleanLyrics(value.toString("utf8"));
    } else if (item.type === "cpil") {
      if (value.length) out.compilation ??= value[0] === 1;
    } else if (item.type === "----") {
      const name = find(children, "name");
      if (name && /^musicbrainz album id$/i.test(moov.toString("utf8", name.start + 4, name.end))) assign(out, "mb_albumid", value.toString("utf8"));
    } else if (MP4_ITEMS[item.type]) {
      assign(out, MP4_ITEMS[item.type]!, value.toString("utf8"));
    }
  }
}

/** Tags from one file; {} when the format isn't supported or the file can't be read. */
export function readTags(path: string, options: { lyrics?: boolean } = {}): FileTags {
  const lyrics = !!options.lyrics;
  const out: FileTags = {};
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const lower = path.toLowerCase();
    if (lower.endsWith(".flac")) readFlac(fd, out, lyrics);
    else if (/\.(m4a|m4b|mp4|aac|alac)$/.test(lower)) readMp4(fd, size, out, lyrics);
    else if (lower.endsWith(".mp3")) { readId3v2(fd, out, lyrics); readId3v1(fd, size, out); }
    else readId3v2(fd, out, lyrics); // some WAV/AIFF/others carry ID3 at the start
  } catch {
    // An odd file must not stop an import: no tags, fall back to folder names.
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ }
  }
  return out;
}
