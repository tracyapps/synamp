/**
 * The librarian's hands: carry out one decision, or undo one, on the real files.
 *
 * Rules (LIBRARY-CARE "Principles"):
 *   - Check everything first. A decision whose files moved, vanished or would
 *     overwrite something is refused before a single file is touched.
 *   - Never overwrite. A copy set aside in `incoming/_duplicates/` that meets
 *     an earlier set-aside of the same name gets " (2)" added instead.
 *   - Renames only; nothing is re-encoded or retagged. When a
 *     rename can't cross disks (incoming/ on another mount), the file is copied,
 *     the copy's checksum compared with the original, and only then is the
 *     original removed.
 *   - All or nothing per decision: if a rename fails half-way, the ones already
 *     done are put back.
 *   - Journal every move (renames.jsonl) the moment it happens. The analyzer
 *     reads the same journal, so moved tracks keep their analysis and history.
 *   - The only files ever deleted are .DS_Store / ._* / Thumbs.db / desktop.ini,
 *     and only to remove a folder that would otherwise be empty (plus, after a
 *     verified cross-disk copy, the original that was copied).
 */

import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, renameSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { reverseMove } from "../library/organise.ts";
import type { Area, FolderMove, JobDecision, Move } from "../library/organise.ts";
import { isSafeRelative, JUNK_FILE } from "../library/naming.ts";
import { SET_ASIDE_FOLDER } from "../library/duplicates.ts";

export type JournalEntry = Record<string, unknown> & { reason: string; batch: string; decision: string; at: number };

export class Journal {
  private path: string | undefined;
  constructor(path: string | undefined) { this.path = path; }
  append(entry: JournalEntry): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
  }
}

/**
 * The analyzer replays `{from, to}` lines as renames inside the library. Moves
 * that start or end in `incoming/` are new arrivals (or set-asides), not
 * renames, so they are written without `from`/`to` and the analyzer skips them.
 */
function journalLine(move: Move, extra: { reason: string; batch: string; decision: string; at: number }): JournalEntry {
  const { from_area, to_area, from, to, ...rest } = move;
  if (!from_area && !to_area) return { from, to, ...rest, ...extra };
  return { source: from, source_area: from_area ?? "library", target: to, target_area: to_area ?? "library", ...rest, ...extra };
}

export type DecisionResult = {
  id: string;
  status: "applied" | "failed";
  moved: Move[];
  errors: string[];
  notes: string[];
};

export type Context = {
  /** The library (the folder Navidrome scans). */
  root: string;
  /** `incoming/`, for imports. */
  incoming?: string;
  batch: string;
  journal: Journal;
  now?: () => number;
  /** Test hook: called before each rename; throwing simulates a failure there. */
  beforeRename?: (from: string, to: string) => void;
};

/** Absolute path for a relative one, refusing anything that could escape its folder. */
export function inside(root: string, path: string): string {
  if (!isSafeRelative(path)) throw new Error(`Unsafe path refused: ${JSON.stringify(path)}`);
  const full = resolve(root, ...path.split("/"));
  const base = resolve(root);
  if (full !== base && !full.startsWith(base + sep)) throw new Error(`Path outside the library refused: ${path}`);
  return full;
}

function rootOf(ctx: Context, area?: Area): string {
  if (!area) return ctx.root;
  if (!ctx.incoming) throw new Error("LIBRARIAN_INCOMING_PATH isn't set, so files in incoming/ can't be filed");
  return ctx.incoming;
}
const where = (ctx: Context, path: string, area?: Area) => inside(rootOf(ctx, area), path);
const label = (path: string, area?: Area) => (area ? `${area}/${path}` : path);
const settingAside = (move: Move) => move.to_area === "incoming" && move.to.startsWith(`${SET_ASIDE_FOLDER}/`);

/** A free name for a set-aside copy: "Song.flac", then "Song (2).flac", "Song (3).flac"… */
function freeAsideName(ctx: Context, move: Move): Move {
  const dot = move.to.lastIndexOf(".");
  const slash = move.to.lastIndexOf("/");
  const [stem, ext] = dot > slash ? [move.to.slice(0, dot), move.to.slice(dot)] : [move.to, ""];
  for (let copy = 1; copy < 1000; copy++) {
    const to = copy === 1 ? move.to : `${stem} (${copy})${ext}`;
    if (!existsSync(where(ctx, to, move.to_area))) return { ...move, to };
  }
  throw new Error(`No free name for “${label(move.to, move.to_area)}”`);
}

/** Same file under another spelling (case-insensitive disks): a rename, not a collision. */
function sameFile(a: string, b: string): boolean {
  try {
    const x = statSync(a), y = statSync(b);
    return x.ino === y.ino && x.dev === y.dev;
  } catch { return false; }
}

const isFile = (path: string) => { try { return lstatSync(path).isFile(); } catch { return false; } };

function sha256(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(1 << 20);
    for (let got; (got = readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, got));
  } finally { closeSync(fd); }
  return hash.digest("hex");
}

/**
 * Across disks a rename is impossible: copy beside the target, compare
 * checksums, only then put it in place and remove the original.
 */
function copyVerified(from: string, to: string): void {
  const temp = `${to}${".synamp-part"}-${randomBytes(4).toString("hex")}`;
  copyFileSync(from, temp, constants.COPYFILE_EXCL);
  try {
    if (sha256(from) !== sha256(temp)) throw new Error("the copy didn't match the original");
    if (existsSync(to)) throw new Error("something appeared at the target meanwhile");
    renameSync(temp, to);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* already gone */ }
    throw error;
  }
  unlinkSync(from);
}

function moveOne(ctx: Context, move: Move): void {
  const from = where(ctx, move.from, move.from_area), to = where(ctx, move.to, move.to_area);
  ctx.beforeRename?.(move.from, move.to);
  const size = statSync(from).size;
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) {
    if (!sameFile(from, to)) throw new Error(`“${label(move.to, move.to_area)}” already exists`);
    // Only the letter case changes: go through a temporary name.
    const temp = `${to}.synamp-${randomBytes(4).toString("hex")}`;
    renameSync(from, temp);
    renameSync(temp, to);
  } else {
    try {
      renameSync(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      copyVerified(from, to);
    }
  }
  if (statSync(to).size !== size) throw new Error(`“${label(move.to, move.to_area)}” has the wrong size after moving`);
}

/** Removes `dir` and its sub-folders when they hold nothing but junk files. Never `root` itself. */
export function pruneEmpty(root: string, dir: string): void {
  const base = resolve(root);
  let current = resolve(dir);
  const prune = (path: string): boolean => {
    let entries: string[];
    try { entries = readdirSync(path); } catch { return false; }
    let empty = true;
    for (const name of entries) {
      const child = join(path, name);
      let stat;
      try { stat = lstatSync(child); } catch { continue; }
      if (stat.isDirectory()) { if (!prune(child)) empty = false; }
      else if (!JUNK_FILE.test(name)) empty = false;
    }
    if (!empty || path === base) return false;
    for (const name of readdirSync(path)) if (JUNK_FILE.test(name)) unlinkSync(join(path, name));
    rmdirSync(path);
    return true;
  };
  if (!current.startsWith(base + sep)) return;
  if (!prune(current)) return;
  // Then walk up while the parents are empty too.
  current = dirname(current);
  while (current.startsWith(base + sep) && prune(current)) current = dirname(current);
}

/** Every file under `dir` (relative to `root`), skipping folders in `keep`, junk and half-written files. */
function filesUnder(root: string, dir: string, keep: Set<string>): string[] {
  const out: string[] = [];
  const walk = (relativeDir: string) => {
    let entries: string[];
    try { entries = readdirSync(inside(root, relativeDir)); } catch { return; }
    for (const name of entries.sort()) {
      const child = `${relativeDir}/${name}`;
      let stat;
      try { stat = lstatSync(inside(root, child)); } catch { continue; }
      if (stat.isDirectory()) { if (!keep.has(child)) walk(child); }
      else if (stat.isFile() && !JUNK_FILE.test(name) && !name.includes(".synamp-part")) out.push(child);
    }
  };
  walk(dir);
  return out;
}

function precheck(ctx: Context, decision: JobDecision): string[] {
  const errors: string[] = [];
  const targets = new Set<string>();
  /** Files an earlier move in this decision takes away (a set-aside making room for the better copy). */
  const vacated = new Set<string>();
  for (const move of decision.moves) {
    let from: string, to: string;
    try { from = where(ctx, move.from, move.from_area); to = where(ctx, move.to, move.to_area); } catch (error) { errors.push((error as Error).message); continue; }
    if (!isFile(from)) errors.push(`“${label(move.from, move.from_area)}” is no longer there`);
    // Set-asides find a free name when they're carried out.
    else if (!settingAside(move) && existsSync(to) && !sameFile(from, to) && !vacated.has(to)) errors.push(`“${label(move.to, move.to_area)}” already exists`);
    vacated.add(from);
    if (targets.has(to)) errors.push(`Two files would both become “${label(move.to, move.to_area)}”`);
    targets.add(to);
  }
  for (const folder of decision.folders) {
    try { where(ctx, folder.from, folder.from_area); inside(ctx.root, folder.to); for (const key of folder.keep ?? []) where(ctx, key, folder.from_area); }
    catch (error) { errors.push((error as Error).message); }
  }
  return [...new Set(errors)].slice(0, 20);
}

type Touched = Map<string, string>; // absolute dir → its root
const touch = (touched: Touched, ctx: Context, path: string, area?: Area) => touched.set(dirname(where(ctx, path, area)), resolve(rootOf(ctx, area)));
function pruneAll(touched: Touched): void {
  for (const [dir, root] of [...touched].sort((a, b) => b[0].length - a[0].length)) pruneEmpty(root, dir);
}

export function applyDecision(decision: JobDecision, ctx: Context): DecisionResult {
  const now = ctx.now ?? Date.now;
  const result: DecisionResult = { id: decision.id, status: "failed", moved: [], errors: [], notes: [] };
  result.errors = precheck(ctx, decision);
  if (result.errors.length) return result;

  const verb = decision.kind === "import" ? "import" : "organise";
  const record = (move: Move, reason: string) => {
    ctx.journal.append(journalLine(move, { reason, batch: ctx.batch, decision: decision.id, at: now() }));
    result.moved.push(move);
  };
  const touched: Touched = new Map();
  try {
    for (const planned of decision.moves) {
      const move = settingAside(planned) ? freeAsideName(ctx, planned) : planned;
      moveOne(ctx, move);
      record(move, settingAside(move) && !planned.from_area ? `set aside (a better copy of the same recording stays): ${decision.title}` : `${verb}: ${decision.title}`);
      touch(touched, ctx, move.from, move.from_area);
    }
  } catch (error) {
    // Put back what was already moved, newest first, so the decision leaves no trace.
    result.errors.push((error as Error).message);
    for (const move of [...result.moved].reverse()) {
      const back = reverseMove(move);
      try {
        moveOne({ ...ctx, beforeRename: undefined }, back);
        ctx.journal.append(journalLine(back, { reason: "put back after a failed step", batch: ctx.batch, decision: decision.id, at: now() }));
      } catch (rollbackError) {
        result.errors.push(`Could not put back “${label(move.to, move.to_area)}”: ${(rollbackError as Error).message}`);
      }
      touch(touched, ctx, move.to, move.to_area);
    }
    pruneAll(touched);
    result.moved = [];
    return result;
  }

  // Artwork, cue sheets, logs and anything else in the old folders follow the music.
  for (const folder of decision.folders) {
    if (folder.from === folder.to && !folder.from_area) continue;
    const keep = new Set(folder.keep ?? []);
    const sourceRoot = rootOf(ctx, folder.from_area);
    for (const file of filesUnder(sourceRoot, folder.from, keep)) {
      const target = folder.to + file.slice(folder.from.length);
      if (!folder.from_area && target.startsWith(folder.from + "/")) continue; // would move into itself
      const companion: Move = { from: file, to: target, ...(folder.from_area ? { from_area: folder.from_area } : {}) };
      if (existsSync(inside(ctx.root, target)) && !sameFile(where(ctx, file, folder.from_area), inside(ctx.root, target))) {
        result.notes.push(`Left “${label(file, folder.from_area)}”: “${target}” already exists`);
        continue;
      }
      try {
        moveOne({ ...ctx, beforeRename: undefined }, companion);
        record(companion, `${verb}: moved with its folder (${decision.title})`);
      } catch (error) {
        result.notes.push(`Left “${label(file, folder.from_area)}”: ${(error as Error).message}`);
      }
    }
    touched.set(where(ctx, folder.from, folder.from_area), resolve(sourceRoot));
  }
  pruneAll(touched);
  result.status = "applied";
  return result;
}

/** Puts files back where a decision found them. Best effort: what can't go back is reported. */
export function undoDecision(decision: JobDecision, ctx: Context): DecisionResult {
  const now = ctx.now ?? Date.now;
  const result: DecisionResult = { id: decision.id, status: "applied", moved: [], errors: [], notes: [] };
  const touched: Touched = new Map();
  for (const move of decision.moves) {
    try {
      const from = where(ctx, move.from, move.from_area), to = where(ctx, move.to, move.to_area);
      if (!isFile(from)) { result.errors.push(`“${label(move.from, move.from_area)}” is no longer there`); continue; }
      if (existsSync(to) && !sameFile(from, to)) { result.errors.push(`Something is already at “${label(move.to, move.to_area)}”`); continue; }
      moveOne({ ...ctx, beforeRename: undefined }, move);
      ctx.journal.append(journalLine(move, { reason: "undo", batch: ctx.batch, decision: decision.id, at: now() }));
      result.moved.push(move);
      touch(touched, ctx, move.from, move.from_area);
    } catch (error) {
      result.errors.push((error as Error).message);
    }
  }
  pruneAll(touched);
  if (result.errors.length) result.status = "failed";
  return result;
}

export function runJob(job: { kind: "apply" | "undo"; batch: string; decisions: JobDecision[] }, ctx: Omit<Context, "batch">): DecisionResult[] {
  const context = { ...ctx, batch: job.batch };
  return job.decisions.map((decision) => (job.kind === "apply" ? applyDecision(decision, context) : undoDecision(decision, context)));
}

export type { FolderMove };
