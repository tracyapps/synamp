/**
 * Library signals source — an interim, file-backed stand-in for the brain DB.
 *
 * The analyzer has no export to the brain yet (AGENT-ROADMAP P1 deliverable 5),
 * so the brain reads a JSON file of per-track signals. The file is re-read when
 * it changes, which is what makes saved smart playlists "live": add a track to
 * the file and the next resolve includes it, no restart.
 *
 * The bundled sample is synthetic. It exists to exercise the query logic and the
 * UI, not to say anything about how real music measures.
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { Library, LibraryTrack } from "./evaluate.ts";

/** Formats this reader understands. A file with no `format` is the hand-made/sample shape. */
export const LIBRARY_FORMATS = ["synamp.library-signals/1"] as const;

export class LibrarySource {
  private path: string;
  private cached: Library = { version: "empty", tracks: [] };
  private stamp = "";
  /** Rows dropped because they lacked an id or title. */
  rejected = 0;
  private byPath = new Map<string, string>();
  private canonical = new Map<string, string>();

  constructor(path: string) { this.path = path; }

  get(): Library {
    let stamp: string;
    try {
      const stat = statSync(this.path);
      stamp = `${stat.size}:${stat.mtimeMs}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: "missing", tracks: [] };
      throw error;
    }
    if (stamp === this.stamp) return this.cached;
    const raw = readFileSync(this.path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const format = Array.isArray(parsed) ? undefined : (parsed as { format?: unknown }).format;
    if (format !== undefined && !(LIBRARY_FORMATS as readonly unknown[]).includes(format)) {
      // A newer exporter must not be read with old assumptions.
      throw new Error(`Library file ${this.path} has unsupported format ${JSON.stringify(format)}`);
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { tracks?: unknown }).tracks;
    if (!Array.isArray(rows)) throw new Error(`Library file ${this.path} has no tracks array`);
    const seen = new Set<string>();
    const tracks: LibraryTrack[] = [];
    this.rejected = 0;
    for (const row of rows) {
      const track = row as LibraryTrack;
      if (!track || typeof track.id !== "string" || !track.id || typeof track.title !== "string" || seen.has(track.id)) { this.rejected++; continue; }
      seen.add(track.id);
      tracks.push(track);
    }
    attachSoundVectors(tracks);
    this.cached = { version: createHash("sha256").update(raw).digest("hex").slice(0, 12), tracks };
    this.byPath = new Map(tracks.filter((track) => track.path).map((track) => [track.path!, track.id]));
    this.canonical = new Map(tracks.flatMap((track) => (track.aliases ?? []).map((alias): [string, string] => [alias, track.id])));
    this.stamp = stamp;
    return this.cached;
  }

  /** The track at a library-relative path, if indexed. IDs survive moves, so look up rather than hash. */
  idForPath(relative: string): string | undefined { this.get(); return this.byPath.get(relative); }

  /** Maps an old ID (from before a move) to the track's current one. */
  canonicalId(id: string): string { this.get(); return this.canonical.get(id) ?? id; }
}

/**
 * "Sounds like": the analyzer's voice stage stores each song's sound as 128
 * signed bytes (base64, `sound_vector`). Decode them into `embedding`, centred
 * on this library's average sound and scaled to length 1, so cosine similarity
 * compares how songs differ from the library rather than what they all share.
 */
export function attachSoundVectors(tracks: LibraryTrack[]): number {
  const decoded: Array<[LibraryTrack, Float64Array]> = [];
  for (const track of tracks) {
    const text = (track as { sound_vector?: unknown }).sound_vector;
    if (typeof text !== "string") continue;
    const bytes = Buffer.from(text, "base64");
    if (bytes.length !== 128) continue;
    const vector = new Float64Array(128);
    for (let i = 0; i < 128; i++) vector[i] = bytes.readInt8(i);
    decoded.push([track, vector]);
  }
  if (decoded.length < 2) {
    for (const [track, vector] of decoded) track.embedding = unit(vector);
    return decoded.length;
  }
  const mean = new Float64Array(128);
  for (const [, vector] of decoded) for (let i = 0; i < 128; i++) mean[i]! += vector[i]! / decoded.length;
  for (const [track, vector] of decoded) {
    for (let i = 0; i < 128; i++) vector[i]! -= mean[i]!;
    track.embedding = unit(vector);
  }
  return decoded.length;
}

function unit(vector: Float64Array): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => Math.round((value / norm) * 1e4) / 1e4);
}
