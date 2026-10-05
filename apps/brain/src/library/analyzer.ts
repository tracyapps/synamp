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
};
type State = {
  format: "synamp.analyzer-control/1";
  settings: { update_after_librarian: boolean };
  commands: Command[];
  worker?: WorkerSeen;
};

/** A worker that hasn't asked for work in this long is shown as not running. */
export const WORKER_ONLINE_MS = 60_000;
/** The worker reports export progress every ~10 s; after this long without word, don't show old numbers. */
export const ACTIVITY_STALE_MS = 5 * 60_000;
const KEEP = 30;

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.slice(0, max) : undefined);

export class AnalyzerControl {
  private path: string;
  state: State;
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = {
      format: "synamp.analyzer-control/1",
      settings: { update_after_librarian: true, ...(loaded.settings ?? {}) },
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
    this.save();
  }

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

  /** Asked by the worker during a long analysis. */
  check(id: string, now = Date.now()): { stop: boolean } {
    const command = this.state.commands.find((c) => c.id === id);
    if (this.state.worker) this.state.worker.last_seen = now;
    return { stop: !command || command.status !== "running" || !!command.stop };
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
