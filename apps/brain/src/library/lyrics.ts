/**
 * Lyrics: the words of each song, kept privately beside the brain's other data.
 *
 * Two sources, in this order:
 *   1. The song file itself (USLT in MP3, LYRICS in FLAC, ©lyr in M4A). Always
 *      on: nothing leaves the NAS.
 *   2. LRCLIB (lrclib.net), a free community lyrics site — only when the owner
 *      switches it on. For each song without words in the file, SynAmp sends
 *      its title, artist, album and length, one song at a time, at a polite
 *      pace. LRCLIB publishes no terms for the lyrics it holds, and the words
 *      stay their writers' copyright, so they are kept here for the owner's own
 *      use and never published, shared or sent anywhere else.
 *
 * Songs the analysis heard no voice in are not looked up (nothing to find).
 *
 * Storage: lyrics/index.json (one small entry per song) and lyrics/text/<hash>.txt
 * (the words). The index is saved in batches, not after every song.
 *
 * Each song's own file is read once. A file whose words change later (lyrics
 * added in another app) is picked up when its path changes; SynAmp's own tag
 * fixes never touch lyrics.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { cleanLyrics, readTags } from "./tags.ts";

export class LyricsError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type LyricsSource = "file" | "lrclib";
export type Entry = {
  /** found = we have words; instrumental = LRCLIB says it has none; none = nothing found (yet). */
  status: "found" | "instrumental" | "none";
  source?: LyricsSource;
  /** size:mtime of the song file when its own tags were read. */
  file_sig?: string;
  /** When LRCLIB was last asked (ms). */
  looked_up?: number;
  words?: number;
  at: number;
};
type State = { format: "synamp.lyrics/1"; lookup: boolean; entries: Record<string, Entry> };

/** Ask LRCLIB again about a song it didn't know after this long. */
export const LOOK_AGAIN_MS = 60 * 24 * 3600 * 1000;
/** Songs the analysis heard a voice in less than this share of the time aren't looked up. */
export const NO_VOICE = 0.05;
/** One LRCLIB request at a time, this far apart. */
export const LOOKUP_GAP_MS = 1500;
/** After a refusal or an outage, wait this long before asking again. */
export const BACK_OFF_MS = 10 * 60 * 1000;

const textName = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 32) + ".txt";
const countWords = (text: string) => (text.match(/[\p{L}\p{N}']+/gu) ?? []).length;

export type LrclibAnswer = { kind: "found"; text: string } | { kind: "instrumental" } | { kind: "none" } | { kind: "problem"; message: string; retryable: boolean };
export type Lookup = (track: { title: string; artist: string; album?: string; duration_s?: number }) => Promise<LrclibAnswer>;

/** The real LRCLIB call. `get` matches artist/title/album with the song's length (±2 s). */
export function lrclib(userAgent: string, fetcher: typeof fetch = fetch): Lookup {
  return async (track) => {
    const query = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
    if (track.album) query.set("album_name", track.album);
    if (track.duration_s) query.set("duration", String(Math.round(track.duration_s)));
    let response: Response;
    try {
      response = await fetcher(`https://lrclib.net/api/get?${query}`, { headers: { "user-agent": userAgent, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      return { kind: "problem", message: `LRCLIB couldn't be reached (${(error as Error).message})`, retryable: true };
    }
    if (response.status === 404) return { kind: "none" };
    if (!response.ok) return { kind: "problem", message: `LRCLIB answered ${response.status}`, retryable: response.status === 429 || response.status >= 500 };
    let body: { instrumental?: boolean; plainLyrics?: string | null; syncedLyrics?: string | null };
    try { body = await response.json() as typeof body; } catch { return { kind: "problem", message: "LRCLIB sent something that wasn't JSON", retryable: true }; }
    if (body.instrumental) return { kind: "instrumental" };
    const text = cleanLyrics(body.plainLyrics ?? undefined) ?? cleanLyrics(body.syncedLyrics ?? undefined);
    return text ? { kind: "found", text } : { kind: "none" };
  };
}

export class LyricsStore {
  private dir: string;
  state: State;
  private dirty = 0;

  constructor(dir: string) {
    this.dir = dir;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.lyrics/1", lookup: loaded.lookup === true, entries: loaded.entries ?? {} };
  }

  /** Save the index now (or only when enough has changed). */
  flush(force = true): void {
    if (!this.dirty || (!force && this.dirty < 50)) return;
    mkdirSync(this.dir, { recursive: true });
    const path = join(this.dir, "index.json");
    const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, path);
    this.dirty = 0;
  }

  setLookup(on: boolean): void {
    this.state.lookup = on;
    this.dirty++;
    this.flush();
  }

  put(id: string, entry: Entry, text?: string): void {
    const file = join(this.dir, "text", textName(id));
    if (text !== undefined) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text + "\n", { mode: 0o600 });
    } else if (entry.status !== "found" && existsSync(file)) {
      rmSync(file, { force: true });
    }
    this.state.entries[id] = entry;
    this.dirty++;
    this.flush(false);
  }

  text(id: string): string | null {
    if (this.state.entries[id]?.status !== "found") return null;
    try { return readFileSync(join(this.dir, "text", textName(id)), "utf8").trimEnd(); } catch { return null; }
  }
}

export type Progress = {
  lookup: boolean;
  songs: number;
  from_files: number;
  from_lrclib: number;
  instrumental: number;
  not_found: number;
  /** Songs whose own file hasn't been read for words yet. */
  files_to_read: number;
  /** Songs LRCLIB will be asked about (when switched on). */
  to_look_up: number;
  no_voice: number;
  working_on: "files" | "lookup" | null;
  problem: string | null;
  waiting_until: number | null;
};

const fileSig = (path: string): string | null => {
  try { const s = statSync(path); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return null; }
};
const noVoice = (track: LibraryTrack) => {
  const value = track.signals?.vocal_fraction;
  return typeof value === "number" && value < NO_VOICE;
};

/**
 * Works through the library in the background: first every song's own file,
 * then (when switched on) LRCLIB for the rest. Small steps on a timer, so the
 * brain stays responsive; `step()` is also called directly by the tests.
 */
export class LyricsWorker {
  private store: LyricsStore;
  private root: string;
  private library: () => Library;
  private lookup: Lookup;
  private now: () => number;
  private readFile: (path: string) => string | undefined;
  private fileQueue: LibraryTrack[] = [];
  private lookupQueue: LibraryTrack[] = [];
  private queuedFor = "";
  /** Files that couldn't be read in this version of the library (moved or gone): not retried until it changes. */
  private unreadable = new Set<string>();
  private unreadableFor = "";
  private nextLookupAt = 0;
  private timer?: NodeJS.Timeout;
  problem: string | null = null;
  workingOn: Progress["working_on"] = null;

  constructor(options: { store: LyricsStore; root: string; library: () => Library; lookup: Lookup; now?: () => number; readFile?: (path: string) => string | undefined }) {
    this.store = options.store;
    this.root = options.root;
    this.library = options.library;
    this.lookup = options.lookup;
    this.now = options.now ?? Date.now;
    this.readFile = options.readFile ?? ((path) => readTags(path, { lyrics: true }).lyrics);
  }

  /** Work out what's left. Cheap enough to redo when the library or the switch changes. */
  private plan(force = false): void {
    const lib = this.library();
    const key = `${lib.version}:${this.store.state.lookup}`;
    if (!force && key === this.queuedFor) return;
    this.queuedFor = key;
    if (lib.version !== this.unreadableFor) { this.unreadable.clear(); this.unreadableFor = lib.version; }
    const entries = this.store.state.entries;
    this.fileQueue = lib.tracks.filter((track) => track.path && entries[track.id]?.file_sig === undefined && !this.unreadable.has(track.id));
    this.lookupQueue = this.store.state.lookup ? lib.tracks.filter((track) => this.wantsLookup(track)) : [];
  }

  private wantsLookup(track: LibraryTrack): boolean {
    const entry = this.store.state.entries[track.id];
    if (!entry || entry.file_sig === undefined || entry.status !== "none") return false;
    if (!track.title || !track.artist || noVoice(track)) return false;
    return entry.looked_up === undefined || this.now() - entry.looked_up >= LOOK_AGAIN_MS;
  }

  /** Do one small piece of work. Returns false when there's nothing to do right now. */
  async step(): Promise<boolean> {
    this.plan();
    // 1. The songs' own files: a few at a time.
    if (this.fileQueue.length) {
      this.workingOn = "files";
      for (const track of this.fileQueue.splice(0, 25)) {
        const path = join(this.root, track.path!);
        const sig = fileSig(path);
        if (!sig) { this.unreadable.add(track.id); continue; } // gone since the library was read
        const previous = this.store.state.entries[track.id];
        const text = this.readFile(path);
        if (text) this.store.put(track.id, { status: "found", source: "file", file_sig: sig, words: countWords(text), at: this.now() }, text);
        else if (previous?.source === "lrclib") this.store.put(track.id, { ...previous, file_sig: sig });
        else this.store.put(track.id, { status: "none", file_sig: sig, ...(previous?.looked_up ? { looked_up: previous.looked_up } : {}), at: this.now() });
      }
      if (!this.fileQueue.length) {
        this.store.flush();
        this.queuedFor = ""; // plan the lookups now the files are done
      }
      return true;
    }
    // 2. LRCLIB, one song at a time, when switched on.
    if (!this.store.state.lookup || !this.lookupQueue.length) { this.workingOn = null; return false; }
    if (this.now() < this.nextLookupAt) { this.workingOn = "lookup"; return false; }
    const track = this.lookupQueue.shift()!;
    if (!this.wantsLookup(track)) return true;
    this.workingOn = "lookup";
    const answer = await this.lookup({ title: track.title, artist: track.artist!, ...(track.album ? { album: track.album } : {}), ...(track.duration_s ? { duration_s: track.duration_s } : {}) });
    const entry = this.store.state.entries[track.id]!;
    const at = this.now();
    if (answer.kind === "problem") {
      this.problem = answer.message;
      if (answer.retryable) {
        this.lookupQueue.unshift(track);
        this.nextLookupAt = at + BACK_OFF_MS;
      } else {
        this.store.put(track.id, { ...entry, looked_up: at, at });
        this.nextLookupAt = at + LOOKUP_GAP_MS;
      }
      return true;
    }
    this.problem = null;
    this.nextLookupAt = at + LOOKUP_GAP_MS;
    const words = answer.kind === "found" ? cleanLyrics(answer.text) : undefined;
    if (words) this.store.put(track.id, { status: "found", source: "lrclib", file_sig: entry.file_sig!, looked_up: at, words: countWords(words), at }, words);
    else this.store.put(track.id, { status: answer.kind === "instrumental" ? "instrumental" : "none", ...(answer.kind === "instrumental" ? { source: "lrclib" as const } : {}), file_sig: entry.file_sig!, looked_up: at, at });
    if (!this.lookupQueue.length) this.store.flush();
    return true;
  }

  /** Run in the background until stopped. */
  start(): void {
    if (this.timer) return;
    const tick = async () => {
      let busy = false;
      try { busy = await this.step(); } catch (error) { this.problem = (error as Error).message; }
      const wait = busy ? 20 : this.store.state.lookup && this.lookupQueue.length ? Math.max(50, this.nextLookupAt - this.now()) : 60_000;
      this.timer = setTimeout(tick, wait);
      this.timer.unref?.();
    };
    this.timer = setTimeout(tick, 2_000);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.store.flush(); }

  /** The switch: on asks LRCLIB about songs without words in their files. */
  setLookup(on: boolean): void {
    this.store.setLookup(on);
    this.queuedFor = "";
    this.problem = null;
    if (on) this.nextLookupAt = 0;
  }

  progress(): Progress {
    this.plan();
    const lib = this.library();
    const entries = this.store.state.entries;
    let fromFiles = 0, fromLrclib = 0, instrumental = 0, notFound = 0, voiceless = 0;
    for (const track of lib.tracks) {
      const entry = entries[track.id];
      if (!entry || entry.file_sig === undefined) continue;
      if (entry.status === "found") entry.source === "lrclib" ? fromLrclib++ : fromFiles++;
      else if (entry.status === "instrumental") instrumental++;
      else if (noVoice(track)) voiceless++;
      else if (entry.looked_up !== undefined) notFound++;
    }
    return {
      lookup: this.store.state.lookup,
      songs: lib.tracks.length,
      from_files: fromFiles, from_lrclib: fromLrclib, instrumental, not_found: notFound, no_voice: voiceless,
      files_to_read: this.fileQueue.length,
      to_look_up: this.store.state.lookup ? this.lookupQueue.length : lib.tracks.filter((track) => {
        const entry = entries[track.id];
        return entry?.file_sig !== undefined && entry.status === "none" && entry.looked_up === undefined && !!track.title && !!track.artist && !noVoice(track);
      }).length,
      working_on: this.workingOn,
      problem: this.problem,
      waiting_until: this.problem && this.nextLookupAt > this.now() ? this.nextLookupAt : null,
    };
  }
}
