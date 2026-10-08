import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { PlaylistStore } from "../playlists.ts";
import { explore, selectExplorerSongs } from "./explore.ts";
import { ExplorerSelections } from "./explorer-selection.ts";

const track = (i: number, extra: Partial<LibraryTrack> = {}): LibraryTrack => ({ id: `id-${i}`, title: `Song ${String(i).padStart(6, "0")}`, artist: "Artist", album: "Collection", path: `Artist/Collection/${i}.mp3`, year: 2000, ...extra });
const library = (tracks: LibraryTrack[], version = "fixture"): Library => ({ version, tracks });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "synamp-explorer-selection-")); const path = join(dir, "playlists.json");
  return { path, store: new PlaylistStore(path), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("full selection overrides displayed album/artist types, ignores paging, sorts globally, and deduplicates IDs", () => {
  const lib = library([...Array.from({ length: 510 }, (_, i) => track(i)), track(4)]);
  const page = explore(lib, { types: "song", offset: "200", limit: "10", sort: "title", direction: "desc" });
  assert.equal(page.rows.length, 10);
  const selections = new ExplorerSelections();
  const preview = selections.preview(lib, { types: "album,artist", offset: "200", limit: "10", sort: "title", direction: "desc" });
  assert.equal(preview.track_count, 510); assert.equal(preview.sample.length, 8);
  assert.deepEqual(preview.sample.map(row => row.id), [509, 508, 507, 506, 505, 504, 503, 502].map(i => `id-${i}`));
  assert.equal(preview.max_tracks, 100_000);
  const f = fixture();
  try {
    const saved = selections.create(lib, f.store, preview.selection_id, "All matches");
    assert.equal(saved.track_count, 510); assert.equal(saved.playlist.type, "playlist");
    assert.deepEqual(f.store.resolve(saved.playlist.id).map(row => row.id), Array.from({ length: 510 }, (_, i) => `id-${509 - i}`));
    assert.equal(saved.playlist.parentId, null);
  } finally { f.cleanup(); }
});

test("selection applies year AND/OR/not rules and active pivot key at song level, without expanding matching albums", () => {
  const lib = library([
    track(1, { title: "Chosen", artist: "A", year: 1995, genre: ["Rock"] }),
    track(2, { title: "Other", artist: "A", year: 2005, genre: ["Pop"] }),
    track(3, { title: "Chosen", artist: "B", year: 1997, genre: ["Rock", "Pop"] }),
    track(4, { title: "Other", artist: "B", year: 1997, genre: ["Rock"] }),
  ]);
  const options = { types: "album", q: "Chosen", mode: "exact", from: "1990", to: "2000", group: "artist", group_key: "A" };
  assert.deepEqual(selectExplorerSongs(lib, options).map(row => row.key), ["id-1"]);
  const rules = JSON.stringify([{ field: "artist", mode: "exact", value: "A" }, { field: "title", mode: "exact", value: "Chosen" }]);
  assert.deepEqual(selectExplorerSongs(lib, { rules, logic: "or", from: "1990", to: "2000", sort: "title" }).map(row => row.key), ["id-1", "id-3"]);
  assert.deepEqual(selectExplorerSongs(lib, { rules, logic: "and" }).map(row => row.key), ["id-1"]);
  assert.deepEqual(selectExplorerSongs(lib, { rules: JSON.stringify([{ field: "genre", mode: "exact", value: "Pop", not: true }]), group: "genre", group_key: "Rock", sort: "title" }).map(row => row.key), ["id-1", "id-4"]);
  assert.deepEqual(selectExplorerSongs(lib, { q: "Song *", mode: "glob" }), []);
  assert.throws(() => selectExplorerSongs(lib, { types: "" }), /at least one/);
  assert.throws(() => selectExplorerSongs(lib, { types: "video" }), /entity type/);
  assert.throws(() => selectExplorerSongs(lib, { rules: "[false]" }), /rule field/);
});

test("preview TTL, bounded receipts, empty results, invalid names, and idempotent retries", () => {
  let now = 1000; const selections = new ExplorerSelections({ now: () => now }); const lib = library([track(1)]);
  const f = fixture();
  try {
    const preview = selections.preview(lib); assert.equal(preview.created_at, 1000); assert.equal(preview.expires_at, 601000);
    assert.throws(() => selections.create(lib, f.store, preview.selection_id, " "), /Name must/);
    assert.equal(f.store.list().length, 0);
    const saved = selections.create(lib, f.store, preview.selection_id, "Saved"); const bytes = readFileSync(f.path, "utf8");
    const retry = selections.create(library([], "later"), f.store, preview.selection_id, "Saved");
    assert.equal(retry.duplicate, true); assert.equal(retry.playlist.id, saved.playlist.id); assert.equal(readFileSync(f.path, "utf8"), bytes);
    assert.throws(() => selections.create(lib, f.store, preview.selection_id, "Different"), { status: 409 });
    const empty = selections.preview(lib, { q: "not present" }); assert.equal(empty.track_count, 0);
    assert.throws(() => selections.create(lib, f.store, empty.selection_id, "Empty"), /No songs match/);
    const first = selections.preview(lib);
    for (let i = 0; i < 32; i++) selections.preview(lib);
    assert.throws(() => selections.create(lib, f.store, first.selection_id, "Evicted"), { status: 410 });
    const recent = selections.preview(lib); now = recent.expires_at;
    assert.throws(() => selections.create(lib, f.store, recent.selection_id, "Expired"), { status: 410 });
    assert.throws(() => selections.create(lib, f.store, "missing", "Unknown"), { status: 410 });
  } finally { f.cleanup(); }
});

test("signal-only library changes are allowed, but replaced or missing IDs reject the complete save", () => {
  const lib = library([track(1), track(2)]); const selections = new ExplorerSelections(); const f = fixture();
  try {
    const missing = selections.preview(lib);
    assert.throws(() => selections.create(library([track(1), track(20, { aliases: ["id-2"] })], "changed"), f.store, missing.selection_id, "No drops"), { status: 409 });
    assert.equal(f.store.list().length, 0);
    const measured = library([track(1, { signals: { bpm: 124 } }), track(2, { signals: { bpm: 95 } })], "new-analysis");
    const saved = selections.create(measured, f.store, missing.selection_id, "No drops");
    assert.deepEqual(f.store.resolve(saved.playlist.id).map(row => row.id), ["id-1", "id-2"]);
  } finally { f.cleanup(); }
});

test("snapshot creation uses one save, preserves preview state on real storage failure, and permits retry", () => {
  const f = fixture(); const selections = new ExplorerSelections(); const lib = library([track(1), track(2)]);
  try {
    f.store.create({ type: "folder", name: "Existing" }); const before = readFileSync(f.path, "utf8");
    const preview = selections.preview(lib);
    renameSync(f.path, `${f.path}.backup`); mkdirSync(f.path);
    assert.throws(() => selections.create(lib, f.store, preview.selection_id, "Atomic"));
    assert.equal(f.store.list().length, 1); assert.equal(readFileSync(`${f.path}.backup`, "utf8"), before);
    rmSync(f.path, { recursive: true }); renameSync(`${f.path}.backup`, f.path);
    const observable = f.store as unknown as { save: () => void }; const original = observable.save.bind(f.store); let saves = 0;
    observable.save = () => { saves++; original(); };
    const saved = selections.create(lib, f.store, preview.selection_id, "Atomic");
    assert.equal(saves, 1); assert.equal(saved.duplicate, false);
    assert.equal(new PlaylistStore(f.path).resolve(saved.playlist.id).length, 2);
    assert.throws(() => f.store.createSnapshot("Bad", [{ id: "valid", title: "Valid" }, { id: "", title: "Bad" }]), /Invalid snapshot/);
    assert.equal(saves, 1); assert.equal(f.store.list().length, 2);
  } finally { f.cleanup(); }
});

test("a selection above the track ceiling is rejected explicitly rather than truncated", () => {
  const lib = library(Array.from({ length: 100_001 }, (_, i) => track(i, { path: undefined })));
  assert.throws(() => new ExplorerSelections().preview(lib), { status: 413 });
});
