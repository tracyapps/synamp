/**
 * Duplicate-blocked merges (LIBRARY-CARE, owner request 2026-10-04).
 *
 * When a merge or rename would put a file where another one already sits, and
 * the two are certainly **the same recording**, the better copy is kept and
 * the other is set aside in `incoming/_duplicates/` — moved, never deleted,
 * journaled and undoable like any other move.
 *
 * "Certainly the same" means one of:
 *   - identical audio: the analyzer's audio hash is equal (same decoded
 *     samples — a copy, or the same rip with other tags);
 *   - same recording, another file: the Chromaprint sketches line up (low
 *     bit-error rate) and the lengths agree to within a couple of seconds —
 *     e.g. a FLAC and an MP3 of one rip.
 * Anything else — not analysed yet, lengths differ, sketches disagree (live vs
 * studio) — stays a conflict for a person to decide. A remaster can still look
 * like the same recording to a fingerprint, so the owner sees both copies and
 * can choose the other one ("Keep this one instead").
 */

import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import type { LibraryTrack } from "../query/evaluate.ts";

export type Quality = {
  format?: string;
  lossless?: boolean;
  bitrate_kbps?: number;
  sample_rate?: number;
  bit_depth?: number;
  size_bytes?: number;
};

export type Sameness =
  | { same: true; how: "identical" | "recording"; ber?: number }
  | { same: false; why: string };

/** Sketches more alike than this (fraction of differing bits) are the same recording. Unrelated audio sits near 0.5. */
export const MAX_BER = 0.15;
/** Lengths may differ by this much (encoder padding, a trimmed gap) and still count as one recording. */
export const LENGTH_SLACK_S = 2;
const MAX_SHIFT = 8;
const MIN_OVERLAP = 32;

const lengthOf = (track: LibraryTrack) => track.duration_s ?? track.audio_duration_s;

function decodeSketch(text: string | undefined): { start: number; values: Uint32Array } | undefined {
  if (!text) return undefined;
  const [format, start, payload] = text.split(":");
  if (format !== "cp1" || !payload || !/^\d+$/.test(start ?? "")) return undefined;
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length || bytes.length % 4) return undefined;
  const values = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = bytes.readUInt32LE(i * 4);
  return { start: Number(start), values };
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Lowest bit-error rate over small shifts (encoder delay, a slightly longer gap). */
export function sketchDistance(a?: string, b?: string): number | undefined {
  const x = decodeSketch(a), y = decodeSketch(b);
  if (!x || !y) return undefined;
  let best: number | undefined;
  const base = x.start - y.start; // the windows may start at different places on short tracks
  for (let shift = -MAX_SHIFT; shift <= MAX_SHIFT; shift++) {
    const offset = base + shift; // x[i] lines up with y[i + offset]
    let bits = 0, count = 0;
    for (let i = 0; i < x.values.length; i++) {
      const j = i + offset;
      if (j < 0 || j >= y.values.length) continue;
      bits += popcount((x.values[i]! ^ y.values[j]!) >>> 0);
      count++;
    }
    if (count < MIN_OVERLAP) continue;
    const ber = bits / (count * 32);
    if (best === undefined || ber < best) best = ber;
  }
  return best;
}

export function sameRecording(a: LibraryTrack, b: LibraryTrack): Sameness {
  if (a.audio_hash && a.audio_hash === b.audio_hash) return { same: true, how: "identical" };
  const la = lengthOf(a), lb = lengthOf(b);
  if (la !== undefined && lb !== undefined && Math.abs(la - lb) > LENGTH_SLACK_S) {
    return { same: false, why: `lengths differ by ${Math.round(Math.abs(la - lb))} s` };
  }
  const ber = sketchDistance(a.fp_sketch, b.fp_sketch);
  if (ber === undefined) {
    return { same: false, why: a.fp_sketch || b.fp_sketch ? "one of them isn’t fingerprinted yet" : "not analysed yet, so SynAmp can’t tell" };
  }
  if (ber > MAX_BER) return { same: false, why: "a different recording" };
  if (la === undefined || lb === undefined) return { same: false, why: "lengths unknown, so SynAmp can’t be sure" };
  return { same: true, how: "recording", ber: Math.round(ber * 1000) / 1000 };
}

/** "FLAC, 24-bit 96 kHz" / "MP3, 320 kbps" / "M4A". */
export function describeQuality(q?: Quality): string {
  if (!q?.format) return "unknown format";
  const parts: string[] = [];
  if (q.lossless && (q.bit_depth || q.sample_rate)) {
    parts.push([q.bit_depth ? `${q.bit_depth}-bit` : "", q.sample_rate ? `${Math.round(q.sample_rate / 100) / 10} kHz` : ""].filter(Boolean).join(" "));
  } else if (q.bitrate_kbps) parts.push(`${Math.round(q.bitrate_kbps)} kbps`);
  if (q.lossless !== undefined) parts.push(q.lossless ? "lossless" : "lossy");
  return `${q.format.toUpperCase()}${parts.length ? `, ${parts.join(", ")}` : ""}`;
}

const TAG_FIELDS = ["title", "artist", "album", "album_artist", "track_no", "year", "mb_albumid"] as const;
export function tagScore(track: LibraryTrack): number {
  if (track.metadata_source !== "tags") return 0;
  return TAG_FIELDS.filter((key) => track[key] !== undefined && track[key] !== "").length;
}

/** Quality as a comparable list, best first: lossless, then bit depth and sample rate (lossless only), then bitrate. */
function qualityKey(q?: Quality): number[] {
  const lossless = q?.lossless ? 1 : 0;
  return [lossless, lossless ? q?.bit_depth ?? 0 : 0, lossless ? q?.sample_rate ?? 0 : 0, lossless ? 0 : q?.bitrate_kbps ?? 0];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/** "Song (2).mp3" / "Song copy.mp3" → the copy number (1 for the plain name). */
const COPY_SUFFIX = /(?: \((\d{1,3})\)| copy(?: (\d{1,3}))?)$/i;
export function copyNumber(path: string): { base: string; copy: number } {
  const file = basename(path);
  const dot = file.lastIndexOf(".");
  const stemPart = dot > 0 ? file.slice(0, dot) : file;
  const match = stemPart.match(COPY_SUFFIX);
  if (!match) return { base: path, copy: 1 };
  const base = `${dirname(path)}/${stemPart.slice(0, match.index)}${dot > 0 ? file.slice(dot) : ""}`;
  return { base, copy: Number(match[1] ?? match[2] ?? 2) || 2 };
}
const copySuffix = (path: string) => {
  const file = basename(path);
  const stemPart = file.includes(".") ? file.slice(0, file.lastIndexOf(".")) : file;
  return stemPart.match(COPY_SUFFIX)?.[0].trim() ?? "";
};

export type Choice = { keep: LibraryTrack; aside: LibraryTrack; why: string };

/**
 * The better copy. `resident` is the one already in place: on a tie it stays,
 * which means one move fewer.
 */
export function betterCopy(resident: LibraryTrack, arriving: LibraryTrack): Choice {
  const byQuality = compare(qualityKey(resident.quality), qualityKey(arriving.quality));
  if (byQuality !== 0) {
    const [keep, aside] = byQuality > 0 ? [resident, arriving] : [arriving, resident];
    return { keep, aside, why: `${describeQuality(keep.quality)} beats ${describeQuality(aside.quality)}` };
  }
  const byTags = tagScore(resident) - tagScore(arriving);
  if (byTags !== 0) {
    const [keep, aside] = byTags > 0 ? [resident, arriving] : [arriving, resident];
    return { keep, aside, why: `same quality; this copy has fuller tags` };
  }
  // A true tie: keep the copy with the cleaner name ("Song.mp3" over "Song (2).mp3").
  const byName = (arriving.path ? copyNumber(arriving.path).copy : 1) - (resident.path ? copyNumber(resident.path).copy : 1);
  if (byName < 0) return { keep: arriving, aside: resident, why: `same quality and tags; keeps the copy without “${copySuffix(resident.path!)}” in its name` };
  return { keep: resident, aside: arriving, why: byName > 0
    ? `same quality and tags; keeps the copy without “${copySuffix(arriving.path!)}” in its name`
    : "same quality and tags; the copy already there stays" };
}

/** Stable key for a pair, whichever way round it comes. */
export function pairKey(a: LibraryTrack, b: LibraryTrack): string {
  return createHash("sha256").update([a.id, b.id].sort().join("\n")).digest("hex").slice(0, 16);
}

export const SET_ASIDE_FOLDER = "_duplicates";
