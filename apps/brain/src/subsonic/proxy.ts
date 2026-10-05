/**
 * Subsonic pass-through that notices plays.
 *
 * Phone and desktop apps (Symfonium, play:Sub, Feishin, …) talk Subsonic to
 * Navidrome. They report what they played with the standard `scrobble` call:
 * `submission=false` means "now playing", `submission=true` means "played" (the
 * app has already applied its own rule, usually half the track or 4 minutes).
 *
 * The edge routes /rest/* here; this forwards every request to Navidrome
 * untouched (streams are piped, never buffered) and, only for a scrobble that
 * Navidrome itself accepted, looks the song up and hands the play to the brain.
 * So authentication stays Navidrome's job: a request Navidrome rejects records
 * nothing.
 *
 * What it cannot see: skips. Subsonic apps don't report them, so plays from
 * other apps are a weak positive and never a negative.
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";

export type ReportedSong = { id: string; title?: string; artist?: string; album?: string; duration?: number; path?: string };
export type CapturedPlay = {
  /** true = played (counts), false = now playing (informational). */
  submission: boolean;
  songId: string;
  /** When the app says it was listened to (ms since epoch), if given. */
  time?: number;
  client?: string;
  user?: string;
  song?: ReportedSong;
};

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host"]);
/** Auth and protocol params a lookup must reuse so Navidrome treats it as the same user. */
const AUTH_PARAMS = ["u", "p", "t", "s", "v", "c", "apiKey"];

function isScrobble(pathname: string): boolean {
  return /^\/rest\/scrobble(\.view)?$/.test(pathname);
}

function readBody(req: IncomingMessage, limit = 64_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Did the Subsonic server say ok? Works for JSON and XML responses. */
export function subsonicOk(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try { return (JSON.parse(trimmed) as { "subsonic-response"?: { status?: string } })["subsonic-response"]?.status === "ok"; }
    catch { return false; }
  }
  return /<subsonic-response[^>]*\bstatus="ok"/.test(trimmed);
}

/** All params from the query string and, for a form POST, the body (OpenSubsonic allows both). */
export function scrobbleParams(url: URL, body?: Buffer, contentType?: string): URLSearchParams {
  const params = new URLSearchParams(url.search);
  if (body?.length && (contentType ?? "").includes("application/x-www-form-urlencoded")) {
    for (const [key, value] of new URLSearchParams(body.toString("utf8"))) params.append(key, value);
  }
  return params;
}

export function playsFrom(params: URLSearchParams): CapturedPlay[] {
  const ids = params.getAll("id").filter((id) => id && id.length <= 200).slice(0, 50);
  const times = params.getAll("time");
  const submission = (params.get("submission") ?? "true").toLowerCase() !== "false";
  return ids.map((songId, index) => {
    const time = Number(times[index]);
    return {
      submission, songId,
      ...(Number.isFinite(time) && time > 0 ? { time } : {}),
      ...(params.get("c") ? { client: params.get("c")!.slice(0, 80) } : {}),
      ...(params.get("u") ? { user: params.get("u")!.slice(0, 80) } : {}),
    };
  });
}

export type ProxyOptions = {
  coreUrl: string;
  onPlays: (plays: CapturedPlay[]) => void;
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

export function createSubsonicProxy(options: ProxyOptions) {
  const core = new URL(options.coreUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const log = options.log ?? ((message: string) => console.warn(message));

  async function lookup(params: URLSearchParams, songId: string): Promise<ReportedSong | undefined> {
    const query = new URLSearchParams();
    for (const key of AUTH_PARAMS) { const value = params.get(key); if (value !== null) query.set(key, value); }
    query.set("f", "json");
    query.set("id", songId);
    try {
      const response = await doFetch(new URL(`/rest/getSong.view?${query}`, core), { signal: AbortSignal.timeout(5000) });
      const data = await response.json() as { "subsonic-response"?: { status?: string; song?: ReportedSong } };
      const song = data["subsonic-response"]?.song;
      return data["subsonic-response"]?.status === "ok" && song ? song : undefined;
    } catch (error) {
      log(`subsonic: could not look up song ${songId}: ${(error as Error).message}`);
      return undefined;
    }
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://placeholder");
    const scrobble = isScrobble(url.pathname);
    const body = scrobble && req.method === "POST" ? await readBody(req) : undefined;

    const headers: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined && !HOP_BY_HOP.has(key.toLowerCase())) headers[key] = value;
    }
    const forwardedFor = [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", ");
    if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
    if (body) headers["content-length"] = String(body.length);

    const send = core.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = send({
      protocol: core.protocol, hostname: core.hostname, port: core.port || (core.protocol === "https:" ? 443 : 80),
      method: req.method, path: url.pathname + url.search, headers,
    }, (response) => {
      const outHeaders: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined && !HOP_BY_HOP.has(key.toLowerCase())) outHeaders[key] = value;
      }
      if (!scrobble) {
        // Everything except scrobble is piped straight through — including audio streams.
        res.writeHead(response.statusCode ?? 502, outHeaders);
        response.pipe(res);
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const payload = Buffer.concat(chunks);
        res.writeHead(response.statusCode ?? 502, { ...outHeaders, "content-length": String(payload.length) });
        res.end(payload);
        // Only after Navidrome accepted it: a rejected (unauthenticated) call records nothing.
        if ((response.statusCode ?? 0) >= 400 || !subsonicOk(payload.toString("utf8"))) return;
        const params = scrobbleParams(url, body, req.headers["content-type"]);
        const plays = playsFrom(params);
        Promise.all(plays.map(async (play) => ({ ...play, song: await lookup(params, play.songId) })))
          .then((resolved) => options.onPlays(resolved))
          .catch((error) => log(`subsonic: failed to record plays: ${(error as Error).message}`));
      });
    });
    // A listener who closes the app mid-song should not leave a stream running upstream.
    res.on("close", () => { if (!res.writableFinished) upstream.destroy(); });
    upstream.on("error", (error) => {
      log(`subsonic: library core unreachable: ${error.message}`);
      if (!res.headersSent) { res.writeHead(502, { "content-type": "application/json" }); res.end('{"error":"library core unreachable"}'); }
      else res.destroy();
    });
    if (body) upstream.end(body);
    else req.pipe(upstream);
  };
}
