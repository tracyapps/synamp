/**
 * "Listen anywhere": the guided setup for Phase 1 — your music on your phone,
 * at home and away, through any Subsonic app.
 *
 * Most steps happen outside SynAmp (a Navidrome account, Tailscale, an app on
 * the phone), so they are a checklist you tick. Two are checked for real:
 * whether Navidrome answers, and whether plays from other apps have arrived
 * (which proves an app is connected through SynAmp, not straight to Navidrome).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export class SetupError extends Error {
  status = 400;
}

/** The steps you tick yourself (the others are checked automatically). */
export const MANUAL_STEPS = ["navidrome_account", "tailscale_nas", "tailscale_phone", "app_installed", "away_test"] as const;
export type ManualStep = (typeof MANUAL_STEPS)[number];
type State = {
  format: "synamp.setup/1";
  done: Partial<Record<ManualStep, number>>;
  /** The NAS's name on your tailnet (e.g. "syd" or "syd.tail1234.ts.net"). */
  tailscale_name?: string;
};

/** A host name: letters, digits, hyphens and dots — no scheme, port or path. */
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export class SetupStore {
  private path: string;
  state: State;
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.setup/1", done: loaded.done ?? {}, ...(loaded.tailscale_name ? { tailscale_name: loaded.tailscale_name } : {}) };
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  update(input: Record<string, unknown>, now = Date.now()): void {
    if (input.step !== undefined) {
      if (!MANUAL_STEPS.includes(input.step as ManualStep)) throw new SetupError(`step must be one of ${MANUAL_STEPS.join(", ")}`);
      if (typeof input.done !== "boolean") throw new SetupError("done must be true or false");
      if (input.done) this.state.done[input.step as ManualStep] = now;
      else delete this.state.done[input.step as ManualStep];
    }
    if (input.tailscale_name !== undefined) {
      if (typeof input.tailscale_name !== "string") throw new SetupError("tailscale_name must be text");
      // People paste whole addresses: keep just the name.
      const name = input.tailscale_name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
      if (name && !HOST.test(name)) throw new SetupError("That doesn't look like a device name — it's something like syd or syd.tail1234.ts.net");
      if (name) this.state.tailscale_name = name; else delete this.state.tailscale_name;
    }
    this.save();
  }
}

/** Does Navidrome answer? (Its /ping needs no account.) */
export async function pingCore(coreUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 3000): Promise<{ ok: boolean; problem?: string }> {
  try {
    const response = await fetchImpl(`${coreUrl.replace(/\/$/, "")}/ping`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? { ok: true } : { ok: false, problem: `Navidrome answered HTTP ${response.status}` };
  } catch {
    return { ok: false, problem: "Navidrome isn't answering — it may be stopped, or still starting" };
  }
}

/** Plays that other apps reported through SynAmp: which apps, how many, when last. */
export function otherAppPlays(events: ReadonlyArray<{ source?: string; signal: string; ts: number; detail?: Record<string, unknown> }>) {
  const clients = new Map<string, { plays: number; last_at: number }>();
  for (const event of events) {
    if (event.source !== "subsonic" || (event.signal !== "external_play" && event.signal !== "now_playing")) continue;
    const name = typeof event.detail?.client === "string" ? event.detail.client : "an app";
    const entry = clients.get(name) ?? { plays: 0, last_at: 0 };
    entry.plays++;
    entry.last_at = Math.max(entry.last_at, event.ts);
    clients.set(name, entry);
  }
  return [...clients.entries()].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.last_at - a.last_at);
}
