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
export type ExploreOptions = Partial<Record<"q" | "types" | "mode" | "logic" | "rules" | "from" | "to" | "sort" | "direction" | "group" | "group_key" | "offset" | "limit" | "favourites"
  | "group2" | "sections" | "open" | "expand" | "chunk", string>>;
/** Options that only change how a result is laid out, not what's in it: they don't make a new remembered selection. */
const LAYOUT_ONLY = new Set(["offset", "limit", "sections", "open", "expand", "chunk", "favourites_seen"]);
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
function selection(library: Library, options: ExploreOptions, songsOnly = false, favourites?: ReadonlySet<string>) {
  if (selectionsFor !== library) { selections.clear(); selectionsFor = library; }
  const key = JSON.stringify([songsOnly, Object.entries(options).filter(([name, v]) => v !== undefined && !LAYOUT_ONLY.has(name)).sort(([a], [b]) => a.localeCompare(b))]);
  const known = selections.get(key);
  if (known) { selections.delete(key); selections.set(key, known); return known; }
  const result = select(library, options, songsOnly, favourites);
  selections.set(key, result);
  for (const old of selections.keys()) { if (selections.size <= SELECTIONS_KEPT) break; selections.delete(old); }
  return result;
}

function select(library: Library, options: ExploreOptions, songsOnly: boolean, favourites?: ReadonlySet<string>) {
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
  // "Favourites only" (the brain passes the hearted keys, and a revision in options.favourites so remembered results refresh).
  const onlyFavourites = !!options.favourites && options.favourites !== "0";
  const hearted = (entity: Entity) => !!favourites?.has(`${entity.row.type}:${entity.row.key}`);
  const matched = entities(library).filter(entity => searchedKinds.includes(entity.row.type)
    && (!onlyFavourites || hearted(entity))
    && (!dated || entity.years.some(year => year >= from && year <= to))
    && (!tests.length || (logic === "or" ? tests.some(test => test(entity)) : tests.every(test => test(entity)))));
  const group = options.group ?? "none";
  if (!GROUPS.includes(group)) throw new BrowseError("Invalid grouping");
  const labels = labelsFor(group);
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

const GROUPS = ["none", "album_artist", "artist", "album", "decade", "genre"];
/** The group labels an entity belongs to for one grouping ("Unknown" when it has none). */
function labelsFor(group: string): (entity: Entity) => string[] {
  return (entity: Entity) => {
    if (group === "none") return [];
    const values = group === "album_artist" ? entity.albumArtists : group === "artist" ? unique([entity.row.artist])
      : group === "album" ? entity.albums : group === "genre" ? entity.row.genres : unique(entity.years.map(year => `${Math.floor(year / 10) * 10}s`));
    return values.length ? values : ["Unknown"];
  };
}

/** Every matching song in globally sorted order, independent of display paging. */
export function selectExplorerSongs(library: Library, options: ExploreOptions = {}, favourites?: ReadonlySet<string>): ExplorerRow[] {
  return selection(library, options, true, favourites).selected.map(entity => entity.row);
}

export function explore(library: Library, options: ExploreOptions = {}, favourites?: ReadonlySet<string>) {
  const { selected, matched, groups, group } = selection(library, options, false, favourites);
  const offset = number(options.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = number(options.limit, "limit", 60, 1, 200);
  return { library_version: library.version, total: selected.length, matched_total: matched.length, offset,
    rows: selected.slice(offset, offset + limit).map(entity => entity.row),
    groups: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
    group_memberships_overlap: group === "genre" || group === "album" || group === "album_artist" || group === "decade" };
}

// --- Sections: the list grouped into collapsible groups (two levels at most) -------------------------

/** A group's place: its label, or "label\u0000sub-label" for a group inside a group. */
export const SEP = "\u0000";
type Node = { label: string; entities: Entity[]; sub?: Map<string, Node> };
export type SectionGroup = { type: "group"; key: string; level: 0 | 1; label: string; count: number; open: boolean };
export type SectionItem = ExplorerRow & { path: string };
export type SectionChunk = { type: "chunk"; key: string; path: string; items: ExplorerRow[] };
export type SectionElement = SectionGroup | SectionItem | SectionChunk;

const labelOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byLabel = (a: string, b: string) => (a === "Unknown" ? 1 : 0) - (b === "Unknown" ? 1 : 0) || labelOrder.compare(a, b);
const trees = new WeakMap<object, Map<string, Map<string, Node>>>();

/** Groups (and sub-groups) of a selection, built once per selection and grouping. */
function treeOf(result: ReturnType<typeof select>, group: string, group2: string): Map<string, Node> {
  let byGrouping = trees.get(result);
  if (!byGrouping) { byGrouping = new Map(); trees.set(result, byGrouping); }
  const known = byGrouping.get(`${group}|${group2}`);
  if (known) return known;
  const first = labelsFor(group), second = labelsFor(group2);
  const tree = new Map<string, Node>();
  for (const entity of result.selected) { // already sorted, so every group keeps the list's order
    for (const label of first(entity)) {
      let node = tree.get(label);
      if (!node) { node = { label, entities: [], ...(group2 !== "none" ? { sub: new Map() } : {}) }; tree.set(label, node); }
      node.entities.push(entity);
      if (node.sub) for (const label2 of second(entity)) {
        let child = node.sub.get(label2);
        if (!child) { child = { label: label2, entities: [] }; node.sub.set(label2, child); }
        child.entities.push(entity);
      }
    }
  }
  const sorted = new Map([...tree.entries()].sort(([a], [b]) => byLabel(a, b)));
  for (const node of sorted.values()) if (node.sub) node.sub = new Map([...node.sub.entries()].sort(([a], [b]) => byLabel(a, b)));
  byGrouping.set(`${group}|${group2}`, sorted);
  return sorted;
}

function groupingOf(options: ExploreOptions) {
  const group = options.group ?? "none";
  const group2 = group === "none" ? "none" : options.group2 ?? "none";
  if (!GROUPS.includes(group2)) throw new BrowseError("Invalid second grouping");
  if (group2 !== "none" && group2 === group) throw new BrowseError("Group by two different things");
  return { group, group2 };
}

function openState(options: ExploreOptions) {
  let toggled: string[] = [];
  if (options.open) {
    try { toggled = JSON.parse(options.open); } catch { throw new BrowseError("Invalid open groups"); }
    if (!Array.isArray(toggled) || toggled.length > 5000 || toggled.some(path => typeof path !== "string" || path.length > 2000)) throw new BrowseError("Invalid open groups");
  }
  const set = new Set(toggled);
  const base = options.expand === "all";
  return (path: string) => base !== set.has(path); // "all": the list is the ones closed; otherwise it's the ones open
}

/**
 * The list as collapsible sections: a header for each group (and sub-group),
 * then the items of the open ones. Groups start closed; `open` lists the ones
 * opened (or, with expand=all, the ones closed). With chunk=N, the items come
 * N to an element: a row of cards in the grid view.
 */
export function exploreSections(library: Library, options: ExploreOptions = {}, favourites?: ReadonlySet<string>) {
  const result = selection(library, options, false, favourites);
  const { group, group2 } = groupingOf(options);
  const isOpen = openState(options);
  const chunk = number(options.chunk, "chunk", 1, 1, 12);
  const elements: SectionElement[] = [];
  const pushItems = (path: string, items: Entity[]) => {
    if (chunk === 1) { for (const entity of items) elements.push({ ...entity.row, path }); return; }
    for (let i = 0; i < items.length; i += chunk) elements.push({ type: "chunk", key: `${path}#${i}`, path, items: items.slice(i, i + chunk).map(entity => entity.row) });
  };
  if (group === "none") pushItems("", result.selected);
  else for (const node of treeOf(result, group, group2).values()) {
    const open = isOpen(node.label);
    elements.push({ type: "group", key: node.label, level: 0, label: node.label, count: node.entities.length, open });
    if (!open) continue;
    if (!node.sub) { pushItems(node.label, node.entities); continue; }
    for (const child of node.sub.values()) {
      const path = `${node.label}${SEP}${child.label}`;
      const childOpen = isOpen(path);
      elements.push({ type: "group", key: path, level: 1, label: child.label, count: child.entities.length, open: childOpen });
      if (childOpen) pushItems(path, child.entities);
    }
  }
  const offset = number(options.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = number(options.limit, "limit", 60, 1, 200);
  return { library_version: library.version, total: elements.length, items_total: result.selected.length, matched_total: result.matched.length, offset,
    rows: elements.slice(offset, offset + limit),
    groups: [...result.groups].sort(([a], [b]) => byLabel(a, b)).map(([label, count]) => ({ label, count })),
    group_memberships_overlap: group === "genre" || group === "album" || group === "album_artist" || group === "decade" };
}

export type PickSpec = { all?: unknown; groups?: unknown; items?: unknown; excluded?: unknown };
/**
 * What a selection in the list means: whole groups (minus anything unticked
 * inside them) plus single rows. Rows come back in the list's order, once each.
 */
export function pickRows(library: Library, options: ExploreOptions, spec: PickSpec, favourites?: ReadonlySet<string>): ExplorerRow[] {
  const list = (value: unknown, label: string) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20_000) throw new BrowseError(`Invalid ${label}`);
    return value;
  };
  const groups = list(spec.groups, "groups").map(String);
  const items = new Set(list(spec.items, "items").map(String));
  // "path\u0001type:key" for a row unticked inside a ticked group; "path\u0001*" for a whole sub-group unticked.
  const excluded = new Set(list(spec.excluded, "excluded").map(String));
  const result = selection(library, options, false, favourites);
  const { group, group2 } = groupingOf(options);
  const out = new Map<string, ExplorerRow>();
  const id = (row: ExplorerRow) => `${row.type}:${row.key}`;
  const left = (scope: string, key: string) => !excluded.has(`${scope}\u0001*`) && !excluded.has(`${scope}\u0001${key}`);
  if (spec.all === true) {
    // Everything in the list (minus what's unticked).
    if (group === "none") { for (const entity of result.selected) if (left("", id(entity.row))) out.set(id(entity.row), entity.row); }
    else for (const node of treeOf(result, group, group2).values()) {
      if (excluded.has(`${node.label}\u0001*`)) continue;
      const scopes = node.sub ? [...node.sub.values()].map(child => [`${node.label}${SEP}${child.label}`, child.entities] as const) : [[node.label, node.entities] as const];
      for (const [scope, entities] of scopes) for (const entity of entities) if (left(scope, id(entity.row)) && left(node.label, id(entity.row))) out.set(id(entity.row), entity.row);
    }
  }
  if (groups.length && group !== "none") {
    const tree = treeOf(result, group, group2);
    for (const path of groups) {
      const [label, label2] = path.split(SEP);
      const node = tree.get(label!);
      if (!node) continue;
      const scopes = label2 !== undefined ? [[path, node.sub?.get(label2)?.entities ?? []] as const]
        : node.sub ? [...node.sub.values()].map(child => [`${label}${SEP}${child.label}`, child.entities] as const) : [[path, node.entities] as const];
      for (const [scope, entities] of scopes) for (const entity of entities) {
        const key = id(entity.row);
        if (left(scope, key) && left(path, key)) out.set(key, entity.row);
      }
    }
  }
  if (items.size) for (const entity of result.selected) if (items.has(id(entity.row))) out.set(id(entity.row), entity.row);
  // In the list's order.
  const order = new Map(result.selected.map((entity, index) => [id(entity.row), index]));
  return [...out.values()].sort((a, b) => (order.get(id(a)) ?? 0) - (order.get(id(b)) ?? 0));
}
