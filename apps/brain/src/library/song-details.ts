/**
 * "Fix song details inside the files": proposals to write corrected details
 * (title, artist, album, album artist, track and disc numbers, year) into the
 * files themselves, from the album's MusicBrainz match.
 *
 * They're reviewed with the rest of Organise (decision kind "tags") and
 * written by the librarian, which keeps the old tag so Undo puts it back.
 *
 * Only albums matched with confidence (or the edition you chose, or the
 * MusicBrainz ID in the files) are proposed, and only the details these
 * settings allow:
 *   - fill_missing_details: details the file doesn't have at all
 *   - fix_track_numbers: track (and, on multi-disc albums, disc) numbers that disagree
 *   - match_mb_spelling: album, album artist and song titles spelled as on MusicBrainz (off by default)
 *
 * What a file says now comes from the file itself (TagCache), not the
 * analyzer's export: track numbers there may come from the file name.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { groupAlbums, matchRelease } from "./albums.ts";
import type { AlbumRecord } from "./missing.ts";
import type { MbRelease } from "./musicbrainz.ts";
import { readTags } from "./tags.ts";
import type { FileTags } from "./tags.ts";
import { formatOf, TAG_FIELDS } from "./tag-writer.ts";
import type { TagField, TagValues } from "./tag-writer.ts";

export type DetailSettings = { fill_missing_details: boolean; fix_track_numbers: boolean; match_mb_spelling: boolean };

/** One file's change: what it says now (for the fields that change) and what it will say. */
export type TagEdit = { path: string; track_id: string; now: TagValues; set: TagValues };

// --- what the files say now -----------------------------------------------------------------

type Cached = { size: number; mtime: number; tags: FileTags };

/**
 * Tags read from the files (read-only), remembered by size and modified time,
 * and filled in a little at a time in the background so the brain stays responsive.
 */
export class TagCache {
  private entries = new Map<string, Cached>();
  private dirty = false;
  /** Changes whenever something new was read (the plan is rebuilt then). */
  revision = 0;

  private root: string;
  private file: string | undefined;

  constructor(root: string, file?: string) {
    this.root = root;
    this.file = file;
    if (!file) return;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { format?: string; entries?: Record<string, Cached> };
      if (saved.format === "synamp.tag-cache/1" && saved.entries) for (const [path, entry] of Object.entries(saved.entries)) this.entries.set(path, entry);
    } catch { /* first run */ }
  }

  get(path: string): FileTags | undefined { return this.entries.get(path)?.tags; }
  get size(): number { return this.entries.size; }

  private cursor = 0;
  /** Listed in the library but not there (yet): not counted as waiting. */
  private gone = new Set<string>();

  /**
   * Read files not read yet, for up to `budgetMs`; then re-check a few hundred
   * known ones (in turn) in case they changed. Returns how many are still unread.
   */
  fill(paths: string[], budgetMs = 200, recheck = 300): number {
    const until = Date.now() + budgetMs;
    const unread = paths.filter((path) => !this.entries.has(path) && !this.gone.has(path));
    let read = 0;
    for (const path of unread) {
      if (Date.now() > until) break;
      if (this.read(path)) read++;
    }
    for (let i = 0; i < Math.min(recheck, paths.length) && Date.now() <= until + budgetMs; i++) {
      this.cursor = (this.cursor + 1) % paths.length;
      const path = paths[this.cursor]!;
      const known = this.entries.get(path);
      if (!known) continue;
      let stat;
      try { stat = statSync(join(this.root, path)); } catch { continue; }
      if (known.size !== stat.size || known.mtime !== stat.mtimeMs) { this.read(path); read++; }
    }
    if (read) { this.revision++; this.dirty = true; }
    return paths.filter((path) => !this.entries.has(path) && !this.gone.has(path)).length;
  }

  private read(path: string): boolean {
    try {
      const stat = statSync(join(this.root, path));
      this.entries.set(path, { size: stat.size, mtime: stat.mtimeMs, tags: readTags(join(this.root, path)) });
      this.gone.delete(path);
      return true;
    } catch { this.gone.add(path); return false; }
  }

  /** Read these again next time (the librarian just wrote them). */
  forget(paths: string[]): void {
    for (const path of paths) { this.entries.delete(path); this.gone.delete(path); }
    this.revision++;
  }

  /** Forget files that are no longer in the library. */
  prune(keep: Set<string>): void {
    for (const path of this.entries.keys()) if (!keep.has(path)) { this.entries.delete(path); this.dirty = true; }
  }

  save(): void {
    if (!this.file || !this.dirty) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify({ format: "synamp.tag-cache/1", entries: Object.fromEntries(this.entries) }));
    renameSync(temp, this.file);
    this.dirty = false;
  }
}

// --- the proposals ------------------------------------------------------------------------------

const VARIOUS = /^(?:various(?: artists)?|va)$/i;
const yearOf = (date?: string) => { const y = Number(date?.slice(0, 4)); return y >= 1000 && y <= 2999 ? y : undefined; };
const LABEL: Record<TagField, string> = {
  title: "title", artist: "artist", album_artist: "album artist", album: "album", track_no: "track number",
  track_total: "number of tracks", disc_no: "disc number", disc_total: "number of discs", year: "year",
};
export const fieldLabel = (field: TagField) => LABEL[field];

/** Which files' tags the plan needs: every track of every matched album, in MP3 or FLAC. */
export function filesToRead(library: Library, records: Record<string, AlbumRecord>): string[] {
  const out: string[] = [];
  for (const unit of groupAlbums(library)) {
    if (records[unit.key]?.status !== "matched") continue;
    for (const track of unit.tracks) if (track.path && formatOf(track.path)) out.push(track.path);
  }
  return out;
}

export type DetailDecision = {
  /** Album folder. */
  key: string;
  title: string;
  changes: string[];
  edits: TagEdit[];
  /** Files left out, and why ("M4A files can't be written yet"). */
  notes: string[];
  /** Files whose tags haven't been read yet (the proposal waits for them). */
  waiting: number;
};

/** The wanted details for one file, from its slot on the matched release. */
function wanted(track: LibraryTrack, now: FileTags, release: MbRelease, slot: { disc: number; position: number }, multiDisc: boolean, settings: DetailSettings): TagValues {
  const medium = release.media.find((m) => m.position === slot.disc);
  const found = medium?.tracks.find((t) => t.position === slot.position);
  const mbTrack = found && { ...found, title: found.title.trim() };
  release = { ...release, title: release.title.trim(), artist: release.artist.trim() };
  const set: TagValues = {};
  const missing = (field: TagField) => now[field] === undefined || now[field] === "";
  const year = yearOf(release.date);
  const various = VARIOUS.test(release.artist);
  if (settings.fill_missing_details) {
    if (missing("title") && mbTrack?.title) set.title = mbTrack.title;
    if (missing("album")) set.album = release.title;
    if (missing("album_artist")) set.album_artist = release.artist;
    if (missing("artist") && !various) set.artist = release.artist;
    if (missing("year") && year) set.year = year;
    if (missing("track_no")) set.track_no = slot.position;
    if (missing("track_total") && medium) set.track_total = medium.tracks.length;
    if (multiDisc && missing("disc_no")) set.disc_no = slot.disc;
    if (multiDisc && missing("disc_total")) set.disc_total = release.media.length;
  }
  if (settings.fix_track_numbers) {
    if (now.track_no !== undefined && now.track_no !== slot.position) set.track_no = slot.position;
    if (now.track_total !== undefined && medium && now.track_total !== medium.tracks.length) set.track_total = medium.tracks.length;
    if (multiDisc && now.disc_no !== undefined && now.disc_no !== slot.disc) set.disc_no = slot.disc;
    if (multiDisc && now.disc_total !== undefined && now.disc_total !== release.media.length) set.disc_total = release.media.length;
  }
  if (settings.match_mb_spelling) {
    if (now.album && now.album !== release.title) set.album = release.title;
    if (now.album_artist && now.album_artist !== release.artist) set.album_artist = release.artist;
    if (now.title && mbTrack?.title && now.title !== mbTrack.title) set.title = mbTrack.title;
  }
  return set;
}

export function detailDecisions(library: Library, records: Record<string, AlbumRecord>, settings: DetailSettings, cache: { get(path: string): FileTags | undefined }): DetailDecision[] {
  if (!settings.fill_missing_details && !settings.fix_track_numbers && !settings.match_mb_spelling) return [];
  const out: DetailDecision[] = [];
  for (const unit of groupAlbums(library)) {
    const record = records[unit.key];
    if (record?.status !== "matched" || !record.release) continue;
    const match = matchRelease(unit, record.release);
    // Only a match you can trust: confident by the files, the edition you chose, or the ID in the files.
    if (!match.confident && record.source !== "you" && record.source !== "tag") continue;
    const slots = new Map([...match.mapping].map(([id, key]) => { const [disc, position] = key.split("-").map(Number); return [id, { disc: disc!, position: position! }] as const; }));
    const multiDisc = new Set([...slots.values()].map((s) => s.disc)).size > 1;
    const edits: TagEdit[] = [];
    let waiting = 0, unsupported = 0, unmatched = 0;
    for (const track of [...unit.tracks].sort((a, b) => a.path!.localeCompare(b.path!))) {
      if (!formatOf(track.path!)) { unsupported++; continue; }
      const slot = slots.get(track.id);
      if (!slot) { unmatched++; continue; }
      const now = cache.get(track.path!);
      if (!now) { waiting++; continue; }
      const set = wanted(track, now, record.release, slot, multiDisc, settings);
      const fields = TAG_FIELDS.filter((field) => set[field] !== undefined);
      if (!fields.length) continue;
      edits.push({ path: track.path!, track_id: track.id, set, now: Object.fromEntries(fields.flatMap((f) => (now[f] === undefined ? [] : [[f, now[f]]]))) as TagValues });
    }
    if (!edits.length && !waiting) continue;
    const count = (test: (edit: TagEdit, field: TagField) => boolean) => edits.reduce((n, edit) => n + TAG_FIELDS.filter((f) => edit.set[f] !== undefined && test(edit, f)).length, 0);
    const filled = count((edit, f) => edit.now[f] === undefined);
    const numbers = count((edit, f) => edit.now[f] !== undefined && /_(no|total)$/.test(f));
    const spelled = count((edit, f) => edit.now[f] !== undefined && !/_(no|total)$/.test(f));
    const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
    const changes = [
      ...(edits.length ? [`Writes song details into ${plural(edits.length, "file")}, from MusicBrainz (“${record.release.title}”${record.release.date ? `, ${record.release.date.slice(0, 4)}` : ""})`] : []),
      ...(filled ? [`Fills in ${plural(filled, "missing detail")}`] : []),
      ...(numbers ? [`Corrects ${plural(numbers, "track or disc number")}`] : []),
      ...(spelled ? [`Matches ${plural(spelled, "name")} to MusicBrainz’s spelling`] : []),
    ];
    const notes = [
      ...(unsupported ? [`${plural(unsupported, "file")} in a format SynAmp can’t write yet (M4A and others) ${unsupported === 1 ? "is" : "are"} left as ${unsupported === 1 ? "it is" : "they are"}`] : []),
      ...(unmatched ? [`${plural(unmatched, "file")} didn’t match a song on this release, so ${unmatched === 1 ? "it’s" : "they’re"} left as ${unmatched === 1 ? "it is" : "they are"}`] : []),
    ];
    out.push({ key: unit.key, title: `${unit.artist} — ${unit.title}`, changes, edits, notes, waiting });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** A short fingerprint of a set of edits (part of the decision's revision). */
export const editsHash = (edits: TagEdit[]) => createHash("sha256").update(JSON.stringify(edits)).digest("hex").slice(0, 16);
