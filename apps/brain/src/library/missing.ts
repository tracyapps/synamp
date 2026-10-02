/**
 * The missing-tracks list (LIBRARY-CARE step 3).
 *
 * Read-only toward the music: nothing here touches a file. Three parts:
 *
 *   1. AlbumMatches — which MusicBrainz release each album folder is, found by
 *      a slow background matcher (1 request/second) and kept on disk. A
 *      confident match is accepted; anything uncertain goes to a review queue
 *      where the owner picks the edition (or says "not on MusicBrainz").
 *   2. missingList() — a pure comparison of each matched release with the files
 *      present *now*. Re-ripped tracks drop off by themselves the next time the
 *      library index refreshes; no bookkeeping, nothing to forget.
 *   3. MissingNotes — the owner's own status, tags and notes per missing track.
 *      Kept separately, so they survive re-matching and are still there if a
 *      track goes missing again.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library } from "../query/evaluate.ts";
import { groupAlbums, matchRelease, missingTracks } from "./albums.ts";
import type { AlbumUnit, MissingTrack } from "./albums.ts";
import { MusicBrainzError } from "./musicbrainz.ts";
import type { MbCandidate, MbRelease, MusicBrainz } from "./musicbrainz.ts";

function readJson<T>(path: string, fallback: T): T {
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return fallback; }
}
function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}

export class MissingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

// --- 1. matches ----------------------------------------------------------------

export type AlbumRecord = {
  key: string;
  status: "matched" | "needs_review" | "no_match" | "skipped" | "error";
  /** The folder's track set when this was decided; a change re-opens uncertain results. */
  fingerprint: string;
  release?: MbRelease;
  source?: "tag" | "search" | "you";
  confidence?: number;
  /** Other plausible editions, for "change edition". */
  alternatives?: MbCandidate[];
  /** Search results to choose from when nothing was confident. */
  candidates?: MbCandidate[];
  error?: string;
  checked_at: number;
};

export class AlbumMatches {
  private path: string;
  records: Record<string, AlbumRecord>;
  constructor(path: string) {
    this.path = path;
    this.records = readJson<{ records?: Record<string, AlbumRecord> }>(path, {}).records ?? {};
  }
  save(): void { writeJson(this.path, { format: "synamp.album-matches/1", records: this.records }); }
  set(record: AlbumRecord): void { this.records[record.key] = record; this.save(); }

  /** Folders that still need a decision: never checked, or uncertain and changed since. */
  due(units: AlbumUnit[]): AlbumUnit[] {
    return units.filter((unit) => {
      const record = this.records[unit.key];
      if (!record) return true;
      if (record.status === "matched" || record.status === "skipped") return false;
      // Uncertain results are retried when the folder changes; errors also after a day.
      return record.fingerprint !== unit.fingerprint || (record.status === "error" && Date.now() - record.checked_at > 86_400_000);
    });
  }
}

/** Prefer what was most likely ripped from a CD: official, CD format, earliest. */
function preference(c: MbCandidate): number {
  return (c.status === "Official" ? 2 : 0) + (c.formats.some((f) => /CD/i.test(f)) ? 1 : 0);
}

export async function matchAlbum(unit: AlbumUnit, mb: MusicBrainz, now = Date.now()): Promise<AlbumRecord> {
  const base = { key: unit.key, fingerprint: unit.fingerprint, checked_at: now };
  if (unit.mb_albumid) {
    // The files say exactly which release they are (tagged by Picard or similar).
    const release = await mb.release(unit.mb_albumid);
    return { ...base, status: "matched", release, source: "tag", confidence: matchRelease(unit, release).score };
  }
  const found = await mb.searchReleases(unit.title, unit.artist === "Various Artists" ? undefined : unit.artist);
  if (!found.length) return { ...base, status: "no_match" };
  const highest = Math.max(...unit.tracks.map((t) => t.track_no ?? 0), unit.tracks.length);
  const ranked = [...found]
    .filter((c) => c.score >= 60)
    // Long enough to hold the files, best search score, then the plain edition (no "deluxe",
    // fewest tracks) as ripped from a CD, earliest first. Bonus-track editions stay alternatives.
    .sort((a, b) => Number(b.track_count >= highest) - Number(a.track_count >= highest) || b.score - a.score
      || Number(!b.disambiguation) - Number(!a.disambiguation) || preference(b) - preference(a)
      || a.track_count - b.track_count || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  let best: { release: MbRelease; score: number } | undefined;
  const confident: MbCandidate[] = [];
  for (const candidate of ranked.slice(0, 3)) {
    const release = await mb.release(candidate.id);
    const match = matchRelease(unit, release);
    if (match.confident) confident.push(candidate);
    if (match.confident && (!best || match.score > best.score)) best = { release, score: match.score };
    if (best && best.score >= 0.95) break; // clearly this one; save MusicBrainz the extra requests
  }
  if (best) {
    return { ...base, status: "matched", release: best.release, source: "search", confidence: best.score,
      alternatives: ranked.filter((c) => c.id !== best!.release.id).slice(0, 6) };
  }
  return { ...base, status: "needs_review", candidates: ranked.slice(0, 8).length ? ranked.slice(0, 8) : found.slice(0, 8) };
}

/** Background matching: one folder at a time, MusicBrainz-paced, resumable, pausable. */
export class Matcher {
  state: "idle" | "running" | "paused" | "waiting" = "idle";
  current = "";
  lastError = "";
  done = 0;
  private stopRequested = false;
  private matches: AlbumMatches;
  private mb: () => MusicBrainz;
  private library: () => Library;
  private sleep: (ms: number) => Promise<void>;

  constructor(matches: AlbumMatches, mb: () => MusicBrainz, library: () => Library, sleep?: (ms: number) => Promise<void>) {
    this.matches = matches;
    this.mb = mb;
    this.library = library;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  start(): Promise<void> | undefined {
    if (this.state === "running" || this.state === "waiting") return undefined;
    const client = this.mb(); // throws without a contact, before anything starts
    this.stopRequested = false;
    this.state = "running";
    return this.loop(client);
  }

  pause(): void { this.stopRequested = true; if (this.state !== "idle") this.state = "paused"; }

  private async loop(client: MusicBrainz): Promise<void> {
    let backoff = 30_000;
    const attempted = new Set<string>(); // never loop on the same folder within one run
    while (!this.stopRequested) {
      const next = this.matches.due(groupAlbums(this.library())).find((unit) => !attempted.has(unit.key));
      if (!next) { this.state = "idle"; this.current = ""; return; }
      this.current = next.key;
      try {
        this.matches.set(await matchAlbum(next, client));
        attempted.add(next.key);
        this.done++;
        backoff = 30_000;
        this.lastError = "";
      } catch (error) {
        const failure = error instanceof MusicBrainzError ? error : new MusicBrainzError(String(error));
        this.lastError = failure.message;
        if (failure.retryable) {
          this.state = "waiting";
          await this.sleep(backoff);
          backoff = Math.min(backoff * 2, 15 * 60_000);
          if (!this.stopRequested) this.state = "running";
        } else {
          this.matches.set({ key: next.key, fingerprint: next.fingerprint, status: "error", error: failure.message, checked_at: Date.now() });
          attempted.add(next.key);
        }
      }
    }
    this.current = "";
  }
}

// --- 3. the owner's notes ---------------------------------------------------------

export const STATUSES = ["missing", "want", "ordered", "have_source", "ignore"] as const;
export type MissingStatus = (typeof STATUSES)[number];
export type Note = { status: MissingStatus; tags: string[]; note: string; updated_at: number };

export class MissingNotes {
  private path: string;
  entries: Record<string, Note>;
  constructor(path: string) {
    this.path = path;
    this.entries = readJson<{ entries?: Record<string, Note> }>(path, {}).entries ?? {};
  }
  update(id: string, input: { status?: unknown; tags?: unknown; note?: unknown }, now = Date.now()): Note {
    if (!/^[0-9a-f-]{36}:\d{1,2}-\d{1,3}$/.test(id)) throw new MissingError("Unknown missing-track id", 404);
    const current = this.entries[id] ?? { status: "missing", tags: [], note: "", updated_at: now };
    const next: Note = { ...current, updated_at: now };
    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status as MissingStatus)) throw new MissingError(`status must be one of ${STATUSES.join(", ")}`);
      next.status = input.status as MissingStatus;
    }
    if (input.tags !== undefined) {
      if (!Array.isArray(input.tags) || input.tags.length > 20) throw new MissingError("tags must be a list of up to 20");
      next.tags = [...new Set(input.tags.map((tag) => String(tag).trim().slice(0, 40)).filter(Boolean))];
    }
    if (input.note !== undefined) next.note = String(input.note).slice(0, 2000);
    this.entries[id] = next;
    writeJson(this.path, { format: "synamp.missing-notes/1", entries: this.entries });
    return next;
  }
}

// --- 2. the list ----------------------------------------------------------------------

export type MissingRow = MissingTrack & {
  album_key: string;
  album: string;
  artist: string;
  year?: string;
  edition?: string;
  album_have: number;
  album_total: number;
  status: MissingStatus;
  tags: string[];
  note: string;
};

export type MissingReport = {
  summary: {
    albums: number; checked: number; matched: number; complete: number; with_gaps: number;
    missing_tracks: number; needs_review: number; no_match: number; skipped: number; errors: number;
    /** Tracks you noted that are no longer missing — found again. */
    found_again: number;
  };
  rows: MissingRow[];
  /** Folders waiting for the owner: uncertain matches, and ones search couldn't find (not_found). */
  review: Array<{ key: string; title: string; artist: string; tracks: number; candidates: MbCandidate[]; not_found?: boolean }>;
  found: Array<{ id: string; note: Note }>;
};

export function missingList(library: Library, matches: AlbumMatches, notes: MissingNotes): MissingReport {
  const units = groupAlbums(library);
  const rows: MissingRow[] = [];
  const review: MissingReport["review"] = [];
  const counts = { matched: 0, complete: 0, with_gaps: 0, needs_review: 0, no_match: 0, skipped: 0, errors: 0, checked: 0 };
  const stillMissing = new Set<string>();
  for (const unit of units) {
    const record = matches.records[unit.key];
    if (!record) continue;
    counts.checked++;
    if (record.status === "needs_review") { counts.needs_review++; review.push({ key: unit.key, title: unit.title, artist: unit.artist, tracks: unit.tracks.length, candidates: record.candidates ?? [] }); continue; }
    if (record.status === "no_match") {
      counts.no_match++;
      review.push({ key: unit.key, title: unit.title, artist: unit.artist, tracks: unit.tracks.length, candidates: [], not_found: true });
      continue;
    }
    if (record.status === "skipped") { counts.skipped++; continue; }
    if (record.status === "error" || !record.release) { counts.errors++; continue; }
    counts.matched++;
    const release = record.release;
    const match = matchRelease(unit, release);
    const gaps = missingTracks(release, match);
    if (!gaps.length) { counts.complete++; continue; }
    counts.with_gaps++;
    for (const gap of gaps) {
      stillMissing.add(gap.id);
      const note = notes.entries[gap.id];
      rows.push({
        ...gap, album_key: unit.key, album: release.title, artist: release.artist,
        ...(release.date ? { year: release.date.slice(0, 4) } : {}),
        ...(release.disambiguation ? { edition: release.disambiguation } : {}),
        album_have: release.track_count - gaps.length, album_total: release.track_count,
        status: note?.status ?? "missing", tags: note?.tags ?? [], note: note?.note ?? "",
      });
    }
  }
  // Noted tracks that are no longer missing from an album still matched to that release: found again.
  const matchedReleases = new Set(Object.values(matches.records).flatMap((r) => (r.status === "matched" && r.release ? [r.release.id] : [])));
  const found = Object.entries(notes.entries)
    .filter(([id, note]) => !stillMissing.has(id) && matchedReleases.has(id.split(":")[0]!) && (note.status !== "missing" || note.tags.length || note.note))
    .map(([id, note]) => ({ id, note }));
  return {
    summary: {
      albums: units.length, ...counts, missing_tracks: rows.length, found_again: found.length,
    },
    rows, review, found,
  };
}

/** CSV for spreadsheets (RFC 4180 quoting). */
export function missingCsv(rows: MissingRow[]): string {
  const header = ["Artist", "Album", "Year", "Edition", "Disc", "Track", "Title", "Length", "Status", "Tags", "Note", "Have", "Of", "Folder"];
  const q = (value: unknown) => {
    const text = value === undefined || value === null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const length = (ms?: number) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}` : "");
  return [header, ...rows.map((r) => [r.artist, r.album, r.year, r.edition, r.discs > 1 ? r.disc : "", r.number, r.title, length(r.length_ms),
    r.status, r.tags.join("; "), r.note, r.album_have, r.album_total, r.album_key])]
    .map((line) => line.map(q).join(",")).join("\r\n") + "\r\n";
}

/** The owner picks an edition (or none) for a folder. */
export async function chooseRelease(matches: AlbumMatches, unit: AlbumUnit, releaseId: string | null, mb: MusicBrainz): Promise<AlbumRecord> {
  if (releaseId === null) {
    const record: AlbumRecord = { key: unit.key, fingerprint: unit.fingerprint, status: "skipped", checked_at: Date.now() };
    matches.set(record);
    return record;
  }
  const release = await mb.release(releaseId);
  const previous = matches.records[unit.key];
  const record: AlbumRecord = {
    key: unit.key, fingerprint: unit.fingerprint, status: "matched", release, source: "you",
    confidence: matchRelease(unit, release).score, checked_at: Date.now(),
    alternatives: [
      ...(previous?.release ? [{ ...previous.release, score: 100, formats: previous.release.media.map((m) => m.format ?? "?") }] : []),
      ...(previous?.alternatives ?? []), ...(previous?.candidates ?? []),
    ].filter((c, i, list) => c.id !== releaseId && list.findIndex((o) => o.id === c.id) === i)
      .map(({ media: _media, ...candidate }: MbCandidate & { media?: unknown }) => candidate as MbCandidate).slice(0, 8),
  };
  matches.set(record);
  return record;
}
