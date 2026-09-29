/**
 * SynAmp brain — HTTP API.
 *
 * Phase 0 skeleton. Deliberately framework-free (node:http) so it runs on a bare
 * Node install with no build step, via native TypeScript type stripping.
 *
 * Architectural rule this file exists to establish: **the server owns the
 * playback session.** Party requests and the DJ display (Phase 6) are thin
 * clients of this state, not owners of it.
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.ts";
import { PlaylistError, PlaylistStore } from "./playlists.ts";
import type { CreateNode, TrackRef } from "./playlists.ts";

const STARTED_AT = Date.now();
const playlists = new PlaylistStore(config.playlistDataPath);

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2) + "\n";
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let input = "";
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 64_000) throw new PlaylistError("Request body too large", 413);
  }
  try {
    const value: unknown = JSON.parse(input);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new PlaylistError("Invalid JSON object"); }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path.startsWith("/api/v1/playlists") && config.playlistApiToken &&
      req.headers.authorization !== `Bearer ${config.playlistApiToken}`) {
    return send(res, 401, { error: "unauthorized" });
  }

  const nodePath = path.match(/^\/api\/v1\/playlists\/([^/]+)$/);
  const resolvePath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/resolve$/);
  const tracksPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/tracks$/);
  const trackPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/tracks\/(\d+)$/);
  if (path === "/api/v1/playlists" && req.method === "GET") {
    return send(res, 200, { nodes: playlists.list() });
  }
  if (path === "/api/v1/playlists" && req.method === "POST") {
    return send(res, 201, { node: playlists.create((await body(req)) as CreateNode) });
  }
  if (resolvePath && req.method === "GET") {
    return send(res, 200, { tracks: playlists.resolve(resolvePath[1]!) });
  }
  if (tracksPath && req.method === "POST") {
    return send(res, 201, { node: playlists.addTrack(tracksPath[1]!, (await body(req)) as TrackRef) });
  }
  if (trackPath && req.method === "DELETE") {
    return send(res, 200, { node: playlists.removeTrack(trackPath[1]!, Number(trackPath[2])) });
  }
  if (nodePath && req.method === "DELETE") {
    playlists.delete(nodePath[1]!);
    return send(res, 200, { deleted: true });
  }

  switch (path) {
    case "/health":
      return send(res, 200, {
        status: "ok",
        service: "synamp-brain",
        uptimeMs: Date.now() - STARTED_AT,
      });

    // Phase 2/6: the authoritative playback session (queue, history, participants).
    case "/api/v1/session":
      return send(res, 200, {
        nowPlaying: null,
        queue: [],
        history: [],
        participants: [],
      });

    default:
      return send(res, 404, { error: "not_found", path });
  }
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    if (error instanceof PlaylistError) return send(res, error.status, { error: error.message });
    console.error("Brain request failed", error);
    send(res, 500, { error: "internal_error" });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`synamp-brain listening on http://${config.host}:${config.port}`);
});
