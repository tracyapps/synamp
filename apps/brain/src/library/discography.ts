/**
 * Discography gaps (LIBRARY-CARE step 6): albums by artists you love that you
 * don't have yet, plus new and upcoming releases. Read-only toward the music.
 *
 *   1. Who you love: every artist folder, scored by how much of them you keep
 *      and how much you play and love them. The top ones are followed
 *      automatically; you can follow or unfollow anyone.
 *   2. Which MusicBrainz artist that is: taken from an album already matched in
 *      step 3 when possible, else a name search; unclear names go to "Which
 *      artist?" for you to pick.
 *   3. What they released (MusicBrainz release groups: an album across all its
 *      editions), compared with the albums in your library by release group
 *      and by loosely compared title.
 *
 * Checking runs in the background at MusicBrainz's pace, sharing the one
 * client the missing-tracks matcher uses, and re-checks each artist monthly so
 * new releases show up.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library } from "../query/evaluate.ts";
import type { ListeningEvent } from "../session/events.ts";
import { groupAlbums, normalTitle } from "./albums.ts";
import type { AlbumRecord } from "./missing.ts";
import { MusicBrainzError } from "./musicbrainz.ts";
import type { MbArtist, MbReleaseGroup, MusicBrainz } from "./musicbrainz.ts";
import { artistKey } from "./naming.ts";

export class DiscographyError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const DAY = 86_400_000;
export const RECHECK_AFTER_MS = 30 * DAY;
const NEW_WITHIN_MS = 120 * DAY;
const NOT_ARTISTS = /^(?:various(?: artists)?|va|compilations|soundtracks?|unknown(?: artist)?|_unknown)$/i;

// --- 1. who you love ------------------------------------------------------------------

export type ArtistStat = { key: string; name: string; tracks: number; albums: number; plays: number; loves: number; score: number };

/** Artists by artist folder, with how much you keep and play them. */
export function artistStats(library: Library, events: readonly ListeningEvent[], canonical: (id: string) => string = (id) => id): ArtistStat[] {
  const byKey = new Map<string, ArtistStat & { folders: Set<string> }>();
  const ofTrack = new Map<string, string>();
  for (const track of library.tracks) {
    const parts = track.path?.split("/") ?? [];
    if (parts.length < 2 || NOT_ARTISTS.test(parts[0]!)) continue;
    const key = artistKey(parts[0]!);
    const stat = byKey.get(key) ?? { key, name: parts[0]!, tracks: 0, albums: 0, plays: 0, loves: 0, score: 0, folders: new Set<string>() };
    stat.tracks++;
    if (parts.length >= 3) stat.folders.add(parts.slice(0, -1).join("/"));
    byKey.set(key, stat);
    ofTrack.set(track.id, key);
  }
  for (const event of events) {
    const key = ofTrack.get(canonical(event.track_id));
    if (!key) continue;
    const stat = byKey.get(key)!;
    if (event.signal === "full_play" || event.signal === "external_play") stat.plays++;
    if (event.signal === "love" || event.signal === "thumb_up") stat.loves++;
  }
  return [...byKey.values()].map(({ folders, ...stat }) => {
    const albums = folders.size;
    // Keeping a lot of an artist counts, but listening and loving count for more.
    return { ...stat, albums, score: Math.round(stat.tracks / 4 + albums * 2 + stat.plays + stat.loves * 5) };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// --- state --------------------------------------------------------------------------

export type ArtistRecord = {
  key: string;
  name: string;
  status: "matched" | "needs_choice" | "not_found" | "skipped" | "error";
  mbid?: string;
  mb_name?: string;
  mb_disambiguation?: string;
  source?: "albums" | "search" | "you";
  candidates?: MbArtist[];
  groups?: MbReleaseGroup[];
  error?: string;
  checked_at: number;
};
export type GapNote = "want" | "ignore";
export type DiscographySettings = {
  /** How many of your top artists are followed without asking. */
  auto_follow: number;
  albums: boolean;
  eps: boolean;
  singles: boolean;
  /** Live albums, compilations, soundtracks, remixes, demos… */
  include_other: boolean;
};
export const DEFAULT_DISCOGRAPHY_SETTINGS: DiscographySettings = { auto_follow: 50, albums: true, eps: false, singles: false, include_other: false };

type State = {
  format: "synamp.discography/1";
  settings: DiscographySettings;
  /** true: followed; false: unfollowed (even if it's a top artist). */
  follows: Record<string, boolean>;
  artists: Record<string, ArtistRecord>;
  notes: Record<string, GapNote>;
};

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}

export class DiscographyStore {
  private path: string;
  state: State;
  revision = 0;
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = {
      format: "synamp.discography/1",
      settings: { ...DEFAULT_DISCOGRAPHY_SETTINGS, ...(loaded.settings ?? {}) },
      follows: loaded.follows ?? {},
      artists: loaded.artists ?? {},
      notes: loaded.notes ?? {},
    };
  }
  save(): void { this.revision++; writeJson(this.path, this.state); }

  /** Your top artists (unless unfollowed), plus everyone you followed by hand. */
  followed(stats: ArtistStat[]): ArtistStat[] {
    const top = new Set(stats.slice(0, this.state.settings.auto_follow).map((s) => s.key));
    return stats.filter((s) => this.state.follows[s.key] ?? top.has(s.key));
  }

  follow(key: string, follow: boolean, stats: ArtistStat[]): void {
    if (!stats.some((s) => s.key === key)) throw new DiscographyError("No artist with that key in the library", 404);
    this.state.follows[key] = follow;
    this.save();
  }

  note(id: string, status: GapNote | "none"): void {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new DiscographyError("Unknown release group", 404);
    if (status === "none") delete this.state.notes[id];
    else if (status === "want" || status === "ignore") this.state.notes[id] = status;
    else throw new DiscographyError('status must be "want", "ignore" or "none"');
    this.save();
  }

  setSettings(input: Record<string, unknown>): DiscographySettings {
    const next = { ...this.state.settings };
    for (const key of ["albums", "eps", "singles", "include_other"] as const) {
      if (input[key] === undefined) continue;
      if (typeof input[key] !== "boolean") throw new DiscographyError(`${key} must be true or false`);
      next[key] = input[key];
    }
    if (input.auto_follow !== undefined) {
      const n = Number(input.auto_follow);
      if (!Number.isInteger(n) || n < 0 || n > 1000) throw new DiscographyError("auto_follow must be 0–1000");
      next.auto_follow = n;
    }
    this.state.settings = next;
    this.save();
    return next;
  }

  set(record: ArtistRecord): void { this.state.artists[record.key] = record; this.save(); }

  /** Followed artists not checked yet, due their monthly re-check, or failed more than a day ago. */
  due(stats: ArtistStat[], now = Date.now()): ArtistStat[] {
    return this.followed(stats).filter((stat) => {
      const record = this.state.artists[stat.key];
      if (!record) return true;
      if (record.status === "skipped" || record.status === "needs_choice") return false;
      if (record.status === "error") return now - record.checked_at > DAY;
      return now - record.checked_at > RECHECK_AFTER_MS;
    });
  }
}

// --- 2 + 3. checking an artist ------------------------------------------------------------

/** An MBID for this artist from albums already matched to MusicBrainz in step 3. */
function idFromAlbums(stat: ArtistStat, albums: Record<string, AlbumRecord>): { id: string; name: string } | undefined {
  const votes = new Map<string, { name: string; count: number }>();
  for (const record of Object.values(albums)) {
    const release = record.status === "matched" ? record.release : undefined;
    if (!release?.artist_ids || release.artist_ids.length !== 1 || artistKey(release.artist) !== stat.key) continue;
    const id = release.artist_ids[0]!;
    votes.set(id, { name: release.artist, count: (votes.get(id)?.count ?? 0) + 1 });
  }
  const best = [...votes].sort((a, b) => b[1].count - a[1].count)[0];
  return best ? { id: best[0], name: best[1].name } : undefined;
}

export async function checkArtist(stat: ArtistStat, mb: MusicBrainz, albums: Record<string, AlbumRecord>, previous?: ArtistRecord, now = Date.now()): Promise<ArtistRecord> {
  const base = { key: stat.key, name: stat.name, checked_at: now };
  let mbid = previous?.status === "matched" ? previous.mbid : undefined;
  let found: Pick<ArtistRecord, "mb_name" | "mb_disambiguation" | "source"> = previous?.status === "matched"
    ? { ...(previous.mb_name ? { mb_name: previous.mb_name } : {}), ...(previous.mb_disambiguation ? { mb_disambiguation: previous.mb_disambiguation } : {}), ...(previous.source ? { source: previous.source } : {}) }
    : {};
  if (!mbid) {
    const fromAlbums = idFromAlbums(stat, albums);
    if (fromAlbums) {
      mbid = fromAlbums.id;
      found = { mb_name: fromAlbums.name, source: "albums" };
    } else {
      const candidates = await mb.searchArtists(stat.name);
      const same = candidates.filter((c) => artistKey(c.name) === stat.key || (c.sort_name && artistKey(c.sort_name) === stat.key));
      const strong = same.filter((c) => c.score >= 90);
      if (!candidates.length) return { ...base, status: "not_found" };
      // One clear answer: take it. Two artists with the same name: ask.
      if (strong.length === 1 || (strong.length > 1 && strong[0]!.score === 100 && strong[1]!.score < 90)) {
        mbid = strong[0]!.id;
        found = { mb_name: strong[0]!.name, ...(strong[0]!.disambiguation ? { mb_disambiguation: strong[0]!.disambiguation } : {}), source: "search" };
      } else {
        return { ...base, status: "needs_choice", candidates: (same.length ? same : candidates).slice(0, 6) };
      }
    }
  }
  const groups = await mb.releaseGroups(mbid);
  return { ...base, status: "matched", mbid, ...found, groups };
}

/** Background checking: one artist at a time, MusicBrainz-paced, pausable. */
export class DiscographyChecker {
  state: "idle" | "running" | "paused" | "waiting" = "idle";
  current = "";
  lastError = "";
  done = 0;
  private stop = false;
  private store: DiscographyStore;
  private mb: () => MusicBrainz;
  private stats: () => ArtistStat[];
  private albums: () => Record<string, AlbumRecord>;
  private sleep: (ms: number) => Promise<void>;

  constructor(store: DiscographyStore, mb: () => MusicBrainz, stats: () => ArtistStat[], albums: () => Record<string, AlbumRecord>, sleep?: (ms: number) => Promise<void>) {
    this.store = store; this.mb = mb; this.stats = stats; this.albums = albums;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  start(): Promise<void> | undefined {
    if (this.state === "running" || this.state === "waiting") return undefined;
    const client = this.mb(); // throws without a contact, before anything starts
    this.stop = false;
    this.state = "running";
    return this.loop(client);
  }
  pause(): void { this.stop = true; if (this.state !== "idle") this.state = "paused"; }

  private async loop(client: MusicBrainz): Promise<void> {
    let backoff = 30_000;
    const attempted = new Set<string>();
    while (!this.stop) {
      const next = this.store.due(this.stats()).find((stat) => !attempted.has(stat.key));
      if (!next) { this.state = "idle"; this.current = ""; return; }
      this.current = next.name;
      try {
        this.store.set(await checkArtist(next, client, this.albums(), this.store.state.artists[next.key]));
        attempted.add(next.key);
        this.done++;
        backoff = 30_000;
        this.lastError = "";
      } catch (error) {
        const failure = error instanceof MusicBrainzError ? error : new MusicBrainzError(String(error));
        this.lastError = failure.message;
        if (failure.retryable) {
          this.state = "waiting";
          await this.sleep(backoff);
          backoff = Math.min(backoff * 2, 15 * 60_000);
          if (!this.stop) this.state = "running";
        } else {
          this.store.set({ key: next.key, name: next.name, status: "error", error: failure.message, checked_at: Date.now() });
          attempted.add(next.key);
        }
      }
    }
    this.current = "";
  }
}

/** You pick which MusicBrainz artist a name is (or say it isn't there). */
export async function chooseArtist(store: DiscographyStore, stat: ArtistStat, mbid: string | null, mb: MusicBrainz): Promise<ArtistRecord> {
  if (mbid === null) {
    const record: ArtistRecord = { key: stat.key, name: stat.name, status: "skipped", checked_at: Date.now() };
    store.set(record);
    return record;
  }
  if (!/^[0-9a-f-]{36}$/.test(mbid)) throw new DiscographyError("Not a MusicBrainz artist ID");
  const candidate = store.state.artists[stat.key]?.candidates?.find((c) => c.id === mbid);
  const record: ArtistRecord = {
    key: stat.key, name: stat.name, status: "matched", mbid, source: "you", checked_at: Date.now(),
    ...(candidate ? { mb_name: candidate.name, ...(candidate.disambiguation ? { mb_disambiguation: candidate.disambiguation } : {}) } : {}),
    groups: await mb.releaseGroups(mbid),
  };
  store.set(record);
  return record;
}

// --- the list ---------------------------------------------------------------------------

export type Gap = {
  id: string;
  title: string;
  type: string;
  year?: string;
  date?: string;
  /** Released in the last few months, or not out yet. */
  fresh?: "new" | "upcoming";
  note?: GapNote;
  links: Array<{ label: string; url: string }>;
};
export type ArtistGaps = {
  key: string; name: string; mbid: string; mb_name?: string; disambiguation?: string;
  have: number; total: number; gaps: Gap[]; score: number; checked_at: number;
};
export type DiscographyReport = {
  summary: { followed: number; checked: number; matched: number; with_gaps: number; gaps: number; fresh: number; needs_choice: number; not_found: number; waiting: number };
  artists: ArtistGaps[];
  review: Array<{ key: string; name: string; tracks: number; candidates: MbArtist[]; not_found?: boolean }>;
};

const enc = encodeURIComponent;
export function gapLinks(artist: string, title: string, id: string): Gap["links"] {
  const q = `${artist} ${title}`;
  return [
    { label: "MusicBrainz", url: `https://musicbrainz.org/release-group/${id}` },
    { label: "Bandcamp", url: `https://bandcamp.com/search?q=${enc(q)}&item_type=a` },
    { label: "Apple Music", url: `https://music.apple.com/search?term=${enc(q)}` },
    { label: "Spotify", url: `https://open.spotify.com/search/${enc(q)}` },
    { label: "YouTube Music", url: `https://music.youtube.com/search?q=${enc(q)}` },
    { label: "Discogs (CD/vinyl)", url: `https://www.discogs.com/search/?q=${enc(q)}&type=release` },
  ];
}

function wanted(group: MbReleaseGroup, settings: DiscographySettings): boolean {
  const type = group.primary_type ?? "Other";
  const typeOk = (type === "Album" && settings.albums) || (type === "EP" && settings.eps) || (type === "Single" && settings.singles);
  return typeOk && (settings.include_other || group.secondary_types.length === 0);
}

export function discographyReport(library: Library, stats: ArtistStat[], store: DiscographyStore, albums: Record<string, AlbumRecord>, now = Date.now()): DiscographyReport {
  const followed = store.followed(stats);
  const units = groupAlbums(library);
  const settings = store.state.settings;
  const summary = { followed: followed.length, checked: 0, matched: 0, with_gaps: 0, gaps: 0, fresh: 0, needs_choice: 0, not_found: 0, waiting: store.due(stats, now).length };
  const artists: ArtistGaps[] = [];
  const review: DiscographyReport["review"] = [];
  for (const stat of followed) {
    const record = store.state.artists[stat.key];
    if (!record) continue;
    summary.checked++;
    if (record.status === "needs_choice" || record.status === "not_found") {
      summary[record.status]++;
      review.push({ key: stat.key, name: stat.name, tracks: stat.tracks, candidates: record.candidates ?? [], ...(record.status === "not_found" ? { not_found: true } : {}) });
      continue;
    }
    if (record.status !== "matched" || !record.mbid || !record.groups) continue;
    summary.matched++;
    // What you own: albums in this artist's folders, by release group (when known) and by title.
    const mine = units.filter((unit) => artistKey(unit.key.split("/")[0]!) === stat.key);
    const ownedGroups = new Set<string>();
    const ownedTitles = new Set<string>();
    for (const unit of mine) {
      ownedTitles.add(normalTitle(unit.title));
      const release = albums[unit.key]?.status === "matched" ? albums[unit.key]!.release : undefined;
      if (release?.release_group_id) ownedGroups.add(release.release_group_id);
      if (release) ownedTitles.add(normalTitle(release.title));
    }
    const relevant = record.groups.filter((group) => wanted(group, settings));
    const isOwned = (group: MbReleaseGroup) => ownedGroups.has(group.id) || ownedTitles.has(normalTitle(group.title));
    const gaps: Gap[] = relevant.filter((group) => !isOwned(group)).map((group) => {
      const date = group.first_release_date;
      const time = date ? Date.parse(date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date) : NaN;
      const fresh: Gap["fresh"] = Number.isFinite(time) ? (time > now ? "upcoming" : now - time < NEW_WITHIN_MS ? "new" : undefined) : undefined;
      const note = store.state.notes[group.id];
      return {
        id: group.id, title: group.title, type: [group.primary_type ?? "Other", ...group.secondary_types].join(" · "),
        ...(date ? { date, year: date.slice(0, 4) } : {}),
        ...(fresh ? { fresh } : {}), ...(note ? { note } : {}),
        links: gapLinks(record.mb_name ?? stat.name, group.title, group.id),
      };
    }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
    const shown = gaps.filter((gap) => gap.note !== "ignore");
    if (shown.length) summary.with_gaps++;
    summary.gaps += shown.length;
    summary.fresh += shown.filter((gap) => gap.fresh).length;
    artists.push({
      key: stat.key, name: stat.name, mbid: record.mbid, score: stat.score, checked_at: record.checked_at,
      ...(record.mb_name ? { mb_name: record.mb_name } : {}), ...(record.mb_disambiguation ? { disambiguation: record.mb_disambiguation } : {}),
      have: relevant.length - gaps.length, total: relevant.length, gaps,
    });
  }
  return { summary, artists, review };
}
