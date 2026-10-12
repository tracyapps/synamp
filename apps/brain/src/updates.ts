/**
 * "A new SynAmp is available": the check-and-tell half of a Sparkle-style updater.
 *
 * Twice a day the brain reads SynAmp's public list of releases on GitHub and
 * compares it with the version it is running. It sends nothing about the
 * person or their music: a plain request with a generic User-Agent, which
 * GitHub requires. It never checks when Settings turns update checks off, nor
 * on a copy built on the NAS (no release number to compare).
 *
 * Installing stays with the person (unzip the release, then Build); this only
 * says when there's something to install and what changed. Skip this version
 * and Remind me later are kept here, so every device agrees.
 */

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { loadUserState } from "./state-loading.ts";
import { releaseVersion } from "./version.ts";

export type Release = { version: string; name: string; notes: string; url: string; published_at: string; prerelease: boolean };

type Saved = {
  skipped?: string;
  remind_after?: number;
  /** The one-time note saying that SynAmp checks for updates and what it sends. */
  notice_seen?: boolean;
  checked_at?: number;
  /** Newest stable release, and newest including betas, from the last check. */
  latest?: Release | null;
  latest_beta?: Release | null;
  error?: string;
};

export type UpdateView = {
  enabled: boolean;
  beta: boolean;
  /** The release number running, or null on a copy built on the NAS (nothing to compare). */
  current: string | null;
  /** Newer than current, allowed by the beta switch, and not skipped or put off. */
  available: Release | null;
  /** Newer than current, even if skipped or put off (for About this install). */
  newer: Release | null;
  skipped: string | null;
  remind_after: number | null;
  checked_at: number | null;
  error: string | null;
  show_notice: boolean;
};

type Parsed = { core: [number, number, number]; pre: string[] };
function parse(version: string): Parsed | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/.exec(version);
  return match ? { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split(".") : [] } : null;
}

/** Semantic version order: 1.2.0-beta.2 < 1.2.0-beta.10 < 1.2.0 < 1.2.1. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a), y = parse(b);
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! - y.core[i]!;
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** The newest published release from GitHub's list; pre-releases only when asked for. */
export function newestRelease(list: unknown, beta: boolean): Release | null {
  if (!Array.isArray(list)) throw new Error("the release list wasn't a list");
  let best: Release | null = null;
  for (const item of list as Array<Record<string, unknown>>) {
    if (!item || item.draft === true) continue;
    const version = releaseVersion(typeof item.tag_name === "string" ? item.tag_name : undefined);
    if (!version) continue;
    const prerelease = item.prerelease === true || version.includes("-");
    if (prerelease && !beta) continue;
    const url = typeof item.html_url === "string" && /^https:\/\/github\.com\//.test(item.html_url) ? item.html_url : "https://github.com/tracyapps/synamp/releases";
    const release: Release = {
      version, prerelease, url,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : `SynAmp ${version}`,
      notes: typeof item.body === "string" ? item.body.slice(0, 20_000) : "",
      published_at: typeof item.published_at === "string" ? item.published_at : "",
    };
    if (!best || compareVersions(version, best.version) > 0) best = release;
  }
  return best;
}

const TWELVE_HOURS = 12 * 60 * 60_000;
const REMIND_DAYS = 3;

export class UpdateCheck {
  private path: string;
  private saved: Saved;
  private feedUrl: string;
  private fetcher: typeof fetch;
  private current: () => string | undefined;
  private enabled: () => boolean;
  private beta: () => boolean;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<UpdateView>;

  constructor(options: { path: string; feedUrl: string; current: () => string | undefined; enabled: () => boolean; beta: () => boolean; fetcher?: typeof fetch }) {
    this.path = options.path;
    this.feedUrl = options.feedUrl;
    this.current = options.current;
    this.enabled = options.enabled;
    this.beta = options.beta;
    this.fetcher = options.fetcher ?? fetch;
    this.saved = loadUserState<Saved>(this.path, "synamp.updates/1", []);
  }

  /** May this install check at all? Only a release install with checks on. */
  private active(): boolean { return this.enabled() && !!this.current(); }

  view(now = Date.now()): UpdateView {
    const current = this.current() ?? null;
    const beta = this.beta();
    let newer = (beta ? this.saved.latest_beta ?? this.saved.latest : this.saved.latest) ?? null;
    if (newer && (!current || compareVersions(newer.version, current) <= 0)) newer = null;
    const putOff = (this.saved.remind_after ?? 0) > now;
    const available = newer && this.enabled() && newer.version !== this.saved.skipped && !putOff ? newer : null;
    return {
      enabled: this.enabled(), beta, current, available, newer,
      skipped: this.saved.skipped ?? null,
      remind_after: putOff ? this.saved.remind_after! : null,
      checked_at: this.saved.checked_at ?? null,
      error: this.saved.error ?? null,
      show_notice: !!current && this.enabled() && !this.saved.notice_seen,
    };
  }

  /** Ask GitHub now. Never throws: a failed check is shown as such and tried again later. */
  check(now = () => Date.now()): Promise<UpdateView> {
    if (!this.active()) return Promise.resolve(this.view());
    this.running ??= (async () => {
      try {
        const response = await this.fetcher(this.feedUrl, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "SynAmp-update-check" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? "GitHub asked us to slow down" : `GitHub answered ${response.status}`);
        const list = await response.json();
        this.save({ ...this.saved, latest: newestRelease(list, false), latest_beta: newestRelease(list, true), checked_at: now(), error: undefined });
      } catch (error) {
        const message = error instanceof Error && error.name === "TimeoutError" ? "GitHub didn't answer in time" : error instanceof Error ? error.message : "the check failed";
        this.save({ ...this.saved, checked_at: now(), error: `Couldn't check for updates: ${message}.` });
      }
      return this.view(now());
    })().finally(() => { this.running = undefined; });
    return this.running;
  }

  skip(version: string): UpdateView {
    if (!releaseVersion(version)) throw new UpdateError("That isn't a version number");
    this.save({ ...this.saved, skipped: releaseVersion(version), remind_after: undefined });
    return this.view();
  }

  remindLater(now = Date.now()): UpdateView {
    this.save({ ...this.saved, remind_after: now + REMIND_DAYS * 24 * 60 * 60_000 });
    return this.view(now);
  }

  noticeSeen(): UpdateView {
    this.save({ ...this.saved, notice_seen: true });
    return this.view();
  }

  /** First check a minute after starting, then twice a day. Checks off: no requests at all. */
  start(firstDelayMs = 60_000, everyMs = TWELVE_HOURS): void {
    this.stop();
    const tick = () => {
      void this.check().finally(() => { this.timer = setTimeout(tick, everyMs); this.timer.unref?.(); });
    };
    this.timer = setTimeout(tick, firstDelayMs);
    this.timer.unref?.();
  }

  stop(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  private save(next: Saved): void {
    this.saved = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as Saved;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify({ format: "synamp.updates/1", ...this.saved }) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }
}

export class UpdateError extends Error {
  status = 400;
}
