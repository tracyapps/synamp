import test from "node:test";
import assert from "node:assert/strict";
import { ExploreService } from "./explore-service.ts";
import { explore, exploreSections } from "./explore.ts";
import type { ExploreOptions } from "./explore.ts";
import type { Library } from "../query/evaluate.ts";
import { BrowseError } from "./browse.ts";

const library: Library = { version: "test", tracks: [
  { id: "one", title: "The Café", artist: "A & B", album: "First", album_artist: "A & B", path: "A/First/01.mp3", year: 1994, duration_s: 123, genre: ["Jazz", "Live"], signals: { bpm: 120 } },
  { id: "two", title: "Second", artist: "Guest", album: "First", album_artist: "A & B", path: "A/First/02.mp3", year: 1994, duration_s: 80, genre: ["Jazz"] },
  { id: "three", title: "Other", artist: "Other", album: "Other album", path: "Other/Album/CD1/01.mp3", genre: ["Rock"] },
] };

test("worker preserves filters, global sort, groups, paging and selection membership", async () => {
  const service = new ExploreService();
  try {
    const cases: ExploreOptions[] = [
      {}, { types: "song,album,artist", sort: "title", direction: "desc", offset: "1", limit: "2" },
      { types: "song", q: "cafe" }, { types: "song", from: "1990", to: "2000" },
      { types: "song,album,artist", group: "genre", group2: "artist", expand: "all", chunk: "2" },
      { types: "song", rules: JSON.stringify([{ field: "artist", value: "Guest", not: true }]) },
    ];
    for (const options of cases) {
      assert.deepEqual(await service.query(library, options), explore(library, options));
      assert.deepEqual(await service.query(library, options, undefined, true), exploreSections(library, options));
    }
  } finally { await service.close(); }
});

test("concurrent snapshots and revised favourites cannot mix results", async () => {
  const service = new ExploreService();
  try {
    // Even an unchanged version label on a new immutable snapshot must refresh.
    const changed = { ...library, tracks: [{ ...library.tracks[0]!, title: "Renamed", path: "Moved/Album/01.mp3" }] };
    const options = { types: "song" };
    const [a, b, c] = await Promise.all([service.query(library, options), service.query(changed, options), service.query(library, options)]);
    assert.deepEqual(a, explore(library, options));
    assert.deepEqual(b, explore(changed, options));
    assert.deepEqual(c, a);
    for (const [rev, id] of [[1, "one"], [2, "three"]] as const) {
      const options = { types: "song", favourites: `rev${rev}` };
      const keys = new Set([`song:${id}`]);
      assert.deepEqual(await service.query(library, options, keys), explore(library, options, keys));
    }
  } finally { await service.close(); }
});

test("invalid queries keep their public error and the worker remains usable", async () => {
  const service = new ExploreService();
  try {
    await assert.rejects(service.query(library, { types: "planet" }), error => error instanceof BrowseError && error.status === 400 && /type/.test(error.message));
    assert.deepEqual(await service.query(library), explore(library));
  } finally { await service.close(); }
});

test("cold 46k-track query yields to unrelated server work before returning", async () => {
  const service = new ExploreService();
  const large: Library = { version: "large", tracks: Array.from({ length: 46_000 }, (_, i) => ({
    id: `track-${i}`, title: `The song ${i}`, artist: `Artist ${i % 1200}`, album: `Album ${Math.floor(i / 12)}`,
    path: `Artist ${i % 1200}/Album ${Math.floor(i / 12)}/${i}.mp3`, year: 1980 + i % 40, genre: ["Rock", `Genre ${i % 6}`],
  })) };
  let heartbeats = 0;
  const timer = setInterval(() => { heartbeats++; }, 5);
  try {
    const result = await service.query(large, { types: "song", sort: "title", group: "artist", expand: "all", limit: "1" }, undefined, true);
    assert.ok(heartbeats > 0, "other requests can run during cold list construction/sorting");
    assert.equal(result.matched_total, 46_000);
    assert.equal(result.rows.length, 1);
  } finally { clearInterval(timer); await service.close(); }
});

test("pending work is bounded and shutdown rejects waiting requests", async () => {
  const service = new ExploreService();
  const jobs = Array.from({ length: 17 }, () => service.query(library));
  const settled = Promise.allSettled(jobs);
  await service.close();
  const results = await settled;
  assert.equal(results[16]!.status, "rejected");
  assert.ok(results.every(result => result.status === "rejected"));
  await assert.rejects(service.query(library), /stopping/);
});
