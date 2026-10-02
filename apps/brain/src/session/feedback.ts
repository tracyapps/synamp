/**
 * Explicit feedback and the v1 heuristic re-ranker (dossier ch. 7, "v1").
 *
 * One listener means feedback arrives slowly, so v1 is a handful of readable
 * rules over the event log — no training, and every adjustment comes with the
 * sentence that explains it. Rules:
 *
 *   love ................ strong global boost
 *   thumbs up / down .... in the scope the listener chose (playlist or global)
 *   heard it through .... small boost in that playlist
 *   replayed ............ boost in that playlist
 *   remove .............. hidden from THAT playlist only (undo = restore)
 *   early skip .......... session only; twice in one playlist → small penalty there
 *   global negative ..... only when explicit, or corroborated across ≥ 2 playlists
 *
 * Interruptions, errors and seeks never count. Everything decays: playlist
 * signals with a 30-day half-life, global ones with 180 days.
 *
 * The view is a pure function of the log, so a policy change is a re-derive, and
 * rolling back is switching the function — the events never change.
 */

import { POLICY_VERSION } from "./events.ts";
import type { EventLog, ListeningEvent, Reason, Scope } from "./events.ts";

export type ExplicitSignal = "love" | "thumb_up" | "thumb_down" | "remove" | "restore";
export type FeedbackInput = {
  event_id: string;
  signal: ExplicitSignal;
  track_id: string;
  scope?: Scope;
  playlist_id?: string;
  session_id?: string;
  entry_id?: string;
  reason?: Reason;
};

export class FeedbackError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const SIGNALS: readonly ExplicitSignal[] = ["love", "thumb_up", "thumb_down", "remove", "restore"];
const REASONS: readonly Reason[] = ["wrong_energy", "wrong_vibe", "not_now"];

export function recordFeedback(log: EventLog, input: FeedbackInput): { event: ListeningEvent; duplicate: boolean } {
  if (!input || typeof input !== "object") throw new FeedbackError("Invalid feedback");
  if (typeof input.event_id !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(input.event_id)) throw new FeedbackError("event_id must be 8–80 URL-safe characters");
  const existing = log.get(input.event_id);
  if (existing) return { event: existing, duplicate: true };
  if (!SIGNALS.includes(input.signal)) throw new FeedbackError(`signal must be one of ${SIGNALS.join(", ")}`);
  if (typeof input.track_id !== "string" || !input.track_id || input.track_id.length > 256) throw new FeedbackError("track_id is required");
  const scope: Scope = input.scope ?? (input.signal === "love" ? "global" : input.playlist_id ? "playlist" : "global");
  if (!(["global", "playlist", "session"] as Scope[]).includes(scope)) throw new FeedbackError("scope must be global, playlist or session");
  if (scope === "playlist" && typeof input.playlist_id !== "string") throw new FeedbackError("playlist scope needs playlist_id");
  if ((input.signal === "remove" || input.signal === "restore") && scope !== "playlist") {
    // Remove is aimed at one playlist. A global ban is a different, explicit gesture.
    throw new FeedbackError("remove and restore apply to one playlist (scope: playlist)");
  }
  if (input.reason !== undefined && (!REASONS.includes(input.reason) || !["thumb_down", "remove"].includes(input.signal))) {
    throw new FeedbackError(`reason is only for thumb_down/remove and must be one of ${REASONS.join(", ")}`);
  }
  return log.append({
    id: input.event_id, ts: Date.now(), signal: input.signal, track_id: input.track_id, scope,
    ...(scope === "playlist" ? { scope_id: input.playlist_id } : {}),
    ...(scope === "session" && input.session_id ? { scope_id: input.session_id } : {}),
    ...(input.playlist_id ? { playlist_id: input.playlist_id } : {}),
    ...(input.session_id ? { session_id: input.session_id } : {}),
    ...(input.entry_id ? { entry_id: input.entry_id } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    source: "player", policy_version: POLICY_VERSION,
  });
}

export type Adjustment = { value: number; parts: Array<{ label: string; value: number }> };

export type FeedbackView = {
  policy_version: string;
  events: number;
  /** Tracks hidden from a playlist by an explicit remove (and not restored). */
  removed(playlistId: string): ReadonlySet<string>;
  /** Signed preference for a track, optionally within one playlist. */
  adjust(trackId: string, playlistId?: string): Adjustment;
};

const DAY = 86_400_000;
export const HALF_LIFE_DAYS = { global: 180, playlist: 30 } as const;
const decay = (ts: number, now: number, days: number) => Math.pow(0.5, Math.max(0, now - ts) / (days * DAY));

type Cell = { value: number; parts: Map<string, number> };
const bump = (map: Map<string, Cell>, key: string, label: string, value: number) => {
  const cell = map.get(key) ?? { value: 0, parts: new Map<string, number>() };
  cell.value += value;
  cell.parts.set(label, (cell.parts.get(label) ?? 0) + value);
  map.set(key, cell);
};

export function deriveFeedback(events: readonly ListeningEvent[], now = Date.now()): FeedbackView {
  const removed = new Map<string, Map<string, boolean>>();
  const global = new Map<string, Cell>();
  const playlist = new Map<string, Cell>();
  const earlySkips = new Map<string, number>();
  const negativesBy = new Map<string, Map<string, number>>();
  let count = 0;

  for (const event of [...events].sort((a, b) => a.ts - b.ts)) {
    const t = event.track_id;
    const g = decay(event.ts, now, HALF_LIFE_DAYS.global);
    const p = decay(event.ts, now, HALF_LIFE_DAYS.playlist);
    const pid = event.scope === "playlist" ? event.scope_id : undefined;
    switch (event.signal) {
      case "love": bump(global, t, "you loved this", 2 * g); count++; break;
      case "thumb_up":
        if (pid) bump(playlist, `${pid}\u0000${t}`, "thumbs up here", 1 * p);
        else if (event.scope === "global") bump(global, t, "thumbs up", 1 * g);
        count++;
        break;
      case "thumb_down":
        if (pid) bump(playlist, `${pid}\u0000${t}`, "thumbs down here", -1 * p);
        else if (event.scope === "global") bump(global, t, "thumbs down", -1 * g);
        if (pid) { const m = negativesBy.get(t) ?? new Map(); m.set(pid, event.ts); negativesBy.set(t, m); }
        count++;
        break;
      case "remove": case "restore":
        if (pid) {
          const m = removed.get(pid) ?? new Map<string, boolean>();
          m.set(t, event.signal === "remove");
          removed.set(pid, m);
          const n = negativesBy.get(t) ?? new Map();
          if (event.signal === "remove") n.set(pid, event.ts); else n.delete(pid);
          negativesBy.set(t, n);
        }
        count++;
        break;
      case "full_play": if (pid) bump(playlist, `${pid}\u0000${t}`, "heard it through here", 0.5 * p); count++; break;
      case "repeat": if (pid) bump(playlist, `${pid}\u0000${t}`, "replayed here", 1 * p); count++; break;
      case "skip_early":
        // Session-scoped by itself. Only a pattern inside one playlist counts there.
        if (event.playlist_id) {
          const key = `${event.playlist_id}\u0000${t}`;
          const n = (earlySkips.get(key) ?? 0) + 1;
          earlySkips.set(key, n);
          if (n === 2) bump(playlist, key, "skipped early twice here", -0.6 * p);
        }
        count++;
        break;
      default: break; // interrupted, playback_error, seek, started, exposure, receipt: never preference
    }
  }

  // Promotion: a negative becomes global only when it shows up in two or more playlists.
  for (const [t, byPlaylist] of negativesBy) {
    if (byPlaylist.size >= 2) {
      const latest = Math.max(...byPlaylist.values());
      bump(global, t, `turned down in ${byPlaylist.size} playlists`, -1 * decay(latest, now, HALF_LIFE_DAYS.global));
    }
  }

  return {
    policy_version: POLICY_VERSION,
    events: count,
    removed(playlistId) {
      const m = removed.get(playlistId);
      return new Set(m ? [...m].filter(([, on]) => on).map(([t]) => t) : []);
    },
    adjust(trackId, playlistId) {
      const cells = [global.get(trackId), playlistId ? playlist.get(`${playlistId}\u0000${trackId}`) : undefined].filter((c): c is Cell => !!c);
      const parts = cells.flatMap((cell) => [...cell.parts].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })))
        .filter((part) => part.value !== 0);
      return { value: cells.reduce((sum, cell) => sum + cell.value, 0), parts };
    },
  };
}

/** How much feedback may move a track: bounded, so it re-ranks but never outweighs your request. */
export const FEEDBACK_WEIGHT = 0.15;
export function feedbackBonus(value: number): number { return FEEDBACK_WEIGHT * Math.tanh(value / 2); }
