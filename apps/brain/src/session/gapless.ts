/**
 * Gapless playback needs to know how much silence an encoder added to a file.
 *
 * MP3 and AAC encoders put a few thousand samples of silence ("priming") at
 * the start and pad the end out to a whole frame. Played as-is, that's a tiny
 * gap between tracks of a live album. Good encoders write down exactly how
 * much they added:
 *   - MP3: the LAME (or Lavc) tag in the first frame's Xing/Info header:
 *     encoder delay and padding, 12 bits each. Decoders add 529 samples of
 *     their own delay, so the start trim is delay + 529 and the end trim
 *     padding − 529.
 *   - M4A: the iTunSMPB comment: delay, padding and the real sample count.
 *
 * The player compares this with the length its decoder produced (browsers
 * differ in whether they trim already) and trims what's left. Read-only,
 * headers only; null when a file doesn't say.
 */

import { closeSync, openSync, readSync, statSync } from "node:fs";

export type Gapless = {
  /** Samples of silence at the start (encoder + decoder delay). */
  delay: number;
  /** Samples of padding at the end. */
  padding: number;
  /** The real number of samples, without delay or padding. */
  samples: number;
  /** Sample rate those numbers are in. */
  rate: number;
};

function read(fd: number, at: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  return buffer.subarray(0, readSync(fd, buffer, 0, length, at));
}

const MPEG_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3: from the Xing/Info header of the first frame, and its LAME tag. */
export function mp3Gapless(head: Buffer): Gapless | null {
  let at = 0;
  if (head.toString("latin1", 0, 3) === "ID3") at = 10 + (((head[6]! & 0x7f) << 21) | ((head[7]! & 0x7f) << 14) | ((head[8]! & 0x7f) << 7) | (head[9]! & 0x7f));
  // The first frame: a sync word (stray zeros before it are allowed).
  const limit = Math.min(head.length - 4, at + 8192);
  while (at < limit && !(head[at] === 0xff && (head[at + 1]! & 0xe0) === 0xe0)) at++;
  if (at >= limit) return null;
  const version = (head[at + 1]! >> 3) & 3, layer = (head[at + 1]! >> 1) & 3;
  if (layer !== 1 || version === 1) return null; // Layer III only
  const rate = MPEG_RATES[version]?.[(head[at + 2]! >> 2) & 3];
  if (!rate) return null;
  const mono = ((head[at + 3]! >> 6) & 3) === 3;
  const side = version === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  const xing = at + 4 + side;
  const tag = head.toString("latin1", xing, xing + 4);
  if (tag !== "Xing" && tag !== "Info") return null;
  const flags = head.readUInt32BE(xing + 4);
  if (!(flags & 1)) return null; // no frame count
  const frames = head.readUInt32BE(xing + 8);
  // The LAME tag sits 120 bytes into the Xing header (frames, bytes, TOC and quality always written by LAME).
  const lame = xing + 120;
  if (lame + 24 > head.length || !/^(LAME|Lavc|Lavf|L3.9)/.test(head.toString("latin1", lame, lame + 4))) return null;
  const delay = (head[lame + 21]! << 4) | (head[lame + 22]! >> 4);
  const padding = ((head[lame + 22]! & 0x0f) << 8) | head[lame + 23]!;
  const perFrame = version === 3 ? 1152 : 576;
  const samples = frames * perFrame - delay - padding;
  if (samples <= 0 || delay > 4096 || padding > 4096) return null;
  return { delay: delay + 529, padding: Math.max(0, padding - 529), samples, rate };
}

/** M4A: the iTunSMPB comment (" 00000000 00000840 000001CC 0000000000A2A3F4 …", hex). */
export function mp4Gapless(moov: Buffer, rate: number | undefined): Gapless | null {
  const at = moov.indexOf("iTunSMPB", 0, "latin1");
  if (at < 0) return null;
  const data = moov.indexOf("data", at, "latin1");
  if (data < 0 || data - at > 64) return null;
  const text = moov.toString("latin1", data + 12, Math.min(moov.length, data + 12 + 120));
  const parts = text.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const delay = parseInt(parts[1]!, 16), padding = parseInt(parts[2]!, 16), samples = parseInt(parts[3]!, 16);
  if (![delay, padding, samples].every(Number.isFinite) || samples <= 0) return null;
  return { delay, padding, samples, rate: rate ?? 44100 };
}

/** The `moov` box of an MP4 file (where iTunSMPB lives), read by its header only. */
function readMoov(fd: number, size: number): Buffer | null {
  let at = 0;
  for (let i = 0; i < 64 && at + 8 <= size; i++) {
    const header = read(fd, at, 16);
    let length = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    if (length === 1) length = Number(header.readBigUInt64BE(8));
    else if (length === 0) length = size - at;
    if (length < 8) return null;
    if (type === "moov") return length <= 64 * 1024 * 1024 ? read(fd, at, length) : null;
    at += length;
  }
  return null;
}

const cache = new Map<string, Gapless | null>();

/** Gapless numbers for a file, remembered by path, size and modified time. Never throws. */
export function gaplessInfo(path: string, rate?: number): Gapless | null {
  let fd: number | undefined;
  try {
    const stat = statSync(path);
    const key = `${path}\n${stat.size}\n${stat.mtimeMs}`;
    if (cache.has(key)) return cache.get(key)!;
    fd = openSync(path, "r");
    const lower = path.toLowerCase();
    let info: Gapless | null = null;
    if (lower.endsWith(".mp3")) {
      const first = read(fd, 0, 10);
      const tagLength = first.toString("latin1", 0, 3) === "ID3" ? 10 + (((first[6]! & 0x7f) << 21) | ((first[7]! & 0x7f) << 14) | ((first[8]! & 0x7f) << 7) | (first[9]! & 0x7f)) : 0;
      // Headers only: the tag (it can hold cover art) isn't read, just skipped.
      info = mp3Gapless(read(fd, tagLength, 12_000));
    } else if (/\.(m4a|mp4|aac|alac)$/.test(lower)) {
      const moov = readMoov(fd, stat.size);
      info = moov ? mp4Gapless(moov, rate) : null;
    }
    if (cache.size > 20_000) cache.clear();
    cache.set(key, info);
    return info;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ }
  }
}
