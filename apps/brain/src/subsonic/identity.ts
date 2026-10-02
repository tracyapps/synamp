/**
 * One track, one ID — whichever door it came through.
 *
 * The analyzer names a track by a hash of its path relative to the library root
 * (services/analyzer/.../export.py `track_id`). Navidrome reports the file's
 * real path when `ND_SUBSONIC_DEFAULTREPORTREALPATH=true`. Both reduce to the
 * same relative path, so both reduce to the same ID — no lookup table to drift.
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";

/** Same recipe as the analyzer: "p:" + first 20 hex chars of sha256(relative POSIX path). */
export function trackIdForPath(relative: string): string {
  return "p:" + createHash("sha256").update(relative, "utf8").digest("hex").slice(0, 20);
}

/**
 * Turns the path a Subsonic server reports into a library-relative path, or null.
 * `root` is where the library is mounted inside the core (e.g. "/music").
 * Without real paths enabled Navidrome reports a synthetic "Artist/Album/NN - Title.ext"
 * that is NOT the file; callers must treat a non-absolute path as unknown.
 */
export function relativeFromReported(reported: unknown, root: string): string | null {
  if (typeof reported !== "string" || !reported.startsWith("/")) return null;
  const normalRoot = posix.normalize(root.endsWith("/") ? root : `${root}/`);
  const normal = posix.normalize(reported);
  if (!normal.startsWith(normalRoot)) return null;
  const relative = normal.slice(normalRoot.length);
  return relative && !relative.split("/").includes("..") ? relative : null;
}
