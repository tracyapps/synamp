/**
 * World radio, from radio-browser.info — a free, community-run directory of
 * about 50,000 stations. No account, no key.
 *
 * The brain does the talking so the browser never has to: searches go out from
 * here with SynAmp's name on them (the directory asks clients to identify
 * themselves), and the station's audio is relayed through the brain, so it
 * plays on an https page, works with the visualizers later (they need the audio
 * from our own address), and the station never sees your phone's address.
 *
 * Safety: the relay only fetches a station the directory (or your favourites)
 * told us about, never a URL from the browser, and never an address on your
 * own network.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

export class RadioError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type Station = {
  id: string; name: string; url: string; homepage?: string; tags: string[];
  country?: string; countrycode?: string; language?: string; codec?: string; bitrate?: number; votes?: number;
};
type RawStation = {
  stationuuid: string; name: string; url: string; url_resolved?: string; homepage?: string; tags?: string;
  country?: string; countrycode?: string; language?: string; codec?: string; bitrate?: number; votes?: number; hls?: number; lastcheckok?: number;
};

/** Moods aren't in the directory; these are the tags that sound like them. Said plainly in the app. */
export const MOODS: Record<string, string> = {
  Chill: "chillout", Focus: "lofi", Ambient: "ambient", Party: "dance", Jazz: "jazz", Classical: "classical",
  Soul: "soul", Rock: "rock", Electronic: "electronic", "Hip hop": "hiphop", Reggae: "reggae", News: "news",
};

const FALLBACK_SERVERS = ["de1.api.radio-browser.info", "de2.api.radio-browser.info", "fi1.api.radio-browser.info", "nl1.api.radio-browser.info"];
const USER_AGENT = "SynAmp/1.0 (+https://synamp.app)";

export function toStation(raw: RawStation): Station | null {
  const url = (raw.url_resolved || raw.url || "").trim();
  // HLS (.m3u8) is a playlist of chunks, not one stream: the relay can't pass it through.
  if (!raw.stationuuid || !raw.name?.trim() || !/^https?:\/\//i.test(url) || raw.hls === 1) return null;
  return {
    id: raw.stationuuid, name: raw.name.trim().slice(0, 120), url,
    tags: (raw.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
    ...(raw.homepage && /^https?:\/\//i.test(raw.homepage) ? { homepage: raw.homepage } : {}),
    ...(raw.country ? { country: raw.country } : {}), ...(raw.countrycode ? { countrycode: raw.countrycode } : {}),
    ...(raw.language ? { language: raw.language } : {}), ...(raw.codec ? { codec: raw.codec } : {}),
    ...(raw.bitrate ? { bitrate: raw.bitrate } : {}), ...(raw.votes ? { votes: raw.votes } : {}),
  };
}

/** Loopback, private, link-local, carrier-grade NAT and the like: your own network. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

export class Radio {
  private path: string;
  private fetchImpl: typeof fetch;
  private resolve: (host: string) => Promise<string[]>;
  favourites: Station[] = [];
  /** Stations seen in recent searches, so Play can find their stream. */
  private seen = new Map<string, Station>();
  private servers: { at: number; list: string[] } | null = null;

  constructor(path: string, options: { fetchImpl?: typeof fetch; resolve?: (host: string) => Promise<string[]> } = {}) {
    this.path = path;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.resolve = options.resolve ?? (async (host) => (await lookup(host, { all: true })).map((item) => item.address));
    try { this.favourites = (JSON.parse(readFileSync(path, "utf8")) as { favourites?: Station[] }).favourites ?? []; } catch { /* first run */ }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify({ format: "synamp.radio/1", favourites: this.favourites }) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  /** The directory's mirrors change; ask it which are up (once a day), and try them in turn. */
  private async serverList(): Promise<string[]> {
    if (this.servers && Date.now() - this.servers.at < 24 * 3600_000) return this.servers.list;
    try {
      const response = await this.fetchImpl("https://all.api.radio-browser.info/json/servers", { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) });
      const names = [...new Set(((await response.json()) as Array<{ name: string }>).map((item) => item.name).filter((name) => /\.api\.radio-browser\.info$/.test(name)))];
      if (names.length) { this.servers = { at: Date.now(), list: names.sort(() => Math.random() - 0.5) }; return this.servers.list; }
    } catch { /* use the known ones */ }
    return FALLBACK_SERVERS;
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams(params);
    let lastError: unknown;
    for (const server of await this.serverList()) {
      try {
        const response = await this.fetchImpl(`https://${server}${path}${query.size ? `?${query}` : ""}`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as T;
      } catch (error) { lastError = error; }
    }
    throw new RadioError(`The radio directory isn't answering right now (${(lastError as Error)?.message ?? "no servers"}). Try again in a minute.`, 502);
  }

  private remember(stations: Station[]): Station[] {
    for (const station of stations) this.seen.set(station.id, station);
    if (this.seen.size > 5000) this.seen = new Map([...this.seen].slice(-2500));
    return stations;
  }

  async search(options: { q?: string; tag?: string; country?: string; offset?: number }): Promise<Station[]> {
    const params: Record<string, string> = {
      hidebroken: "true", order: "clickcount", reverse: "true", limit: "60", offset: String(Math.max(0, Math.trunc(options.offset ?? 0))),
    };
    if (options.q?.trim()) params.name = options.q.trim().slice(0, 100);
    if (options.tag?.trim()) params.tag = options.tag.trim().toLowerCase().slice(0, 50);
    if (options.country && /^[A-Za-z]{2}$/.test(options.country)) params.countrycode = options.country.toUpperCase();
    const raw = await this.get<RawStation[]>("/json/stations/search", params);
    return this.remember(raw.map(toStation).filter((station): station is Station => !!station).slice(0, 40));
  }

  async countries(): Promise<Array<{ code: string; name: string; stations: number }>> {
    const raw = await this.get<Array<{ name: string; iso_3166_1: string; stationcount: number }>>("/json/countries", { hidebroken: "true", order: "name" });
    return raw.filter((item) => /^[A-Z]{2}$/.test(item.iso_3166_1) && item.stationcount >= 5)
      .map((item) => ({ code: item.iso_3166_1, name: item.name, stations: item.stationcount }));
  }

  addFavourite(id: unknown): Station {
    const station = typeof id === "string" ? this.seen.get(id) : undefined;
    if (!station) throw new RadioError("Search for the station again, then add it", 404);
    if (!this.favourites.some((item) => item.id === station.id)) { this.favourites.push(station); this.save(); }
    return station;
  }

  removeFavourite(id: unknown): void {
    this.favourites = this.favourites.filter((item) => item.id !== id);
    this.save();
  }

  /** A station we know about (favourite or recently seen), or the directory's answer for that ID. */
  async station(id: string): Promise<Station> {
    const known = this.favourites.find((item) => item.id === id) ?? this.seen.get(id);
    if (known) return known;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RadioError("Unknown station", 404);
    const [raw] = await this.get<RawStation[]>(`/json/stations/byuuid/${id}`);
    const station = raw ? toStation(raw) : null;
    if (!station) throw new RadioError("That station isn't in the directory any more", 404);
    return this.remember([station])[0]!;
  }

  /** Tell the directory someone listened (it ranks stations by this). Best effort. */
  countClick(id: string): void {
    this.get(`/json/url/${id}`).catch(() => undefined);
  }

  /** Relay a station's audio to the player, following redirects but never into your own network. */
  async relay(req: IncomingMessage, res: ServerResponse, station: Station): Promise<void> {
    let url = new URL(station.url);
    let upstream: Response | undefined;
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    for (let hop = 0; hop < 5; hop++) {
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host) ? [host] : await this.resolve(host).catch(() => []);
      if (!addresses.length) throw new RadioError("The station's address can't be found", 502);
      if (addresses.some(isPrivateAddress)) throw new RadioError("That station points inside your own network, so SynAmp won't play it", 403);
      // A station that never answers shouldn't hang the player: 10 s to start sending.
      const timer = setTimeout(() => controller.abort(), 10_000);
      upstream = await this.fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: { "user-agent": USER_AGENT, "icy-metadata": "0" } })
        .catch((error) => { throw new RadioError(`The station isn't answering (${controller.signal.aborted ? "no answer in 10 seconds" : (error as Error).message})`, 502); })
        .finally(() => clearTimeout(timer));
      const location = upstream.headers.get("location");
      if (upstream.status >= 300 && upstream.status < 400 && location) { url = new URL(location, url); continue; }
      break;
    }
    if (!upstream || !upstream.ok || !upstream.body) throw new RadioError(`The station isn't playing right now${upstream ? ` (HTTP ${upstream.status})` : ""}`, 502);
    const type = upstream.headers.get("content-type") ?? "audio/mpeg";
    if (/text\/html|application\/json/.test(type)) throw new RadioError("The station sent a web page instead of audio", 502);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    if (req.method === "HEAD") { controller.abort(); res.end(); return; }
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).on("error", () => res.destroy()).pipe(res);
  }
}
