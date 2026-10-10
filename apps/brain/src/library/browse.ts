/**
 * Browsing the library: albums as they sit on disk, an album's tracks in order,
 * and a quick search across titles, artists and albums.
 *
 * Pure functions over the analyzer's library list. Album grouping is the same
 * as the missing-tracks list (albums.ts), cached per library version because a
 * 46,000-track library takes a moment to group.
 */

import { groupAlbums } from "./albums.ts";
import type { AlbumUnit } from "./albums.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

export type AlbumSort = "artist" | "title" | "year";
export type AlbumSummary = { key: string; title: string; artist: string; year?: number; tracks: number; duration_s?: number };
export type TrackSummary = { id: string; title: string; artist?: string; album?: string; year?: number; duration_s?: number; track_no?: number; disc_no?: number };

export class BrowseError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Lowercase, accents and punctuation gone: "Björk" and "bjork" match. */
export function fold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** "The Beatles" files under B. */
function sortName(text: string): string {
  return fold(text).replace(/^(the|a|an) /, "");
}

let cache: { version: string; albums: AlbumUnit[] } | null = null;
function albumsOf(library: Library): AlbumUnit[] {
  if (cache?.version !== library.version || library.version === "missing") cache = { version: library.version, albums: groupAlbums(library) };
  return cache.albums;
}

export function trackSummary(track: LibraryTrack): TrackSummary {
  return {
    id: track.id, title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    ...(track.album ? { album: track.album } : {}),
    ...(track.year ? { year: track.year } : {}),
    ...(track.duration_s ? { duration_s: track.duration_s } : {}),
    ...(track.track_no ? { track_no: track.track_no } : {}),
    ...(track.disc_no ? { disc_no: track.disc_no } : {}),
  };
}

function albumSummary(album: AlbumUnit): AlbumSummary {
  const seconds = album.tracks.reduce((sum, track) => sum + (track.duration_s ?? 0), 0);
  return {
    key: album.key, title: album.title, artist: album.artist, tracks: album.tracks.length,
    ...(album.year ? { year: album.year } : {}),
    ...(seconds ? { duration_s: Math.round(seconds) } : {}),
  };
}

/** Every word of the query appears somewhere in the text. */
function matches(haystack: string, words: string[]): boolean {
  return words.every((word) => haystack.includes(word));
}

export function listAlbums(library: Library, options: { q?: string; sort?: string; offset?: number; limit?: number } = {}):
  { total: number; offset: number; albums: AlbumSummary[] } {
  const sort: AlbumSort = options.sort === "title" || options.sort === "year" ? options.sort : "artist";
  const limit = Math.min(Math.max(1, Math.trunc(options.limit ?? 60)), 200);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const words = fold(options.q ?? "").split(" ").filter(Boolean);
  let albums = albumsOf(library);
  if (words.length) albums = albums.filter((album) => matches(fold(`${album.title} ${album.artist} ${album.year ?? ""}`), words));
  const sorted = [...albums].sort((a, b) => {
    if (sort === "title") return sortName(a.title).localeCompare(sortName(b.title)) || sortName(a.artist).localeCompare(sortName(b.artist));
    if (sort === "year") return (b.year ?? 0) - (a.year ?? 0) || sortName(a.artist).localeCompare(sortName(b.artist));
    return sortName(a.artist).localeCompare(sortName(b.artist)) || (a.year ?? 0) - (b.year ?? 0) || sortName(a.title).localeCompare(sortName(b.title));
  });
  return { total: sorted.length, offset, albums: sorted.slice(offset, offset + limit).map(albumSummary) };
}

/** An album's tracks in play order: disc, then track number, then file name. */
export function albumTracks(library: Library, key: string): { album: AlbumSummary; tracks: LibraryTrack[] } {
  const album = albumsOf(library).find((item) => item.key === key);
  if (!album) throw new BrowseError("That album isn't in the library list any more", 404);
  const tracks = [...album.tracks].sort((a, b) =>
    (a.disc_no ?? 1) - (b.disc_no ?? 1) || (a.track_no ?? 9999) - (b.track_no ?? 9999) || (a.path ?? "").localeCompare(b.path ?? ""));
  return { album: albumSummary(album), tracks };
}

/**
 * Tracks whose title, artist or album contain every word of the query. Title
 * matches come first, then artist, then album; ties keep library order.
 */
export function searchTracks(library: Library, q: string, limit = 50): { total: number; tracks: TrackSummary[] } {
  const words = fold(q).split(" ").filter(Boolean);
  if (!words.length) return { total: 0, tracks: [] };
  const scored: Array<{ track: LibraryTrack; score: number }> = [];
  for (const track of library.tracks) {
    const title = fold(track.title);
    const artist = fold(track.artist ?? "");
    const album = fold(track.album ?? "");
    if (!matches(`${title} ${artist} ${album}`, words)) continue;
    const score = (matches(title, words) ? 4 : 0) + (title.startsWith(words.join(" ")) ? 2 : 0) + (matches(artist, words) ? 1 : 0);
    scored.push({ track, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { total: scored.length, tracks: scored.slice(0, Math.min(Math.max(1, limit), 200)).map((item) => trackSummary(item.track)) };
}

/** Shuffle in place (Fisher–Yates). */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [list[index], list[other]] = [list[other]!, list[index]!];
  }
  return list;
}

export type ArtistAlbum = AlbumSummary & { songs_by_artist: number };
export type ArtistPage = {
  artist: { name: string; songs: number; albums: number; duration_s?: number };
  /** Albums filed under this artist. */
  albums: ArtistAlbum[];
  /** Other artists' albums (compilations, guest spots) with songs credited to this artist. */
  appears_on: ArtistAlbum[];
  /** Every song by this artist, album by album (oldest first), at most 2,000. */
  songs: Array<TrackSummary & { album_key: string }>;
  truncated: boolean;
};

/** Same artist when the names match ignoring case and accents ("Björk" = "bjork"); punctuation still counts (AC/DC). */
export const artistKey = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** The tracks of an artist, as on their page: their albums, then the albums they appear on. */
export function artistTracks(library: Library, name: string): LibraryTrack[] {
  return artistPageOf(library, name).tracks;
}

function artistPageOf(library: Library, name: string) {
  const key = artistKey(name);
  if (!key) throw new BrowseError("Which artist?");
  const own: Array<{ album: AlbumUnit; tracks: LibraryTrack[] }> = [];
  const guest: Array<{ album: AlbumUnit; tracks: LibraryTrack[] }> = [];
  let shownName: string | undefined;
  for (const album of albumsOf(library)) {
    const filedHere = artistKey(album.artist) === key;
    const theirs = album.tracks.filter((track) => artistKey(track.artist ?? "") === key || (!track.artist && filedHere));
    if (filedHere) { own.push({ album, tracks: [...album.tracks] }); shownName ??= album.artist; }
    else if (theirs.length) { guest.push({ album, tracks: theirs }); shownName ??= theirs[0]!.artist; }
  }
  if (!own.length && !guest.length) throw new BrowseError("That artist isn't in the library list any more", 404);
  const byYear = (a: { album: AlbumUnit }, b: { album: AlbumUnit }) =>
    (a.album.year ?? 9999) - (b.album.year ?? 9999) || sortName(a.album.title).localeCompare(sortName(b.album.title));
  own.sort(byYear); guest.sort(byYear);
  const inOrder = (tracks: LibraryTrack[]) => [...tracks].sort((a, b) =>
    (a.disc_no ?? 1) - (b.disc_no ?? 1) || (a.track_no ?? 9999) - (b.track_no ?? 9999) || (a.path ?? "").localeCompare(b.path ?? ""));
  const entries = [...own, ...guest].map((entry) => ({ ...entry, tracks: inOrder(entry.tracks) }));
  const tracks = entries.flatMap((entry) => entry.tracks);
  return { name: shownName ?? name, own, guest, entries, tracks };
}

export function artistPage(library: Library, name: string): ArtistPage {
  const page = artistPageOf(library, name);
  const seconds = page.tracks.reduce((sum, track) => sum + (track.duration_s ?? 0), 0);
  const songs = page.entries.flatMap((entry) => entry.tracks.map((track) => ({ ...trackSummary(track), album_key: entry.album.key }))).slice(0, 2000);
  return {
    artist: { name: page.name, songs: page.tracks.length, albums: page.own.length, ...(seconds ? { duration_s: Math.round(seconds) } : {}) },
    albums: page.own.map((entry) => ({ ...albumSummary(entry.album), songs_by_artist: entry.tracks.length })),
    appears_on: page.guest.map((entry) => ({ ...albumSummary(entry.album), songs_by_artist: entry.tracks.length })),
    songs, truncated: page.tracks.length > songs.length,
  };
}
