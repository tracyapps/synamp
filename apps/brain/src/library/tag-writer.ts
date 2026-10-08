/**
 * Writing song details (tags) into MP3 and FLAC files, without touching the music.
 *
 * Every file is three parts: the tags at the front, the audio, and (MP3 only)
 * an old 128-byte ID3v1 tag at the end. Only the tag parts are ever rebuilt;
 * the audio bytes are copied across as they are, and the librarian checks
 * they're identical before replacing the file. So undo doesn't need a copy of
 * the whole file: the old tag parts (a few kilobytes, or the size of the
 * cover art) plus the untouched audio make the original again, byte for byte.
 *
 * Only the details SynAmp changes are replaced. Everything else in the tag
 * (cover art, comments, lyrics, ratings, ReplayGain, MusicBrainz IDs, frames
 * SynAmp doesn't know) is kept exactly as it was. Files whose tags are in a
 * form SynAmp can't rebuild safely (unsynchronised or extended ID3 headers,
 * FLAC with an ID3 tag in front) are refused with a plain reason, never
 * guessed at. Old ID3v2.2 tags are carried over to ID3v2.3, frame for frame.
 * M4A isn't written yet.
 *
 * Pure: bytes in, bytes out (tested in tag-writer.test.ts).
 */

import { createHash } from "node:crypto";

export type TagValues = {
  title?: string; artist?: string; album_artist?: string; album?: string;
  track_no?: number; track_total?: number; disc_no?: number; disc_total?: number; year?: number;
};
export const TAG_FIELDS = ["title", "artist", "album_artist", "album", "track_no", "track_total", "disc_no", "disc_total", "year"] as const;
export type TagField = (typeof TAG_FIELDS)[number];

export class TagWriteError extends Error {}

export type Format = "mp3" | "flac";
export function formatOf(path: string): Format | undefined {
  const lower = path.toLowerCase();
  return lower.endsWith(".mp3") ? "mp3" : lower.endsWith(".flac") ? "flac" : undefined;
}

/** The parts of a file: tags in front, the audio, anything after (an ID3v1 tag). */
export type Parts = { head: Buffer; audio: Buffer; tail: Buffer };

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

// --- ID3v2 (MP3) ---------------------------------------------------------------------------

const syncsafeRead = (b: Buffer, at: number) => ((b[at]! & 0x7f) << 21) | ((b[at + 1]! & 0x7f) << 14) | ((b[at + 2]! & 0x7f) << 7) | (b[at + 3]! & 0x7f);
function syncsafeWrite(n: number): Buffer {
  if (n >= 1 << 28) throw new TagWriteError("the tag would be too large");
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

type Frame = { id: string; raw: Buffer };
type Id3 = { major: 3 | 4; frames: Frame[]; total: number };

function id3Length(bytes: Buffer): number {
  if (bytes.length < 10 || bytes.toString("latin1", 0, 3) !== "ID3") return 0;
  return 10 + syncsafeRead(bytes, 6) + (bytes[5]! & 0x10 ? 10 : 0);
}

function parseId3(bytes: Buffer): Id3 | undefined {
  const length = id3Length(bytes);
  if (!length) return undefined;
  const major = bytes[3]!, flags = bytes[5]!;
  if (major === 2) return upgradeV22(bytes, length);
  if (major !== 3 && major !== 4) throw new TagWriteError(`it has an ID3v2.${major} tag, which SynAmp doesn't know`);
  if (flags & 0x80) throw new TagWriteError("its tag uses “unsynchronisation”, which SynAmp doesn't rewrite yet");
  if (flags & 0x40) throw new TagWriteError("its tag has an extended header, which SynAmp doesn't rewrite yet");
  if (flags & 0x10) throw new TagWriteError("its tag has a footer, which SynAmp doesn't rewrite yet");
  if (length > bytes.length) throw new TagWriteError("its tag is longer than the file");
  const frames: Frame[] = [];
  let at = 10;
  while (at + 10 <= length) {
    if (bytes[at] === 0) {
      // Padding: everything to the end of the tag must be zeros, or the frames weren't read right.
      if (bytes.subarray(at, length).some((b) => b !== 0)) throw new TagWriteError("its tag couldn't be read safely (unexpected data after the padding)");
      break;
    }
    const id = bytes.toString("latin1", at, at + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) throw new TagWriteError("its tag couldn't be read safely (a damaged frame)");
    const size = major === 4 ? syncsafeRead(bytes, at + 4) : bytes.readUInt32BE(at + 4);
    if (at + 10 + size > length) throw new TagWriteError("its tag couldn't be read safely (a frame runs past the end)");
    frames.push({ id, raw: bytes.subarray(at, at + 10 + size) });
    at += 10 + size;
  }
  return { major: major as 3 | 4, frames, total: length };
}

/**
 * ID3v2.2 (older iTunes rips) → ID3v2.3: the same frames with four-letter
 * names. Text, comments and lyrics are laid out the same; cover art (PIC)
 * names its image type differently. A frame with no known v2.3 name means the
 * file is refused, so nothing is ever dropped.
 */
const V22: Record<string, string> = {
  TT1: "TIT1", TT2: "TIT2", TT3: "TIT3", TP1: "TPE1", TP2: "TPE2", TP3: "TPE3", TP4: "TPE4", TAL: "TALB", TRK: "TRCK", TPA: "TPOS",
  TYE: "TYER", TDA: "TDAT", TIM: "TIME", TRD: "TRDA", TOR: "TORY", TCO: "TCON", TCM: "TCOM", TXT: "TEXT", TEN: "TENC", TSS: "TSSE",
  TBP: "TBPM", TKE: "TKEY", TLA: "TLAN", TLE: "TLEN", TMT: "TMED", TOA: "TOPE", TOF: "TOFN", TOL: "TOLY", TOT: "TOAL", TPB: "TPUB",
  TCR: "TCOP", TRC: "TSRC", TFT: "TFLT", TSI: "TSIZ", TDY: "TDLY", TXX: "TXXX", TCP: "TCMP", TST: "TSOT", TSP: "TSOP", TSA: "TSOA",
  TS2: "TSO2", TSC: "TSOC", COM: "COMM", ULT: "USLT", UFI: "UFID", WXX: "WXXX", WAR: "WOAR", WAS: "WOAS", WAF: "WOAF", WCM: "WCOM",
  WCP: "WCOP", WPB: "WPUB", CNT: "PCNT", POP: "POPM", GEO: "GEOB", MCI: "MCDI", ETC: "ETCO", IPL: "IPLS", PIC: "APIC",
  RVA: "RVAD", EQU: "EQUA", REV: "RVRB", SLT: "SYLT", STC: "SYTC", BUF: "RBUF", CRA: "AENC",
};
function upgradeV22(bytes: Buffer, length: number): Id3 {
  if (bytes[5]! & 0xc0) throw new TagWriteError("its old ID3v2.2 tag is compressed or unsynchronised, which SynAmp doesn't rewrite");
  if (length > bytes.length) throw new TagWriteError("its tag is longer than the file");
  const frames: Frame[] = [];
  let at = 10;
  while (at + 6 <= length) {
    if (bytes[at] === 0) {
      if (bytes.subarray(at, length).some((b) => b !== 0)) throw new TagWriteError("its tag couldn't be read safely (unexpected data after the padding)");
      break;
    }
    const id = bytes.toString("latin1", at, at + 3);
    const size = bytes.readUIntBE(at + 3, 3);
    if (!/^[A-Z0-9]{3}$/.test(id) || at + 6 + size > length) throw new TagWriteError("its tag couldn't be read safely (a damaged frame)");
    const newId = V22[id];
    if (!newId) throw new TagWriteError(`its old ID3v2.2 tag has a “${id}” frame SynAmp can't carry over`);
    let body = bytes.subarray(at + 6, at + 6 + size);
    if (id === "PIC") {
      // encoding, 3-letter image type, picture type, description…, data  →  encoding, MIME type\0, picture type, …
      if (body.length < 5) throw new TagWriteError("its cover art frame couldn't be read safely");
      const kind = body.toString("latin1", 1, 4).toUpperCase();
      const mime = kind === "PNG" ? "image/png" : kind === "JPG" || kind === "JPE" ? "image/jpeg" : kind === "-->" ? "-->" : `image/${kind.toLowerCase().trim()}`;
      body = Buffer.concat([body.subarray(0, 1), Buffer.from(`${mime}\0`, "latin1"), body.subarray(4)]);
    }
    const header = Buffer.alloc(10);
    header.write(newId, 0, "latin1");
    header.writeUInt32BE(body.length, 4);
    frames.push({ id: newId, raw: Buffer.concat([header, body]) });
    at += 6 + size;
  }
  return { major: 3, frames, total: length };
}

const latin1Safe = (text: string) => /^[\x01-\xff]*$/.test(text);
function textFrame(id: string, text: string, major: 3 | 4): Frame {
  let body: Buffer;
  if (latin1Safe(text)) body = Buffer.concat([Buffer.from([0]), Buffer.from(text, "latin1")]);
  else if (major === 4) body = Buffer.concat([Buffer.from([3]), Buffer.from(text, "utf8")]);
  else body = Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const header = Buffer.alloc(10);
  header.write(id, 0, "latin1");
  if (major === 4) syncsafeWrite(body.length).copy(header, 4);
  else header.writeUInt32BE(body.length, 4);
  return { id, raw: Buffer.concat([header, body]) };
}

/** Text of a text frame we may need to keep half of (e.g. the "/12" of "3/12"). */
function frameText(frame: Frame | undefined): string | undefined {
  if (!frame || frame.raw.length < 11) return undefined;
  const flags = frame.raw.readUInt16BE(8);
  if (flags & 0x00ff) return undefined; // compressed/encrypted/etc.: can't read it, don't reuse it
  const body = frame.raw.subarray(10);
  const encoding = body[0];
  const data = body.subarray(1);
  if (encoding === 1 || encoding === 2) {
    let start = 0, big = encoding === 2;
    if (data[0] === 0xfe && data[1] === 0xff) { big = true; start = 2; } else if (data[0] === 0xff && data[1] === 0xfe) { big = false; start = 2; }
    const slice = Buffer.from(data.subarray(start, start + ((data.length - start) & ~1)));
    if (big) slice.swap16();
    return slice.toString("utf16le").replace(/\0.*$/s, "");
  }
  return data.toString(encoding === 3 ? "utf8" : "latin1").replace(/\0.*$/s, "");
}

const pair = (text: string | undefined) => {
  const match = text?.trim().match(/^(\d{1,4})(?:\s*\/\s*(\d{1,4}))?/);
  return { no: match ? Number(match[1]) || undefined : undefined, total: match?.[2] ? Number(match[2]) || undefined : undefined };
};
const pairText = (no: number | undefined, total: number | undefined) => (no ? (total ? `${no}/${total}` : String(no)) : undefined);

/** The new frames for a change, and which frame IDs they replace. */
function id3Frames(old: Id3 | undefined, change: TagValues, major: 3 | 4): { add: Frame[]; replace: Set<string> } {
  const add: Frame[] = [], replace = new Set<string>();
  const first = (id: string) => old?.frames.find((f) => f.id === id);
  const set = (id: string, text: string | undefined, also: string[] = []) => {
    if (text === undefined) return;
    add.push(textFrame(id, text, major));
    replace.add(id);
    for (const other of also) replace.add(other);
  };
  set("TIT2", change.title);
  set("TPE1", change.artist);
  set("TPE2", change.album_artist);
  set("TALB", change.album);
  if (change.track_no !== undefined || change.track_total !== undefined) {
    const now = pair(frameText(first("TRCK")));
    set("TRCK", pairText(change.track_no ?? now.no, change.track_total ?? now.total));
  }
  if (change.disc_no !== undefined || change.disc_total !== undefined) {
    const now = pair(frameText(first("TPOS")));
    set("TPOS", pairText(change.disc_no ?? now.no, change.disc_total ?? now.total));
  }
  if (change.year !== undefined) set(major === 4 ? "TDRC" : "TYER", String(change.year), ["TYER", "TDRC"]);
  return { add, replace };
}

function mp3Parts(bytes: Buffer): Parts {
  const headEnd = id3Length(bytes);
  const hasV1 = bytes.length - headEnd >= 128 && bytes.toString("latin1", bytes.length - 128, bytes.length - 125) === "TAG";
  const tailStart = hasV1 ? bytes.length - 128 : bytes.length;
  return { head: bytes.subarray(0, headEnd), audio: bytes.subarray(headEnd, tailStart), tail: bytes.subarray(tailStart) };
}

/** Keep the old ID3v1 tag in step for the fields it has room for (players read it only when there's no ID3v2). */
function updateV1(tail: Buffer, change: TagValues): Buffer {
  if (tail.length !== 128) return tail;
  const out = Buffer.from(tail);
  const put = (text: string | undefined, at: number, size: number) => {
    if (text === undefined || !latin1Safe(text)) return;
    out.fill(0, at, at + size);
    out.write(text.slice(0, size), at, "latin1");
  };
  put(change.title, 3, 30);
  put(change.artist, 33, 30);
  put(change.album, 63, 30);
  if (change.year !== undefined) put(String(change.year), 93, 4);
  if (change.track_no !== undefined && out[125] === 0 && change.track_no <= 255) out[126] = change.track_no;
  return out;
}

/** The audio should start with an MPEG frame (after any stray zeros); otherwise this isn't a plain MP3 inside. */
function looksLikeMp3(audio: Buffer): boolean {
  if (audio.toString("latin1", 0, 4) === "RIFF") return false;
  const limit = Math.min(audio.length - 1, 64 * 1024);
  for (let i = 0; i < limit; i++) if (audio[i] === 0xff && (audio[i + 1]! & 0xe0) === 0xe0) return true;
  return false;
}

function rewriteMp3(bytes: Buffer, change: TagValues): Parts {
  const parts = mp3Parts(bytes);
  if (!looksLikeMp3(parts.audio)) throw new TagWriteError("its audio isn't plain MP3 inside (it may be a WAV or another format with an .mp3 name)");
  const old = parseId3(bytes);
  const major = old?.major ?? 3;
  const { add, replace } = id3Frames(old, change, major);
  // New frames first, so they're the ones every reader sees; everything else exactly as it was.
  const frames = [...add, ...(old?.frames ?? []).filter((frame) => !replace.has(frame.id))];
  const body = Buffer.concat(frames.map((frame) => frame.raw));
  const room = old ? old.total - 10 : 0;
  const size = body.length <= room ? room : body.length + 2048; // reuse the space (and padding) when it fits
  const header = Buffer.from([0x49, 0x44, 0x33, major, 0, 0, ...syncsafeWrite(size)]);
  const head = Buffer.concat([header, body, Buffer.alloc(size - body.length)]);
  return { head, audio: parts.audio, tail: updateV1(parts.tail, change) };
}

// --- FLAC (Vorbis comments) ---------------------------------------------------------------

type Block = { type: number; data: Buffer };
function flacBlocks(bytes: Buffer): { blocks: Block[]; audioStart: number } {
  if (bytes.toString("latin1", 0, 3) === "ID3") throw new TagWriteError("it has an ID3 tag in front of the FLAC data, which SynAmp doesn't rewrite");
  if (bytes.toString("latin1", 0, 4) !== "fLaC") throw new TagWriteError("it isn't a FLAC file inside");
  const blocks: Block[] = [];
  let at = 4;
  for (;;) {
    if (at + 4 > bytes.length) throw new TagWriteError("its details couldn't be read safely");
    const last = bytes[at]! & 0x80, type = bytes[at]! & 0x7f, length = bytes.readUIntBE(at + 1, 3);
    if (at + 4 + length > bytes.length) throw new TagWriteError("its details couldn't be read safely");
    blocks.push({ type, data: bytes.subarray(at + 4, at + 4 + length) });
    at += 4 + length;
    if (last) break;
    if (blocks.length > 1000) throw new TagWriteError("its details couldn't be read safely");
  }
  if (blocks[0]?.type !== 0) throw new TagWriteError("it has no stream information block");
  return { blocks, audioStart: at };
}

const VORBIS: Record<Exclude<TagField, "track_total" | "disc_total">, { key: string; drop: string[] }> = {
  title: { key: "TITLE", drop: [] },
  artist: { key: "ARTIST", drop: [] },
  album_artist: { key: "ALBUMARTIST", drop: ["ALBUM ARTIST"] },
  album: { key: "ALBUM", drop: [] },
  track_no: { key: "TRACKNUMBER", drop: [] },
  disc_no: { key: "DISCNUMBER", drop: [] },
  year: { key: "DATE", drop: ["YEAR"] },
};

function comments(data: Buffer | undefined): { vendor: Buffer; entries: string[] } {
  if (!data) return { vendor: Buffer.from("SynAmp"), entries: [] };
  let at = 0;
  const vendorLength = data.readUInt32LE(at);
  const vendor = data.subarray(4, 4 + vendorLength);
  at = 4 + vendorLength;
  const count = data.readUInt32LE(at);
  at += 4;
  const entries: string[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 4 > data.length) throw new TagWriteError("its details couldn't be read safely");
    const length = data.readUInt32LE(at);
    if (at + 4 + length > data.length) throw new TagWriteError("its details couldn't be read safely");
    entries.push(data.toString("utf8", at + 4, at + 4 + length));
    at += 4 + length;
  }
  return { vendor, entries };
}

function rewriteFlac(bytes: Buffer, change: TagValues): Parts {
  const { blocks, audioStart } = flacBlocks(bytes);
  const old = blocks.find((b) => b.type === 4);
  const { vendor, entries } = comments(old?.data);
  const keyOf = (entry: string) => entry.slice(0, Math.max(0, entry.indexOf("="))).toUpperCase();
  const valueOf = (key: string) => entries.find((e) => keyOf(e) === key)?.slice(key.length + 1);
  const add: string[] = [];
  const drop = new Set<string>();
  const set = (key: string, value: string | number | undefined, also: string[] = []) => {
    if (value === undefined) return;
    add.push(`${key}=${value}`);
    drop.add(key);
    for (const other of also) drop.add(other);
  };
  for (const field of ["title", "artist", "album_artist", "album", "year"] as const) set(VORBIS[field].key, change[field], VORBIS[field].drop);
  // Numbers: "3" and "12" in their own comments (an old "3/12" is split up, keeping its total).
  if (change.track_no !== undefined || change.track_total !== undefined) {
    const now = pair(valueOf("TRACKNUMBER"));
    set("TRACKNUMBER", change.track_no ?? now.no);
    set("TRACKTOTAL", change.track_total ?? now.total ?? (Number(valueOf("TRACKTOTAL") ?? valueOf("TOTALTRACKS")) || undefined), ["TOTALTRACKS"]);
  }
  if (change.disc_no !== undefined || change.disc_total !== undefined) {
    const now = pair(valueOf("DISCNUMBER"));
    set("DISCNUMBER", change.disc_no ?? now.no);
    set("DISCTOTAL", change.disc_total ?? now.total ?? (Number(valueOf("DISCTOTAL") ?? valueOf("TOTALDISCS")) || undefined), ["TOTALDISCS"]);
  }
  const kept = [...add, ...entries.filter((entry) => !drop.has(keyOf(entry)))];
  const encoded = kept.map((entry) => Buffer.from(entry, "utf8"));
  const data = Buffer.alloc(4 + vendor.length + 4 + encoded.reduce((n, e) => n + 4 + e.length, 0));
  let at = data.writeUInt32LE(vendor.length, 0);
  at += vendor.copy(data, at);
  at = data.writeUInt32LE(encoded.length, at);
  for (const entry of encoded) { at = data.writeUInt32LE(entry.length, at); at += entry.copy(data, at); }

  // Same blocks in the same order (comments where they were, or right after the stream info); padding last.
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type === 1) continue;
    out.push(block.type === 4 ? { type: 4, data } : block);
    if (block.type === 0 && !old) out.push({ type: 4, data });
  }
  const used = out.reduce((n, b) => n + 4 + b.data.length, 0);
  const room = audioStart - 4;
  const padding = used + 4 <= room ? room - used - 4 : 4096; // keep the audio where it was when it fits
  out.push({ type: 1, data: Buffer.alloc(padding) });
  const head = Buffer.concat([Buffer.from("fLaC", "latin1"), ...out.map((block, i) => {
    if (block.data.length >= 1 << 24) throw new TagWriteError("a block would be too large");
    const header = Buffer.alloc(4);
    header[0] = (i === out.length - 1 ? 0x80 : 0) | block.type;
    header.writeUIntBE(block.data.length, 1, 3);
    return Buffer.concat([header, block.data]);
  })]);
  return { head, audio: bytes.subarray(audioStart), tail: Buffer.alloc(0) };
}

// --- The two things the librarian does ------------------------------------------------------

/** Split a file into tags / audio / tail (to check the audio is untouched, and to keep the old tag parts for undo). */
export function splitParts(bytes: Buffer, format: Format): Parts {
  if (format === "mp3") return mp3Parts(bytes);
  const { audioStart } = flacBlocks(bytes);
  return { head: bytes.subarray(0, audioStart), audio: bytes.subarray(audioStart), tail: Buffer.alloc(0) };
}

/** The new file's parts with `change` written in. Throws TagWriteError (with a plain reason) when it can't be done safely. */
export function rewrite(bytes: Buffer, format: Format, change: TagValues): Parts {
  for (const [key, value] of Object.entries(change)) {
    if (!(TAG_FIELDS as readonly string[]).includes(key)) throw new TagWriteError(`unknown detail ${key}`);
    if (typeof value === "string" && (!value.trim() || value.length > 500 || /[\0\r\n]/.test(value))) throw new TagWriteError(`unusable text for ${key}`);
    if (typeof value === "number" && (!Number.isInteger(value) || value < 1 || value > 9999)) throw new TagWriteError(`unusable number for ${key}`);
  }
  return format === "mp3" ? rewriteMp3(bytes, change) : rewriteFlac(bytes, change);
}

export const join = (parts: Parts) => Buffer.concat([parts.head, parts.audio, parts.tail]);
