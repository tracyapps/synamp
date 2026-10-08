/**
 * The analyzer, driven from the web app.
 *
 * The analyzer runs on the Mac as a background worker (`synamp-analyze worker`,
 * started at login). Like the librarian, it asks the brain for work; the web
 * app's Library strip puts commands in the queue ("Scan for changes",
 * "Start analysis", "Pause"). After the librarian applies a batch, an
 * "update" (scan + export) is queued automatically, so moved and new files are
 * picked up without anyone opening a Terminal.
 */

import { isSafeRelative } from "./naming.ts";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export class AnalyzerError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const ACTIONS = ["update", "scan", "export", "analyze"] as const;
export type Action = (typeof ACTIONS)[number];
export type Command = {
  id: string;
  action: Action;
  requested_by: "you" | "the librarian";
  status: "queued" | "running" | "done" | "failed" | "stopped" | "cancelled";
  created_at: number;
  claimed_at?: number;
  finished_at?: number;
  summary?: string;
  stop?: boolean;
  /** What the worker is busy with inside this command (e.g. updating the library list), while it lasts. */
  activity?: Activity;
};
export type Activity = { kind: "export"; done?: number; total?: number; at: number };
export type WorkerSeen = {
  last_seen: number; host?: string; version?: string; state?: string;
  library_path?: string; library_ok?: boolean; export_path?: string; journal?: string; problem?: string;
  /** The Mac: total memory (GB) and cores, for the memory setting. */
  memory_gb?: number; cores?: number;
  /** What analysis is allowed right now, as the worker worked it out (it knows the clock and whether you're at the Mac). */
  memory_now?: { gb: number; songs: number; why: "normal" | "hours" | "away"; at: number };
};

/**
 * How much of the Mac analysis may use (Settings → Analysis on your Mac).
 * `normal_gb` all the time, or more (`more_gb`) at set hours or while you're away
 * from the Mac. Null = SynAmp's recommendation for that Mac. The worker applies it.
 */
export type MemorySettings = {
  mode: "steady" | "hours" | "away";
  normal_gb: number | null;
  more_gb: number | null;
  /** "22:00"–"07:00" on the Mac's own clock; may run past midnight. */
  from: string;
  to: string;
  /** Minutes without keyboard or mouse before "away" counts. */
  away_minutes: number;
};
export const DEFAULT_MEMORY: MemorySettings = { mode: "steady", normal_gb: null, more_gb: null, from: "22:00", to: "07:00", away_minutes: 10 };
type State = {
  format: "synamp.analyzer-control/1";
  settings: { update_after_librarian: boolean; memory: MemorySettings };
  commands: Command[];
  worker?: WorkerSeen;
};

/** A worker that hasn't asked for work in this long is shown as not running. */
export const WORKER_ONLINE_MS = 60_000;
/** The worker reports export progress every ~10 s; after this long without word, don't show old numbers. */
export const ACTIVITY_STALE_MS = 5 * 60_000;
const KEEP = 30;

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.slice(0, max) : undefined);

/** How long a "show it in Finder" request waits for the Mac to pick it up. */
const REVEAL_WAIT_MS = 60_000;

export class AnalyzerControl {
  /** Folders to open in Finder on the Mac, waiting for it to ask (not saved). */
  private reveals: Array<{ path: string; at: number }> = [];

  /** Ask the Mac that analyses the music to open a folder in Finder (`area` library or incoming, `path` inside it). */
  reveal(area: unknown, path: unknown, now = Date.now()): { host?: string; path: string } {
    const worker = this.state.worker;
    if (!worker || now - worker.last_seen >= WORKER_ONLINE_MS) {
      throw new AnalyzerError("The Mac that analyses your music isn’t connected right now, so it can’t open Finder.", 409);
    }
    const target = macPath(worker, area, path);
    if (!target) throw new AnalyzerError("That folder can’t be opened from here.", 400);
    this.reveals = [...this.reveals.filter((r) => now - r.at < REVEAL_WAIT_MS && r.path !== target), { path: target, at: now }].slice(-10);
    return { ...(worker.host ? { host: worker.host } : {}), path: target };
  }

  /** The Mac asks (every few seconds): which folders to open. Each is handed out once. */
  takeReveals(now = Date.now()): string[] {
    const due = this.reveals.filter((r) => now - r.at < REVEAL_WAIT_MS).map((r) => r.path);
    this.reveals = [];
    if (this.state.worker) this.state.worker.last_seen = now;
    return due;
  }

  private path: string;
  state: State;
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = {
      format: "synamp.analyzer-control/1",
      settings: { update_after_librarian: true, ...(loaded.settings ?? {}), memory: { ...DEFAULT_MEMORY, ...(loaded.settings?.memory ?? {}) } },
      commands: loaded.commands ?? [],
      ...(loaded.worker ? { worker: loaded.worker } : {}),
    };
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  private active(): Command[] { return this.state.commands.filter((c) => c.status === "queued" || c.status === "running"); }

  /** Queue a command. Asking for something already waiting doesn't queue it twice. */
  request(action: unknown, by: Command["requested_by"] = "you", now = Date.now()): Command {
    if (!ACTIONS.includes(action as Action)) throw new AnalyzerError(`action must be one of ${ACTIONS.join(", ")}`);
    const waiting = this.state.commands.find((c) => c.status === "queued" && (c.action === action || (c.action === "update" && action !== "analyze")));
    if (waiting) return waiting;
    const running = this.state.commands.find((c) => c.status === "running");
    if (running?.action === "analyze" && action === "analyze" && !running.stop) throw new AnalyzerError("Analysis is already running", 409);
    const command: Command = { id: `a_${randomBytes(6).toString("hex")}`, action: action as Action, requested_by: by, status: "queued", created_at: now };
    this.state.commands.push(command);
    this.trim();
    this.save();
    return command;
  }

  /** Pause: stop a running analysis after the current track; cancel anything waiting. */
  stop(now = Date.now()): void {
    for (const command of this.active()) {
      if (command.status === "queued") { command.status = "cancelled"; command.finished_at = now; }
      else command.stop = true;
    }
    this.save();
  }

  setSettings(input: Record<string, unknown>): void {
    if (input.update_after_librarian !== undefined) {
      if (typeof input.update_after_librarian !== "boolean") throw new AnalyzerError("update_after_librarian must be true or false");
      this.state.settings.update_after_librarian = input.update_after_librarian;
    }
    if (input.memory !== undefined) this.state.settings.memory = checkMemory(input.memory, this.state.settings.memory);
    this.save();
  }

  /** What the worker needs to decide how many songs to analyse at once. */
  memory(): MemorySettings { return this.state.settings.memory; }

  /** The worker checks in; hand it the next command (one at a time). */
  claim(about: unknown, now = Date.now()): Command | null {
    const raw = (about && typeof about === "object" ? about : {}) as Record<string, unknown>;
    this.state.worker = {
      last_seen: now,
      ...(text(raw.host, 200) ? { host: text(raw.host, 200) } : {}),
      ...(text(raw.version, 50) ? { version: text(raw.version, 50) } : {}),
      ...(text(raw.state, 50) ? { state: text(raw.state, 50) } : {}),
      ...(text(raw.library_path) ? { library_path: text(raw.library_path) } : {}),
      ...(typeof raw.library_ok === "boolean" ? { library_ok: raw.library_ok } : {}),
      ...(text(raw.export_path) ? { export_path: text(raw.export_path) } : {}),
      ...(text(raw.journal) !== undefined ? { journal: text(raw.journal) } : {}),
      ...(text(raw.problem) ? { problem: text(raw.problem) } : {}),
      ...(gb(raw.memory_gb) !== undefined ? { memory_gb: gb(raw.memory_gb) } : {}),
      ...(typeof raw.cores === "number" && Number.isInteger(raw.cores) && raw.cores > 0 && raw.cores < 1024 ? { cores: raw.cores } : {}),
      ...(nowFrom(raw.memory_now, now) ? { memory_now: nowFrom(raw.memory_now, now)! } : {}),
    };
    // The worker only asks when it's free, so anything still "running" was interrupted (Mac asleep, restarted).
    for (const command of this.state.commands) {
      if (command.status === "running") {
        command.status = "failed";
        command.finished_at = now;
        command.summary = "Interrupted (the Mac slept, restarted or lost the connection). Run it again; analysis carries on where it left off.";
      }
    }
    const next = this.state.commands.find((c) => c.status === "queued");
    if (next) { next.status = "running"; next.claimed_at = now; }
    this.save();
    return next ?? null;
  }

  /** Asked by the worker during a long analysis: stop? and the current memory setting. It says what it's using now. */
  check(id: string, input: unknown = {}, now = Date.now()): { stop: boolean; memory: MemorySettings } {
    const command = this.state.commands.find((c) => c.id === id);
    if (this.state.worker) {
      this.state.worker.last_seen = now;
      const reported = nowFrom((input && typeof input === "object" ? input as Record<string, unknown> : {}).memory_now, now);
      if (reported) this.state.worker.memory_now = reported;
    }
    return { stop: !command || command.status !== "running" || !!command.stop, memory: this.state.settings.memory };
  }

  /**
   * The worker says what it's busy with inside a command — the library list update can take
   * the better part of an hour after an update, and analysis waits for it. Not saved: only for watching.
   */
  setActivity(id: string, input: unknown, now = Date.now()): Command {
    const command = this.state.commands.find((c) => c.id === id);
    if (!command) throw new AnalyzerError("No command with that id", 404);
    if (this.state.worker) this.state.worker.last_seen = now;
    const raw = input && typeof input === "object" ? (input as { activity?: unknown }).activity : undefined;
    if (raw === null || command.status !== "running") { delete command.activity; return command; }
    if (!raw || typeof raw !== "object" || (raw as { kind?: unknown }).kind !== "export") throw new AnalyzerError("activity must be {kind: \"export\", done?, total?} or null");
    const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined);
    const { done, total } = raw as { done?: unknown; total?: unknown };
    const t = count(total), d = count(done);
    command.activity = { kind: "export", at: now, ...(t !== undefined ? { total: t, done: Math.min(d ?? 0, t) } : {}) };
    return command;
  }

  complete(id: string, input: unknown, now = Date.now()): Command {
    const command = this.state.commands.find((c) => c.id === id);
    if (!command) throw new AnalyzerError("No command with that id", 404);
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    delete command.activity;
    if (command.status === "running") {
      command.status = raw.status === "done" ? "done" : raw.status === "stopped" ? "stopped" : "failed";
      command.finished_at = now;
      if (text(raw.summary, 1000)) command.summary = text(raw.summary, 1000);
    }
    if (this.state.worker) this.state.worker.last_seen = now;
    this.save();
    return command;
  }

  /** After the librarian moved files: scan and export, so everything follows them. */
  afterLibrarian(): Command | null {
    if (!this.state.settings.update_after_librarian) return null;
    return this.request("update", "the librarian");
  }

  private trim(): void {
    const finished = this.state.commands.filter((c) => c.status !== "queued" && c.status !== "running");
    const drop = new Set(finished.slice(0, Math.max(0, finished.length - KEEP)).map((c) => c.id));
    this.state.commands = this.state.commands.filter((c) => !drop.has(c.id));
  }

  view(now = Date.now()) {
    const worker = this.state.worker;
    let running = this.state.commands.find((c) => c.status === "running") ?? null;
    if (running?.activity && now - running.activity.at > ACTIVITY_STALE_MS) {
      const { activity: _stale, ...rest } = running;
      running = rest;
    }
    return {
      // While it scans or exports it doesn't check in, so a running command counts as alive.
      worker: worker ? { ...worker, online: now - worker.last_seen < WORKER_ONLINE_MS || this.state.commands.some((c) => c.status === "running") } : null,
      running,
      queued: this.state.commands.filter((c) => c.status === "queued"),
      recent: this.state.commands.filter((c) => c.status !== "queued" && c.status !== "running").slice(-8).reverse(),
      settings: this.state.settings,
    };
  }
}

const gb = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 4096 ? Math.round(value * 10) / 10 : undefined);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function nowFrom(value: unknown, at: number): WorkerSeen["memory_now"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const amount = gb(raw.gb);
  const songs = typeof raw.songs === "number" && Number.isInteger(raw.songs) && raw.songs > 0 && raw.songs < 1024 ? raw.songs : undefined;
  const why = raw.why === "hours" || raw.why === "away" || raw.why === "normal" ? raw.why : undefined;
  return amount !== undefined && songs !== undefined && why ? { gb: amount, songs, why, at } : undefined;
}

/** Check a memory setting from the web app; anything left out keeps its current value. */
export function checkMemory(input: unknown, current: MemorySettings = DEFAULT_MEMORY): MemorySettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AnalyzerError("memory must be an object");
  const raw = input as Record<string, unknown>;
  const next = { ...current };
  if (raw.mode !== undefined) {
    if (raw.mode !== "steady" && raw.mode !== "hours" && raw.mode !== "away") throw new AnalyzerError('memory.mode must be "steady", "hours" or "away"');
    next.mode = raw.mode;
  }
  for (const key of ["normal_gb", "more_gb"] as const) {
    if (raw[key] === undefined) continue;
    if (raw[key] === null) { next[key] = null; continue; }
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 1024) throw new AnalyzerError(`memory.${key} must be between 1 and 1024 GB, or null for the recommendation`);
    next[key] = Math.round(value);
  }
  for (const key of ["from", "to"] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "string" || !TIME.test(raw[key] as string)) throw new AnalyzerError(`memory.${key} must be a time like 22:00`);
    next[key] = raw[key] as string;
  }
  if (raw.away_minutes !== undefined) {
    const value = raw.away_minutes;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 240) throw new AnalyzerError("memory.away_minutes must be 1–240");
    next.away_minutes = value;
  }
  if (next.mode === "hours" && next.from === next.to) throw new AnalyzerError("The start and end times are the same");
  return next;
}


/**
 * Where a folder is on the Mac that analyses the music, from where the library
 * sits there (/Volumes/music/library). New music is the "incoming" folder next
 * to the library, as SynAmp sets the share up. Undefined for anything unsafe.
 */
export function macPath(worker: WorkerSeen | null | undefined, area: unknown, path: unknown): string | undefined {
  const library = worker?.library_path?.replace(/\/+$/, "");
  if (!library || !library.startsWith("/")) return undefined;
  if (area !== "library" && area !== "incoming") return undefined;
  if (path !== "" && !isSafeRelative(path)) return undefined;
  const root = area === "library" ? library : `${library.slice(0, library.lastIndexOf("/")) || ""}/incoming`;
  return path ? `${root}/${path}` : root;
}
