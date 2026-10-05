/**
 * Albums as they sit on disk, and how well a MusicBrainz release explains them.
 *
 * Pure functions, no network: grouping tracks into album folders, comparing a
 * folder with a release's tracklist, and listing what the release has that the
 * folder doesn't. The matcher (missing.ts) does the talking to MusicBrainz.
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import type { MbRelease } from "./musicbrainz.ts";

export type AlbumUnit = {
  /** The album folder, library-relative (disc sub-folders folded in). */
  key: string;
  title: string;
  artist: string;
  year?: number;
  mb_albumid?: string;
  tracks: LibraryTrack[];
  /** Changes when tracks are added or removed. */
  fingerprint: string;
};

const DISC_FOLDER = /^(?:cd|disc|disk)\s*[-_ ]?(\d{1,2})$/i;
const YEAR_SUFFIX = /\s*[([]\s*(\d{4})\s*[)\]]\s*$/;

function majority<T>(values: Array<T | undefined>): { value: T; share: number } | undefined {
  const counts = new Map<T, number>();
  let total = 0;
  for (const value of values) if (value !== undefined && value !== "") { counts.set(value, (counts.get(value) ?? 0) + 1); total++; }
  let best: T | undefined, bestCount = 0;
  for (const [value, count] of counts) if (count > bestCount) { best = value; bestCount = count; }
  return best === undefined ? undefined : { value: best, share: bestCount / values.length };
}

/** Disc number from a "CD2" / "Disc 2" folder, if the track sits in one. */
export function discFromFolder(path: string): number | undefined {
  const match = posix.basename(posix.dirname(path)).match(DISC_FOLDER);
  return match ? Number(match[1]) : undefined;
}

export function groupAlbums(library: Library): AlbumUnit[] {
  const folders = new Map<string, LibraryTrack[]>();
  for (const track of library.tracks) {
    if (!track.path) continue;
    let folder = posix.dirname(track.path);
    if (DISC_FOLDER.test(posix.basename(folder))) folder = posix.dirname(folder);
    if (folder === "." || folder === "") continue; // loose files at the library root aren't an album
    const list = folders.get(folder) ?? [];
    list.push(track);
    folders.set(folder, list);
  }
  return [...folders].map(([key, tracks]) => {
    const folderName = posix.basename(key);
    const album = majority(tracks.map((t) => t.album));
    const albumArtist = majority(tracks.map((t) => t.album_artist));
    const artist = majority(tracks.map((t) => t.artist));
    const year = majority(tracks.map((t) => t.year));
    const yearInName = folderName.match(YEAR_SUFFIX);
    const mbid = majority(tracks.map((t) => t.mb_albumid));
    const title = album && album.share >= 0.5 ? album.value : folderName.replace(YEAR_SUFFIX, "");
    const who = albumArtist?.value ?? (artist && artist.share > 0.5 ? artist.value : tracks.length > 2 && artist ? "Various Artists" : key.split("/")[0]!);
    return {
      key, title, artist: who, tracks,
      ...(year ? { year: year.value } : yearInName ? { year: Number(yearInName[1]) } : {}),
      ...(mbid && mbid.share >= 0.5 ? { mb_albumid: mbid.value } : {}),
      fingerprint: createHash("sha256").update(tracks.map((t) => t.id).sort().join("\n")).digest("hex").slice(0, 16),
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

/** Lowercase, no accents, no "(Remastered 2011)"-style suffixes, no punctuation. */
export function normalTitle(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\s*[([][^)\]]*(?:remaster|remix|version|edit|live|mono|stereo|bonus|demo|mix|deluxe|edition)[^)\]]*[)\]]/g, "")
    .replace(/\s+(?:feat|ft|featuring)\.?\s.*$/, "")
    .replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function titleSimilarity(a: string, b: string): number {
  const x = normalTitle(a), y = normalTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const tx = new Set(x.split(" ")), ty = new Set(y.split(" "));
  const shared = [...tx].filter((token) => ty.has(token)).length;
  return shared / new Set([...tx, ...ty]).size;
}

type Slot = { disc: number; track: MbRelease["media"][number]["tracks"][number] };
const slots = (release: MbRelease): Slot[] => release.media.flatMap((medium) => medium.tracks.map((track) => ({ disc: medium.position, track })));
const discOf = (t: LibraryTrack) => t.disc_no ?? (t.path ? discFromFolder(t.path) : undefined);
const numberOf = (t: LibraryTrack) => t.track_no;

export type Match = {
  /** Present track id → release slot key ("disc-position"). */
  mapping: Map<string, string>;
  matched: number;
  present: number;
  /** 0..1, how well the release explains the folder. */
  score: number;
  confident: boolean;
};

export const slotKey = (disc: number, position: number) => `${disc}-${position}`;

/**
 * Pairs each track in the folder with a track on the release: by title first,
 * then by disc/track number with a matching length (titles sometimes differ in
 * punctuation or language). Each release track is used at most once.
 */
export function matchRelease(unit: AlbumUnit, release: MbRelease): Match {
  const all = slots(release);
  const taken = new Set<string>();
  const mapping = new Map<string, string>();
  const singleDisc = release.media.length === 1;
  const pairs: Array<{ track: LibraryTrack; slot: Slot; sim: number }> = [];
  for (const track of unit.tracks) for (const slot of all) {
    const sim = titleSimilarity(track.title, slot.track.title);
    const sameNumber = numberOf(track) === slot.track.position && (singleDisc || (discOf(track) ?? 1) === slot.disc);
    if (sim >= 0.6) pairs.push({ track, slot, sim: sim + (sameNumber ? 0.05 : 0) });
  }
  pairs.sort((a, b) => b.sim - a.sim);
  for (const { track, slot } of pairs) {
    const key = slotKey(slot.disc, slot.track.position);
    if (mapping.has(track.id) || taken.has(key)) continue;
    mapping.set(track.id, key);
    taken.add(key);
  }
  for (const track of unit.tracks) {
    if (mapping.has(track.id) || numberOf(track) === undefined) continue;
    const slot = all.find((s) => s.track.position === numberOf(track) && (singleDisc || (discOf(track) ?? 1) === s.disc));
    const lengthOk = slot?.track.length_ms && track.duration_s ? Math.abs(slot.track.length_ms / 1000 - track.duration_s) <= 3 : false;
    if (slot && lengthOk && !taken.has(slotKey(slot.disc, slot.track.position))) {
      mapping.set(track.id, slotKey(slot.disc, slot.track.position));
      taken.add(slotKey(slot.disc, slot.track.position));
    }
  }
  const present = unit.tracks.length;
  const matched = mapping.size;
  const fraction = present ? matched / present : 0;
  const albumSim = titleSimilarity(unit.title, release.title);
  const yearOk = unit.year && release.date ? Number(release.date.slice(0, 4)) === unit.year : false;
  const overfull = present > release.track_count; // more files than the release has tracks
  const score = Math.max(0, 0.7 * fraction + 0.2 * albumSim + (yearOk ? 0.1 : 0) - (overfull ? 0.2 : 0));
  return { mapping, matched, present, score, confident: fraction >= 0.8 && albumSim >= 0.6 && !overfull };
}

export type MissingTrack = {
  id: string;
  release_id: string;
  disc: number;
  discs: number;
  position: number;
  number: string;
  title: string;
  length_ms?: number;
};

/** The release's tracks that no file in the folder accounts for. */
export function missingTracks(release: MbRelease, match: Match): MissingTrack[] {
  const covered = new Set(match.mapping.values());
  return slots(release)
    .filter((slot) => !covered.has(slotKey(slot.disc, slot.track.position)))
    .map((slot) => ({
      id: `${release.id}:${slotKey(slot.disc, slot.track.position)}`,
      release_id: release.id, disc: slot.disc, discs: release.media.length,
      position: slot.track.position, number: slot.track.number, title: slot.track.title,
      ...(slot.track.length_ms ? { length_ms: slot.track.length_ms } : {}),
    }));
}
