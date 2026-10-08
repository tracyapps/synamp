/**
 * Import (LIBRARY-CARE step 5): new music in `incoming/` becomes proposals.
 *
 * Two doors, one pipeline. Files dropped into `incoming/` on the NAS, and files
 * dragged into the web app (which the brain writes to `incoming/_web/…`), are
 * read here, named by the same standard as the rest of the library, checked
 * for duplicates, and proposed as "new music" decisions in the organise plan.
 * Nothing moves until the owner approves; the librarian does the moving.
 *
 *   - An album that's already in the library (same artist and album name) is
 *     filled in: the new tracks go into the existing folder. Re-ripped missing
 *     tracks land where they belong and drop off the missing list.
 *   - An artist already in the library keeps its existing folder spelling.
 *   - A file byte-identical to one already in place is set aside in
 *     `incoming/_duplicates/`, never deleted. A different file with the same
 *     name (another version) is kept as "(2)".
 *   - Files still being copied in (changed in the last 30 s) wait.
 */

import { createHash } from "node:crypto";
import { lstatSync, openSync, readdirSync, readSync, closeSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { discFromFolder, normalTitle } from "./albums.ts";
import { albumFolderName, artistKey, isSafeRelative, LEADING_NUMBER, pathKey, safeName, trackFileName } from "./naming.ts";
import { copyNumber } from "./duplicates.ts";
import type { Decision, FolderMove, Move, OrganiseSettings } from "./organise.ts";
import { readTags } from "./tags.ts";
import type { FileTags } from "./tags.ts";

export const AUDIO_EXTENSIONS = new Set([".flac", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".aiff", ".aif", ".wma", ".alac", ".m4b"]);
/** Files that travel with an album: artwork, cue sheets, rip logs, notes. */
export const COMPANION_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".cue", ".log", ".txt", ".nfo", ".m3u", ".m3u8"]);
export const WEB_FOLDER = "_web";
export const DUPLICATES_FOLDER = "_duplicates";
export const PART_SUFFIX = ".synamp-part";
const SETTLE_MS = 30_000;
const MAX_FILES = 20_000;

export type IncomingFile = { path: string; size: number; mtime: number; tags: FileTags };
export type IncomingScan = {
  files: IncomingFile[];
  /** Still being copied in. */
  arriving: number;
  /** Not audio and not artwork etc.: left alone. */
  ignored: number;
  /** Set aside earlier as identical copies. */
  set_aside: number;
  scanned_at: number;
  truncated: boolean;
};

const ext = (path: string) => posix.extname(path).toLowerCase();
const VARIOUS = /^(?:various(?: artists)?|va)$/i;

/** Reads `incoming/`; tags are cached per (path, size, mtime) so a re-scan is cheap. */
export class IncomingScanner {
  readonly root: string;
  private cache = new Map<string, { stamp: string; tags: FileTags }>();
  private last?: IncomingScan;

  constructor(root: string) { this.root = root; }

  scan(now = Date.now(), maxAgeMs = 10_000): IncomingScan {
    if (this.last && now - this.last.scanned_at < maxAgeMs) return this.last;
    const files: IncomingFile[] = [];
    let arriving = 0, ignored = 0, setAside = 0, truncated = false;
    const seen = new Set<string>();
    const walk = (relative: string, depth: number) => {
      let names: string[];
      try { names = readdirSync(relative ? join(this.root, relative) : this.root); } catch { return; }
      for (const name of names.sort()) {
        if (name.startsWith(".")) continue;
        const path = relative ? `${relative}/${name}` : name;
        let stat;
        try { stat = lstatSync(join(this.root, path)); } catch { continue; }
        if (stat.isDirectory()) {
          if (!relative && name === DUPLICATES_FOLDER) { setAside += countFiles(join(this.root, path)); continue; }
          if (depth < 12) walk(path, depth + 1);
          continue;
        }
        if (!stat.isFile() || name.endsWith(PART_SUFFIX) || name.includes(`${PART_SUFFIX}-`)) continue;
        const extension = ext(name);
        if (!AUDIO_EXTENSIONS.has(extension)) { if (!COMPANION_EXTENSIONS.has(extension)) ignored++; continue; }
        if (!isSafeRelative(path)) { ignored++; continue; }
        // Web uploads are written whole by the brain; anything else may still be copying.
        if (!path.startsWith(`${WEB_FOLDER}/`) && now - stat.mtimeMs < SETTLE_MS) { arriving++; continue; }
        if (files.length >= MAX_FILES) { truncated = true; continue; }
        const stamp = `${stat.size}:${stat.mtimeMs}`;
        let cached = this.cache.get(path);
        if (cached?.stamp !== stamp) { cached = { stamp, tags: readTags(join(this.root, path)) }; this.cache.set(path, cached); }
        seen.add(path);
        files.push({ path, size: stat.size, mtime: stat.mtimeMs, tags: cached.tags });
      }
    };
    walk("", 0);
    for (const key of this.cache.keys()) if (!seen.has(key)) this.cache.delete(key);
    this.last = { files, arriving, ignored, set_aside: setAside, scanned_at: now, truncated };
    return this.last;
  }

  /** Forget the last scan (after an upload or a finished batch). */
  invalidate(): void { this.last = undefined; }
}

function countFiles(dir: string): number {
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
      else if (!entry.name.startsWith(".")) count++;
    }
  } catch { /* gone */ }
  return count;
}

const hashes = new Map<string, string>();
/** sha256 of a file, read in chunks; remembered per (path, size, mtime). */
export function fileHash(path: string): string {
  const stat = statSync(path);
  const stamp = `${path}|${stat.size}|${stat.mtimeMs}`;
  const known = hashes.get(stamp);
  if (known) return known;
  const value = hashFile(path);
  if (hashes.size > 5000) hashes.clear();
  hashes.set(stamp, value);
  return value;
}

function hashFile(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(1 << 20);
    for (let got; (got = readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, got));
  } finally { closeSync(fd); }
  return hash.digest("hex");
}

/** A file in a library folder with the same bytes (re-imported under any name). */
export function identicalIn(file: string, libraryRoot: string, folder: string): string | undefined {
  let size: number;
  let names: string[];
  try { size = statSync(file).size; names = readdirSync(join(libraryRoot, folder)); } catch { return undefined; }
  let hash: string | undefined;
  for (const name of names) {
    try {
      const candidate = join(libraryRoot, folder, name);
      const stat = statSync(candidate);
      if (!stat.isFile() || stat.size !== size) continue;
      hash ??= fileHash(file);
      if (fileHash(candidate) === hash) return `${folder}/${name}`;
    } catch { /* unreadable: not a match */ }
  }
  return undefined;
}

/** The part of an incoming path that describes the music: without `_web/<upload>/`. */
function meaningfulParts(path: string): string[] {
  const parts = path.split("/");
  const music = parts[0] === WEB_FOLDER ? parts.slice(2) : parts;
  // "Artist/Album/CD2/track": the disc folder isn't a name.
  return music.length >= 3 && DISC_FOLDER.test(music[music.length - 2]!) ? [...music.slice(0, -2), music[music.length - 1]!] : music;
}
const DISC_FOLDER = /^(?:cd|disc|disk)\s*[-_ ]?\d{1,2}$/i;
/** The album folder a file arrived in (disc folders fold into it). */
function albumDir(path: string): string {
  const dir = posix.dirname(path);
  return DISC_FOLDER.test(posix.basename(dir)) ? posix.dirname(dir) : dir;
}

function numberFromName(name: string): { track?: number; disc?: number } {
  const match = posix.basename(name, posix.extname(name)).match(/^\s*(?:(\d{1,2})[-.])?(\d{1,3})(?=\s*(?:[-._]\s*|\s+)\S)/);
  if (!match) return {};
  return { track: Number(match[2]), ...(match[1] ? { disc: Number(match[1]) } : {}) };
}

type Described = {
  file: IncomingFile;
  artist?: string;
  album?: string;
  compilation: boolean;
  title: string;
  track?: number;
  disc?: number;
  disc_total?: number;
  year?: number;
};

function describe(file: IncomingFile): Described {
  const parts = meaningfulParts(file.path);
  const folderArtist = parts.length >= 3 ? parts[parts.length - 3] : undefined;
  const folderAlbum = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  const t = file.tags;
  const fromName = numberFromName(file.path);
  const folderDisc = discFromFolder(file.path);
  const compilation = !!t.compilation || (t.album_artist ? VARIOUS.test(t.album_artist) : false);
  const stem = posix.basename(file.path, posix.extname(file.path));
  const year = t.year ?? (Number(folderAlbum?.match(/[([]\s*(\d{4})\s*[)\]]/)?.[1]) || undefined);
  return {
    file,
    artist: t.album_artist ?? t.artist ?? folderArtist,
    album: t.album ?? folderAlbum?.replace(/\s*[([]\s*\d{4}\s*[)\]]\s*$/, ""),
    compilation,
    title: t.title ?? (stem.replace(LEADING_NUMBER, "").trim() || stem),
    ...(t.track_no ?? fromName.track ? { track: t.track_no ?? fromName.track } : {}),
    ...(t.disc_no ?? fromName.disc ?? folderDisc ? { disc: t.disc_no ?? fromName.disc ?? folderDisc } : {}),
    ...(t.disc_total ? { disc_total: t.disc_total } : {}),
    ...(year ? { year } : {}),
  };
}

type LibraryShape = {
  /** artistKey → the folder spelling already in the library. */
  artists: Map<string, string>;
  /** artist folder (lower) → album folders in it. */
  albums: Map<string, string[]>;
  files: Set<string>;
};

function libraryShape(library: Library): LibraryShape {
  const artists = new Map<string, string>();
  const albums = new Map<string, string[]>();
  const files = new Set<string>();
  for (const track of library.tracks as LibraryTrack[]) {
    if (!track.path || !isSafeRelative(track.path)) continue;
    files.add(pathKey(track.path));
    const parts = track.path.split("/");
    if (parts.length < 2) continue;
    if (!artists.has(artistKey(parts[0]!))) artists.set(artistKey(parts[0]!), parts[0]!);
    if (parts.length >= 3) {
      const key = pathKey(parts[0]!);
      const list = albums.get(key) ?? [];
      if (!list.includes(parts[1]!)) list.push(parts[1]!);
      albums.set(key, list);
    }
  }
  return { artists, albums, files };
}

const majority = (values: Array<string | number | undefined>) => {
  const counts = new Map<string | number, number>();
  for (const v of values) if (v !== undefined && v !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export type ImportContext = {
  incomingRoot: string;
  libraryRoot: string;
  /**
   * The library file in `folder` with exactly these bytes, if any. Injected for
   * tests; by default it compares sizes on disk, then hashes.
   */
  identical?: (incomingPath: string, folder: string) => string | undefined;
};

/** One "new music" decision per folder as it arrived (loose files: per album tag). */
export function buildImport(scan: IncomingScan, library: Library, settings: OrganiseSettings, ctx: ImportContext): Decision[] {
  const shape = libraryShape(library);
  const identical = ctx.identical ?? ((from: string, folder: string) => identicalIn(join(ctx.incomingRoot, from), ctx.libraryRoot, folder));
  const groups = new Map<string, Described[]>();
  for (const file of scan.files) {
    const item = describe(file);
    const dir = albumDir(file.path);
    const loose = dir === "." || (dir.startsWith(`${WEB_FOLDER}/`) && dir.split("/").length === 2);
    const key = loose ? `${dir}|${item.artist ?? ""}|${item.album ?? ""}` : dir;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const claimed = new Set<string>();
  const decisions: Decision[] = [];
  const allDirs = [...new Set(scan.files.map((f) => albumDir(f.path)))];

  for (const [key, items] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const conflicts: string[] = [];
    const changes: string[] = [];
    const compilation = items.filter((i) => i.compilation).length > items.length / 2;
    const artistName = compilation ? (settings.compilations_folder || "Various Artists") : (majority(items.map((i) => i.artist)) as string | undefined);
    const albumName = majority(items.map((i) => i.album)) as string | undefined;
    const year = majority(items.map((i) => i.year)) as number | undefined;
    const sourceDir = key.includes("|") ? key.slice(0, key.indexOf("|")) : key;
    if (!artistName || !albumName) {
      conflicts.push("Can’t tell the artist and album: add tags, or put the files in an “Artist/Album” folder in incoming");
    }
    const artistFolder = artistName ? (shape.artists.get(artistKey(artistName)) ?? safeName(artistName, 120)) : "_unknown";
    const knownArtist = !!artistName && shape.artists.has(artistKey(artistName));
    // An album already in the library: fill it in rather than making a second folder.
    const existing = (shape.albums.get(pathKey(artistFolder)) ?? [])
      .filter((folder) => albumName && normalTitle(folder.replace(/\s*[([]\s*\d{4}\s*[)\]].*$/, "")) === normalTitle(albumName))
      .sort((a, b) => Number(year !== undefined && b.includes(String(year))) - Number(year !== undefined && a.includes(String(year))));
    const albumFolder = existing[0] ?? (albumName ? albumFolderName(albumName, year, settings.add_year) : "_unknown");
    const target = `${artistFolder}/${albumFolder}`;

    const discs = new Set(items.map((i) => i.disc ?? 1));
    const multiDisc = discs.size > 1 || items.some((i) => (i.disc_total ?? 1) > 1 || (i.disc ?? 1) > 1);
    const width = Math.max(2, String(Math.max(0, ...items.map((i) => i.file.tags.track_total ?? i.track ?? 0))).length);
    const moves: Move[] = [];
    let duplicates = 0, versions = 0, numbered = 0;
    for (const item of [...items].sort((a, b) => (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 999) - (b.track ?? 999) || copyNumber(a.file.path).copy - copyNumber(b.file.path).copy || a.file.path.localeCompare(b.file.path))) {
      const original = posix.basename(item.file.path);
      let name = settings.number_tracks
        ? trackFileName({ title: item.title, ext: posix.extname(original), ...(item.track !== undefined ? { track: item.track } : {}), ...(item.disc !== undefined ? { disc: item.disc } : {}), multiDisc, width, stem: posix.basename(original, posix.extname(original)) })
        : safeName(original, 200);
      if (settings.number_tracks && item.track !== undefined) numbered++;
      let to = `${target}/${name}`;
      const twin = existing.length ? identical(item.file.path, target) : undefined;
      if (twin) {
        // Already there, byte for byte: set aside, never delete.
        moves.push({ from: item.file.path, to: `${DUPLICATES_FOLDER}/${item.file.path}`, from_area: "incoming", to_area: "incoming" });
        duplicates++;
        continue;
      }
      for (let copy = 2; shape.files.has(pathKey(to)) || claimed.has(pathKey(to)); copy++) {
        name = `${safeName(`${posix.basename(name, posix.extname(name)).replace(/ \(\d+\)$/, "")} (${copy})`, 190)}${posix.extname(name)}`;
        to = `${target}/${name}`;
        if (copy === 2) versions++;
      }
      claimed.add(pathKey(to));
      moves.push({ from: item.file.path, to, from_area: "incoming" });
    }
    const filing = moves.filter((m) => !m.to_area).length;
    if (filing) changes.push(`${filing} ${filing === 1 ? "track goes" : "tracks go"} into ${existing.length ? `your existing “${target}” folder (fills in the album)` : `a new folder “${target}”`}`);
    if (knownArtist && !existing.length && filing) changes.push(`“${artistFolder}” is already in your library; the new album goes beside the others`);
    if (compilation) changes.push(`A compilation: filed under “${artistFolder}”`);
    if (numbered && settings.number_tracks) changes.push(`Named “${multiDisc ? "1-01" : "01"} - Title”`);
    if (items.length - numbered > 0 && settings.number_tracks) changes.push(`${items.length - numbered} without a track number keep their file name`);
    if (duplicates) changes.push(`${duplicates} already in the library, identical — set aside in incoming/${DUPLICATES_FOLDER}, not deleted`);
    if (versions) changes.push(`${versions} with the same name as a different file already there — kept as “(2)”`);

    // Artwork and the like follow when the folder is one album; other albums inside it stay.
    const folders: FolderMove[] = [];
    // Loose uploads: the artwork follows too when everything in that upload is one album.
    const onlyGroupThere = [...groups.keys()].filter((other) => other.split("|")[0] === sourceDir).length === 1;
    if ((!key.includes("|") || onlyGroupThere) && filing && sourceDir !== ".") {
      const keep = allDirs.filter((dir) => dir !== sourceDir && dir.startsWith(sourceDir + "/"));
      folders.push({ from: sourceDir, to: target, from_area: "incoming", ...(keep.length ? { keep } : {}) });
    }
    const label = `${artistName ?? "Unknown artist"} — ${albumName ?? "Unknown album"}`;
    decisions.push({
      id: `import:${createHash("sha256").update(items.map((i) => `${i.file.path}:${i.file.size}`).sort().join("\n")).digest("hex").slice(0, 16)}`,
      rev: createHash("sha256").update(JSON.stringify({ moves, folders, conflicts })).digest("hex").slice(0, 16),
      kind: "import",
      title: `New: ${label}`,
      changes,
      moves,
      folders,
      conflicts,
      preview: [{ from: `incoming/${sourceDir === "." ? "" : sourceDir}`.replace(/\/$/, ""), to: target }],
    });
  }
  return decisions;
}
