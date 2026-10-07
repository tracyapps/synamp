/**
 * Epoch resolution (A3 §3.1, mainline decision 2).
 *
 * An epoch is the unit of "same listening context". The server session id is
 * NOT an epoch — it is minted once per installation and spans days (A4 §2.3) —
 * so epochs are derived from the event log instead:
 *
 *   break between consecutive events (sorted by (ts, id)) iff any of:
 *     b1 session change — the effective session key differs. Events with no
 *        session_id (e.g. Subsonic-captured plays) are their OWN bucket and are
 *        never merged into a session's epoch (dispatch rule);
 *     b2 idle gap > 30 min (web-analytics sessionization convention);
 *     b3 local-day change in the configured IANA timezone.
 *
 * Dayparts are local-time labels (morning 05–12 / afternoon 12–17 / evening
 * 17–22 / night 22–05, decision 2). They never split epochs; they are context.
 *
 * Everything here is pure: same events + same timezone ⇒ same epochs, byte for
 * byte. Default timezone is the server's local zone via Intl; tests pin one.
 */

import { createHash } from "node:crypto";
import type { ListeningEvent } from "../session/events.ts";
import type { Daypart, Epoch, EpochContext } from "./types.ts";

/** b2: a gap strictly greater than this splits (29:59 ⇒ same, 30:01 ⇒ split). */
export const IDLE_GAP_MS = 30 * 60_000;
/** P4/G_live: an epoch that ended ≤ this ago is still "this moment". */
export const LIVE_WINDOW_MS = 30 * 60_000;

/** Effective session key: missing/empty ids are their own equivalence class. */
const MISSING_SESSION = "\u0000missing";
const sessionKey = (event: ListeningEvent): string => (event.session_id ? event.session_id : MISSING_SESSION);

/** Total, deterministic order: (ts, id) with code-unit id comparison. */
export function compareEvents(a: ListeningEvent, b: ListeningEvent): number {
  return a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: undefined, // set per call
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
};

function formatterFor(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", { ...FORMAT, timeZone: timezone });
}

/** Resolves an IANA timezone; invalid names throw (fail loudly, never guess). */
export function resolveTimezone(timezone?: string): string {
  if (timezone && timezone.trim()) {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function zoneOf(formatter: Intl.DateTimeFormat, ts: number): { day: string; hour: number } {
  let year = "";
  let month = "";
  let day = "";
  let hour = "";
  for (const part of formatter.formatToParts(ts)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
    else if (part.type === "hour") hour = part.value;
  }
  return { day: `${year}-${month}-${day}`, hour: Number.parseInt(hour, 10) };
}

/** Decision 2: morning 05–12 / afternoon 12–17 / evening 17–22 / night 22–05 (local). */
export function daypartForHour(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Daypart of a timestamp in the given IANA timezone (default: server local). */
export function daypartOf(ts: number, timezone?: string): Daypart {
  return daypartForHour(zoneOf(formatterFor(resolveTimezone(timezone)), ts).hour);
}

/** Local calendar date (YYYY-MM-DD) of a timestamp in the given timezone. */
export function localDateOf(ts: number, timezone?: string): string {
  return zoneOf(formatterFor(resolveTimezone(timezone)), ts).day;
}

/** epoch_id = "ep1:" + sha256hex(t_start, t_end, first_event_id)[0..15]. */
export function epochIdFor(tStart: number, tEnd: number, firstEventId: string): string {
  const hex = createHash("sha256").update(`${tStart}\u0000${tEnd}\u0000${firstEventId}`).digest("hex");
  return `ep1:${hex.slice(0, 15)}`;
}

export type EpochRun = { epoch: Epoch; events: ListeningEvent[] };

/**
 * Resolves maximal runs of events that share one listening context.
 * Events with a non-finite `ts` are ignored (torn input never breaks a replay).
 */
export function resolveEpochRuns(events: readonly ListeningEvent[], opts: { timezone?: string } = {}): EpochRun[] {
  const formatter = formatterFor(resolveTimezone(opts.timezone));
  const sorted = [...events].sort(compareEvents);

  const runs: EpochRun[] = [];
  let current: ListeningEvent[] = [];
  let prev: { ts: number; key: string; day: string } | undefined;

  const close = () => {
    if (!current.length) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    const start = zoneOf(formatter, first.ts);
    const sessionIds = [...new Set(current.map((event) => event.session_id).filter((id): id is string => !!id))].sort();
    runs.push({
      epoch: {
        id: epochIdFor(first.ts, last.ts, first.id),
        t_start: first.ts,
        t_end: last.ts,
        first_event_id: first.id,
        event_count: current.length,
        session_ids: sessionIds,
        daypart: daypartForHour(start.hour),
        date: start.day,
      },
      events: current,
    });
    current = [];
  };

  for (const event of sorted) {
    if (!Number.isFinite(event.ts)) continue;
    const day = zoneOf(formatter, event.ts).day;
    const key = sessionKey(event);
    if (prev && (key !== prev.key || event.ts - prev.ts > IDLE_GAP_MS || day !== prev.day)) close();
    current.push(event);
    prev = { ts: event.ts, key, day };
  }
  close();
  return runs;
}

/** Just the epochs (see resolveEpochRuns for the events per epoch). */
export function resolveEpochs(events: readonly ListeningEvent[], opts: { timezone?: string } = {}): Epoch[] {
  return resolveEpochRuns(events, opts).map((run) => run.epoch);
}

/**
 * The active epoch at `now`: the last epoch that has ENDED by `now` and ended
 * no more than the live window ago; null when the moment has passed.
 *
 * `t_end > now` epochs (possible only with future-dated events, e.g. a replay
 * test) are skipped — an epoch never becomes active before it starts, which is
 * also what keeps appended later-day events out of a derived past moment.
 */
export function activeEpoch(epochs: readonly Epoch[], now: number): Epoch | null {
  for (let index = epochs.length - 1; index >= 0; index--) {
    const epoch = epochs[index]!;
    if (epoch.t_end > now) continue;
    return now - epoch.t_end <= LIVE_WINDOW_MS ? epoch : null;
  }
  return null;
}

/** Display context for the active epoch (or the honest "paused" state). */
export function activeEpochContext(epochs: readonly Epoch[], now: number): EpochContext {
  const epoch = activeEpoch(epochs, now);
  if (!epoch) {
    return { epoch: null, daypart: null, date: null, minutes_since_activity: null, note: "no active session — learning is paused" };
  }
  return {
    epoch,
    daypart: epoch.daypart,
    date: epoch.date,
    minutes_since_activity: Math.round((now - epoch.t_end) / 60_000),
    note: `listening in the ${epoch.daypart}`,
  };
}
