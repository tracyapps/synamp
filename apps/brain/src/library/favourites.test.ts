/** Favourites: hearts, what they mean for each song, the Library filter, and two-way stars with Navidrome. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library } from "../query/evaluate.ts";
import { explore } from "./explore.ts";
import { Favourites, favouriteKey, syncStars, type StarServer } from "./favourites.ts";
import { FAVOURITE_VALUE, favouriteWeight, specificity, withFavourites } from "../learning/favourite-prior.ts";
import type { QueryPlan } from "../query/plan.ts";

const lib: Library = { version: "v1", tracks: [
  { id: "t1", title: "Army of Me", artist: "Björk", album: "Post", path: "Björk/Post (1995)/01 - Army of Me.flac" },
  { id: "t2", title: "Hyperballad", artist: "Björk", album: "Post", path: "Björk/Post (1995)/02 - Hyperballad.flac" },
  { id: "t3", title: "Fuel", artist: "Ani DiFranco", album: "Little Plastic Castle", path: "Ani DiFranco/Little Plastic Castle (1998)/CD1/02 - Fuel.flac" },
  { id: "t4", title: "1/1", artist: "Brian Eno", album: "Music for Airports", path: "Brian Eno/Music for Airports (1978)/01 - 1-1.flac" },
] };
const temp = () => mkdtempSync(join(tmpdir(), "synamp-fav-"));

test("hearts: on, off, survive a restart; artists match ignoring case and accents", () => {
  const dir = temp();
  try {
    const favs = new Favourites(join(dir, "favourites.json"));
    favs.set({ kind: "artist", ref: "Björk", name: "Björk", on: true }, 1);
    favs.set({ kind: "album", ref: "Ani DiFranco/Little Plastic Castle (1998)", name: "Little Plastic Castle", on: true }, 2);
    favs.set({ kind: "song", ref: "t4", name: "1/1", on: true }, 3);
    assert.ok(favs.has("artist", "bjork"), "the same artist however it's spelled in a tag");
    assert.equal(favouriteKey("artist", "BJÖRK"), "artist:björk".normalize("NFKD").replace(/[̀-ͯ]/g, ""));
    const kindOf = favs.kindFor(lib);
    assert.equal(kindOf("t1"), "artist");
    assert.equal(kindOf("t3"), "album", "a song in a CD1 folder belongs to the album folder");
    assert.equal(kindOf("t4"), "song");
    favs.set({ kind: "song", ref: "t4", on: false }, 4);
    assert.equal(favs.kindFor(lib)("t4"), null, "the lookup refreshes after a change");
    assert.deepEqual(new Favourites(join(dir, "favourites.json")).view().counts, { songs: 0, albums: 1, artists: 1 });
    assert.throws(() => favs.set({ kind: "playlist", ref: "x", on: true }), /song, album or artist/);
    assert.throws(() => favs.set({ kind: "song", ref: "t1" }), /on must be/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the Library's Favourites only switch: just the hearted rows", () => {
  const dir = temp();
  try {
    const favs = new Favourites(join(dir, "favourites.json"));
    favs.set({ kind: "artist", ref: "Björk", on: true });
    favs.set({ kind: "song", ref: "t3", on: true });
    const all = (types: string) => explore(lib, { types, favourites: `rev${favs.rev}` }, favs.keys()).rows.map((row) => row.title);
    assert.deepEqual(all("artist"), ["Björk"]);
    assert.deepEqual(all("song"), ["Fuel"]);
    assert.equal(explore(lib, { types: "song" }, favs.keys()).total, 4, "switched off: everything");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function fakeNavidrome(initial: Array<[string, string]>) {
  const stars = new Map(initial);
  const calls: string[] = [];
  const server: StarServer = {
    starred: async () => new Map(stars),
    star: async (keys) => { const ok = keys.filter((key) => !key.includes("unscanned")); ok.forEach((key) => stars.set(key, "")); calls.push(`star ${ok.join(",")}`); return ok; },
    unstar: async (keys) => { keys.forEach((key) => stars.delete(key)); calls.push(`unstar ${keys.join(",")}`); return keys; },
  };
  return { stars, calls, server };
}

test("stars sync both ways: phone changes come here, changes here go there, and the newer change wins", async () => {
  const dir = temp();
  try {
    const favs = new Favourites(join(dir, "favourites.json"));
    favs.set({ kind: "song", ref: "t1", name: "Army of Me", on: true }, 10);
    favs.set({ kind: "song", ref: "unscanned", on: true }, 10);
    const phone = fakeNavidrome([["album:Brian Eno/Music for Airports (1978)", "Music for Airports"]]);

    // First sync: the phone's star comes here; ours goes there (except a song Navidrome hasn't scanned).
    let result = await syncStars(favs, phone.server, 100);
    assert.ok(favs.has("album", "Brian Eno/Music for Airports (1978)"));
    assert.equal(favs.state.items["album:Brian Eno/Music for Airports (1978)"]!.name, "Music for Airports");
    assert.ok(phone.stars.has("song:t1"));
    assert.equal(result.added_here, 1);
    assert.equal(result.not_in_navidrome, 1);

    // Unstarred on the phone → un-hearted here.
    phone.stars.delete("song:t1");
    result = await syncStars(favs, phone.server, 200);
    assert.equal(favs.has("song", "t1"), false);
    assert.equal(result.removed_here, 1);

    // Un-hearted here → unstarred there (not brought back).
    favs.set({ kind: "album", ref: "Brian Eno/Music for Airports (1978)", on: false }, 250);
    await syncStars(favs, phone.server, 300);
    assert.equal(phone.stars.has("album:Brian Eno/Music for Airports (1978)"), false);
    assert.equal(favs.has("album", "Brian Eno/Music for Airports (1978)"), false);

    // Starred on the phone AND hearted here meanwhile: stays a favourite, no churn.
    phone.stars.set("artist:bjork", "Björk");
    favs.set({ kind: "artist", ref: "Björk", on: true }, 350);
    phone.calls.length = 0;
    await syncStars(favs, phone.server, 400);
    assert.ok(favs.has("artist", "Björk"));
    assert.equal(Object.keys(favs.state.items).filter((key) => key.startsWith("artist:")).length, 1, "one artist, not two spellings");
    assert.deepEqual(phone.calls.filter((call) => call.startsWith("unstar")), []);
    assert.equal(favs.has("song", "unscanned"), true, "a favourite Navidrome can't match stays here and is tried again");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const plan = (hard: number, soft: number, examples = 0) => ({
  constraints: [...Array(hard).fill({ hard: true }), ...Array(soft).fill({ hard: false })],
  ranking: { signals: [], ...(examples ? { exemplars: { positive: Array(examples).fill("x") } } : {}) },
}) as unknown as QueryPlan;

test("the Brain's favourite nudge: strongest for a vague ask at the start, fading as the ask and the session fill in", () => {
  assert.equal(specificity(plan(0, 0)), 0);
  assert.equal(specificity(plan(2, 2, 2)), 4);
  assert.equal(favouriteWeight(plan(0, 0), 0), 1, "vague, fresh: full weight");
  assert.ok(favouriteWeight(plan(3, 0), 0) < 0.5, "a specific ask leans on favourites less");
  assert.equal(favouriteWeight(plan(0, 0), 8), 0.5, "after 8 listening events in the session: half");
  assert.ok(favouriteWeight(plan(0, 0), 40) < 0.2, "a long session: a whisper");
  assert.ok(favouriteWeight(plan(3, 0), 40) < favouriteWeight(plan(0, 0), 40));

  const base = { adjust: (_id: string) => ({ value: 0.5, parts: [{ label: "you loved this", value: 0.5 }] }), epoch: null, removed: () => new Set<string>() };
  const view = withFavourites(base, (id) => (id === "t1" ? "song" : id === "t2" ? "artist" : null), 0.5);
  assert.deepEqual(view.adjust("t1"), { value: 0.5 + FAVOURITE_VALUE.song * 0.5, parts: [{ label: "you loved this", value: 0.5 }, { label: "one of your favourite songs", value: 0.5 }] });
  assert.equal(view.adjust("t2").parts.at(-1)!.label, "by one of your favourite artists");
  assert.deepEqual(view.adjust("t3"), base.adjust("t3"), "not a favourite: unchanged");
  assert.equal(view.epoch, null, "the rest of the view still works");
  assert.equal(withFavourites(base, () => "song", 0), base, "no weight: the view as it was");
});
