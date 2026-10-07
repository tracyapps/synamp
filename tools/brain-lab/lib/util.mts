/**
 * brain-lab — small shared utilities (paths, JSON safety, git info, formatting).
 *
 * The lab is a developer tool under tools/brain-lab (the repo's tools/ precedent:
 * tools/roadmap/build.mjs, tools/nas/check-playback.mjs). It is never imported by
 * apps/; turbo does not run it; `pnpm test` does not discover it. It runs manually:
 *
 *   node --experimental-strip-types tools/brain-lab/lab.mts
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

/** tools/brain-lab/lib */
export const LIB_DIR = dirname(fileURLToPath(import.meta.url));
/** tools/brain-lab */
export const LAB_DIR = resolve(LIB_DIR, "..");
/** repository root (tools/brain-lab/../..) */
export const REPO_ROOT = resolve(LAB_DIR, "..", "..");
/** apps/brain */
export const BRAIN_DIR = join(REPO_ROOT, "apps", "brain");

export function abs(relPath: string): string {
  return resolve(REPO_ROOT, relPath);
}

export function fileUrl(absPath: string): string {
  return pathToFileURL(absPath).href;
}

export function readJson(absPath: string): unknown {
  return JSON.parse(readFileSync(absPath, "utf8"));
}

/** Compact, stable JSON for evidence values (sorted keys not needed; insertion order is stable per run). */
export function j(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** Read-only git metadata; never mutates the repo. Returns nulls when git is unavailable. */
export function gitInfo(): { head: string | null; branch: string | null; dirty: boolean | null } {
  const run = (args: string[]): string | null => {
    try {
      const done = spawnSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", timeout: 5000 });
      if (done.status !== 0) return null;
      return (done.stdout ?? "").trim() || null;
    } catch {
      return null;
    }
  };
  const status = run(["status", "--porcelain"]);
  return { head: run(["rev-parse", "--short", "HEAD"]), branch: run(["rev-parse", "--abbrev-ref", "HEAD"]), dirty: status === null ? null : status.length > 0 };
}

export function fileExists(absPath: string): boolean {
  return existsSync(absPath);
}
