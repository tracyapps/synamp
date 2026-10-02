/**
 * Minimal Last.fm API client: web auth, scrobble, now playing.
 * Spec: https://www.last.fm/api/scrobbling and https://www.last.fm/api/webauth
 *
 * Requests are signed: md5 of every parameter (except `format` and `callback`)
 * as name+value pairs sorted by name, followed by the shared secret.
 */

import { createHash } from "node:crypto";

export const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
export const LASTFM_AUTH = "https://www.last.fm/api/auth/";

export type ScrobbleItem = {
  artist: string;
  track: string;
  /** Unix seconds when the track STARTED playing. */
  timestamp: number;
  album?: string;
  albumArtist?: string;
  /** Seconds. */
  duration?: number;
};

export class LastfmError extends Error {
  code: number;
  constructor(code: number, message: string) { super(message); this.code = code; }
  /** Last.fm says: retry 11 (offline) and 16 (temporarily unavailable). Network failures are code 0. */
  get retryable(): boolean { return this.code === 0 || this.code === 11 || this.code === 16 || this.code === 29; }
  /** 9 (invalid session) and 4/14/15 (auth failures) need the listener to reconnect. */
  get needsReconnect(): boolean { return [4, 9, 14, 15].includes(this.code); }
}

export function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params).filter((key) => key !== "format" && key !== "callback").sort()
    .map((key) => key + params[key]).join("");
  return createHash("md5").update(base + secret, "utf8").digest("hex");
}

export type ItemResult = { accepted: boolean; code: number; message?: string };

export class LastfmClient {
  private apiKey: string;
  private secret: string;
  private doFetch: typeof fetch;

  constructor(options: { apiKey: string; secret: string; fetchImpl?: typeof fetch }) {
    this.apiKey = options.apiKey;
    this.secret = options.secret;
    this.doFetch = options.fetchImpl ?? fetch;
  }

  authUrl(callback: string): string {
    return `${LASTFM_AUTH}?api_key=${encodeURIComponent(this.apiKey)}&cb=${encodeURIComponent(callback)}`;
  }

  private async call(params: Record<string, string>): Promise<Record<string, unknown>> {
    const signed = { ...params, api_key: this.apiKey };
    const body = new URLSearchParams({ ...signed, api_sig: sign(signed, this.secret), format: "json" });
    let response: Response;
    try {
      response = await this.doFetch(LASTFM_API, {
        method: "POST", body, headers: { "user-agent": "SynAmp/0.1 (self-hosted)" }, signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new LastfmError(0, `network: ${(error as Error).message}`);
    }
    let data: Record<string, unknown>;
    try { data = await response.json() as Record<string, unknown>; }
    catch { throw new LastfmError(response.status >= 500 ? 16 : 0, `unreadable response (HTTP ${response.status})`); }
    // Inspect the body whatever the HTTP status: errors arrive as {error, message}.
    if (typeof data.error === "number") throw new LastfmError(data.error, String(data.message ?? "Last.fm error"));
    if (!response.ok) throw new LastfmError(response.status >= 500 ? 16 : 0, `HTTP ${response.status}`);
    return data;
  }

  async getSession(token: string): Promise<{ key: string; name: string }> {
    const data = await this.call({ method: "auth.getSession", token });
    const session = data.session as { key?: string; name?: string } | undefined;
    if (!session?.key || !session.name) throw new LastfmError(0, "Last.fm returned no session");
    return { key: session.key, name: session.name };
  }

  private itemParams(item: ScrobbleItem, index?: number): Record<string, string> {
    const suffix = index === undefined ? "" : `[${index}]`;
    const params: Record<string, string> = { [`artist${suffix}`]: item.artist, [`track${suffix}`]: item.track };
    if (index !== undefined) params[`timestamp${suffix}`] = String(item.timestamp);
    if (item.album) params[`album${suffix}`] = item.album;
    if (item.albumArtist) params[`albumArtist${suffix}`] = item.albumArtist;
    if (item.duration) params[`duration${suffix}`] = String(Math.round(item.duration));
    return params;
  }

  async updateNowPlaying(sessionKey: string, item: Omit<ScrobbleItem, "timestamp">): Promise<void> {
    await this.call({ method: "track.updateNowPlaying", sk: sessionKey, ...this.itemParams({ ...item, timestamp: 0 }) });
  }

  /** Up to 50 per call. Returns one result per item, in order. */
  async scrobble(sessionKey: string, items: ScrobbleItem[]): Promise<ItemResult[]> {
    if (!items.length) return [];
    if (items.length > 50) throw new Error("Last.fm accepts at most 50 scrobbles per request");
    const params: Record<string, string> = { method: "track.scrobble", sk: sessionKey };
    items.forEach((item, index) => Object.assign(params, this.itemParams(item, index)));
    const data = await this.call(params);
    const block = (data.scrobbles ?? {}) as { scrobble?: unknown };
    const list = Array.isArray(block.scrobble) ? block.scrobble : block.scrobble ? [block.scrobble] : [];
    return items.map((_, index) => {
      const entry = list[index] as { ignoredMessage?: { code?: string | number; "#text"?: string } } | undefined;
      const code = Number(entry?.ignoredMessage?.code ?? 0);
      return { accepted: code === 0, code, ...(code ? { message: entry?.ignoredMessage?.["#text"] || "ignored by Last.fm" } : {}) };
    });
  }
}
