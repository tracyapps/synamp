/**
 * Append-only listening event log (AGENT-ROADMAP P3, dossier ch. 7).
 *
 * Every play, skip, love or removal is one immutable line. Nothing here is ever
 * edited in place: an "undo" is a new event (`restore`), and everything the
 * re-ranker believes is derived by replaying this file. That is what makes a
 * score explainable and a bad policy reversible.
 *
 * Storage is JSON Lines in a local file — deliberately isolated from the
 * library and the playlist store, and simple enough to inspect by hand. It moves
 * to Postgres with the rest of the brain DB.
 */

import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** Bumped whenever the meaning of a signal or its derivation changes. */
export const POLICY_VERSION = "heuristic-v1";

export type Signal =
  // explicit, intentional
  | "love" | "thumb_up" | "thumb_down" | "remove" | "restore"
  // implicit, derived by the server from playback transitions
  | "full_play" | "skip_early" | "skip_late" | "repeat"
  // reported by another Subsonic app through the proxy: a play it counted, or what it is playing now
  | "external_play" | "now_playing"
  // recorded, but never treated as preference
  | "interrupted" | "playback_error" | "seek" | "started"
  // bookkeeping: proves a player report was applied, so a retry is recognised
  | "receipt"
  // what was shown, for later debiasing
  | "exposure";

export type Scope = "global" | "playlist" | "session" | "none";

/** Optional reason the listener can attach to a negative. */
export type Reason = "wrong_energy" | "wrong_vibe" | "not_now";

export type ListeningEvent = {
  /** Client-supplied for reports (retries dedupe on it); server-made for derived events. */
  id: string;
  ts: number;
  signal: Signal;
  track_id: string;
  scope: Scope;
  /** The playlist for scope "playlist", the session for scope "session". */
  scope_id?: string;
  session_id?: string;
  entry_id?: string;
  /** Where the track came from, whatever the scope (context, not a claim). */
  playlist_id?: string;
  plan_hash?: string;
  rank_shown?: number;
  play_ms?: number;
  duration_ms?: number;
  reason?: Reason;
  source: "player" | "playlist_view" | "server" | "subsonic";
  policy_version: string;
  /** Free-form extras (error text, seek positions). Never used for scoring. */
  detail?: Record<string, string | number | boolean>;
};

export class EventLog {
  private path: string;
  private events: ListeningEvent[] = [];
  private ids = new Map<string, ListeningEvent>();
  /** True when the file ends mid-line (a crash during a write); the next append starts a fresh line. */
  private torn = false;

  constructor(path: string) {
    this.path = path;
    let raw = "";
    try { raw = readFileSync(path, "utf8"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.torn = raw.length > 0 && !raw.endsWith("\n");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as ListeningEvent;
        if (event && typeof event.id === "string" && !this.ids.has(event.id)) { this.events.push(event); this.ids.set(event.id, event); }
      } catch {
        // A torn final line from a crash mid-write is skipped, not fatal.
      }
    }
  }

  has(id: string): boolean { return this.ids.has(id); }
  get(id: string): ListeningEvent | undefined { return this.ids.get(id); }
  all(): readonly ListeningEvent[] { return this.events; }

  /** Durably appends. A repeated id is a retry: the first copy wins and nothing is written. */
  append(event: ListeningEvent): { event: ListeningEvent; duplicate: boolean } {
    const existing = this.ids.get(event.id);
    if (existing) return { event: existing, duplicate: true };
    mkdirSync(dirname(this.path), { recursive: true });
    const fd = openSync(this.path, "a", 0o600);
    try {
      appendFileSync(fd, (this.torn ? "\n" : "") + JSON.stringify(event) + "\n");
      this.torn = false;
      fsyncSync(fd);
    } finally { closeSync(fd); }
    this.events.push(event);
    this.ids.set(event.id, event);
    return { event, duplicate: false };
  }
}
