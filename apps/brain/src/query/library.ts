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

export class LibrarySource {
  private path: string;
  private cached: Library = { version: "empty", tracks: [] };
  private stamp = "";
  /** Rows dropped because they lacked an id or title. */
  rejected = 0;

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
    this.cached = { version: createHash("sha256").update(raw).digest("hex").slice(0, 12), tracks };
    this.stamp = stamp;
    return this.cached;
  }
}
