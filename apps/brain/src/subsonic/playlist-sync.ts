/**
 * Your SynAmp playlists, in your phone apps.
 *
 * Phone and desktop apps (Symfonium, play:Sub, Feishin, …) read playlists from
 * Navidrome over the Subsonic API, and Navidrome playlists belong to one user.
 * So SynAmp signs in as you (user name + a salted token, never the password
 * itself) and keeps one Navidrome playlist per SynAmp playlist, roll-up and
 * smart playlist. Folders become part of the name ("Evenings › Slow burn"),
 * because Subsonic has no folders.
 *
 * SynAmp's copy wins: a synced playlist is rewritten from SynAmp on every send,
 * and a SynAmp playlist you delete is deleted from Navidrome too. Playlists you
 * made in Navidrome or a phone app are never touched — only ones SynAmp made.
 *
 * Songs are matched by file: Navidrome reports each song's real path
 * (ND_SUBSONIC_DEFAULTREPORTREALPATH), which maps to the same track the
 * analyzer knows. A song Navidrome hasn't scanned yet is left out and counted.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { relativeFromReported } from "./identity.ts";

export class SyncError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** What the sync needs to know about one SynAmp playlist. */
export type SyncSource = { id: string; name: string; trackIds: string[] };

type Mapping = { navidrome_id: string; name: string; songs: number; missing: number; sent_at: number };
type State = {
  format: "synamp.phone-playlists/1";
  user?: string;
  salt?: string;
  token?: string;
  auto: boolean;
  playlists: Record<string, Mapping>;
  last?: { at: number; sent: number; removed: number; missing: number; error?: string };
};


const CLIENT = "SynAmp";
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

export class PlaylistSync {
  private path: string;
  state: State;
  private coreUrl: string;
  private coreMusicPath: string;
  private fetchImpl: typeof fetch;
  /** Navidrome song ID for each SynAmp track ID, rebuilt when the library changes. */
  private songMap: { key: string; map: Map<string, string> } | null = null;
  running: Promise<State["last"]> | null = null;

  constructor(path: string, options: { coreUrl: string; coreMusicPath: string; fetchImpl?: typeof fetch }) {
    this.path = path;
    this.coreUrl = options.coreUrl;
    this.coreMusicPath = options.coreMusicPath;
    this.fetchImpl = options.fetchImpl ?? fetch;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.phone-playlists/1", auto: loaded.auto ?? true, playlists: loaded.playlists ?? {},
      ...(loaded.user && loaded.salt && loaded.token ? { user: loaded.user, salt: loaded.salt, token: loaded.token } : {}),
      ...(loaded.last ? { last: loaded.last } : {}) };
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state, null, 1) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  get signedIn(): boolean { return !!(this.state.user && this.state.token && this.state.salt); }

  /** One Subsonic call as the signed-in user (or with the credentials given, to test them). */
  private async call(method: string, params: Array<[string, string]>, post = false,
    auth = { user: this.state.user ?? "", salt: this.state.salt ?? "", token: this.state.token ?? "" }): Promise<Record<string, unknown>> {
    const query = new URLSearchParams([["u", auth.user], ["t", auth.token], ["s", auth.salt], ["v", "1.16.1"], ["c", CLIENT], ["f", "json"], ...params]);
    const url = new URL(`/rest/${method}.view`, this.coreUrl);
    let response: Response;
    try {
      response = post
        ? await this.fetchImpl(url, { method: "POST", body: query, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(60_000) })
        : await this.fetchImpl(new URL(`${url}?${query}`), { signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      throw new SyncError(`Navidrome isn't answering (${(error as Error).message}). Is it running?`, 502);
    }
    const data = await response.json().catch(() => ({})) as { "subsonic-response"?: Record<string, unknown> & { status?: string; error?: { code?: number; message?: string } } };
    const body = data["subsonic-response"];
    if (!body) throw new SyncError(`Navidrome sent an answer SynAmp couldn't read (HTTP ${response.status})`, 502);
    if (body.status !== "ok") {
      const code = body.error?.code;
      if (code === 40 || code === 41 || code === 44) throw new SyncError("Navidrome didn't accept that user name and password", 401);
      throw new SyncError(`Navidrome said: ${body.error?.message ?? "something went wrong"}`, 502);
    }
    return body;
  }

  /** Check the user name and password with Navidrome, then keep only a salted token. */
  async signIn(user: unknown, password: unknown): Promise<void> {
    if (typeof user !== "string" || !user.trim()) throw new SyncError("Enter your Navidrome user name");
    if (typeof password !== "string" || !password) throw new SyncError("Enter your Navidrome password");
    const salt = randomBytes(8).toString("hex");
    const auth = { user: user.trim(), salt, token: md5(password + salt) };
    await this.call("ping", [], false, auth);
    // A different account can't see the old account's playlists: start the mapping again.
    if (this.state.user !== auth.user) this.state.playlists = {};
    Object.assign(this.state, auth);
    this.save();
  }

  signOut(): void {
    delete this.state.user; delete this.state.salt; delete this.state.token;
    this.state.playlists = {};
    delete this.state.last;
    this.save();
  }

  setAuto(on: unknown): void {
    if (typeof on !== "boolean") throw new SyncError("auto must be true or false");
    this.state.auto = on;
    this.save();
  }

  view() {
    return {
      signed_in: this.signedIn, ...(this.state.user ? { user: this.state.user } : {}),
      auto: this.state.auto, running: !!this.running,
      playlists: Object.keys(this.state.playlists).length,
      ...(this.state.last ? { last: this.state.last } : {}),
      details: Object.values(this.state.playlists).map((item) => ({ name: item.name, songs: item.songs, missing: item.missing, sent_at: item.sent_at })),
    };
  }

  /** Every song Navidrome knows, as SynAmp track ID → Navidrome song ID. */
  private async buildSongMap(idForPath: (relative: string) => string | undefined): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const query of ["", '""']) {
      let offset = 0;
      for (;;) {
        const body = await this.call("search3", [["query", query], ["songCount", "500"], ["songOffset", String(offset)], ["artistCount", "0"], ["albumCount", "0"]]);
        const songs = ((body.searchResult3 as { song?: Array<{ id: string; path?: string }> } | undefined)?.song) ?? [];
        for (const song of songs) {
          const relative = relativeFromReported(song.path, this.coreMusicPath);
          const id = relative ? idForPath(relative) : undefined;
          if (id) map.set(id, song.id);
        }
        if (songs.length < 500) break;
        offset += songs.length;
      }
      // Navidrome lists everything for an empty query; some versions want two quote marks instead.
      if (map.size) break;
    }
    return map;
  }

  /**
   * Send every playlist. `libraryKey` changes whenever the library list does,
   * so the song map is rebuilt only then.
   */
  async sync(sources: SyncSource[], libraryKey: string, idForPath: (relative: string) => string | undefined, now = Date.now()) {
    if (!this.signedIn) throw new SyncError("Sign in with your Navidrome account first");
    if (this.running) return this.running;
    const job = (async () => {
      let sent = 0, removed = 0, missingTotal = 0;
      try {
        if (this.songMap?.key !== libraryKey) this.songMap = { key: libraryKey, map: await this.buildSongMap(idForPath) };
        const map = this.songMap.map;
        // Playlists that are already there under this account (one may have been deleted by hand).
        const existing = await this.call("getPlaylists", []);
        const there = new Set((((existing.playlists as { playlist?: Array<{ id: string }> } | undefined)?.playlist) ?? []).map((item) => item.id));
        const wanted = new Set(sources.map((source) => source.id));
        for (const source of sources) {
          const songIds = source.trackIds.map((id) => map.get(id)).filter((id): id is string => !!id);
          const missing = source.trackIds.length - songIds.length;
          const known = this.state.playlists[source.id];
          const params: Array<[string, string]> = [...songIds.map((id): [string, string] => ["songId", id])];
          let navidromeId = known && there.has(known.navidrome_id) ? known.navidrome_id : undefined;
          if (navidromeId) {
            // createPlaylist with an ID replaces its songs.
            await this.call("createPlaylist", [["playlistId", navidromeId], ...params], true);
          } else {
            const created = await this.call("createPlaylist", [["name", source.name], ...params], true);
            navidromeId = (created.playlist as { id?: string } | undefined)?.id;
            if (!navidromeId) {
              // Older servers don't return the new playlist: find it by name.
              const after = await this.call("getPlaylists", []);
              navidromeId = ((((after.playlists as { playlist?: Array<{ id: string; name: string }> } | undefined)?.playlist) ?? [])
                .filter((item) => item.name === source.name && !there.has(item.id)).pop())?.id;
            }
            if (!navidromeId) throw new SyncError(`Navidrome didn't say which playlist it made for “${source.name}”`, 502);
          }
          await this.call("updatePlaylist", [["playlistId", navidromeId], ["name", source.name],
            ["comment", "Made in SynAmp. Change it in SynAmp — edits here are replaced on the next send."]], true);
          this.state.playlists[source.id] = { navidrome_id: navidromeId, name: source.name, songs: songIds.length, missing, sent_at: now };
          sent++; missingTotal += missing;
        }
        for (const [id, mapping] of Object.entries(this.state.playlists)) {
          if (wanted.has(id)) continue;
          if (there.has(mapping.navidrome_id)) await this.call("deletePlaylist", [["id", mapping.navidrome_id]]);
          delete this.state.playlists[id];
          removed++;
        }
        this.state.last = { at: now, sent, removed, missing: missingTotal };
      } catch (error) {
        this.state.last = { at: now, sent, removed, missing: missingTotal, error: (error as Error).message };
        if (error instanceof SyncError && error.status === 401) { delete this.state.token; }
        this.save();
        throw error;
      }
      this.save();
      return this.state.last;
    })();
    this.running = job.finally(() => { this.running = null; });
    return this.running;
  }
}

/** "Evenings › Slow burn": the folder path, because Subsonic playlists have no folders. */
export function syncName(nodes: ReadonlyArray<{ id: string; name: string; parentId: string | null }>, id: string): string {
  const parts: string[] = [];
  let node = nodes.find((item) => item.id === id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    parts.unshift(node.name);
    node = node.parentId ? nodes.find((item) => item.id === node!.parentId) : undefined;
  }
  return parts.join(" › ");
}
