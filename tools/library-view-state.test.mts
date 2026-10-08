import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLibraryView, parseLibraryView, libraryHash, stateFromHash, exploreParams, parseSavedViews, serializeSavedViews } from "../apps/web/src/library-view-state.ts";
import type { LibraryViewState, SavedLibraryView } from "../apps/web/src/library-view-state.ts";

const filtered = (): LibraryViewState => ({ ...defaultLibraryView({ view: "table", sort: "genre", direction: "desc" }), q: "Björk 你好 🌙", mode: "exact", types: [],
  rules: [{ field: "artist", mode: "exact", value: "Earth, Wind & Fire", not: false }, { field: "title", mode: "glob", value: "AC/DC *?", not: true }], logic: "or", from: "0001", to: "2026", group: "genre", group_key: "R&B / Soul & Funk" });
const saved = (): SavedLibraryView => ({ id: "view-1", name: "Evening library", created_at: 1790000000000, state: filtered() });

test("defaults use valid presentation preferences and return independent mutable lists", () => {
  assert.equal(defaultLibraryView().sort, "artist");
  assert.deepEqual(defaultLibraryView({ view: "table", sort: "year", direction: "desc" }), { ...defaultLibraryView(), view: "table", sort: "year", direction: "desc" });
  assert.deepEqual(defaultLibraryView({ view: "bogus", sort: "actions", direction: "bad" }), defaultLibraryView());
  const state = defaultLibraryView(); state.types.length = 0;
  assert.deepEqual(defaultLibraryView().types, ["album"]);
});
test("strict state preserves Unicode, exact rule text, exclusions, leading-zero dates and empty types", () => {
  const original = filtered(), parsed = parseLibraryView(original);
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed.types, original.types);
  assert.notEqual(parsed.rules[0], original.rules[0]);
  assert.deepEqual(parseLibraryView({ ...original, rules: [] }).rules, []);
});
test("every version-1 field is required and unknown fields or versions never broaden filters", () => {
  for (const key of Object.keys(filtered())) {
    const incomplete: Record<string, unknown> = { ...filtered() }; delete incomplete[key];
    assert.throws(() => parseLibraryView(incomplete), /missing|version/);
  }
  for (const version of [0, 2, "1", null]) assert.throws(() => parseLibraryView({ ...filtered(), version }), /version/);
  assert.throws(() => parseLibraryView({ ...filtered(), future_filter: "keep me" }), /unsupported field/);
  for (const value of [null, [], "state", 1]) assert.throws(() => parseLibraryView(value), /object/);
});
test("malformed enum fields, type selections, rule exclusions and text fail explicitly", () => {
  for (const [field, value] of Object.entries({ view: "cards", mode: "regex", logic: "xor", sort: "actions", direction: "up", group: "folder", types: "song", q: 42, group_key: false })) {
    assert.throws(() => parseLibraryView({ ...filtered(), [field]: value }), Error, field);
  }
  assert.throws(() => parseLibraryView({ ...filtered(), types: ["song", "planet"] }), /type/);
  assert.throws(() => parseLibraryView({ ...filtered(), types: ["song", "song"] }), /duplicates/);
  for (const rule of [{ field: "bad", mode: "exact", value: "x", not: false }, { field: "artist", mode: "regex", value: "x", not: false }, { field: "artist", mode: "exact", value: "x" }, { field: "artist", mode: "exact", value: "x", not: "false" }]) {
    assert.throws(() => parseLibraryView({ ...filtered(), rules: [rule] }), /rule/);
  }
});
test("text and rule boundaries accept their limit and reject the next character or rule", () => {
  const rule = { field: "title" as const, mode: "exact" as const, value: "好".repeat(160), not: false };
  assert.equal(parseLibraryView({ ...filtered(), q: "a".repeat(160), group_key: "好".repeat(1000), rules: Array.from({ length: 12 }, () => rule) }).rules.length, 12);
  assert.throws(() => parseLibraryView({ ...filtered(), q: "a".repeat(161) }), /160/);
  assert.throws(() => parseLibraryView({ ...filtered(), group_key: "a".repeat(1001) }), /1000/);
  assert.throws(() => parseLibraryView({ ...filtered(), rules: [{ ...rule, value: "a".repeat(161) }] }), /160/);
  assert.throws(() => parseLibraryView({ ...filtered(), rules: Array.from({ length: 13 }, () => rule) }), /12/);
  assert.throws(() => parseLibraryView({ ...filtered(), rules: null }), /array/);
});
test("dates are optional bounded integer text and must form an ordered range", () => {
  assert.equal(parseLibraryView({ ...filtered(), from: "", to: "" }).from, "");
  for (const value of ["0", "10000", "-1", "1.5", "1e3", " 2000", 2000]) assert.throws(() => parseLibraryView({ ...filtered(), from: value }), /year/);
  assert.throws(() => parseLibraryView({ ...filtered(), from: "2026", to: "2025" }), /range/);
});
test("library links round-trip Unicode and punctuation without changing group selection", () => {
  const state = filtered(), hash = libraryHash(state);
  assert.match(hash, /^#\/library\?library_view=/);
  assert.deepEqual(stateFromHash(hash), state);
  assert.equal(stateFromHash("#/library"), null);
  assert.equal(stateFromHash("#/library?other=1"), null);
  assert.deepEqual(stateFromHash(`${hash}&other=harmless`), state);
});
test("duplicate, oversized and malformed shared-view parameters fail rather than reset", () => {
  const hash = libraryHash(filtered());
  assert.throws(() => stateFromHash(`${hash}&library_view=${encodeURIComponent(JSON.stringify(filtered()))}`), /duplicate/);
  assert.throws(() => stateFromHash(`${hash}&library%5Fview=x`), /duplicate/);
  assert.throws(() => stateFromHash("#/library?library_view="), /JSON/);
  assert.throws(() => stateFromHash("#/library?library_view=%7Bbroken"), /JSON/);
  assert.throws(() => stateFromHash("#".repeat(32769)), /32 KiB/);
  assert.throws(() => libraryHash({ ...filtered(), from: `${"0".repeat(32768)}1`, to: "9999" }), /32 KiB/);
});
test("explore parameters preserve all filters and contain only the backend query contract", () => {
  const state = filtered(), params = new URLSearchParams(exploreParams(state));
  assert.deepEqual([...params.keys()], ["q", "mode", "types", "rules", "logic", "from", "to", "sort", "direction", "group", "group_key"]);
  assert.equal(params.get("types"), "");
  assert.equal(params.get("q"), state.q);
  assert.deepEqual(JSON.parse(params.get("rules")!), state.rules);
  assert.equal(params.get("group_key"), state.group_key);
  assert.equal(params.get("from"), "0001");
});
test("saved views use a versioned lossless envelope and trim their display names", () => {
  const entry = saved(), raw = serializeSavedViews([entry]);
  assert.deepEqual(JSON.parse(raw), { version: 1, views: [entry] });
  assert.deepEqual(parseSavedViews(raw), [entry]);
  assert.deepEqual(parseSavedViews(null), []);
  assert.equal(parseSavedViews(serializeSavedViews([{ ...entry, name: "  Evening library  " }]))[0]!.name, "Evening library");
  assert.equal(parseSavedViews(serializeSavedViews([{ ...entry, name: "a".repeat(80) }]))[0]!.name.length, 80);
});
test("bad saved storage rejects the whole import, including later entries and unsupported versions", () => {
  assert.throws(() => parseSavedViews("not JSON"), /JSON/);
  assert.throws(() => parseSavedViews(""), /JSON/);
  assert.throws(() => parseSavedViews(JSON.stringify({ version: 2, views: [] })), /version/);
  assert.throws(() => parseSavedViews(JSON.stringify([saved()])), /object/);
  assert.throws(() => parseSavedViews(JSON.stringify({ version: 1, views: [saved(), { ...saved(), id: "second", state: { ...filtered(), mode: "regex" } }] })), /matching/);
});
test("saved-view names, IDs, timestamps and collection bounds are validated on parse and serialize", () => {
  for (const name of ["", "   ", "a".repeat(81), null]) assert.throws(() => parseSavedViews(JSON.stringify({ version: 1, views: [{ ...saved(), name }] })), /name/);
  for (const id of ["", "  ", " padded", "a".repeat(129), null]) assert.throws(() => parseSavedViews(JSON.stringify({ version: 1, views: [{ ...saved(), id }] })), /ID/);
  for (const created_at of [-1, 1.5, "123", null]) assert.throws(() => parseSavedViews(JSON.stringify({ version: 1, views: [{ ...saved(), created_at }] })), /timestamp/);
  assert.throws(() => serializeSavedViews([{ ...saved(), created_at: Infinity }]), /timestamp/);
  assert.throws(() => serializeSavedViews([saved(), saved()]), /duplicate ID/);
  const fifty = Array.from({ length: 50 }, (_, i) => ({ ...saved(), id: `view-${i}` }));
  assert.equal(parseSavedViews(serializeSavedViews(fifty)).length, 50);
  assert.throws(() => serializeSavedViews([...fifty, { ...saved(), id: "view-51" }]), /50/);
});
