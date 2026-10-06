/**
 * The server-owned playback session (ARCHITECTURE §11, AGENT-ROADMAP P3).
 *
 * Players are thin: they *report* what physically happened (started, ended,
 * skipped, seeked, failed) and the server decides what it means. That keeps the
 * interpretation in one replayable place and makes every client — the web
 * player today, a party display or a Subsonic bridge later — agree.
 *
 * Two promises:
 *   - A queue is a SNAPSHOT. Starting a playlist copies its tracks; a smart
 *     playlist that changes membership later does not reshuffle what is playing.
 *   - Not every stop is a dislike. Errors, seeks, interruptions and replacing
 *     the queue are recorded but never become negative feedback.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { POLICY_VERSION } from "./events.ts";
import type { EventLog, ListeningEvent, Scope, Signal } from "./events.ts";

export type QueueEntry = {
  entry_id: string;
  track_id: string;
  title: string;
  artist?: string;
  source?: { playlist_id: string; plan_hash?: string; rank: number };
  /** A party guest asked for it (their name, if they gave one). */
  requested_by?: string;
};

export type Session = {
  id: string;
  queue: QueueEntry[];
  /** Index of the current entry; equals queue.length when the queue is finished. */
  index: number;
  state: "idle" | "playing" | "paused";
  current?: { entry_id: string; played_ms: number; duration_ms?: number; started_at: number };
  /** Entries that reached a full play in this session (for repeat detection). */
  completed: string[];
  updated_at: number;
  policy_version: string;
};

export type Report =
  | { type: "start"; entry_id: string; duration_ms?: number }
  | { type: "progress"; entry_id: string; played_ms: number }
  | { type: "seek"; entry_id: string; from_ms: number; to_ms: number }
  | { type: "pause" | "resume"; entry_id: string }
  | { type: "ended"; entry_id: string; played_ms: number; duration_ms?: number }
  | { type: "skip"; entry_id: string; played_ms: number; duration_ms?: number }
  | { type: "previous"; entry_id?: string; played_ms?: number }
  | { type: "jump"; index: number; entry_id?: string; played_ms?: number }
  | { type: "error"; entry_id: string; message?: string }
  | { type: "stop" };

export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Early-skip threshold: an absolute floor and a relative one, so short tracks are not punished. */
export const EARLY_SKIP_MS = 30_000;
export const EARLY_SKIP_FRACTION = 0.25;
/** Leaving after this much of a track counts as hearing it through. */
export const PLAY_THROUGH_FRACTION = 0.8;

export function classifyStop(playedMs: number, durationMs?: number): "skip_early" | "skip_late" | "full_play" {
  if (durationMs && durationMs > 0) {
    if (playedMs >= PLAY_THROUGH_FRACTION * durationMs) return "full_play";
    return playedMs < Math.min(EARLY_SKIP_MS, EARLY_SKIP_FRACTION * durationMs) ? "skip_early" : "skip_late";
  }
  return playedMs < EARLY_SKIP_MS ? "skip_early" : "skip_late";
}

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export class SessionStore {
  private path: string;
  private log: EventLog;
  private session: Session;

  constructor(path: string, log: EventLog) {
    this.path = path;
    this.log = log;
    try {
      this.session = JSON.parse(readFileSync(path, "utf8")) as Session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.session = this.fresh();
    }
  }

  private fresh(): Session {
    return { id: randomUUID(), queue: [], index: 0, state: "idle", completed: [], updated_at: Date.now(), policy_version: POLICY_VERSION };
  }

  get(): Session { return structuredClone(this.session); }

  private save(): void {
    this.session.updated_at = Date.now();
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(this.session, null, 2) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  private record(id: string, signal: Signal, entry: QueueEntry, extra: Partial<ListeningEvent> = {}): ListeningEvent {
    const scope: Scope = extra.scope ?? "none";
    return this.log.append({
      id, ts: Date.now(), signal, track_id: entry.track_id, scope,
      ...(scope === "session" ? { scope_id: this.session.id } : {}),
      ...(scope === "playlist" && entry.source ? { scope_id: entry.source.playlist_id } : {}),
      session_id: this.session.id, entry_id: entry.entry_id,
      ...(entry.source ? { playlist_id: entry.source.playlist_id, rank_shown: entry.source.rank } : {}),
      ...(entry.source?.plan_hash ? { plan_hash: entry.source.plan_hash } : {}),
      source: "server", policy_version: POLICY_VERSION,
      ...extra,
    }).event;
  }

  private currentEntry(): QueueEntry | undefined { return this.session.queue[this.session.index]; }

  /** Closes the current entry without a preference: something else took over. */
  private interrupt(reportId: string): void {
    const entry = this.currentEntry();
    if (entry && this.session.current?.entry_id === entry.entry_id) {
      this.record(`${reportId}:interrupted`, "interrupted", entry, { play_ms: this.session.current.played_ms });
    }
    this.session.current = undefined;
  }

  /** Replace the queue with a snapshot of `tracks`. Exposure is logged; nothing is inferred from it. */
  replaceQueue(reportId: string, tracks: Array<{ id: string; title: string; artist?: string }>, source?: { playlist_id: string; plan_hash?: string }, startIndex = 0): Session {
    if (typeof reportId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(reportId)) throw new SessionError("event_id must be 8–80 URL-safe characters");
    if (this.log.has(`${reportId}:queued`)) return this.get();
    if (!tracks.length) throw new SessionError("Nothing to play in that playlist");
    this.interrupt(reportId);
    this.session.queue = tracks.slice(0, 2000).map((track, rank) => ({
      entry_id: randomUUID(), track_id: track.id, title: track.title,
      ...(track.artist ? { artist: track.artist } : {}),
      ...(source ? { source: { ...source, rank } } : {}),
    }));
    this.session.index = Math.min(Math.max(0, Math.trunc(startIndex)), this.session.queue.length - 1);
    this.session.state = "paused";
    this.session.completed = [];
    for (const entry of this.session.queue) {
      // Deterministic ranking: record what was shown and where. No propensity is invented.
      this.record(`${reportId}:exposure:${entry.source?.rank ?? entry.entry_id}`, "exposure", entry, { detail: { policy: "deterministic_rank" } });
    }
    this.record(`${reportId}:queued`, "exposure", this.session.queue[this.session.index]!, { detail: { queued: this.session.queue.length } });
    this.save();
    return this.get();
  }

  /**
   * Put tracks right after the current one (or at the end of a finished
   * queue, where they become current). The rest of the queue is untouched.
   */
  playNext(reportId: string, tracks: Array<{ id: string; title: string; artist?: string; requested_by?: string }>, options: { afterRequests?: boolean } = {}): Session {
    if (typeof reportId !== "string" || !/^[A-Za-z0-9_:-]{8,120}$/.test(reportId)) throw new SessionError("event_id must be 8–120 URL-safe characters");
    if (this.log.has(`${reportId}:next`)) return this.get();
    if (!tracks.length) throw new SessionError("Nothing to add");
    const entries: QueueEntry[] = tracks.slice(0, 200).map((track) => ({
      entry_id: randomUUID(), track_id: track.id, title: track.title,
      ...(track.artist ? { artist: track.artist } : {}), ...(track.requested_by ? { requested_by: track.requested_by.slice(0, 40) } : {}),
    }));
    let at = this.session.index >= this.session.queue.length ? this.session.queue.length : this.session.index + 1;
    // Party requests line up behind the ones already waiting, first come first served.
    if (options.afterRequests) while (at < this.session.queue.length && this.session.queue[at]!.requested_by !== undefined) at++;
    this.session.queue.splice(at, 0, ...entries);
    if (this.session.queue.length > 2000) this.session.queue.length = 2000;
    entries.forEach((entry, offset) => this.record(`${reportId}:next:${offset}`, "exposure", entry, { detail: { policy: "play_next" } }));
    this.log.append({ id: `${reportId}:next`, ts: Date.now(), signal: "receipt", track_id: entries[0]!.track_id, scope: "none", session_id: this.session.id, source: "server", policy_version: POLICY_VERSION });
    this.save();
    return this.get();
  }

  /** Apply one player report. Retries (same id) change nothing and return the current state. */
  report(id: string, input: unknown): { session: Session; derived: ListeningEvent[]; duplicate: boolean } {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new SessionError("event_id must be 8–80 URL-safe characters");
    if (this.log.has(id)) return { session: this.get(), derived: [], duplicate: true };
    const report = input as Report;
    if (!report || typeof report !== "object" || typeof report.type !== "string") throw new SessionError("Invalid report");
    const derived: ListeningEvent[] = [];
    const entry = this.currentEntry();
    const s = this.session;
    const mustBeCurrent = (entryId: unknown) => {
      if (!entry || entryId !== entry.entry_id) throw new SessionError("That report is for a track that is no longer current", 409);
      return entry;
    };
    const played = (value: unknown) => {
      const reported = num(value) ? value : 0;
      const cap = s.current?.duration_ms ? s.current.duration_ms + 5000 : Infinity;
      return Math.min(cap, Math.max(s.current?.played_ms ?? 0, reported));
    };
    const advance = () => { s.index = Math.min(s.index + 1, s.queue.length); s.current = undefined; s.state = s.index < s.queue.length ? s.state : "idle"; };
    const scopeFor = (e: QueueEntry): Scope => (e.source ? "playlist" : "session");

    switch (report.type) {
      case "start": {
        const e = mustBeCurrent(report.entry_id);
        const duration = num(report.duration_ms) && report.duration_ms > 0 ? report.duration_ms : undefined;
        s.current = { entry_id: e.entry_id, played_ms: 0, started_at: Date.now(), ...(duration ? { duration_ms: duration } : {}) };
        s.state = "playing";
        derived.push(this.log.append({ id, ts: Date.now(), signal: "started", track_id: e.track_id, scope: "none", session_id: s.id, entry_id: e.entry_id,
          ...(e.source ? { playlist_id: e.source.playlist_id } : {}), source: "player", policy_version: POLICY_VERSION, ...(duration ? { duration_ms: duration } : {}) }).event);
        break;
      }
      case "progress": {
        mustBeCurrent(report.entry_id);
        if (s.current) s.current.played_ms = played(report.played_ms);
        // Heartbeats are not logged as events; they only keep play time current.
        this.save();
        return { session: this.get(), derived: [], duplicate: false };
      }
      case "pause": case "resume": {
        mustBeCurrent(report.entry_id);
        s.state = report.type === "pause" ? "paused" : "playing";
        break;
      }
      case "seek": {
        const e = mustBeCurrent(report.entry_id);
        derived.push(this.record(id, "seek", e, { source: "player", detail: { from_ms: Number(report.from_ms) || 0, to_ms: Number(report.to_ms) || 0 } }));
        break;
      }
      case "ended": case "skip": case "jump": {
        const e = report.type === "jump" ? entry : mustBeCurrent(report.entry_id);
        if (report.type === "jump" && (!Number.isInteger(report.index) || report.index < 0 || report.index >= s.queue.length)) {
          throw new SessionError("Queue position not found", 404);
        }
        if (e && s.current?.entry_id === e.entry_id) {
          const playMs = played(report.played_ms);
          const duration = (num((report as { duration_ms?: number }).duration_ms) && (report as { duration_ms?: number }).duration_ms) || s.current.duration_ms;
          const signal = report.type === "ended" ? "full_play" : classifyStop(playMs, duration);
          // A skip is about this moment: session scope. Hearing it through is about this playlist.
          const scope: Scope = signal === "full_play" ? scopeFor(e) : "session";
          derived.push(this.record(`${id}:${signal}`, signal, e, { scope, play_ms: playMs, ...(duration ? { duration_ms: duration } : {}) }));
          if (signal === "full_play") s.completed.push(e.entry_id);
        }
        if (report.type === "jump") { s.index = report.index; s.current = undefined; } else advance();
        break;
      }
      case "previous": {
        if (entry && s.current?.entry_id === entry.entry_id && num(report.played_ms) && report.played_ms > 3000) {
          // Like every player: "previous" mid-track restarts it. Not a preference.
          s.current = { ...s.current, played_ms: 0 };
          break;
        }
        if (entry && s.current?.entry_id === entry.entry_id) this.interrupt(id);
        s.index = Math.max(0, Math.min(s.index, s.queue.length) - 1);
        const back = this.currentEntry();
        if (back && s.completed.includes(back.entry_id)) {
          // Going back to something you just heard all the way through is a replay.
          derived.push(this.record(`${id}:repeat`, "repeat", back, { scope: scopeFor(back) }));
        }
        break;
      }
      case "error": {
        const e = mustBeCurrent(report.entry_id);
        // A file that will not play says nothing about taste. Record it and move on.
        derived.push(this.record(id, "playback_error", e, { source: "player", detail: { message: String(report.message ?? "").slice(0, 300) } }));
        advance();
        break;
      }
      case "stop": {
        this.interrupt(id);
        s.state = "paused";
        break;
      }
      default:
        throw new SessionError(`Unknown report type "${String((report as { type: unknown }).type)}"`);
    }
    if (!this.log.has(id)) {
      // Every accepted report leaves a trace under its own id, so a retry is recognised.
      this.log.append({ id, ts: Date.now(), signal: "receipt", track_id: entry?.track_id ?? "", scope: "none", session_id: s.id, source: "player",
        policy_version: POLICY_VERSION, detail: { receipt: report.type } });
    }
    this.save();
    return { session: this.get(), derived, duplicate: false };
  }
}
