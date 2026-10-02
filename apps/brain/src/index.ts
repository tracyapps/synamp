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

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.ts";
import { PlaylistError, PlaylistStore } from "./playlists.ts";
import type { CreateNode, TrackRef } from "./playlists.ts";
import { draftPlan } from "./query/draft.ts";
import { evaluatePlan } from "./query/evaluate.ts";
import { LibrarySource } from "./query/library.ts";
import { validatePlan } from "./query/plan.ts";
import { REGISTRY_VERSION, SIGNALS } from "./query/signals.ts";
import { EventLog } from "./session/events.ts";
import { deriveFeedback, FeedbackError, recordFeedback } from "./session/feedback.ts";
import type { FeedbackInput, FeedbackView } from "./session/feedback.ts";
import { SessionError, SessionStore } from "./session/session.ts";
import type { Session } from "./session/session.ts";
import { resolveInside, sendFile, StreamSigner } from "./session/stream.ts";
import { POLICY_VERSION } from "./session/events.ts";
import type { ListeningEvent } from "./session/events.ts";
import { relativeFromReported, trackIdForPath } from "./subsonic/identity.ts";
import { createSubsonicProxy } from "./subsonic/proxy.ts";
import type { CapturedPlay } from "./subsonic/proxy.ts";
import { LastfmClient, LastfmError } from "./lastfm/client.ts";
import { Scrobbler } from "./lastfm/scrobbler.ts";

const STARTED_AT = Date.now();
const library = new LibrarySource(config.librarySignalsPath);
const dataDir = dirname(config.playlistDataPath);
const events = new EventLog(config.eventsPath || join(dataDir, "events.jsonl"));
const sessions = new SessionStore(config.sessionPath || join(dataDir, "session.json"), events);
const signer = new StreamSigner(config.playlistApiToken || undefined);
const scrobbler = new Scrobbler(config.lastfmStatePath || join(dataDir, "lastfm.json"),
  config.lastfmApiKey && config.lastfmApiSecret ? new LastfmClient({ apiKey: config.lastfmApiKey, secret: config.lastfmApiSecret }) : undefined);

/** After new events: tell Last.fm what's playing now, and send finished plays soon. */
let flushTimer: NodeJS.Timeout | undefined;
function afterEvents(added: readonly ListeningEvent[]): void {
  if (!scrobbler.configured) return;
  const lib = library.get();
  for (const event of added) {
    if (event.signal === "started") {
      const track = lib.tracks.find((item) => item.id === event.track_id);
      if (track?.metadata_source === "tags" && track.artist) {
        void scrobbler.nowPlaying({ artist: track.artist, track: track.title, ...(track.album ? { album: track.album } : {}) });
      }
    }
    if (event.signal === "now_playing" && typeof event.detail?.title === "string" && typeof event.detail?.artist === "string") {
      void scrobbler.nowPlaying({ artist: event.detail.artist, track: event.detail.title, ...(typeof event.detail.album === "string" ? { album: event.detail.album } : {}) });
    }
  }
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { void scrobbler.flush(events.all(), library.get()); }, 5_000);
}
setInterval(() => { void scrobbler.flush(events.all(), library.get()).catch((error) => console.error("Last.fm flush failed", error)); }, 60_000).unref();

/** Plays reported by other Subsonic apps, mapped onto library IDs by real path. */
function recordCaptured(plays: CapturedPlay[]): void {
  const added: ListeningEvent[] = [];
  for (const play of plays) {
    const relative = relativeFromReported(play.song?.path, config.coreMusicPath);
    // Look the path up first: a moved track keeps its original ID, which hashing the new path would miss.
    const trackId = relative ? (library.idForPath(relative) ?? trackIdForPath(relative)) : `subsonic:${play.songId}`;
    const when = play.time ?? Date.now();
    const key = `${play.user ?? ""}|${play.client ?? ""}|${play.songId}|${play.submission}|${play.time ?? Math.floor(when / 60_000)}`;
    const id = `${play.submission ? "ext" : "np"}:${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
    const detail: Record<string, string | number | boolean> = { mapped: !!relative, subsonic_id: play.songId, played_at: when };
    if (play.client) detail.client = play.client;
    if (play.song?.title) detail.title = play.song.title;
    if (play.song?.artist) detail.artist = play.song.artist;
    if (play.song?.album) detail.album = play.song.album;
    if (play.song?.duration) detail.duration_s = play.song.duration;
    const result = events.append({
      id, ts: when, signal: play.submission ? "external_play" : "now_playing", track_id: trackId,
      scope: play.submission ? "global" : "none", source: "subsonic", policy_version: POLICY_VERSION, detail,
    });
    if (!result.duplicate) added.push(result.event);
  }
  afterEvents(added);
}
const subsonic = createSubsonicProxy({ coreUrl: config.coreUrl, onPlays: recordCaptured });

function callbackBase(req: IncomingMessage): string {
  if (config.publicUrl) return config.publicUrl;
  const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0]!.trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0]!.trim();
  return `${proto}://${host}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function sendPage(res: ServerResponse, status: number, title: string, message: string): void {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · SynAmp</title><body style="font:16px/1.6 system-ui;background:#0e0e10;color:#ececec;max-width:36rem;margin:15vh auto;padding:0 20px">
<h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a style="color:#e0a33e" href="/">Back to SynAmp</a></p></body></html>`;
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html), "x-content-type-options": "nosniff" });
  res.end(html);
}

/** Derived feedback, recomputed only when the log grows. */
let feedbackCache: { size: number; version: string; view: FeedbackView } | undefined;
function feedback(): FeedbackView {
  const size = events.all().length;
  const version = library.get().version;
  if (!feedbackCache || feedbackCache.size !== size || feedbackCache.version !== version) {
    feedbackCache = { size, version, view: deriveFeedback(events.all(), Date.now(), (id) => library.canonicalId(id)) };
  }
  return feedbackCache.view;
}
/**
 * Saved plans are re-validated on use, so a registry change that retires a field
 * surfaces as an error instead of a silently different playlist.
 */
function evaluateSaved(plan: unknown, playlistId: string) {
  const checked = validatePlan(plan);
  if (!checked.ok) throw new PlaylistError("This smart playlist's saved plan is no longer valid; re-create it", 409);
  return evaluatePlan(checked, library.get(), { feedback: feedback(), playlistId });
}
const playlists = new PlaylistStore(config.playlistDataPath, {
  // Re-evaluated on every read: a newly analysed track joins without a restart.
  resolveSmart: (plan, _hash, playlistId) => evaluateSaved(plan, playlistId).strict
    .map((track) => ({ id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}) })),
});

/** The session as clients see it: each entry says whether it can be streamed, and from where. */
function sessionView(session: Session) {
  const lib = library.get();
  const byId = new Map(lib.tracks.map((track) => [track.id, track]));
  return {
    ...session,
    queue: session.queue.map((entry) => {
      const track = byId.get(entry.track_id);
      const playable = !!(track?.path && resolveInside(config.libraryPath, track.path));
      return { ...entry, playable, ...(playable ? { stream_url: signer.url(entry.track_id) } : {}) };
    }),
  };
}

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

  // Subsonic apps: forwarded to the library core as-is; Navidrome does the auth.
  if (url.pathname.startsWith("/rest/")) return subsonic(req, res);

  // The Last.fm sign-in callback is a browser navigation, so it carries no bearer token.
  // The one-time state nonce issued by /lastfm/connect is what authorises it.
  if (path === "/api/v1/lastfm/callback" && req.method === "GET") {
    try {
      const name = await scrobbler.completeConnect(url.searchParams.get("state"), url.searchParams.get("token"));
      return sendPage(res, 200, "Last.fm connected", `Scrobbling is on for ${name}. You can close this tab — plays from now on will be sent.`);
    } catch (error) {
      return sendPage(res, 400, "Last.fm was not connected", (error as Error).message);
    }
  }

  // Streams are not here: <audio> cannot send a bearer token, so they carry a signed, expiring URL instead.
  const protectedPath = ["/api/v1/playlists", "/api/v1/plans", "/api/v1/library", "/api/v1/session", "/api/v1/feedback", "/api/v1/events",
    "/api/v1/lastfm", "/api/v1/listening"]
    .some((prefix) => path.startsWith(prefix));
  if (protectedPath && config.playlistApiToken &&
      req.headers.authorization !== `Bearer ${config.playlistApiToken}`) {
    return send(res, 401, { error: "unauthorized" });
  }

  const nodePath = path.match(/^\/api\/v1\/playlists\/([^/]+)$/);
  const resolvePath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/resolve$/);
  const tracksPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/tracks$/);
  const trackPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/tracks\/(\d+)$/);
  const explainPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/explain$/);

  // --- listening: session, reports, feedback, streaming ----------------------
  const streamPath = path.match(/^\/api\/v1\/tracks\/([^/]+)\/stream$/);
  if (streamPath && (req.method === "GET" || req.method === "HEAD")) {
    const trackId = decodeURIComponent(streamPath[1]!);
    if (!signer.verify(trackId, url.searchParams.get("exp"), url.searchParams.get("sig"))) return send(res, 403, { error: "invalid or expired stream link" });
    const track = library.get().tracks.find((item) => item.id === trackId);
    const file = track?.path ? resolveInside(config.libraryPath, track.path) : null;
    if (!file) return send(res, 404, { error: "no audio file for this track" });
    return sendFile(req, res, file);
  }
  if (path === "/api/v1/session" && req.method === "GET") return send(res, 200, { session: sessionView(sessions.get()) });
  if (path === "/api/v1/session/queue" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.playlist_id !== "string") throw new SessionError("playlist_id is required");
    const node = playlists.list().find((item) => item.id === input.playlist_id);
    if (!node) throw new PlaylistError("Playlist node not found", 404);
    // A snapshot: later membership changes do not touch what is queued.
    const tracks = playlists.resolve(node.id);
    const session = sessions.replaceQueue(String(input.event_id ?? ""), tracks,
      { playlist_id: node.id, ...(node.type === "smart" ? { plan_hash: node.planHash } : {}) }, Number(input.start_index ?? 0));
    return send(res, 200, { session: sessionView(session) });
  }
  if (path === "/api/v1/session/report" && req.method === "POST") {
    const input = await body(req);
    const result = sessions.report(String(input.event_id ?? ""), input.report);
    afterEvents(result.derived);
    return send(res, 200, { session: sessionView(result.session), derived: result.derived.map((event) => event.signal), duplicate: result.duplicate });
  }
  if (path === "/api/v1/feedback" && req.method === "POST") {
    const input = (await body(req)) as unknown as FeedbackInput;
    const result = recordFeedback(events, { ...input, session_id: input.session_id ?? sessions.get().id });
    // In a hand-made playlist, "remove" also takes the track out of the list itself.
    if (!result.duplicate && input.signal === "remove" && input.playlist_id) {
      const node = playlists.list().find((item) => item.id === input.playlist_id);
      if (node?.type === "playlist") {
        const index = node.tracks.findIndex((track) => track.id === input.track_id);
        if (index >= 0) playlists.removeTrack(node.id, index);
      }
    }
    return send(res, result.duplicate ? 200 : 201, { event: result.event, duplicate: result.duplicate });
  }
  if (path === "/api/v1/listening" && req.method === "GET") {
    const external = events.all().filter((event) => event.source === "subsonic");
    const byClient: Record<string, number> = {};
    for (const event of external) if (event.signal === "external_play") {
      const client = String(event.detail?.client ?? "unknown app");
      byClient[client] = (byClient[client] ?? 0) + 1;
    }
    return send(res, 200, {
      other_apps: {
        plays: external.filter((event) => event.signal === "external_play").length,
        unmatched: external.filter((event) => event.signal === "external_play" && event.detail?.mapped === false).length,
        by_client: byClient,
        last_at: external.at(-1)?.ts ?? null,
      },
      lastfm: scrobbler.status(events.all(), library.get()),
    });
  }
  if (path === "/api/v1/lastfm/connect" && req.method === "POST") return send(res, 200, { url: scrobbler.connectUrl(callbackBase(req)) });
  if (path === "/api/v1/lastfm/settings" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.enabled !== "boolean") throw new PlaylistError("enabled must be true or false");
    scrobbler.setEnabled(input.enabled);
    if (input.enabled) afterEvents([]);
    return send(res, 200, { lastfm: scrobbler.status(events.all(), library.get()) });
  }
  if (path === "/api/v1/lastfm/disconnect" && req.method === "POST") {
    scrobbler.disconnect();
    return send(res, 200, { lastfm: scrobbler.status(events.all(), library.get()) });
  }
  if (path === "/api/v1/lastfm/flush" && req.method === "POST") {
    const result = await scrobbler.flush(events.all(), library.get());
    return send(res, 200, { result, lastfm: scrobbler.status(events.all(), library.get()) });
  }
  if (path === "/api/v1/events" && req.method === "GET") {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const visible = events.all().filter((event) => event.signal !== "receipt" && event.signal !== "exposure");
    return send(res, 200, { policy_version: feedback().policy_version, total: visible.length, events: visible.slice(-limit).reverse() });
  }

  // --- natural-language plans ---------------------------------------------
  if (path === "/api/v1/plans/draft" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 500) {
      throw new PlaylistError("prompt must be 1–500 characters");
    }
    const lib = library.get();
    const draft = draftPlan(input.prompt, lib);
    const checked = validatePlan(draft.plan);
    return send(res, 200, {
      parser: "rule-based draft (no LLM yet)",
      recognized: draft.recognized,
      unparsed: draft.unparsed,
      encoder_text: draft.encoder_text,
      validation: checked,
      preview: checked.ok ? evaluatePlan(checked, lib, { feedback: feedback() }) : null,
    });
  }
  if (path === "/api/v1/plans/evaluate" && req.method === "POST") {
    const checked = validatePlan((await body(req)).plan);
    if (!checked.ok) return send(res, 422, { validation: checked });
    return send(res, 200, { validation: checked, result: evaluatePlan(checked, library.get(), { feedback: feedback() }) });
  }
  if (path === "/api/v1/library" && req.method === "GET") {
    const lib = library.get();
    return send(res, 200, { version: lib.version, tracks: lib.tracks.length, rejected: library.rejected, source: config.librarySignalsPath });
  }
  if (path === "/api/v1/plans/fields" && req.method === "GET") {
    return send(res, 200, { registry: REGISTRY_VERSION, fields: [...SIGNALS.values()] });
  }
  if (explainPath && req.method === "GET") {
    const node = playlists.list().find((item) => item.id === explainPath[1]);
    if (!node) throw new PlaylistError("Playlist node not found", 404);
    if (node.type !== "smart") throw new PlaylistError("Only smart playlists have an explanation");
    return send(res, 200, { result: evaluateSaved(node.plan, node.id) });
  }
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

    default:
      return send(res, 404, { error: "not_found", path });
  }
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    if (error instanceof PlaylistError || error instanceof SessionError || error instanceof FeedbackError) {
      return send(res, error.status, { error: error.message });
    }
    if (error instanceof LastfmError) return send(res, error.code === -1 ? 400 : 502, { error: error.message });
    console.error("Brain request failed", error);
    send(res, 500, { error: "internal_error" });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`synamp-brain listening on http://${config.host}:${config.port}`);
});
