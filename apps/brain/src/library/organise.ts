/**
 * Organise the library (LIBRARY-CARE step 4): propose → review → apply.
 *
 * The brain only *proposes*. It never writes to the music: it builds a plan of
 * readable decisions from the library index and the MusicBrainz matches, keeps
 * the owner's approvals, and queues approved batches for the librarian — a
 * separate process, and the only one with write access (src/librarian/). The
 * librarian reports back what it actually moved; the brain records that, so a
 * batch can be undone, and so moved files keep streaming before the analyzer
 * has re-exported the library (PathOverlay).
 *
 * Decisions:
 *   - artist: merge spelling variants of one artist ("Ani Difranco",
 *     "DiFranco, Ani" → "Ani DiFranco"), whole folders at a time.
 *   - album:  one album folder brought to the naming standard: `Album (Year)`,
 *     `01 - Title.ext` / `1-01 - Title.ext`, disc folders folded in, and
 *     compilations filed under `Various Artists/`.
 */

import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { discFromFolder, groupAlbums, matchRelease } from "./albums.ts";
import type { AlbumUnit } from "./albums.ts";
import type { AlbumMatches, AlbumRecord } from "./missing.ts";
import { betterCopy, copyNumber, describeQuality, pairKey, sameRecording, SET_ASIDE_FOLDER } from "./duplicates.ts";
import { detailDecisions } from "./song-details.ts";
import type { TagEdit } from "./song-details.ts";
import type { FileTags } from "./tags.ts";
import { albumFolderName, artistKey, isSafeRelative, pathKey, safeName, trackFileName, unswapName } from "./naming.ts";

export class OrganiseError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 16);
const same = (a: string, b: string) => a.normalize("NFC") === b.normalize("NFC");
const ext = (path: string) => posix.extname(path);
const stem = (path: string) => posix.basename(path, ext(path));
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// --- settings -------------------------------------------------------------------

export type OrganiseSettings = {
  /** Merge spelling variants of the same artist into one folder. */
  merge_artists: boolean;
  /** Album folders as `Album (Year)`. */
  add_year: boolean;
  /** Track files as `01 - Title.ext` (`1-01 - …` on multi-disc albums). */
  number_tracks: boolean;
  /** Bring `CD1/`, `CD2/` sub-folders into the album folder. */
  fold_disc_folders: boolean;
  /** Where compilations go. Empty: leave compilations where they are. */
  compilations_folder: string;
  /** Two copies of the same recording in one place: keep the better, set the other aside (never deleted). */
  set_aside_duplicates: boolean;
  /** Song details (tags) inside the files, from the album's MusicBrainz match: fill in what's missing… */
  fill_missing_details: boolean;
  /** …correct track and disc numbers… */
  fix_track_numbers: boolean;
  /** …and (off by default) use MusicBrainz's spelling for album, album artist and song titles. */
  match_mb_spelling: boolean;
};

export const DEFAULT_SETTINGS: OrganiseSettings = {
  merge_artists: true, add_year: true, number_tracks: true, fold_disc_folders: true, compilations_folder: "Various Artists",
  set_aside_duplicates: true, fill_missing_details: true, fix_track_numbers: true, match_mb_spelling: false,
};

export function cleanSettings(input: Record<string, unknown>, current: OrganiseSettings): OrganiseSettings {
  const next = { ...current };
  for (const key of ["merge_artists", "add_year", "number_tracks", "fold_disc_folders", "set_aside_duplicates", "fill_missing_details", "fix_track_numbers", "match_mb_spelling"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") throw new OrganiseError(`${key} must be true or false`);
    next[key] = input[key];
  }
  if (input.compilations_folder !== undefined) {
    if (typeof input.compilations_folder !== "string") throw new OrganiseError("compilations_folder must be text");
    const name = input.compilations_folder.trim();
    next.compilations_folder = name ? safeName(name, 120) : "";
  }
  return next;
}

// --- the plan -------------------------------------------------------------------------

/** Where a path lives: the library (default) or `incoming/` (imports, and `incoming/_duplicates/` for set-aside copies). */
export type Area = "incoming";
export type Move = { from: string; to: string; track_id?: string; audio_hash?: string; from_area?: Area; to_area?: Area };
export type FolderMove = {
  from: string;
  to: string;
  from_area?: Area;
  /** Sub-folders that belong to other albums: left where they are. */
  keep?: string[];
};

export type Decision = {
  /** Stable across moves and re-plans (built from track IDs / the artist key). */
  id: string;
  /** Changes whenever the proposed moves change; an approval is for one revision. */
  rev: string;
  kind: "artist" | "album" | "import" | "tags";
  title: string;
  /** Plain-language list of what this does. */
  changes: string[];
  moves: Move[];
  /** Folders whose other files (artwork, logs, cue sheets) follow, and which are tidied away once empty. */
  folders: FolderMove[];
  /** Why this can't be applied as it stands. */
  conflicts: string[];
  /** Before → after, for display: one line per folder. */
  preview: Array<{ from: string; to: string }>;
  /** Copies of one recording that met here: which is kept, which is set aside, and why. */
  duplicates?: DuplicatePair[];
  /** Song details written into files (kind "tags"): what each file says now, and what it will say. */
  edits?: TagEdit[];
  /** Worth knowing, but not blocking (files left out, and why). */
  notes?: string[];
};

export type DuplicateCopy = { id: string; path: string; quality: string };
export type DuplicatePair = {
  /** Stable key for the two tracks (for "Keep this one instead"). */
  pair: string;
  how: "identical" | "recording";
  keep: DuplicateCopy;
  aside: DuplicateCopy;
  why: string;
  chosen_by: "SynAmp" | "you";
};
/** The owner's picks: pair key → the track ID to keep. */
export type KeepChoices = Record<string, string>;

const copyOf = (track: LibraryTrack): DuplicateCopy => ({ id: track.id, path: track.path!, quality: describeQuality(track.quality) });

/** Same recording? Then which copy stays. A string is the reason it stays a conflict. */
function resolveDuplicate(resident: LibraryTrack, arriving: LibraryTrack, choices: KeepChoices): DuplicatePair | string {
  const same = sameRecording(resident, arriving);
  if (!same.same) return same.why;
  const auto = betterCopy(resident, arriving);
  const pair = pairKey(resident, arriving);
  const wanted = choices[pair];
  const swap = wanted !== undefined && wanted !== auto.keep.id && wanted === auto.aside.id;
  const [keep, aside] = swap ? [auto.aside, auto.keep] : [auto.keep, auto.aside];
  return {
    pair, how: same.how, keep: copyOf(keep), aside: copyOf(aside),
    why: swap ? "your choice" : `${same.how === "identical" ? "Identical audio" : "Same recording"}: ${auto.why}`,
    chosen_by: swap ? "you" : "SynAmp",
  };
}

/** Set a copy aside: into `incoming/_duplicates/`, keeping its library path so it's easy to find (and undo). */
const asideMove = (track: LibraryTrack): Move => ({
  from: track.path!, to: `${SET_ASIDE_FOLDER}/${track.path!}`, to_area: "incoming", track_id: track.id,
  ...(track.audio_hash ? { audio_hash: track.audio_hash } : {}),
});
const asideNote = (n: number) => `${plural(n, "duplicate copy", "duplicate copies")} of the same recording: the better copy stays, the other goes to incoming/${SET_ASIDE_FOLDER} (not deleted)`;

const VARIOUS = /^(?:various(?: artists)?|va)$/i;

/** Same order as by path, except a plain name comes before its "(2)" copy. */
export function byCleanNameFirst(a: LibraryTrack, b: LibraryTrack): number {
  const x = copyNumber(a.path!), y = copyNumber(b.path!);
  return x.base.localeCompare(y.base) || x.copy - y.copy || a.path!.localeCompare(b.path!);
}
/** Do two different songs in this folder share a track number (on the same known disc)? */
function clashingNumbers(tracks: LibraryTrack[]): boolean {
  const titles = new Map<string, string>();
  for (const track of tracks) {
    if (track.track_no === undefined) continue;
    const key = `${discOf(track) ?? "?"}-${track.track_no}`;
    const title = (track.title ?? posix.basename(copyNumber(track.path!).base)).toLowerCase().replace(/\s*\(\d+\)$/, "").trim();
    const seen = titles.get(key);
    if (seen !== undefined && seen !== title) return true;
    titles.set(key, title);
  }
  return false;
}
const discOf = (track: LibraryTrack) => track.disc_no ?? (track.path ? discFromFolder(track.path) : undefined);
const topFolder = (path: string) => (path.includes("/") ? path.slice(0, path.indexOf("/")) : undefined);

type PlanContext = {
  tracks: LibraryTrack[];
  /** Lower-cased paths of every file, and of every folder that holds one. */
  files: Set<string>;
  folders: Set<string>;
  /** Lower-cased path → the track there. */
  byPath: Map<string, LibraryTrack>;
};

function context(library: Library): PlanContext {
  const tracks = library.tracks.filter((track) => track.path && isSafeRelative(track.path));
  const files = new Set<string>();
  const folders = new Set<string>();
  const byPath = new Map<string, LibraryTrack>();
  for (const track of tracks) {
    files.add(pathKey(track.path!));
    byPath.set(pathKey(track.path!), track);
    let dir = posix.dirname(track.path!);
    while (dir !== "." && !folders.has(pathKey(dir))) { folders.add(pathKey(dir)); dir = posix.dirname(dir); }
  }
  return { tracks, files, folders, byPath };
}

function finish(decision: Omit<Decision, "rev">): Decision {
  return { ...decision, rev: hash({ moves: decision.moves, folders: decision.folders, conflicts: decision.conflicts, ...(decision.edits ? { edits: decision.edits } : {}) }) };
}

/** Song details to write into the files (see song-details.ts), as Organise decisions. */
export function tagDecisions(library: Library, records: Record<string, AlbumRecord>, settings: OrganiseSettings, cache: { get(path: string): FileTags | undefined }): Decision[] {
  return detailDecisions(library, records, settings, cache).filter((d) => d.edits.length).map((d) => finish({
    id: `tags:${hash({ tracks: d.edits.map((e) => e.track_id).sort() }).slice(0, 16)}`,
    kind: "tags", title: d.title, changes: d.changes, moves: [], folders: [], conflicts: [], preview: [], edits: d.edits,
    ...(d.notes.length || d.waiting ? { notes: [...d.notes, ...(d.waiting ? [`${d.waiting.toLocaleString()} more ${d.waiting === 1 ? "file is" : "files are"} still being read; ${d.waiting === 1 ? "it" : "they"}’ll be added`] : [])] } : {}),
  }));
}

/** Artist folders that are spellings of one artist, merged into the best-supported spelling. */
function artistDecisions(ctx: PlanContext, units: AlbumUnit[], records: Record<string, AlbumRecord>, settings: OrganiseSettings, choices: KeepChoices): Decision[] {
  const byFolder = new Map<string, LibraryTrack[]>();
  for (const track of ctx.tracks) {
    const folder = topFolder(track.path!);
    if (!folder) continue;
    const list = byFolder.get(folder) ?? [];
    list.push(track);
    byFolder.set(folder, list);
  }
  const groups = new Map<string, string[]>();
  for (const folder of byFolder.keys()) {
    const key = artistKey(folder);
    groups.set(key, [...(groups.get(key) ?? []), folder]);
  }
  // "DiFranco, Ani" joins "Ani DiFranco" only when that spelling exists too.
  for (const folder of [...byFolder.keys()]) {
    const swapped = unswapName(folder);
    if (!swapped) continue;
    const own = artistKey(folder), target = artistKey(swapped);
    if (own === target || !groups.has(target) || !groups.get(own)?.includes(folder)) continue;
    groups.set(own, groups.get(own)!.filter((name) => name !== folder));
    if (!groups.get(own)!.length) groups.delete(own);
    groups.get(target)!.push(folder);
  }

  const decisions: Decision[] = [];
  for (const [key, folders] of groups) {
    if (folders.length < 2 || folders.some((name) => VARIOUS.test(name))) continue;
    // Votes for a spelling: MusicBrainz (per matched album), then tags, then size.
    const score = new Map<string, number>();
    const add = (name: string, points: number) => score.set(name, (score.get(name) ?? 0) + points);
    const mbNames = new Set<string>();
    for (const folder of folders) {
      add(folder, 0);
      for (const track of byFolder.get(folder)!) {
        add(folder, 1);
        if (track.album_artist === folder || track.artist === folder) add(folder, 2);
      }
      for (const unit of units) {
        if (topFolder(unit.key) !== folder) continue;
        const credited = records[unit.key]?.status === "matched" ? records[unit.key]!.release?.artist : undefined;
        if (credited && artistKey(credited) === key) { add(safeName(credited, 120), 1000); mbNames.add(safeName(credited, 120)); }
      }
    }
    const canonical = [...score].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    const moving = folders.filter((folder) => folder !== canonical);
    const moves: Move[] = [];
    const asides: Move[] = [];
    const duplicates: DuplicatePair[] = [];
    const conflicts: string[] = [];
    for (const folder of moving) for (const track of byFolder.get(folder)!) {
      const to = canonical + track.path!.slice(folder.length);
      if (ctx.files.has(pathKey(to)) && !moving.some((m) => pathKey(to).startsWith(pathKey(m) + "/"))) {
        const resident = ctx.byPath.get(pathKey(to));
        const outcome = settings.set_aside_duplicates && resident ? resolveDuplicate(resident, track, choices) : undefined;
        if (outcome && typeof outcome !== "string") {
          duplicates.push(outcome);
          if (outcome.keep.id === resident!.id) { asides.push(asideMove(track)); continue; }
          asides.push(asideMove(resident!)); // the arriving copy is better: it takes the place
        } else {
          conflicts.push(`“${to}” already exists${outcome ? ` (${outcome})` : ""}`);
          continue;
        }
      }
      moves.push({ from: track.path!, to, track_id: track.id, ...(track.audio_hash ? { audio_hash: track.audio_hash } : {}) });
    }
    const albums = (folder: string) => new Set(byFolder.get(folder)!.map((t) => posix.dirname(t.path!))).size;
    decisions.push(finish({
      id: `artist:${hash(key)}`,
      kind: "artist",
      title: `Merge ${moving.map((name) => `“${name}”`).join(", ")} into “${canonical}”`,
      changes: [
        ...folders.map((folder) => `“${folder}”: ${plural(albums(folder), "folder")}, ${plural(byFolder.get(folder)!.length, "track")}${folder === canonical ? " (kept)" : ""}`),
        ...(!folders.includes(canonical) ? [`“${canonical}” is the spelling MusicBrainz uses`] : mbNames.has(canonical) ? ["MusicBrainz agrees with this spelling"] : []),
        ...(duplicates.length ? [asideNote(duplicates.length)] : []),
      ],
      // Set-asides first: they make room for the better copy.
      moves: [...asides, ...moves],
      ...(duplicates.length ? { duplicates } : {}),
      folders: moving.map((folder) => ({ from: folder, to: canonical })),
      conflicts: [...new Set(conflicts)].slice(0, 20),
      preview: moving.map((folder) => ({ from: folder, to: canonical })),
    }));
  }
  return decisions;
}

/** Year for the album folder: the tags first (usually the original year), else MusicBrainz. */
function albumYear(unit: AlbumUnit, record?: AlbumRecord): { year?: number; source?: string } {
  const valid = (year?: number) => year !== undefined && year >= 1900 && year <= new Date().getFullYear() + 1;
  if (valid(unit.year)) return { year: unit.year, source: "the tags" };
  const released = record?.status === "matched" && record.release?.date ? Number(record.release.date.slice(0, 4)) : undefined;
  if (valid(released)) return { year: released, source: "MusicBrainz" };
  return {};
}

function albumDecision(unit: AlbumUnit, ctx: PlanContext, settings: OrganiseSettings, record: AlbumRecord | undefined,
  claimed: Map<string, string>, units: AlbumUnit[], choices: KeepChoices = {}): Decision | undefined {
  const parent = posix.dirname(unit.key);
  // Loose files in an artist folder group as "Artist" — that is not an album folder to rename.
  if (parent === ".") return undefined;
  const folderName = posix.basename(unit.key);
  const changes: string[] = [];
  const conflicts: string[] = [];

  // Where: compilations go to the compilations folder.
  const albumArtists = unit.tracks.map((t) => t.album_artist).filter(Boolean) as string[];
  const taggedVarious = albumArtists.length > unit.tracks.length / 2 && albumArtists.every((name) => VARIOUS.test(name));
  const isCompilation = taggedVarious || /^compilations$/i.test(parent);
  const target = settings.compilations_folder;
  const newParent = isCompilation && target && !same(parent, target) ? target : parent;
  if (newParent !== parent) changes.push(`Moves to “${newParent}” (${taggedVarious ? "tagged as a compilation" : "was in Compilations"})`);

  // The folder name: `Album (Year)`, with the edition added if two would collide.
  const { year, source } = albumYear(unit, record);
  let newName = settings.add_year ? albumFolderName(folderName, year, true) : safeName(folderName);
  const join2 = (name: string) => (newParent === "." ? name : `${newParent}/${name}`);
  const taken = (key: string) => {
    if (pathKey(key) === pathKey(unit.key)) return false;
    const owner = claimed.get(pathKey(key));
    return (owner !== undefined && owner !== unit.key) || ctx.folders.has(pathKey(key));
  };
  if (taken(join2(newName))) {
    const edition = record?.status === "matched" ? record.release?.disambiguation : undefined;
    const withEdition = edition ? safeName(`${newName} [${edition}]`) : undefined;
    if (withEdition && !taken(join2(withEdition))) newName = withEdition;
    else conflicts.push(`A folder named “${join2(newName)}” already exists`);
  }
  const newKey = join2(newName);
  claimed.set(pathKey(newKey), unit.key);
  if (!same(newName, folderName)) {
    changes.push(newName.includes(`(${year})`) && !folderName.includes(String(year))
      ? `Folder gets the year: “${newName}” (year from ${source})` : `Folder renamed “${newName}”`);
  }

  // Track numbers: from the tags or filename, else from the matched MusicBrainz release.
  const fromRelease = new Map<string, { disc: number; position: number }>();
  let trusted = false;
  if (record?.status === "matched" && record.release) {
    const match = matchRelease(unit, record.release);
    // Sure it's this album: its track numbers win over numbers the files have wrong (as "Fix song details" corrects them).
    trusted = settings.fix_track_numbers && (match.confident || record.source === "you" || record.source === "tag");
    for (const [id, slot] of match.mapping) {
      const [disc, position] = slot.split("-").map(Number);
      fromRelease.set(id, { disc: disc!, position: position! });
    }
  }
  // Which disc each file is on. Tags and disc folders say so directly. The matched
  // release is only asked when the files can't tell the discs apart themselves:
  // files with no number, or two different songs sharing one number (a two-CD set
  // in one folder, "01 - …" twice). Otherwise a single CD that MusicBrainz matched
  // to a deluxe or CD+DVD edition would be renamed "1-01 - …" for nothing.
  const numberClash = clashingNumbers(unit.tracks);
  const askRelease = (t: LibraryTrack) => discOf(t) === undefined && (t.track_no === undefined || numberClash);
  const releaseDiscs = new Set(unit.tracks.filter(askRelease).map((t) => fromRelease.get(t.id)?.disc).filter((d) => d !== undefined));
  const ownDiscs = unit.tracks.some((t) => discOf(t) !== undefined);
  // Every file the release placed is on one disc, and none say otherwise: that's one disc.
  const releaseDisc = (t: LibraryTrack) => (askRelease(t) && (releaseDiscs.size > 1 || ownDiscs) ? fromRelease.get(t.id)?.disc : undefined);
  const discOfFile = (t: LibraryTrack) => discOf(t) ?? releaseDisc(t);
  const discs = new Set(unit.tracks.map((t) => discOfFile(t) ?? 1));
  const multiDisc = discs.size > 1 || [...discs].some((d) => d > 1) || unit.tracks.some((t) => (t.disc_total ?? 1) > 1);
  const highest = Math.max(0, ...unit.tracks.map((t) => Math.max(t.track_total ?? 0, t.track_no ?? 0)));
  const width = Math.max(2, String(highest).length);

  let moves: Move[] = [];
  const asides: Move[] = [];
  const duplicatePairs: DuplicatePair[] = [];
  const targets = new Set<string>();
  /** Which track has claimed each new name (to spot two copies of one recording). */
  const owners = new Map<string, LibraryTrack>();
  const sourceFolders = new Map<string, string>();
  let numbered = 0, numberedFromMb = 0, duplicates = 0, folded = 0;
  // Files without a copy number go first, so "Song.mp3" keeps its name and "Song (2).mp3" is the one that moves aside or stays "(2)".
  for (const track of [...unit.tracks].sort(byCleanNameFirst)) {
    const from = track.path!;
    const inDiscFolder = posix.dirname(from) !== unit.key;
    const dir = inDiscFolder && !settings.fold_disc_folders ? `${newKey}/${posix.basename(posix.dirname(from))}` : newKey;
    if (inDiscFolder && settings.fold_disc_folders) folded++;
    let number = settings.number_tracks ? track.track_no : undefined;
    const disc = discOfFile(track);
    if (settings.number_tracks && fromRelease.has(track.id) && (number === undefined || trusted)) {
      if (number === undefined) numberedFromMb++;
      number = fromRelease.get(track.id)!.position;
    }
    let name = settings.number_tracks
      ? trackFileName({ title: track.title, ext: ext(from), track: number, disc, multiDisc, width, stem: stem(from) })
      : posix.basename(from);
    if (settings.number_tracks && number !== undefined && !same(name, posix.basename(from))) numbered++;
    // Two copies of one recording would get the same name: keep the better one there, set the other aside.
    const holder = owners.get(pathKey(`${dir}/${name}`));
    const outcome = holder && settings.set_aside_duplicates ? resolveDuplicate(holder, track, choices) : undefined;
    if (holder && outcome && typeof outcome !== "string") {
      duplicatePairs.push(outcome);
      if (outcome.keep.id === holder.id) { asides.push(asideMove(track)); continue; }
      // This copy is better: it takes the name, and the holder goes aside instead.
      moves = moves.filter((move) => move.track_id !== holder.id);
      asides.push(asideMove(holder));
      owners.set(pathKey(`${dir}/${name}`), track);
      const to = `${dir}/${name}`;
      sourceFolders.set(posix.dirname(from), dir);
      if (!same(from, to)) moves.push({ from, to, track_id: track.id, ...(track.audio_hash ? { audio_hash: track.audio_hash } : {}) });
      continue;
    }
    // Two different recordings would get the same name: number the extra copies.
    for (let copy = 2; targets.has(pathKey(`${dir}/${name}`)); copy++) {
      name = `${safeName(`${stem(name).replace(/ \(\d+\)$/, "")} (${copy})`, 190)}${ext(name)}`;
      if (copy === 2) duplicates++;
    }
    const to = `${dir}/${name}`;
    targets.add(pathKey(to));
    owners.set(pathKey(to), track);
    sourceFolders.set(posix.dirname(from), dir);
    if (!same(from, to)) moves.push({ from, to, track_id: track.id, ...(track.audio_hash ? { audio_hash: track.audio_hash } : {}) });
  }
  if (!moves.length && !asides.length) return undefined;
  // The album folder itself, even when every track sits in a disc folder (its artwork follows too).
  if (!sourceFolders.has(unit.key)) sourceFolders.set(unit.key, newKey);
  if (numbered) changes.push(`Names ${plural(numbered, "track")} “${multiDisc ? "1-01" : "01"} - Title”${numberedFromMb ? ` (${numberedFromMb} numbered from MusicBrainz)` : ""}`);
  if (folded) changes.push(`Brings ${plural(folded, "track")} out of disc folders into the album folder`);
  if (duplicates) changes.push(`${plural(duplicates, "copy", "copies")} with the same name but a different recording (or not analysed yet) get “(2)” added, so nothing is overwritten`);
  if (duplicatePairs.length) changes.push(asideNote(duplicatePairs.length));
  if (!numbered && !folded && newKey === unit.key && moves.length) changes.push(`Tidies ${plural(moves.length, "file name")}`);

  // Other albums nested inside this folder (not disc folders) stay where they are.
  const nested = units.filter((other) => other.key !== unit.key && other.key.startsWith(unit.key + "/")).map((other) => other.key);
  const folders: FolderMove[] = [...sourceFolders]
    .filter(([from, to]) => !same(from, to))
    .sort((a, b) => b[0].split("/").length - a[0].split("/").length)
    .map(([from, to]) => ({ from, to, ...(nested.length ? { keep: nested.filter((key) => key.startsWith(from + "/")) } : {}) }));
  return finish({
    id: `album:${unit.fingerprint}`,
    kind: "album",
    title: `${unit.artist === "Various Artists" || isCompilation ? "Various Artists" : unit.artist} — ${unit.title}`,
    changes,
    moves: [...asides, ...moves],
    folders,
    conflicts,
    ...(duplicatePairs.length ? { duplicates: duplicatePairs } : {}),
    preview: newKey === unit.key ? [{ from: unit.key, to: unit.key }] : [{ from: unit.key, to: newKey }],
  });
}

export function buildPlan(library: Library, records: Record<string, AlbumRecord>, settings: OrganiseSettings, choices: KeepChoices = {}): Decision[] {
  const ctx = context(library);
  const units = groupAlbums({ version: library.version, tracks: ctx.tracks });
  const artists = settings.merge_artists ? artistDecisions(ctx, units, records, settings, choices) : [];
  const claimed = new Map<string, string>();
  const albums = units.map((unit) => albumDecision(unit, ctx, settings, records[unit.key], claimed, units, choices)).filter((d): d is Decision => !!d);
  return [
    ...artists.sort((a, b) => a.title.localeCompare(b.title)),
    ...albums.sort((a, b) => a.title.localeCompare(b.title)),
  ];
}

/**
 * Within one batch, an artist merge runs before that artist's album decisions:
 * rewrite the later decisions' paths to where the merge put their files.
 */
export function rebase(path: string, moved: FolderMove[]): string {
  let out = path;
  for (const { from, to } of moved) {
    if (out === from) out = to;
    else if (out.startsWith(from + "/")) out = to + out.slice(from.length);
  }
  return out;
}

// --- state: reviews, batches, the librarian's queue -------------------------------------------

export type ReviewStatus = "approved" | "skipped";
export type Review = { status: ReviewStatus; rev: string; at: number };
export type JobDecision = { id: string; title: string; kind: Decision["kind"]; moves: Move[]; folders: FolderMove[];
  /** kind "tags", applying: the details to write. */
  edits?: TagEdit[];
  /** kind "tags", undoing: the files to put back as they were. */
  restore?: Written[] };
/** A file whose details the librarian wrote: where its old tag is kept, and checksums to tell it hasn't changed since. */
export type Written = { path: string; track_id?: string; backup: string; audio_sha: string; after_sha: string };
export type DecisionOutcome = {
  id: string; title: string; kind: Decision["kind"];
  status: "queued" | "applied" | "failed";
  errors?: string[];
  notes?: string[];
  /** What was actually moved, in order, artwork and other files included. */
  moved?: Move[];
  /** Files whose details were written (kind "tags"). */
  written?: Written[];
  undo?: { status: "undone" | "failed"; errors?: string[] };
};
export type Batch = {
  id: string;
  created_at: number;
  status: "queued" | "running" | "done" | "partial" | "failed";
  finished_at?: number;
  decisions: DecisionOutcome[];
  undo?: { status: "queued" | "running" | "done" | "partial"; requested_at: number; finished_at?: number };
};
export type Job = {
  id: string;
  batch: string;
  kind: "apply" | "undo";
  status: "queued" | "running" | "done";
  created_at: number;
  claimed_at?: number;
  decisions: JobDecision[];
};
export type LibrarianSeen = { last_seen: number; version?: string; root?: string; incoming?: string; journal?: string; problem?: string };

type State = {
  format: "synamp.organise/1";
  settings: OrganiseSettings;
  reviews: Record<string, Review>;
  batches: Batch[];
  jobs: Job[];
  librarian?: LibrarianSeen;
  /** "Pause file changes": the librarian gets no new work until resumed. */
  paused?: { at: number };
  /** "Keep this one instead": the owner's pick for a pair of duplicate copies. */
  keep?: KeepChoices;
};

/** A claimed job that never reported back is offered again after this long. */
export const RECLAIM_AFTER_MS = 60 * 60_000;
const MAX_BATCHES = 50;

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}

/** The same move backwards (areas swap too). */
export function reverseMove(move: Move): Move {
  const { from_area, to_area, ...rest } = move;
  return { ...rest, from: move.to, to: move.from, ...(to_area ? { from_area: to_area } : {}), ...(from_area ? { to_area: from_area } : {}) };
}

export type JobProgress = { job: string; batch: string; kind: Job["kind"]; done: number; total: number; current?: string; updated_at: number };

export class OrganiseStore {
  private path: string;
  state: State;
  /** Live progress from the librarian (not saved: it's only for watching). */
  private live = new Map<string, JobProgress>();
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = {
      format: "synamp.organise/1",
      settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) },
      reviews: loaded.reviews ?? {},
      batches: loaded.batches ?? [],
      jobs: loaded.jobs ?? [],
      ...(loaded.librarian ? { librarian: loaded.librarian } : {}),
      ...(loaded.paused ? { paused: loaded.paused } : {}),
      ...(loaded.keep ? { keep: loaded.keep } : {}),
    };
  }

  get choices(): KeepChoices { return this.state.keep ?? {}; }

  /**
   * Which copy of a duplicate pair to keep. `keep` is a track ID from that pair
   * (checked against the plan by the caller); null forgets the choice.
   */
  choose(pair: unknown, keep: unknown): void {
    if (typeof pair !== "string" || !/^[0-9a-f]{16}$/.test(pair)) throw new OrganiseError("pair must be a pair key from the plan");
    const choices = { ...(this.state.keep ?? {}) };
    if (keep === null) delete choices[pair];
    else if (typeof keep === "string" && keep.length <= 200) choices[pair] = keep;
    else throw new OrganiseError("keep must be a track ID, or null");
    // Old picks for pairs that were resolved long ago don't need to live forever.
    const keys = Object.keys(choices);
    for (const key of keys.slice(0, Math.max(0, keys.length - 5000))) delete choices[key];
    this.state.keep = choices;
    this.save();
  }
  save(): void { writeJson(this.path, this.state); }

  /** Pause or resume file changes. A batch already under way finishes; nothing new starts. */
  setPaused(paused: unknown, now = Date.now()): void {
    if (typeof paused !== "boolean") throw new OrganiseError("paused must be true or false");
    if (paused && !this.state.paused) this.state.paused = { at: now };
    if (!paused) delete this.state.paused;
    this.save();
  }

  setSettings(input: Record<string, unknown>): OrganiseSettings {
    this.state.settings = cleanSettings(input, this.state.settings);
    this.save();
    return this.state.settings;
  }

  /** An approval counts only for the revision that was reviewed. */
  statusOf(decision: Decision): { status: "proposed" | ReviewStatus; changed: boolean } {
    const review = this.state.reviews[decision.id];
    if (!review) return { status: "proposed", changed: false };
    if (review.rev !== decision.rev) return { status: "proposed", changed: true };
    return { status: review.status, changed: false };
  }

  review(decisions: Decision[], status: ReviewStatus | "proposed", now = Date.now()): number {
    for (const decision of decisions) {
      if (status === "proposed") delete this.state.reviews[decision.id];
      else this.state.reviews[decision.id] = { status, rev: decision.rev, at: now };
    }
    this.save();
    return decisions.length;
  }

  busy(): Job | undefined { return this.state.jobs.find((job) => job.status !== "done"); }

  /** Queue every approved, conflict-free decision as one batch for the librarian. */
  apply(plan: Decision[], now = Date.now()): Batch {
    if (this.busy()) throw new OrganiseError("The librarian is still working on the last batch; wait for it to finish", 409);
    const chosen = plan.filter((decision) => this.statusOf(decision).status === "approved" && !decision.conflicts.length);
    if (!chosen.length) throw new OrganiseError("Nothing approved to apply");
    // (A batch of only song details whose files all went aside would be empty; checked below.)
    const moved: FolderMove[] = [];
    const jobDecisions: JobDecision[] = [];
    // New music first (it may land in a folder that a merge or rename then moves, along with it);
    // then artist merges; album decisions then follow the files to their merged folder.
    const order = { import: 0, artist: 1, album: 2, tags: 3 } as const;
    // Files renamed earlier in this batch: song details follow them to their new names.
    const renamed = new Map<string, string | null>();
    for (const decision of [...chosen].sort((a, b) => order[a.kind] - order[b.kind])) {
      const inLibrary = (path: string, area?: Area) => (area ? path : rebase(path, moved));
      if (decision.kind === "tags") {
        const edits = (decision.edits ?? []).flatMap((edit) => {
          const path = rebase(edit.path, moved);
          const to = renamed.has(path) ? renamed.get(path) : path;
          return to ? [{ ...edit, path: to }] : []; // set aside as a duplicate: nothing to write
        });
        if (edits.length) jobDecisions.push({ id: decision.id, title: decision.title, kind: "tags", moves: [], folders: [], edits });
        continue;
      }
      const moves = decision.moves.map((move) => ({ ...move, from: inLibrary(move.from, move.from_area), to: inLibrary(move.to, move.to_area) }));
      const folders = decision.folders.map((folder) => ({
        ...folder, from: inLibrary(folder.from, folder.from_area), to: rebase(folder.to, moved),
        ...(folder.keep ? { keep: folder.keep.map((key) => rebase(key, moved)) } : {}),
      }));
      jobDecisions.push({ id: decision.id, title: decision.title, kind: decision.kind, moves, folders });
      if (decision.kind === "artist") moved.push(...decision.folders.map(({ from, to }) => ({ from, to })));
      for (const move of moves) if (!move.from_area) renamed.set(move.from, move.to_area ? null : move.to);
    }
    if (!jobDecisions.length) throw new OrganiseError("Nothing approved to apply");
    const batch: Batch = {
      id: `b_${now.toString(36)}${randomBytes(3).toString("hex")}`,
      created_at: now,
      status: "queued",
      decisions: jobDecisions.map(({ id, title, kind }) => ({ id, title, kind, status: "queued" })),
    };
    this.state.batches.unshift(batch);
    this.state.batches = this.state.batches.slice(0, MAX_BATCHES);
    this.state.jobs.push({ id: `j_${randomBytes(6).toString("hex")}`, batch: batch.id, kind: "apply", status: "queued", created_at: now, decisions: jobDecisions });
    this.save();
    return batch;
  }

  undo(batchId: string, now = Date.now()): Batch {
    const batch = this.state.batches.find((item) => item.id === batchId);
    if (!batch) throw new OrganiseError("No batch with that id", 404);
    if (this.busy()) throw new OrganiseError("The librarian is still working on the last batch; wait for it to finish", 409);
    if (batch.status === "queued" || batch.status === "running") throw new OrganiseError("This batch hasn't been applied yet", 409);
    if (batch.undo && batch.undo.status !== "partial") throw new OrganiseError("This batch was already undone", 409);
    // Newer batches may have moved the same files again; undo those first.
    const newer = this.state.batches.filter((item) => item.created_at > batch.created_at && item.decisions.some((d) => d.status === "applied" && d.undo?.status !== "undone"));
    if (newer.length) throw new OrganiseError("Undo the newer batches first (most recent first)", 409);
    const decisions: JobDecision[] = batch.decisions
      .filter((d) => d.status === "applied" && (d.moved?.length || d.written?.length) && d.undo?.status !== "undone")
      .reverse()
      .map((d) => d.kind === "tags"
        ? { id: d.id, title: d.title, kind: d.kind, folders: [], moves: [], restore: [...(d.written ?? [])].reverse() }
        : { id: d.id, title: d.title, kind: d.kind, folders: [], moves: [...(d.moved ?? [])].reverse().map(reverseMove) });
    if (!decisions.length) throw new OrganiseError("Nothing in this batch to undo");
    batch.undo = { status: "queued", requested_at: now };
    this.state.jobs.push({ id: `j_${randomBytes(6).toString("hex")}`, batch: batch.id, kind: "undo", status: "queued", created_at: now, decisions });
    this.save();
    return batch;
  }

  /** The librarian asks for work; this is also how the brain knows it is alive. */
  claim(seen: Omit<LibrarianSeen, "last_seen">, now = Date.now()): Job | null {
    this.state.librarian = { ...seen, last_seen: now };
    if (this.state.paused) { this.save(); return null; }
    const job = this.state.jobs.find((item) => item.status === "queued")
      // A job that went quiet (no report, no progress) for an hour is offered again.
      ?? this.state.jobs.find((item) => item.status === "running"
        && now - Math.max(item.claimed_at ?? 0, this.live.get(item.id)?.updated_at ?? 0) > RECLAIM_AFTER_MS);
    if (job) {
      job.status = "running";
      job.claimed_at = now;
      const batch = this.state.batches.find((item) => item.id === job.batch);
      if (batch && job.kind === "apply") batch.status = "running";
      if (batch?.undo && job.kind === "undo") batch.undo.status = "running";
    }
    this.save();
    return job ?? null;
  }

  /** The librarian says how far along a job is. */
  progress(jobId: string, input: unknown, now = Date.now()): void {
    const job = this.state.jobs.find((item) => item.id === jobId);
    if (!job || job.status !== "running") return;
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
    this.live.set(jobId, {
      job: jobId, batch: job.batch, kind: job.kind, total: job.decisions.length,
      done: Math.min(count(raw.done), job.decisions.length), updated_at: now,
      ...(typeof raw.current === "string" ? { current: raw.current.slice(0, 300) } : {}),
    });
    if (this.state.librarian) this.state.librarian.last_seen = now;
  }

  /** The running job, with live progress when the librarian has sent some. */
  progressView(): (JobProgress & { claimed_at?: number }) | null {
    const job = this.state.jobs.find((item) => item.status === "running");
    if (!job) {
      const queued = this.state.jobs.find((item) => item.status === "queued");
      return queued ? { job: queued.id, batch: queued.batch, kind: queued.kind, done: 0, total: queued.decisions.length, updated_at: queued.created_at } : null;
    }
    return { job: job.id, batch: job.batch, kind: job.kind, done: 0, total: job.decisions.length, updated_at: job.claimed_at ?? job.created_at,
      ...(job.claimed_at ? { claimed_at: job.claimed_at } : {}), ...this.live.get(job.id) };
  }

  /** The librarian's report. Returns the moves that actually happened, in order. */
  complete(jobId: string, input: unknown, now = Date.now()): { job: Job; moved: Move[]; folders: FolderMove[]; written: Written[] } {
    const job = this.state.jobs.find((item) => item.id === jobId);
    if (!job) throw new OrganiseError("No job with that id", 404);
    if (job.status === "done") return { job, moved: [], folders: [], written: [] }; // a repeated report changes nothing
    const results = cleanResults(input, job);
    const batch = this.state.batches.find((item) => item.id === job.batch);
    const moved: Move[] = [];
    const folders: FolderMove[] = [];
    const written: Written[] = [];
    for (const result of results) {
      const outcome = batch?.decisions.find((d) => d.id === result.id);
      const planned = job.decisions.find((d) => d.id === result.id)!;
      moved.push(...result.moved);
      written.push(...result.written);
      // Folder moves inside the library carry the MusicBrainz matches along; imports have none yet.
      if (result.status === "applied") folders.push(...planned.folders.filter((f) => !f.from_area).map(({ from, to }) => ({ from, to })));
      if (!outcome) continue;
      if (job.kind === "apply") {
        outcome.status = result.status;
        outcome.moved = result.moved;
        if (result.written.length) outcome.written = result.written;
        if (result.errors.length) outcome.errors = result.errors;
        if (result.notes.length) outcome.notes = result.notes;
        if (result.status === "applied") delete this.state.reviews[result.id];
      } else {
        // An undo that only partly worked keeps what is left, so it can be tried again.
        const undone = new Set(result.moved.map((m) => `${m.to_area ?? ""}:${m.to}\n${m.from_area ?? ""}:${m.from}`));
        if (outcome.moved) outcome.moved = outcome.moved.filter((m) => !undone.has(`${m.from_area ?? ""}:${m.from}\n${m.to_area ?? ""}:${m.to}`));
        // Song details put back: those files are done; any left can be tried again.
        if (outcome.written) { const back = new Set(result.written.map((w) => w.path)); outcome.written = outcome.written.filter((w) => !back.has(w.path)); }
        outcome.undo = { status: result.status === "applied" ? "undone" : "failed", ...(result.errors.length ? { errors: result.errors } : {}) };
      }
    }
    job.status = "done";
    this.live.delete(job.id);
    if (batch) {
      if (job.kind === "apply") {
        const applied = batch.decisions.filter((d) => d.status === "applied").length;
        batch.status = applied === batch.decisions.length ? "done" : applied ? "partial" : "failed";
        batch.finished_at = now;
      } else if (batch.undo) {
        const tried = batch.decisions.filter((d) => d.undo);
        batch.undo.status = tried.every((d) => d.undo!.status === "undone") ? "done" : "partial";
        batch.undo.finished_at = now;
      }
    }
    this.state.jobs = [...this.state.jobs.filter((item) => item.status !== "done"), ...this.state.jobs.filter((item) => item.status === "done").slice(-20)];
    this.save();
    return { job, moved, folders: job.kind === "undo" ? [] : folders, written };
  }
}

type CleanResult = { id: string; status: "applied" | "failed"; moved: Move[]; written: Written[]; errors: string[]; notes: string[] };
const hex = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);

/** The report comes over the network: keep only well-formed, known, safe entries. */
function cleanResults(input: unknown, job: Job): CleanResult[] {
  const raw = input && typeof input === "object" ? (input as { results?: unknown }).results : undefined;
  if (!Array.isArray(raw)) throw new OrganiseError("results must be a list");
  const known = new Set(job.decisions.map((d) => d.id));
  const texts = (value: unknown) => (Array.isArray(value) ? value.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 500)).slice(0, 50) : []);
  const out: CleanResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || !known.has(entry.id) || out.some((r) => r.id === entry.id)) continue;
    const moved = (Array.isArray(entry.moved) ? entry.moved : [])
      .filter((m): m is Move => !!m && typeof m === "object" && isSafeRelative((m as Move).from) && isSafeRelative((m as Move).to))
      .map((m) => ({
        from: m.from, to: m.to, ...(typeof m.track_id === "string" ? { track_id: m.track_id } : {}), ...(typeof m.audio_hash === "string" ? { audio_hash: m.audio_hash } : {}),
        ...(m.from_area === "incoming" ? { from_area: "incoming" as const } : {}), ...(m.to_area === "incoming" ? { to_area: "incoming" as const } : {}),
      }));
    const written = (Array.isArray(entry.written) ? entry.written : [])
      .filter((w): w is Written => !!w && typeof w === "object" && isSafeRelative((w as Written).path) && /^[\w./-]{1,300}$/.test((w as Written).backup) && hex((w as Written).audio_sha, 64) && hex((w as Written).after_sha, 64))
      .map((w) => ({ path: w.path, backup: w.backup, audio_sha: w.audio_sha, after_sha: w.after_sha, ...(typeof w.track_id === "string" ? { track_id: w.track_id } : {}) }));
    out.push({ id: entry.id, status: entry.status === "applied" ? "applied" : "failed", moved, written, errors: texts(entry.errors), notes: texts(entry.notes) });
  }
  // Anything the librarian didn't mention did not happen.
  for (const decision of job.decisions) {
    if (!out.some((r) => r.id === decision.id)) out.push({ id: decision.id, status: "failed", moved: [], written: [], errors: ["The librarian did not report on this"], notes: [] });
  }
  return out;
}

/** After folders moved, carry their MusicBrainz matches along (copied, so nothing is re-looked-up). */
export function carryMatches(matches: AlbumMatches, folders: FolderMove[]): number {
  let carried = 0;
  for (const { from, to } of folders) {
    for (const [key, record] of Object.entries({ ...matches.records })) {
      if (key !== from && !key.startsWith(from + "/")) continue;
      const next = to + key.slice(from.length);
      if (matches.records[next]) continue;
      matches.records[next] = { ...record, key: next };
      carried++;
    }
  }
  if (carried) matches.save();
  return carried;
}

// --- moved files keep working before the next export -------------------------------------------

/**
 * The library index comes from the analyzer and is refreshed when it next
 * exports. Until then, a track whose file the librarian moved would point at a
 * path that no longer exists. The overlay follows recorded moves for exactly
 * those tracks — and only when the old file is really gone and the new one is
 * really there, so a fresh export is never second-guessed.
 */
export class PathOverlay {
  private file: string;
  private root: string;
  private exists: (path: string) => boolean;
  private moves: Array<[string, string]> = [];
  private cache?: { key: string; library: Library; byPath: Map<string, string> };

  constructor(file: string, root: string, exists: (path: string) => boolean = existsSync) {
    this.file = file;
    this.root = root;
    this.exists = exists;
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        try {
          const move = JSON.parse(line) as Move;
          if (isSafeRelative(move.from) && isSafeRelative(move.to)) this.moves.push([move.from, move.to]);
        } catch { /* a torn last line */ }
      }
    } catch { /* none yet */ }
  }

  get count(): number { return this.moves.length; }

  record(all: Move[]): void {
    // Only moves inside the library matter here; new arrivals reach the index with the next export.
    const moves = all.filter((m) => !m.from_area && !m.to_area);
    if (!moves.length) return;
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, moves.map((m) => JSON.stringify({ from: m.from, to: m.to })).join("\n") + "\n");
    for (const move of moves) this.moves.push([move.from, move.to]);
    this.cache = undefined;
  }

  /** Forget the cached view (call after the librarian reports). */
  refresh(): void { this.cache = undefined; }

  apply(library: Library): Library {
    const key = `${library.version}:${this.moves.length}`;
    if (this.cache?.key === key) return this.cache.library;
    const latest = new Map<string, string>();
    for (const [from, to] of this.moves) latest.set(from, to);
    const byPath = new Map<string, string>();
    let changed = 0;
    const tracks = library.tracks.map((track) => {
      if (!track.path || !latest.has(track.path) || this.exists(join(this.root, track.path))) return track;
      const seen = new Set<string>();
      let path = track.path;
      while (latest.has(path) && !seen.has(path)) {
        seen.add(path);
        path = latest.get(path)!;
        if (this.exists(join(this.root, path))) {
          changed++;
          byPath.set(path, track.id);
          return { ...track, path };
        }
      }
      return track;
    });
    const result = changed ? { version: `${library.version}+${this.moves.length}`, tracks } : library;
    this.cache = { key, library: result, byPath };
    return result;
  }

  /** A moved track's ID by its new path (for plays reported by other apps). */
  idForPath(path: string, library: Library): string | undefined {
    this.apply(library);
    return this.cache?.byPath.get(path);
  }
}
