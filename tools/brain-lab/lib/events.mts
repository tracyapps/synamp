/**
 * brain-lab — synthetic listening-event builders.
 *
 * Long-hand construction of `ListeningEvent` objects that match
 * apps/brain/src/session/events.ts field-for-field (id, ts, signal, track_id,
 * scope, scope_id, session_id, entry_id, playlist_id, plan_hash, rank_shown,
 * play_ms, duration_ms, reason, source, policy_version, detail).
 *
 * Everything is deterministic: ids come from a counter, timestamps from a fixed
 * base + "±Xm" offsets, and defaults mirror how src/session/session.ts records
 * real events (full_play → playlist scope; skips → session scope; explicit
 * feedback → player source). No randomness anywhere in the lab.
 *
 * The lab builds these as plain objects and passes them to pure derivation
 * functions — it never touches an EventLog or any file under apps/brain.
 */

export type LabEvent = {
  id: string;
  ts: number;
  signal: string;
  track_id: string;
  scope: string;
  scope_id?: string;
  session_id?: string;
  entry_id?: string;
  playlist_id?: string;
  plan_hash?: string;
  rank_shown?: number;
  play_ms?: number;
  duration_ms?: number;
  reason?: string;
  source: string;
  policy_version: string;
  detail?: Record<string, string | number | boolean>;
};

export type StreamEntry = {
  signal: string;
  track: string;
  at: string;
  play_ms?: number;
  duration_ms?: number;
  reason?: string;
  scope?: string;
  scope_id?: string;
  source?: string;
  detail?: Record<string, string | number | boolean>;
};

export type StreamSpec = {
  base_ts: string;
  timezone?: string;
  playlist_id?: string;
  session_id?: string;
  plan_hash?: string;
  events: StreamEntry[];
  /** appended after `events` (used by `extends` scenarios to add one marker) */
  events_append?: StreamEntry[];
};

export type StreamContext = {
  playlistId: string;
  sessionId: string;
  planHash: string;
  /** id prefix, e.g. "lab05" */
  idPrefix: string;
  /** policy_version literal for recorded events (historical provenance; keep "heuristic-v1") */
  policyVersion?: string;
};

const OFFSET = /^\+(\d+)([smh])$/;

export function parseOffset(spec: string): number {
  const match = OFFSET.exec(spec);
  if (!match) throw new Error(`bad time offset "${spec}" (expected e.g. "+5m", "+30s", "+16h")`);
  const n = Number(match[1]);
  const unit = match[2];
  return n * (unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000);
}

function defaultsFor(signal: string, entry: StreamEntry, ctx: StreamContext): { scope: string; source: string; scopeId?: string } {
  switch (signal) {
    case "full_play": return { scope: "playlist", source: "server", scopeId: ctx.playlistId };
    case "repeat": return { scope: "playlist", source: "server", scopeId: ctx.playlistId };
    case "skip_early": case "skip_late": return { scope: "session", source: "server", scopeId: ctx.sessionId };
    case "started": case "interrupted": case "playback_error": case "seek": return { scope: "none", source: "server" };
    case "love": return { scope: "global", source: "player" };
    case "thumb_up": case "thumb_down": return { scope: "global", source: "player" };
    case "remove": case "restore": return { scope: "playlist", source: "player", scopeId: ctx.playlistId };
    case "learning_reset": return { scope: "none", source: "server" };
    case "external_play": case "now_playing": return { scope: "global", source: "subsonic" };
    case "exposure": return { scope: "none", source: "server" };
    default: return { scope: "none", source: "server" };
  }
}

/** Build one ListeningEvent, long-hand, with every field filled explicitly. */
export function makeEvent(
  seq: number,
  entry: StreamEntry,
  baseTs: number,
  ctx: StreamContext,
): LabEvent {
  const ts = baseTs + parseOffset(entry.at);
  const fallback = defaultsFor(entry.signal, entry, ctx);
  const scope = entry.scope ?? fallback.scope;
  const source = entry.source ?? fallback.source;
  const scopeId = entry.scope_id ?? fallback.scopeId;
  const id = `${ctx.idPrefix}:${String(seq).padStart(3, "0")}`;
  const playback = ["started", "skip_early", "skip_late", "full_play", "repeat", "interrupted", "playback_error", "seek"].includes(entry.signal);
  return {
    id,
    ts,
    signal: entry.signal,
    track_id: entry.track,
    scope,
    ...(scopeId ? { scope_id: scopeId } : {}),
    session_id: ctx.sessionId,
    ...(playback ? { entry_id: `entry-${String(seq).padStart(3, "0")}` } : {}),
    ...(entry.track ? { playlist_id: ctx.playlistId } : {}),
    ...(playback ? { plan_hash: ctx.planHash } : {}),
    ...(entry.play_ms !== undefined ? { play_ms: entry.play_ms } : {}),
    ...(entry.duration_ms !== undefined ? { duration_ms: entry.duration_ms } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    source,
    policy_version: ctx.policyVersion ?? "heuristic-v1",
    ...(entry.detail ? { detail: entry.detail } : {}),
  };
}

export type BuiltStream = {
  events: LabEvent[];
  baseTs: number;
  endTs: number;
  bySignal: Record<string, number>;
};

/** Build the full event array for a scenario stream. Throws on malformed specs or unknown tracks. */
export function buildStream(spec: StreamSpec, knownTrackIds: ReadonlySet<string>, ctx: StreamContext): BuiltStream {
  const baseTs = Date.parse(spec.base_ts);
  if (!Number.isFinite(baseTs)) throw new Error(`bad base_ts "${spec.base_ts}"`);
  const entries = [...spec.events, ...(spec.events_append ?? [])];
  const events: LabEvent[] = [];
  const bySignal: Record<string, number> = {};
  const ids = new Set<string>();
  let previousTs = -Infinity;
  entries.forEach((entry, index) => {
    if (typeof entry.signal !== "string" || !entry.signal) throw new Error(`entry ${index}: signal is required`);
    if (typeof entry.track !== "string") throw new Error(`entry ${index}: track must be a string (use "" for non-track events)`);
    if (entry.track && !knownTrackIds.has(entry.track)) throw new Error(`entry ${index}: track "${entry.track}" is not in the sample library`);
    const event = makeEvent(index + 1, entry, baseTs, ctx);
    if (ids.has(event.id)) throw new Error(`duplicate event id ${event.id}`);
    ids.add(event.id);
    if (event.ts < previousTs) throw new Error(`entry ${index}: ts goes backwards (${entry.at}) — keep the stream sorted`);
    previousTs = event.ts;
    events.push(event);
    bySignal[event.signal] = (bySignal[event.signal] ?? 0) + 1;
  });
  const endTs = events.length ? Math.max(...events.map((event) => event.ts)) : baseTs;
  return { events, baseTs, endTs, bySignal };
}

/** Resolve a scenario-level `now` ("+29m") against the stream's base timestamp. Exported for checks. */
export function resolveNow(spec: string, baseTs: number): number {
  return baseTs + parseOffset(spec);
}
