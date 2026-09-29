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
