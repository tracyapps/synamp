/** Artist planets are a presentation projection, never a physical album merge. */
import { createHash } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { albumFolder, groupAlbums } from "./albums.ts";
import type { AlbumUnit } from "./albums.ts";
import { BrowseError, trackSummary } from "./browse.ts";
import type { TrackSummary } from "./browse.ts";

export type GalaxyNode = { key: string; name: string; tracks: number; albums: number; parsed_credit: boolean; raw_credits: string[] };
export type GalaxyOptions = { q?: string; sort?: string; offset?: number; limit?: number };
type Artist = { node: GalaxyNode; tracks: LibraryTrack[]; search: string };
type Catalog = { artists: Artist[]; byKey: Map<string, Artist>; albums: Map<string, AlbumUnit> };
let cached: { library: Library; version: string; catalog: Catalog } | undefined;

/** Search ignores case/accents while retaining all scripts. It does not merge artist identities. */
const searchable = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Only explicit credit markers are candidates. AC/DC, Earth, Wind & Fire stay intact. */
function credit(track: LibraryTrack): { name: string; raw: string; parsed: boolean } {
  const raw = track.artist?.trim() || "Unknown artist";
  const match = raw.match(/^(.+?)\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i);
  return { name: match?.[1]?.trim() || raw, raw, parsed: !!match };
}

function catalog(library: Library): Catalog {
  if (cached?.library === library && cached.version === library.version) return cached.catalog;
  const albums = new Map(groupAlbums(library).map(album => [album.key, album]));
  const artists = new Map<string, { name: string; tracks: LibraryTrack[]; credits: Set<string>; parsed: boolean }>();
  for (const track of library.tracks) {
    const who = credit(track);
    const item = artists.get(who.name) ?? { name: who.name, tracks: [], credits: new Set<string>(), parsed: false };
    item.tracks.push(track); item.credits.add(who.raw); item.parsed ||= who.parsed; artists.set(who.name, item);
  }
  const all = [...artists.values()].map(item => {
    const albumKeys = new Set(item.tracks.flatMap(track => track.path && albums.has(albumFolder(track.path)) ? [albumFolder(track.path)] : []));
    const node: GalaxyNode = { key: `artist:${createHash("sha256").update(item.name).digest("hex").slice(0, 24)}`, name: item.name,
      tracks: item.tracks.length, albums: albumKeys.size, parsed_credit: item.parsed, raw_credits: [...item.credits].sort() };
    return { node, tracks: item.tracks, search: searchable([item.name, ...item.credits].join(" ")) };
  });
  const result = { artists: all, byKey: new Map(all.map(item => [item.node.key, item])), albums };
  cached = { library, version: library.version, catalog: result }; return result;
}

function pool(library: Library, q = ""): Artist[] {
  if (q.length > 160) throw new BrowseError("Artist search is limited to 160 characters.");
  const words = searchable(q).split(" ").filter(Boolean);
  return catalog(library).artists.filter(item => words.every(word => item.search.includes(word)));
}
const alphabetical = (a: Artist, b: Artist) => searchable(a.node.name).replace(/^(the|a|an) /, "").localeCompare(searchable(b.node.name).replace(/^(the|a|an) /, "")) || a.node.key.localeCompare(b.node.key);
const bounded = (value: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value!))) : fallback;

export function galaxy(library: Library, options: GalaxyOptions = {}): { total: number; offset: number; nodes: GalaxyNode[] } {
  const artists = pool(library, options.q);
  artists.sort(options.sort === "count" ? (a, b) => b.node.tracks - a.node.tracks || alphabetical(a, b) : alphabetical);
  const offset = bounded(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = bounded(options.limit, 60, 1, 100);
  return { total: artists.length, offset, nodes: artists.slice(offset, offset + limit).map(item => item.node) };
}

/** Pick from every filtered artist, not the displayed page. Injection permits meaningful tests. */
export function galaxyRandom(library: Library, options: { q?: string } = {}, random: () => number = Math.random): { total: number; node: GalaxyNode | null } {
  const artists = pool(library, options.q);
  const draw = random();
  const index = Math.min(artists.length - 1, Math.max(0, Math.floor((Number.isFinite(draw) ? draw : 0) * artists.length)));
  return { total: artists.length, node: artists[index]?.node ?? null };
}

export function galaxyArtist(library: Library, key: string): {
  artist: GalaxyNode;
  albums: { key: string; title: string; artist: string; year?: number; tracks: number; total_tracks: number; matching_tracks: TrackSummary[] }[];
  loose_tracks: TrackSummary[]; truncated: boolean;
} {
  const data = catalog(library); const artist = data.byKey.get(key);
  if (!artist) throw new BrowseError("That artist isn't in the library list any more", 404);
  const groups = new Map<string, LibraryTrack[]>(); const loose: LibraryTrack[] = [];
  for (const track of artist.tracks) {
    const folder = track.path ? albumFolder(track.path) : undefined;
    if (!folder || !data.albums.has(folder)) { loose.push(track); continue; }
    const rows = groups.get(folder) ?? []; rows.push(track); groups.set(folder, rows);
  }
  let remaining = 2000;
  const take = (rows: LibraryTrack[]) => { const selected = rows.slice(0, remaining); remaining -= selected.length; return selected.map(trackSummary); };
  const albums = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, tracks]) => {
    const album = data.albums.get(folder)!;
    tracks.sort((a, b) => (a.disc_no ?? 1) - (b.disc_no ?? 1) || (a.track_no ?? 9999) - (b.track_no ?? 9999) || (a.path ?? a.title).localeCompare(b.path ?? b.title));
    return { key: folder, title: album.title, artist: album.artist, ...(album.year ? { year: album.year } : {}), tracks: tracks.length,
      total_tracks: album.tracks.length, matching_tracks: take(tracks) };
  });
  return { artist: artist.node, albums, loose_tracks: take(loose), truncated: artist.tracks.length > 2000 };
}
