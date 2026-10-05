import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PlaylistStore } from "./playlists.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "synamp-playlists-"));
  const path = join(dir, "playlists.json");
  const store = new PlaylistStore(path);
  return { store, path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("nested folders and roll-ups stay live as tracks are added", () => {
  const { store, cleanup } = fixture();
  try {
    const top = store.create({ type: "folder", name: "Workday" });
    const nested = store.create({ type: "folder", name: "Focus", parentId: top.id });
    const morning = store.create({ type: "playlist", name: "Morning", parentId: nested.id });
    const afternoon = store.create({ type: "playlist", name: "Afternoon", parentId: top.id });
    store.addTrack(morning.id, { id: "a", title: "A" });
    store.addTrack(afternoon.id, { id: "b", title: "B" });
    const all = store.create({ type: "rollup", name: "All day", sourceId: top.id, mode: "merge" });
    assert.deepEqual(store.resolve(all.id).map((track) => track.id), ["a", "b"]);
    store.addTrack(morning.id, { id: "c", title: "C" });
    assert.deepEqual(store.resolve(all.id).map((track) => track.id), ["a", "c", "b"]);
  } finally { cleanup(); }
});

test("interleave alternates children of the source folder", () => {
  const { store, cleanup } = fixture();
  try {
    const folder = store.create({ type: "folder", name: "Sets" });
    const left = store.create({ type: "playlist", name: "Left", parentId: folder.id });
    const right = store.create({ type: "playlist", name: "Right", parentId: folder.id });
    for (const id of ["a", "b", "c"]) store.addTrack(left.id, { id, title: id });
    for (const id of ["1", "2"]) store.addTrack(right.id, { id, title: id });
    const mix = store.create({ type: "rollup", name: "Mix", sourceId: folder.id, mode: "interleave" });
    assert.deepEqual(store.resolve(mix.id).map((track) => track.id), ["a", "1", "b", "2", "c"]);
  } finally { cleanup(); }
});

test("shuffle retains every entry, including duplicates", () => {
  const { store, cleanup } = fixture();
  try {
    const list = store.create({ type: "playlist", name: "List" });
    for (const id of ["a", "b", "a"]) store.addTrack(list.id, { id, title: id });
    const mix = store.create({ type: "rollup", name: "Shuffle", sourceId: list.id, mode: "shuffle" });
    assert.deepEqual(store.resolve(mix.id, () => 0).map((track) => track.id), ["b", "a", "a"]);
  } finally { cleanup(); }
});

test("rejects recursive roll-ups and preserves the prior state", () => {
  const { store, cleanup } = fixture();
  try {
    const folder = store.create({ type: "folder", name: "Root" });
    assert.throws(() => store.create({ type: "rollup", name: "Loop", parentId: folder.id, sourceId: folder.id, mode: "merge" }), /cycle/i);
    assert.equal(store.list().length, 1);
  } finally { cleanup(); }
});

test("persists edits and protects referenced nodes from deletion", () => {
  const { store, path, cleanup } = fixture();
  try {
    const list = store.create({ type: "playlist", name: "List" });
    store.addTrack(list.id, { id: "a", title: "A" });
    const rollup = store.create({ type: "rollup", name: "Copy", sourceId: list.id, mode: "merge" });
    assert.throws(() => store.delete(list.id), /uses this node/);
    const reopened = new PlaylistStore(path);
    assert.deepEqual(reopened.resolve(rollup.id).map((track) => track.id), ["a"]);
    reopened.removeTrack(list.id, 0);
    assert.deepEqual(new PlaylistStore(path).resolve(rollup.id), []);
  } finally { cleanup(); }
});

test("smart playlists store the plan, resolve live, and reject invalid plans", () => {
  const { store, cleanup } = fixture();
  let catalog = [{ id: "a", title: "A" }];
  const live = new PlaylistStore(join(mkdtempSync(join(tmpdir(), "synamp-smart-")), "p.json"), { resolveSmart: () => catalog });
  try {
    const plan = {
      version: "2.0", intent: { query_type: "exclusion" }, target_size: 10,
      constraints: [{ id: "no_piano", source_phrase: "no piano", hard: true, explicit_exclusion: true, unknown_policy: "exclude",
        confidence: 0.8, where: { field: "instruments.piano", op: "lt", value: 0.2 } }],
      ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict", ladder: [] },
    };
    const smart = live.create({ type: "smart", name: "No piano", plan, prompt: "no piano" });
    assert.equal(smart.type, "smart");
    assert.match(smart.type === "smart" ? smart.planHash : "", /^[0-9a-f]{64}$/);
    const roll = live.create({ type: "rollup", name: "All", sourceId: smart.id, mode: "merge" });
    assert.deepEqual(live.resolve(roll.id).map((track) => track.id), ["a"]);
    catalog = [...catalog, { id: "b", title: "B" }];
    assert.deepEqual(live.resolve(roll.id).map((track) => track.id), ["a", "b"], "a newly analysed track joins without re-saving");
    assert.throws(() => live.create({ type: "smart", name: "Bad", plan: { ...plan, version: "9" } }), /Invalid plan at \$\.version/);
    assert.throws(() => live.addTrack(smart.id, { id: "x", title: "X" }), /only be added to playlists/);
    // A store without a library source refuses rather than returning an empty list.
    const offline = store.create({ type: "smart", name: "Offline", plan });
    assert.throws(() => store.resolve(offline.id), /need a library source/);
  } finally { cleanup(); }
});
