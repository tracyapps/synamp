/**
 * The web app's files, served by the brain itself.
 *
 * On the NAS, Caddy sends /api, /rest and /health to the brain and everything
 * else to a small nginx container. The desktop app has no Caddy or nginx: the
 * brain is the one address, so it serves the built web app (apps/web/dist) too
 * when WEB_ROOT names that folder. Same rules as nginx.conf: a real file if
 * there is one, otherwise index.html (the app's screens live in the #hash, but
 * an old bookmark to /library still opens the app), hashed /assets/ cached for
 * a year, index.html never cached so an update shows up straight away.
 */

import { createReadStream, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".map": "application/json", ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};

/** A file inside `root` for this URL path, or null. Never leaves the folder (`..`, symlinks out, NUL). */
export function webFile(root: string, urlPath: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes("\0")) return null;
  const relativePath = decoded.replace(/^\/+/, "");
  try {
    const realRoot = realpathSync(root);
    const real = realpathSync(resolve(realRoot, relativePath || "index.html"));
    const rel = relative(realRoot, real);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    const stat = statSync(real);
    if (stat.isFile()) return real;
    if (stat.isDirectory()) {
      const index = resolve(real, "index.html");
      return statSync(index).isFile() ? index : null;
    }
  } catch { /* not there */ }
  return null;
}

/** Paths that belong to the brain, never to the web app's files. */
export const isApiPath = (path: string) => path === "/health" || path.startsWith("/api/") || path.startsWith("/rest/");

/**
 * Answer a GET or HEAD for the web app. Returns false when this isn't a web-app
 * request (or no WEB_ROOT is set), so the caller can answer 404 as before.
 */
export function serveWeb(req: IncomingMessage, res: ServerResponse, root: string, urlPath: string): boolean {
  if (!root || (req.method !== "GET" && req.method !== "HEAD") || isApiPath(urlPath)) return false;
  // A missing asset is a real 404 (a stale tab asking for last version's script), not the app.
  const asset = urlPath.startsWith("/assets/") || extname(urlPath) !== "";
  const file = webFile(root, urlPath) ?? (asset ? null : webFile(root, "/index.html"));
  if (!file) return false;
  const immutable = urlPath.startsWith("/assets/") && file !== webFile(root, "/index.html");
  const size = statSync(file).size;
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": size,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
  });
  if (req.method === "HEAD") { res.end(); return true; }
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
  return true;
}
