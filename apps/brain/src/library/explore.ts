/** Read-only entity explorer. Folder album identity and verbatim artist credits
 * stay intact; filtering/grouping never rewrites tags or listening IDs. */
import type { Library } from "../query/evaluate.ts";
import { groupAlbums } from "./albums.ts";
import { BrowseError } from "./browse.ts";

type Kind = "song" | "album" | "artist";
type Field = "any" | "title" | "artist" | "album_artist" | "album" | "genre";
type Mode = "contains" | "exact" | "glob" | "fuzzy";
type Rule = { field: Field; value: string; mode: Mode; not?: boolean };
export type ExplorerRow = {
  key: string; type: Kind; title: string; artist?: string; album_artist?: string;
  album?: string; year?: number; count: number; duration_s?: number; genres: string[];
  /** Songs: the album folder they're in (for the album page). */
  album_key?: string;
};
type Entity = { row: ExplorerRow; values: Record<Field, string[]>; years: number[]; albums: string[]; albumArtists: string[];
  /** Sort text per column, worked out once (folding text is the slow part of sorting 100k rows). */
  keys?: Partial<Record<string, string>> };
export type ExploreOptions = Partial<Record<"q" | "types" | "mode" | "logic" | "rules" | "from" | "to" | "sort" | "direction" | "group" | "group_key" | "offset" | "limit", string>>;
const fields: Field[] = ["any", "title", "artist", "album_artist", "album", "genre"];
const modes: Mode[] = ["contains", "exact", "glob", "fuzzy"];
const unique = (values: Array<string | undefined>) => [...new Set(values.filter((v): v is string => !!v))];
const norm = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const fold = (value: string) => norm(value).replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function knownDuration(tracks: Library["tracks"]): number | undefined {
  const values = tracks.flatMap(track => track.duration_s === undefined ? [] : [track.duration_s]);
  return values.length ? values.reduce((sum, duration) => sum + duration, 0) : undefined;
}
let cache: { library: Library; entities: Entity[] } | undefined;
/** Folded/normalised field text, worked out once per distinct string (names repeat a lot). Cleared with the entities. */
const folded = new Map<string, string>(), normed = new Map<string, string>();
const foldOnce = (value: string) => { let out = folded.get(value); if (out === undefined) { out = fold(value); folded.set(value, out); } return out; };
const normOnce = (value: string) => { let out = normed.get(value); if (out === undefined) { out = norm(value); normed.set(value, out); } return out; };
/**
 * The last few filtered-and-sorted results, so scrolling a long list asks only
 * for a slice: the first page of a view does the work, the rest are instant.
 */
const selections = new Map<string, ReturnType<typeof select>>();
let selectionsFor: Library | undefined;
const SELECTIONS_KEPT = 8;
const collator = new Intl.Collator();

function entities(library: Library): Entity[] {
  if (cache?.library === library) return cache.entities;
  folded.clear(); normed.clear();
  const result: Entity[] = [];
  const units = groupAlbums(library);
  const byTrack = new Map(units.flatMap(unit => unit.tracks.map(track => [track.id, unit] as const)));
  const creditArtists = new Map<string, typeof library.tracks>();
  function add(row: ExplorerRow, values: Omit<Entity["values"], "any">, years: number[], albums: string[], albumArtists: string[]) {
    result.push({ row, values: { ...values, any: unique([...Object.values(values).flat(), ...years.map(String)]) }, years, albums, albumArtists });
  }
  for (const track of library.tracks) {
    const unit = byTrack.get(track.id);
    const albumArtist = track.album_artist || unit?.artist;
    const album = track.album || unit?.title;
    add({ key: track.id, type: "song", title: track.title, artist: track.artist, album_artist: albumArtist, album, year: track.year,
      count: 1, duration_s: track.duration_s, genres: track.genre ?? [], ...(unit ? { album_key: unit.key } : {}) },
      { title: [track.title], artist: unique([track.artist]), album_artist: unique([albumArtist]), album: unique([album]), genre: track.genre ?? [] },
      track.year ? [track.year] : [], unique([album]), unique([albumArtist]));
    // A display credit is not a resolved multi-artist identity. In particular,
    // AC/DC and Earth, Wind & Fire must not be split by punctuation.
    if (track.artist) {
      const key = norm(track.artist);
      const list = creditArtists.get(key) ?? [];
      list.push(track); creditArtists.set(key, list);
    }
  }
  for (const unit of units) {
    const genres = unique(unit.tracks.flatMap(track => track.genre ?? []));
    add({ key: unit.key, type: "album", title: unit.title, artist: unit.artist, album_artist: unit.artist, album: unit.title,
      year: unit.year, count: unit.tracks.length, duration_s: knownDuration(unit.tracks), genres },
      { title: [unit.title], artist: unique([unit.artist, ...unit.tracks.map(track => track.artist)]), album_artist: [unit.artist], album: [unit.title], genre: genres },
      unit.year ? [unit.year] : [], [unit.title], [unit.artist]);
  }
  for (const [key, tracks] of creditArtists) {
    const title = tracks[0]!.artist!;
    const albums = unique(tracks.map(track => track.album || byTrack.get(track.id)?.title));
    const albumArtists = unique(tracks.map(track => track.album_artist || byTrack.get(track.id)?.artist));
    const genres = unique(tracks.flatMap(track => track.genre ?? []));
    const years = [...new Set(tracks.flatMap(track => track.year ? [track.year] : []))];
    add({ key, type: "artist", title, artist: title, count: tracks.length, genres,
      duration_s: knownDuration(tracks) },
      { title: [title], artist: [title], album_artist: albumArtists, album: albums, genre: genres }, years, albums, albumArtists);
  }
  cache = { library, entities: result };
  return result;
}

/** Edit distance with a small explicit tolerance; short words must be exact. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  const allowed = a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0;
  if (!allowed || Math.abs(a.length - b.length) > allowed) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = next;
  }
  return prev[b.length]! <= allowed;
}

/** Whole-field glob without regex backtracking, even for repeated stars. */
function wildcard(pattern: string, value: string): boolean {
  const p = Array.from(pattern), v = Array.from(value);
  let pi = 0, vi = 0, star = -1, retry = 0;
  while (vi < v.length) {
    if (pi < p.length && (p[pi] === "?" || p[pi] === v[vi])) { pi++; vi++; }
    else if (p[pi] === "*") { star = pi++; retry = vi; }
    else if (star >= 0) { pi = star + 1; vi = ++retry; }
    else return false;
  }
  while (p[pi] === "*") pi++;
  return pi === p.length;
}

function matcher(rule: Rule): (entity: Entity) => boolean {
  const pattern = norm(rule.value);
  // Only * and ? are operators. No raw regex or executable query language.
  const words = fold(rule.value).split(" ").filter(Boolean);
  return entity => {
    const values = entity.values[rule.field];
    const matched = rule.mode === "exact" ? values.some(value => normOnce(value) === pattern)
      : rule.mode === "glob" ? values.some(value => wildcard(pattern, normOnce(value)))
      : rule.mode === "fuzzy" ? words.every(word => values.some(value => foldOnce(value).split(" ").some(token => near(word, token))))
      : words.every(word => values.some(value => foldOnce(value).includes(word)));
    return rule.not ? !matched : matched;
  };
}

function number(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new BrowseError(`Invalid ${name}`);
  return Number(value);
}

/** Shared filter/group/sort pipeline; playlist selection projects it onto songs. Remembered per library and filter. */
function selection(library: Library, options: ExploreOptions, songsOnly = false) {
  if (selectionsFor !== library) { selections.clear(); selectionsFor = library; }
  const { offset: _offset, limit: _limit, ...rest } = options;
  const key = JSON.stringify([songsOnly, Object.entries(rest).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))]);
  const known = selections.get(key);
  if (known) { selections.delete(key); selections.set(key, known); return known; }
  const result = select(library, options, songsOnly);
  selections.set(key, result);
  for (const old of selections.keys()) { if (selections.size <= SELECTIONS_KEPT) break; selections.delete(old); }
  return result;
}

function select(library: Library, options: ExploreOptions, songsOnly: boolean) {
  const kinds = options.types === undefined ? ["album"] : options.types.split(",").filter(Boolean);
  if (kinds.some(kind => !["song", "album", "artist"].includes(kind))) throw new BrowseError("Invalid entity type");
  if (songsOnly && !kinds.length) throw new BrowseError("Choose at least one entity type");
  const searchedKinds = songsOnly ? ["song"] : kinds;
  const mode = options.mode ?? "contains";
  if (!modes.includes(mode as Mode)) throw new BrowseError("Invalid match mode");
  const logic = options.logic ?? "and";
  if (logic !== "and" && logic !== "or") throw new BrowseError("Invalid filter logic");
  const rules: Rule[] = [];
  if (options.q?.trim()) rules.push({ field: "any", value: options.q.trim(), mode: mode as Mode });
  if (options.rules) {
    let input: unknown;
    try { input = JSON.parse(options.rules); } catch { throw new BrowseError("Invalid filter rules"); }
    if (!Array.isArray(input) || input.length > 12) throw new BrowseError("Use at most 12 filter rules");
    for (const raw of input) {
      if (!raw || typeof raw !== "object" || !fields.includes(raw.field)) throw new BrowseError("Invalid rule field");
      if (typeof raw.value !== "string" || raw.value.length > 160) throw new BrowseError("Invalid rule text (maximum 160 characters)");
      if (!modes.includes(raw.mode ?? "contains")) throw new BrowseError("Invalid rule match mode");
      if (raw.not !== undefined && typeof raw.not !== "boolean") throw new BrowseError("Invalid rule not flag");
      if (raw.value.trim()) rules.push({ field: raw.field, value: raw.value.trim(), mode: raw.mode ?? "contains", not: raw.not });
    }
  }
  if ((options.q?.length ?? 0) > 160) throw new BrowseError("Search text is limited to 160 characters");
  const from = number(options.from, "year", 0, 1, 9999);
  const to = number(options.to, "year", 9999, 1, 9999);
  if (from > to) throw new BrowseError("Year range must run from earlier to later");
  const dated = !!options.from || !!options.to;
  const tests = rules.map(matcher);
  const matched = entities(library).filter(entity => searchedKinds.includes(entity.row.type)
    && (!dated || entity.years.some(year => year >= from && year <= to))
    && (!tests.length || (logic === "or" ? tests.some(test => test(entity)) : tests.every(test => test(entity)))));
  const group = options.group ?? "none";
  if (!["none", "album_artist", "artist", "album", "decade", "genre"].includes(group)) throw new BrowseError("Invalid grouping");
  const labels = (entity: Entity): string[] => {
    if (group === "none") return [];
    const values = group === "album_artist" ? entity.albumArtists : group === "artist" ? unique([entity.row.artist])
      : group === "album" ? entity.albums : group === "genre" ? entity.row.genres : unique(entity.years.map(year => `${Math.floor(year / 10) * 10}s`));
    return values.length ? values : ["Unknown"];
  };
  const groups = new Map<string, number>();
  for (const entity of matched) for (const label of labels(entity)) groups.set(label, (groups.get(label) ?? 0) + 1);
  const selected = options.group_key && group !== "none" ? matched.filter(entity => labels(entity).includes(options.group_key!)) : matched;
  const sort = options.sort ?? "artist";
  if (!["title", "type", "artist", "album_artist", "album", "year", "count", "duration", "genre"].includes(sort)) throw new BrowseError("Invalid sort");
  const direction = options.direction ?? (sort === "year" || sort === "count" ? "desc" : "asc");
  if (direction !== "asc" && direction !== "desc") throw new BrowseError("Invalid sort direction");
  const sign = direction === "desc" ? -1 : 1;
  const text = (value: string) => foldOnce(value).replace(/^(the|a|an) /, "");
  const value = (row: ExplorerRow): string | number | undefined => sort === "duration" ? row.duration_s
      : sort === "genre" ? row.genres.join(", ") || undefined : row[sort as "title" | "type" | "artist" | "album_artist" | "album" | "year" | "count"];
  /** Folded sort text for this entity and column, kept on the entity for next time. */
  const keyOf = (entity: Entity, column: string, raw: unknown) => {
    const keys = (entity.keys ??= {});
    return keys[column] ??= text(String(raw ?? ""));
  };
  selected.sort((a, b) => {
    const x = a.row, y = b.row;
    const xv = value(x), yv = value(y);
    const missingX = xv === undefined || xv === "", missingY = yv === undefined || yv === "";
    // Unknown values remain at the end when reversing the sort.
    if (missingX !== missingY) return missingX ? 1 : -1;
    const cmp = typeof xv === "number" && typeof yv === "number" ? xv - yv : collator.compare(keyOf(a, sort, xv), keyOf(b, sort, yv));
    return sign * cmp || collator.compare(keyOf(a, "title", x.title), keyOf(b, "title", y.title)) || x.type.localeCompare(y.type) || x.key.localeCompare(y.key);
  });
  return { selected, matched, groups, group };
}

/** Every matching song in globally sorted order, independent of display paging. */
export function selectExplorerSongs(library: Library, options: ExploreOptions = {}): ExplorerRow[] {
  return selection(library, options, true).selected.map(entity => entity.row);
}

export function explore(library: Library, options: ExploreOptions = {}) {
  const { selected, matched, groups, group } = selection(library, options);
  const offset = number(options.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = number(options.limit, "limit", 60, 1, 200);
  return { library_version: library.version, total: selected.length, matched_total: matched.length, offset,
    rows: selected.slice(offset, offset + limit).map(entity => entity.row),
    groups: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
    group_memberships_overlap: group === "genre" || group === "album" || group === "album_artist" || group === "decade" };
}
