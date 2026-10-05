/**
 * Audio streaming for the SynAmp web player.
 *
 * The brain already mounts the music share read-only (LIBRARY_PATH), and the
 * analyzer export carries each track's library-relative path, so the web player
 * can play real files — which is what makes play/skip events real.
 *
 * Third-party Subsonic apps keep streaming from Navidrome; this path exists so
 * SynAmp's own player is a trustworthy source of listening events.
 *
 * Safety:
 *   - Only tracks present in the library index can be streamed (no arbitrary paths).
 *   - The resolved file must stay inside LIBRARY_PATH (no "../" escapes, no symlink escapes).
 *   - URLs are signed and expire, because an <audio> element cannot send an
 *     Authorization header and the access token must not end up in URLs or logs.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
  ".opus": "audio/ogg", ".wav": "audio/wav", ".aiff": "audio/aiff", ".aif": "audio/aiff",
};
const LIFETIME_MS = 6 * 60 * 60 * 1000;

export class StreamSigner {
  private key: Buffer;
  constructor(secret?: string) {
    // With no configured token (local dev), a per-process key still prevents
    // arbitrary URL guessing; links simply stop working after a restart.
    this.key = secret ? createHmac("sha256", "synamp-stream").update(secret).digest() : randomBytes(32);
  }
  private mac(trackId: string, exp: number): string {
    return createHmac("sha256", this.key).update(`${trackId}\n${exp}`).digest("base64url");
  }
  url(trackId: string, now = Date.now()): string {
    const exp = now + LIFETIME_MS;
    return `/api/v1/tracks/${encodeURIComponent(trackId)}/stream?exp=${exp}&sig=${this.mac(trackId, exp)}`;
  }
  verify(trackId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
    const expiry = Number(exp);
    if (!sig || !Number.isFinite(expiry) || expiry < now) return false;
    const want = Buffer.from(this.mac(trackId, expiry));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }
}

/** Resolves a library-relative path to a real file inside the root, or null. */
export function resolveInside(root: string, relativePath: string): string | null {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes("\0")) return null;
  try {
    const realRoot = realpathSync(root);
    const real = realpathSync(resolve(realRoot, relativePath));
    const rel = relative(realRoot, real);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
    return statSync(real).isFile() ? real : null;
  } catch { return null; }
}

/** Streams a file with single-range support (what <audio> needs for seeking). */
export function sendFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  const size = statSync(file).size;
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string | number> = {
    "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (req.headers.range && !range) {
    res.writeHead(416, { "content-range": `bytes */${size}` });
    res.end();
    return;
  }
  if (range) {
    let start = range[1] ? Number(range[1]) : NaN;
    let end = range[2] ? Number(range[2]) : size - 1;
    if (Number.isNaN(start)) { start = Math.max(0, size - end); end = size - 1; } // suffix range: last N bytes
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "content-length": size });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
}
