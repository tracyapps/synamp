/**
 * Favourites: artists, albums and songs you've hearted.
 *
 * They're for browsing first (the Library's "Favourites only" switch), and they
 * travel: with your Navidrome account signed in (Settings → Phone playlists),
 * each heart is a star in Navidrome, so it shows up as a favourite in your
 * phone apps, and stars you add or remove there come back here.
 *
 * Keys: "song:<track id>", "album:<album folder>", "artist:<name, case and
 * accents ignored>" — the same keys the Library list uses for its rows.
 *
 * Sync is two-way with a memory of what both sides agreed on last time
 * (`synced`), so a change on either side wins over the other side's silence:
 *   starred in Navidrome since last time → hearted here (unless you un-hearted it here since)
 *   unstarred in Navidrome since last time → un-hearted here (unless you hearted it here since)
 *   hearted here, not in Navidrome → starred there; un-hearted here → unstarred there.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { albumFolder } from "./albums.ts";
import { artistKey } from "./browse.ts";

export class FavouriteError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type FavouriteKind = "song" | "album" | "artist";
export type Favourite = { kind: FavouriteKind; ref: string; name: string; at: number };
type State = {
  format: "synamp.favourites/1";
  items: Record<string, Favourite>;
  /** Un-hearted here, and when: so the next sync unstars it in Navidrome instead of bringing it back. */
  removed: Record<string, number>;
  /** Keys starred in Navidrome when the two last agreed. */
  synced: string[];
  last_sync?: { at: number; added_here: number; removed_here: number; starred: number; unstarred: number; not_in_navidrome?: number; error?: string };
};

export const favouriteKey = (kind: FavouriteKind, ref: string) => `${kind}:${kind === "artist" ? artistKey(ref) : ref}`;
const KINDS: readonly FavouriteKind[] = ["song", "album", "artist"];

export class Favourites {
  private path: string;
  state: State;
  /** Bumps on every change, so caches (the Library list, the Brain's lookup) know to refresh. */
  rev = 0;
  private lookup?: { key: string; byTrack: Map<string, FavouriteKind> };

  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.favourites/1", items: loaded.items ?? {}, removed: loaded.removed ?? {}, synced: loaded.synced ?? [],
      ...(loaded.last_sync ? { last_sync: loaded.last_sync } : {}) };
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
    this.rev++;
  }

  has(kind: FavouriteKind, ref: string): boolean { return !!this.state.items[favouriteKey(kind, ref)]; }
  keys(): Set<string> { return new Set(Object.keys(this.state.items)); }

  /** Heart or un-heart one thing. */
  set(input: Record<string, unknown>, now = Date.now()): Favourite | null {
    const kind = input.kind as FavouriteKind;
    if (!KINDS.includes(kind)) throw new FavouriteError("kind must be song, album or artist");
    if (typeof input.ref !== "string" || !input.ref.trim() || input.ref.length > 1000) throw new FavouriteError("Which one? (ref is missing)");
    if (typeof input.on !== "boolean") throw new FavouriteError("on must be true or false");
    const key = favouriteKey(kind, input.ref);
    if (input.on) {
      const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 300) : input.ref;
      const item = this.state.items[key] ?? { kind, ref: input.ref, name, at: now };
      this.state.items[key] = item;
      delete this.state.removed[key];
      this.save();
      return item;
    }
    if (this.state.items[key]) {
      delete this.state.items[key];
      this.state.removed[key] = now;
      this.save();
    }
    return null;
  }

  /** For each track: the strongest way it's a favourite (the song itself, its album, or its artist). */
  kindFor(library: Library): (trackId: string) => FavouriteKind | null {
    const key = `${library.version}:${this.rev}`;
    if (this.lookup?.key !== key) {
      const byTrack = new Map<string, FavouriteKind>();
      const items = this.state.items;
      if (Object.keys(items).length) {
        for (const track of library.tracks) {
          const kind = trackFavourite(track, items);
          if (kind) byTrack.set(track.id, kind);
        }
      }
      this.lookup = { key, byTrack };
    }
    const map = this.lookup.byTrack;
    return (trackId) => map.get(trackId) ?? null;
  }

  view() {
    const items = Object.values(this.state.items);
    return {
      keys: Object.keys(this.state.items),
      counts: { songs: items.filter((i) => i.kind === "song").length, albums: items.filter((i) => i.kind === "album").length, artists: items.filter((i) => i.kind === "artist").length },
      ...(this.state.last_sync ? { last_sync: this.state.last_sync } : {}),
    };
  }
}

function trackFavourite(track: LibraryTrack, items: Record<string, Favourite>): FavouriteKind | null {
  if (items[`song:${track.id}`]) return "song";
  if (track.path && items[`album:${albumFolder(track.path)}`]) return "album";
  for (const name of [track.artist, track.album_artist]) if (name && items[`artist:${artistKey(name)}`]) return "artist";
  return null;
}

// --- Navidrome stars ---------------------------------------------------------------------------

/** What a sync needs from Navidrome (PlaylistSync provides it, signed in as you). */
export type StarServer = {
  /** Your stars as SynAmp keys ("song:…", "album:…", "artist:…") with their names; ones SynAmp doesn't know are left out. */
  starred(): Promise<Map<string, string>>;
  /** Star these; returns the keys Navidrome could match (a song it hasn't scanned yet can't be starred). */
  star(keys: string[]): Promise<string[]>;
  unstar(keys: string[]): Promise<string[]>;
};

export async function syncStars(favourites: Favourites, server: StarServer, now = Date.now()) {
  const state = favourites.state;
  const names = await server.starred();
  const remote = new Set(names.keys());
  const synced = new Set(state.synced);
  const local = new Set(Object.keys(state.items));
  let addedHere = 0, removedHere = 0;
  // Changes made in the phone apps since last time.
  for (const key of remote) {
    if (synced.has(key) || local.has(key)) continue;
    if (state.removed[key]) continue; // you un-hearted it here since: that wins, and it's unstarred below
    const [kind, ...rest] = key.split(":");
    const ref = rest.join(":");
    state.items[key] = { kind: kind as FavouriteKind, ref, name: names.get(key) || ref, at: now };
    local.add(key); addedHere++;
  }
  for (const key of synced) {
    if (remote.has(key) || !local.has(key)) continue;
    const item = state.items[key]!;
    if (item.at > (state.last_sync?.at ?? 0)) continue; // hearted again here since: that wins, it's starred below
    delete state.items[key];
    local.delete(key); removedHere++;
  }
  // Changes made here.
  const toStar = [...local].filter((key) => !remote.has(key));
  const toUnstar = [...remote].filter((key) => !local.has(key));
  const starred = toStar.length ? await server.star(toStar) : [];
  const unstarred = toUnstar.length ? await server.unstar(toUnstar) : [];
  const nowStarred = new Set(starred);
  // Agreed now: hearted here and starred there. A favourite Navidrome couldn't match is tried again next time.
  state.synced = [...local].filter((key) => remote.has(key) || nowStarred.has(key));
  state.removed = {};
  state.last_sync = { at: now, added_here: addedHere, removed_here: removedHere, starred: starred.length, unstarred: unstarred.length,
    ...(toStar.length > starred.length ? { not_in_navidrome: toStar.length - starred.length } : {}) };
  favourites.save();
  return state.last_sync;
}
