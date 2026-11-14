/**
 * What SynAmp is doing right now, in one small answer: for the menu-bar icon,
 * and later a phone or a widget. Like a VPN's status line: is the music
 * there, is anything playing, how far has listening got, is Listen anywhere on.
 *
 * Only facts SynAmp already has; this asks nothing of the disk or the network.
 */

import { SESSION_STALE_MS, STREAM_RECENT_MS } from "./activity.ts";

export type StatusInput = {
  now: number;
  session: { state: "idle" | "playing" | "paused"; updated_at: number; current?: { title: string; artist?: string } } | null;
  lastStreamAt: number | null;
  /** The latest progress report from listening (analysis), as the Library panel sees it. */
  analysis: {
    reported: boolean; stale?: boolean; state?: string;
    catalog?: { present?: number }; analysed_once?: number; queue?: { failed?: number };
    run?: { eta_seconds?: number | null };
  };
  /** The listening worker's last hello: can it see the music? */
  worker: { online?: boolean; library_ok?: boolean; away?: boolean; problem?: string } | null;
  /** Listen anywhere: the name the server answers to away from home, once set up. */
  anywhere: { tailscale_name?: string };
};

export type SystemStatus = {
  /** SynAmp's own player. Null: nothing playing or paused. */
  player: { state: "playing" | "paused"; title: string; artist?: string } | null;
  /** A phone app played through SynAmp in the last few minutes. */
  phone: boolean;
  /** Listening to the library. Null: nothing has reported yet. */
  listening: { active: boolean; done: number; total: number; eta_seconds: number | null } | null;
  /** Can the music be reached? Null: not known (listening isn't running to say). */
  music: { ok: boolean; away: boolean; problem?: string } | null;
  /** Listen anywhere. `name` is the address away from home, when it's set up. */
  anywhere: { ready: boolean; name?: string };
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

export function systemStatus({ now, session, lastStreamAt, analysis, worker, anywhere }: StatusInput): SystemStatus {
  const fresh = session && session.state !== "idle" && session.current && now - session.updated_at < SESSION_STALE_MS;
  const player = fresh
    ? { state: session.state as "playing" | "paused", title: session.current!.title, ...(session.current!.artist ? { artist: session.current!.artist } : {}) }
    : null;

  let listening: SystemStatus["listening"] = null;
  if (analysis.reported) {
    const failed = count(analysis.queue?.failed);
    // Songs that can't be read will never be done: leave them out of the total.
    const total = Math.max(0, count(analysis.catalog?.present) - failed);
    const done = Math.min(count(analysis.analysed_once), total);
    const active = analysis.state === "analyzing" && analysis.stale !== true;
    const eta = analysis.run?.eta_seconds;
    listening = { active, done, total, eta_seconds: active && typeof eta === "number" && Number.isFinite(eta) && eta >= 0 ? eta : null };
  }

  const music = worker?.online
    ? { ok: worker.library_ok === true, away: worker.away === true, ...(worker.library_ok !== true && worker.problem ? { problem: worker.problem } : {}) }
    : null;

  const name = anywhere.tailscale_name?.trim();
  return {
    player,
    phone: lastStreamAt !== null && now - lastStreamAt < STREAM_RECENT_MS,
    listening,
    music,
    anywhere: name ? { ready: true, name } : { ready: false },
  };
}
