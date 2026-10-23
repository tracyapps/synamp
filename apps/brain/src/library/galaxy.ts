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

/*
 * The whole-library map behind the Galaxy explorer. One request carries every
 * artist with the facets the views group and colour by, plus the featured-credit
 * links between them. Edges are parsed candidates (the same explicit
 * feat/ft/featuring markers as the planet list), never verified collaborations.
 */
export type GalaxyMapNode = {
  key: string; name: string; tracks: number; albums: number;
  genres: string[]; decade?: number; year_first?: number; year_last?: number; letter: string;
  signals?: { bpm?: number; valence?: number; arousal?: number };
  guest?: boolean; appearances?: number;
};
export type GalaxyMapEdge = { a: string; b: string; tracks: number };
export type GalaxyMap = { version: string; total_tracks: number; artists: GalaxyMapNode[]; edges: GalaxyMapEdge[] };
type MapCache = { library: Library; version: string; map: GalaxyMap };
let mapCached: MapCache | undefined;

const letterOf = (name: string) => {
  const sort = searchable(name).replace(/^(the|a|an) /, "");
  const first = sort.slice(0, 1).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
};

/** Whole-credit guest lists, kept conservative: comma and standalone "&" splits, annotation brackets dropped. */
function featured(raw: string): { base: string; whole: string; guests: string[] } | null {
  const match = raw.match(/^(.+?)\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i);
  if (!match) return null;
  const clean = match[2]!.replace(/\([^()]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const guests = clean.split(/,|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+/i).map(part => part.trim()).filter(part => part.length > 0 && part.length <= 120);
  return guests.length ? { base: match[1]!.trim(), whole: clean, guests } : null;
}

const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : undefined;

export function galaxyMap(library: Library): GalaxyMap {
  if (mapCached?.library === library && mapCached.version === library.version) return mapCached.map;
  const data = catalog(library);
  const byName = new Map(data.artists.map(item => [item.node.name, item]));
  const keyOf = (name: string) => `artist:${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
  const artists: GalaxyMapNode[] = data.artists.map(item => {
    const genres = new Map<string, number>(); const years: number[] = []; let first: number | undefined; let last: number | undefined;
    const bpm: number[] = []; const valence: number[] = []; const arousal: number[] = [];
    for (const track of item.tracks) {
      for (const genre of track.genre ?? []) { const name = genre.trim(); if (name) genres.set(name, (genres.get(name) ?? 0) + 1); }
      if (Number.isFinite(track.year)) { const year = Math.trunc(track.year!); years.push(Math.floor(year / 10) * 10); first = Math.min(first ?? year, year); last = Math.max(last ?? year, year); }
      const signals = track.signals ?? {};
      for (const [name, bucket] of [["bpm", bpm], ["valence", valence], ["arousal", arousal]] as const) {
        const value = signals[name];
        if (typeof value === "number" && Number.isFinite(value)) bucket.push(value);
      }
    }
    const decades = new Map<number, number>(); for (const decade of years) decades.set(decade, (decades.get(decade) ?? 0) + 1);
    const decade = [...decades.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    const signals = { bpm: average(bpm), valence: average(valence), arousal: average(arousal) };
    return { key: item.node.key, name: item.node.name, tracks: item.tracks.length, albums: item.node.albums, letter: letterOf(item.node.name),
      genres: [...genres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([genre]) => genre),
      ...(decade !== undefined ? { decade } : {}), ...(first !== undefined ? { year_first: first, year_last: last } : {}),
      ...(signals.bpm !== undefined || signals.valence !== undefined || signals.arousal !== undefined ? { signals } : {}) };
  });
  // Featured credits become links when the guest is a lead artist anywhere in
  // the library. Guests nobody leads still join as small "guest" nodes once
  // they have been featured more than once, so the web stays navigable.
  const edgeTotals = new Map<string, number>(); const guestTotals = new Map<string, number>(); const guestEdges = new Map<string, Map<string, number>>();
  for (const item of data.artists) for (const track of item.tracks) {
    const raw = track.artist?.trim(); if (!raw) continue;
    const parsed = featured(raw); if (!parsed || parsed.base !== item.node.name) continue;
    // A featured string that names a lead artist exactly ("feat. Earth, Wind &
    // Fire") stays whole; otherwise it splits into individual guests.
    const whole = byName.get(parsed.whole);
    const unique = [...new Set(whole ? [whole.node.name] : parsed.guests)];
    for (const guest of unique) {
      const lead = byName.get(guest);
      if (lead) { const a = item.node.key < lead.node.key ? item.node.key : lead.node.key; const b = a === item.node.key ? lead.node.key : item.node.key; edgeTotals.set(`${a}|${b}`, (edgeTotals.get(`${a}|${b}`) ?? 0) + 1); continue; }
      guestTotals.set(guest, (guestTotals.get(guest) ?? 0) + 1);
      const partners = guestEdges.get(guest) ?? new Map<string, number>();
      partners.set(item.node.key, (partners.get(item.node.key) ?? 0) + 1); guestEdges.set(guest, partners);
    }
  }
  const edges: GalaxyMapEdge[] = [...edgeTotals.entries()].map(([pair, tracks]) => ({ a: pair.slice(0, pair.indexOf("|")), b: pair.slice(pair.indexOf("|") + 1), tracks }));
  for (const [guest, appearances] of guestTotals) {
    if (appearances < 2) continue;
    const key = keyOf(guest);
    artists.push({ key, name: guest, tracks: 0, albums: 0, genres: [], letter: letterOf(guest), guest: true, appearances });
    for (const [partner, tracks] of guestEdges.get(guest) ?? []) edges.push({ a: partner, b: key, tracks });
  }
  artists.sort((a, b) => b.tracks - a.tracks || a.name.localeCompare(b.name));
  edges.sort((a, b) => b.tracks - a.tracks || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  const map = { version: library.version, total_tracks: library.tracks.length, artists, edges };
  mapCached = { library, version: library.version, map }; return map;
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
