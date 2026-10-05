/**
 * Which SynAmp is running, and is a newer copy waiting on the NAS?
 *
 * Updating SynAmp is two steps: copy the new code to the NAS (`synamp-sync` on
 * the Mac), then press Build in Container Manager. The app should say when the
 * first has happened and the second hasn't. So:
 *
 * - When the brain's image is built, it fingerprints the code it was built
 *   from (brain and web) into build.json. Docker only re-runs that step when the
 *   code changed, so the fingerprint always matches the code inside the images.
 * - While running, the brain fingerprints the copy on the NAS (mounted
 *   read-only at /source) the same way. Different → an update is waiting.
 *
 * Only code files count, so Finder's .DS_Store and similar never look like an update.
 *
 * Run at build time:  node --experimental-strip-types src/version.ts <apps folder> > build.json
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** What counts as "the code", relative to the apps/ folder. */
export const SOURCE_PARTS = ["brain/src", "web/src", "web/index.html", "web/package.json", "web/package-lock.json"];
const CODE = /\.(ts|tsx|mts|js|mjs|css|html|json)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "data", ".git"]);

function files(root: string, part: string): string[] {
  const path = join(root, part);
  let stat;
  try { stat = statSync(path); } catch { return []; }
  if (stat.isFile()) return CODE.test(path) ? [path] : [];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".") && !(entry.isDirectory() && SKIP_DIRS.has(entry.name)))
    .flatMap((entry) => files(root, join(part, entry.name)));
}

export type Fingerprint = { fingerprint: string; files: number; newest: number };

/** One hash over every code file's path and content. Null when nothing is there to read. */
export function fingerprint(root: string): Fingerprint | null {
  const all = SOURCE_PARTS.flatMap((part) => files(root, part))
    .map((path) => ({ path, key: relative(root, path).split(sep).join("/") }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!all.length) return null;
  const hash = createHash("sha256");
  let newest = 0;
  for (const { path, key } of all) {
    hash.update(key).update("\0").update(readFileSync(path)).update("\0");
    newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return { fingerprint: hash.digest("hex"), files: all.length, newest: Math.round(newest) };
}

export type Build = { fingerprint: string; built_at: number };

export type UpdateView = {
  /** The code inside the running images (null when not built as an image, e.g. in development). */
  running: (Build & { short: string }) | null;
  /** The copy on the NAS: same, newer (waiting for Build), or not readable. */
  copy: "same" | "waiting" | "unknown";
  copied_at?: number;
  checked_at: number;
};

export class VersionCheck {
  private build: Build | null;
  private sourceRoot: string;
  private cache?: UpdateView;
  constructor(buildPath: string, sourceRoot: string) {
    this.sourceRoot = sourceRoot;
    try {
      const raw = JSON.parse(readFileSync(buildPath, "utf8")) as Partial<Build>;
      this.build = typeof raw.fingerprint === "string" && typeof raw.built_at === "number" ? { fingerprint: raw.fingerprint, built_at: raw.built_at } : null;
    } catch { this.build = null; }
  }

  /** Re-reads the NAS copy at most once a minute (a few hundred small files). */
  view(now = Date.now(), maxAgeMs = 60_000): UpdateView {
    if (this.cache && now - this.cache.checked_at < maxAgeMs) return this.cache;
    const running = this.build ? { ...this.build, short: this.build.fingerprint.slice(0, 7) } : null;
    let copy: UpdateView["copy"] = "unknown";
    let copiedAt: number | undefined;
    if (running && this.sourceRoot) {
      const source = fingerprint(this.sourceRoot);
      if (source) {
        copy = source.fingerprint === running.fingerprint ? "same" : "waiting";
        copiedAt = source.newest;
      }
    }
    this.cache = { running, copy, ...(copy === "waiting" && copiedAt ? { copied_at: copiedAt } : {}), checked_at: now };
    return this.cache;
  }
}

// Build time: print build.json for the image.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2];
  const result = root ? fingerprint(root) : null;
  if (!result) {
    process.stderr.write("version: no code found to fingerprint\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ fingerprint: result.fingerprint, built_at: Date.now() }) + "\n");
}
