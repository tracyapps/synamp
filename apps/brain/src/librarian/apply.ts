/**
 * The librarian's hands: carry out one decision, or undo one, on the real files.
 *
 * Rules (LIBRARY-CARE "Principles"):
 *   - Check everything first. A decision whose files moved, vanished or would
 *     overwrite something is refused before a single file is touched.
 *   - Never overwrite. Renames only; nothing is copied, re-encoded or retagged.
 *   - All or nothing per decision: if a rename fails half-way, the ones already
 *     done are put back.
 *   - Journal every move (renames.jsonl) the moment it happens. The analyzer
 *     reads the same journal, so moved tracks keep their analysis and history.
 *   - The only files ever deleted are .DS_Store / ._* / Thumbs.db / desktop.ini,
 *     and only to remove a folder that would otherwise be empty.
 */

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { FolderMove, JobDecision, Move } from "../library/organise.ts";
import { isSafeRelative, JUNK_FILE } from "../library/naming.ts";

export type JournalEntry = Move & { reason: string; batch: string; decision: string; at: number };

export class Journal {
  private path: string | undefined;
  constructor(path: string | undefined) { this.path = path; }
  append(entry: JournalEntry): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
  }
}

export type DecisionResult = {
  id: string;
  status: "applied" | "failed";
  moved: Move[];
  errors: string[];
  notes: string[];
};

export type Context = {
  root: string;
  batch: string;
  journal: Journal;
  now?: () => number;
  /** Test hook: called before each rename; throwing simulates a failure there. */
  beforeRename?: (from: string, to: string) => void;
};

/** Absolute path for a library-relative one, refusing anything that could escape the library. */
export function inside(root: string, path: string): string {
  if (!isSafeRelative(path)) throw new Error(`Unsafe path refused: ${JSON.stringify(path)}`);
  const full = resolve(root, ...path.split("/"));
  const base = resolve(root);
  if (full !== base && !full.startsWith(base + sep)) throw new Error(`Path outside the library refused: ${path}`);
  return full;
}

/** Same file under another spelling (case-insensitive disks): a rename, not a collision. */
function sameFile(a: string, b: string): boolean {
  try {
    const x = statSync(a), y = statSync(b);
    return x.ino === y.ino && x.dev === y.dev;
  } catch { return false; }
}

const isFile = (path: string) => { try { return lstatSync(path).isFile(); } catch { return false; } };

function renameOne(root: string, move: Move, ctx: Context): void {
  const from = inside(root, move.from), to = inside(root, move.to);
  ctx.beforeRename?.(move.from, move.to);
  const size = statSync(from).size;
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) {
    if (!sameFile(from, to)) throw new Error(`“${move.to}” already exists`);
    // Only the letter case changes: go through a temporary name.
    const temp = `${to}.synamp-${randomBytes(4).toString("hex")}`;
    renameSync(from, temp);
    renameSync(temp, to);
  } else {
    renameSync(from, to);
  }
  if (statSync(to).size !== size) throw new Error(`“${move.to}” has the wrong size after moving`);
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

/** Every file under `dir`, library-relative, skipping folders in `keep` and junk files. */
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
      else if (stat.isFile() && !JUNK_FILE.test(name)) out.push(child);
    }
  };
  walk(dir);
  return out;
}

function precheck(root: string, decision: JobDecision): string[] {
  const errors: string[] = [];
  const targets = new Set<string>();
  for (const move of decision.moves) {
    let from: string, to: string;
    try { from = inside(root, move.from); to = inside(root, move.to); } catch (error) { errors.push((error as Error).message); continue; }
    if (!isFile(from)) errors.push(`“${move.from}” is no longer there`);
    else if (existsSync(to) && !sameFile(from, to)) errors.push(`“${move.to}” already exists`);
    if (targets.has(to)) errors.push(`Two files would both become “${move.to}”`);
    targets.add(to);
  }
  for (const folder of decision.folders) {
    try { inside(root, folder.from); inside(root, folder.to); for (const key of folder.keep ?? []) inside(root, key); }
    catch (error) { errors.push((error as Error).message); }
  }
  return [...new Set(errors)].slice(0, 20);
}

export function applyDecision(decision: JobDecision, ctx: Context): DecisionResult {
  const { root } = ctx;
  const now = ctx.now ?? Date.now;
  const result: DecisionResult = { id: decision.id, status: "failed", moved: [], errors: [], notes: [] };
  result.errors = precheck(root, decision);
  if (result.errors.length) return result;

  const record = (move: Move, reason: string) => {
    ctx.journal.append({ ...move, reason, batch: ctx.batch, decision: decision.id, at: now() });
    result.moved.push(move);
  };
  const touched = new Set<string>();
  try {
    for (const move of decision.moves) {
      renameOne(root, move, ctx);
      record(move, `organise: ${decision.title}`);
      touched.add(dirname(inside(root, move.from)));
    }
  } catch (error) {
    // Put back what was already moved, newest first, so the decision leaves no trace.
    result.errors.push((error as Error).message);
    for (const move of [...result.moved].reverse()) {
      try {
        renameOne(root, { ...move, from: move.to, to: move.from }, { ...ctx, beforeRename: undefined });
        ctx.journal.append({ ...move, from: move.to, to: move.from, reason: "put back after a failed step", batch: ctx.batch, decision: decision.id, at: now() });
      } catch (rollbackError) {
        result.errors.push(`Could not put back “${move.to}”: ${(rollbackError as Error).message}`);
      }
    }
    for (const move of result.moved) pruneEmpty(root, dirname(inside(root, move.to)));
    result.moved = [];
    return result;
  }

  // Artwork, cue sheets, logs and anything else in the old folders follow the music.
  for (const folder of decision.folders) {
    if (folder.from === folder.to) continue;
    const keep = new Set(folder.keep ?? []);
    for (const file of filesUnder(root, folder.from, keep)) {
      const target = folder.to + file.slice(folder.from.length);
      if (target.startsWith(folder.from + "/")) continue; // would move into itself
      if (existsSync(inside(root, target)) && !sameFile(inside(root, file), inside(root, target))) {
        result.notes.push(`Left “${file}”: “${target}” already exists`);
        continue;
      }
      try {
        renameOne(root, { from: file, to: target }, { ...ctx, beforeRename: undefined });
        record({ from: file, to: target }, `organise: moved with its folder (${decision.title})`);
      } catch (error) {
        result.notes.push(`Left “${file}”: ${(error as Error).message}`);
      }
    }
    touched.add(inside(root, folder.from));
  }
  for (const dir of [...touched].sort((a, b) => b.length - a.length)) pruneEmpty(root, dir);
  result.status = "applied";
  return result;
}

/** Puts files back where a decision found them. Best effort: what can't go back is reported. */
export function undoDecision(decision: JobDecision, ctx: Context): DecisionResult {
  const { root } = ctx;
  const now = ctx.now ?? Date.now;
  const result: DecisionResult = { id: decision.id, status: "applied", moved: [], errors: [], notes: [] };
  const touched = new Set<string>();
  for (const move of decision.moves) {
    try {
      const from = inside(root, move.from), to = inside(root, move.to);
      if (!isFile(from)) { result.errors.push(`“${move.from}” is no longer there`); continue; }
      if (existsSync(to) && !sameFile(from, to)) { result.errors.push(`Something is already at “${move.to}”`); continue; }
      renameOne(root, move, { ...ctx, beforeRename: undefined });
      ctx.journal.append({ ...move, reason: "undo", batch: ctx.batch, decision: decision.id, at: now() });
      result.moved.push(move);
      touched.add(dirname(from));
    } catch (error) {
      result.errors.push((error as Error).message);
    }
  }
  for (const dir of [...touched].sort((a, b) => b.length - a.length)) pruneEmpty(root, dir);
  if (result.errors.length) result.status = "failed";
  return result;
}

export function runJob(job: { kind: "apply" | "undo"; batch: string; decisions: JobDecision[] }, ctx: Omit<Context, "batch">): DecisionResult[] {
  const context = { ...ctx, batch: job.batch };
  return job.decisions.map((decision) => (job.kind === "apply" ? applyDecision(decision, context) : undoDecision(decision, context)));
}

export type { FolderMove };
