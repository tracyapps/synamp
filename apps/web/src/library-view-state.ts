import type { SortColumn } from "./library-table";

const views = ["list", "grid", "table"] as const;
const modes = ["contains", "exact", "glob", "fuzzy"] as const;
const kinds = ["song", "album", "artist"] as const;
const fields = ["any", "title", "artist", "album_artist", "album", "genre"] as const;
const groups = ["none", "album_artist", "artist", "album", "decade", "genre"] as const;
const sorts: Record<SortColumn, true> = { title: true, type: true, artist: true, album_artist: true, album: true, year: true, count: true, duration: true, genre: true };
const sortNames = Object.keys(sorts) as SortColumn[];
const MAX_HASH = 32 * 1024;

export type LibraryViewState = {
  version: 1;
  view: typeof views[number];
  q: string;
  mode: typeof modes[number];
  types: Array<typeof kinds[number]>;
  rules: Array<{ field: typeof fields[number]; mode: typeof modes[number]; value: string; not: boolean }>;
  logic: "and" | "or";
  from: string;
  to: string;
  sort: SortColumn;
  direction: "asc" | "desc";
  group: typeof groups[number];
  group_key: string;
};
export type SavedLibraryView = { id: string; name: string; created_at: number; state: LibraryViewState };

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(data: Record<string, unknown>, expected: readonly string[], label: string) {
  for (const key of expected) if (!Object.hasOwn(data, key)) throw new Error(`${label} is missing "${key}".`);
  for (const key of Object.keys(data)) if (!expected.includes(key)) throw new Error(`${label} has an unsupported field "${key}".`);
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || value.length > max) throw new Error(`${label} must be text with at most ${max} characters.`);
  return value;
}
function year(value: unknown, label: string): string {
  if (typeof value !== "string" || (value !== "" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 9999))) {
    throw new Error(`${label} must be empty or a year from 1 to 9999.`);
  }
  return value;
}

/** Only presentation defaults are forgiving; shared or saved filters are strict. */
export function defaultLibraryView(presentation: { view?: string; sort?: string; direction?: string } = {}): LibraryViewState {
  return { version: 1, view: views.includes(presentation.view as typeof views[number]) ? presentation.view as typeof views[number] : "list", q: "", mode: "contains", types: ["album"], rules: [], logic: "and", from: "", to: "",
    sort: Object.hasOwn(sorts, presentation.sort ?? "") ? presentation.sort as SortColumn : "artist", direction: presentation.direction === "desc" ? "desc" : "asc", group: "none", group_key: "" };
}

/** Reject malformed filters instead of silently turning them into a wider query. */
export function parseLibraryView(value: unknown): LibraryViewState {
  const data = object(value, "Library view");
  if (data.version !== 1) throw new Error("Unsupported library view version; expected version 1.");
  keys(data, ["version", "view", "q", "mode", "types", "rules", "logic", "from", "to", "sort", "direction", "group", "group_key"], "Library view");
  if (!Array.isArray(data.types)) throw new Error("Library view types must be an array.");
  const types = data.types.map(value => oneOf(value, kinds, "Library view type"));
  if (new Set(types).size !== types.length) throw new Error("Library view types must not contain duplicates.");
  if (!Array.isArray(data.rules) || data.rules.length > 12) throw new Error("Library view must contain an array of at most 12 rules.");
  const rules = data.rules.map((value, index) => {
    const label = `Library view rule ${index + 1}`, rule = object(value, label);
    keys(rule, ["field", "mode", "value", "not"], label);
    if (typeof rule.not !== "boolean") throw new Error(`${label} "not" must be true or false.`);
    return { field: oneOf(rule.field, fields, `${label} field`), mode: oneOf(rule.mode, modes, `${label} matching`), value: text(rule.value, 160, `${label} text`), not: rule.not };
  });
  const from = year(data.from, "Library view start year"), to = year(data.to, "Library view end year");
  if (from && to && Number(from) > Number(to)) throw new Error("Library view year range must run from earlier to later.");
  return { version: 1, view: oneOf(data.view, views, "Library view layout"), q: text(data.q, 160, "Library view search"), mode: oneOf(data.mode, modes, "Library view matching"), types, rules,
    logic: oneOf(data.logic, ["and", "or"], "Library view rule logic"), from, to, sort: oneOf(data.sort, sortNames, "Library view sort"), direction: oneOf(data.direction, ["asc", "desc"], "Library view sort direction"), group: oneOf(data.group, groups, "Library view grouping"), group_key: text(data.group_key, 1000, "Library view group") };
}

export function libraryHash(state: LibraryViewState): string {
  const hash = `#/library?library_view=${encodeURIComponent(JSON.stringify(parseLibraryView(state)))}`;
  if (hash.length > MAX_HASH) throw new Error("Library view link exceeds 32 KiB.");
  return hash;
}
export function stateFromHash(hash: string): LibraryViewState | null {
  if (hash.length > MAX_HASH) throw new Error("Library view link exceeds 32 KiB.");
  const question = hash.indexOf("?");
  if (question === -1) return null;
  const params = new URLSearchParams(hash.slice(question + 1));
  const values = params.getAll("library_view");
  if (!values.length) return null;
  if (values.length !== 1) throw new Error("Library view link contains duplicate library_view parameters.");
  let state: unknown;
  try { state = JSON.parse(values[0]!); } catch { throw new Error("Library view link contains invalid JSON."); }
  return parseLibraryView(state);
}

export function exploreParams(state: LibraryViewState): string {
  const value = parseLibraryView(state);
  return new URLSearchParams({ q: value.q, mode: value.mode, types: value.types.join(","), rules: JSON.stringify(value.rules), logic: value.logic, from: value.from, to: value.to, sort: value.sort, direction: value.direction, group: value.group, group_key: value.group_key }).toString();
}

function savedViews(value: unknown): SavedLibraryView[] {
  const envelope = object(value, "Saved library views");
  if (envelope.version !== 1) throw new Error("Unsupported saved library views version; expected version 1.");
  keys(envelope, ["version", "views"], "Saved library views");
  if (!Array.isArray(envelope.views) || envelope.views.length > 50) throw new Error("Saved library views must contain an array of at most 50 views.");
  const ids = new Set<string>();
  return envelope.views.map((value, index) => {
    const label = `Saved library view ${index + 1}`, data = object(value, label);
    keys(data, ["id", "name", "created_at", "state"], label);
    const id = text(data.id, 128, `${label} ID`);
    if (!id.trim() || id !== id.trim()) throw new Error(`${label} ID must be nonempty and trimmed.`);
    if (ids.has(id)) throw new Error(`Saved library views contain a duplicate ID "${id}".`);
    ids.add(id);
    if (typeof data.name !== "string") throw new Error(`${label} name must be text.`);
    const name = data.name.trim();
    if (!name || name.length > 80) throw new Error(`${label} name must contain 1 to 80 characters after trimming.`);
    if (typeof data.created_at !== "number" || !Number.isSafeInteger(data.created_at) || data.created_at < 0) throw new Error(`${label} creation time must be a nonnegative integer timestamp.`);
    return { id, name, created_at: data.created_at, state: parseLibraryView(data.state) };
  });
}
/** Pure parsing: callers decide how to report errors and preserve bad storage. */
export function parseSavedViews(raw: string | null): SavedLibraryView[] {
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Saved library views contain invalid JSON."); }
  return savedViews(value);
}
export function serializeSavedViews(views: SavedLibraryView[]): string {
  return JSON.stringify({ version: 1, views: savedViews({ version: 1, views }) });
}
