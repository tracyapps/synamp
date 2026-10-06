/**
 * Party mode: friends request songs from their phones, and you stay in charge.
 *
 * You start a party and get a short code (in a QR code). Guests open the party
 * page — no account, no app — search your library by song or artist, ask for
 * songs and vote for each other's requests. Requests wait for you: Play next,
 * or Dismiss. (Or switch on "Add requests by themselves" for an easy night.)
 *
 * What guests can see: what's playing, what's next, and song titles/artists
 * that match a search. Nothing else about your library, your playlists or your
 * listening. The code stops working the moment you end the party.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class PartyError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type PartyRequest = {
  id: string; track_id: string; title: string; artist?: string;
  /** The guest's name, if they gave one. */
  name?: string;
  /** Hashed guest ID — who asked (for "yours" and limits), never shown. */
  guest: string;
  votes: string[];
  at: number;
  status: "waiting" | "queued" | "dismissed";
};
type Party = { code: string; started_at: number; auto_add: boolean; requests: PartyRequest[] };

/** No 0/O, 1/I/L: easy to read off a screen and type on a phone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MAX_WAITING_PER_GUEST = 3;
export const REQUEST_GAP_MS = 15_000;

export function newCode(bytes = randomBytes(6)): string {
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Guests send a random ID their phone made up; only a hash of it is kept. */
export function guestKey(raw: unknown): string {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(raw)) throw new PartyError("Reload the party page and try again", 400);
  return createHash("sha256").update(`synamp-party:${raw}`).digest("base64url").slice(0, 16);
}

/** Keeps one guest from flooding the brain: so many calls a minute per key. */
export class RateLimit {
  private hits = new Map<string, number[]>();
  private perMinute: number;
  constructor(perMinute: number) { this.perMinute = perMinute; }
  check(key: string, now = Date.now()): void {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= this.perMinute) throw new PartyError("Slow down a little — try again in a moment", 429);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear();
  }
}

export class PartyStore {
  private path: string;
  party: Party | null = null;

  constructor(path: string) {
    this.path = path;
    try { this.party = (JSON.parse(readFileSync(path, "utf8")) as { party?: Party | null }).party ?? null; } catch { /* no party */ }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify({ format: "synamp.party/1", party: this.party }) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  start(autoAdd = false, now = Date.now()): Party {
    this.party = { code: newCode(), started_at: now, auto_add: autoAdd === true, requests: [] };
    this.save();
    return this.party;
  }

  end(): void { this.party = null; this.save(); }

  setAutoAdd(on: unknown): void {
    if (!this.party) throw new PartyError("There's no party on", 404);
    if (typeof on !== "boolean") throw new PartyError("auto_add must be true or false");
    this.party.auto_add = on;
    this.save();
  }

  /** The party for a code a guest typed (any case, spaces ignored), or a plain "no". */
  forCode(code: string): Party {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!this.party || clean !== this.party.code) throw new PartyError("That party has ended, or the code is wrong", 404);
    return this.party;
  }

  /** A guest asks for a song. Asking for one that's already waiting counts as a vote for it. */
  request(code: string, guest: string, track: { id: string; title: string; artist?: string }, name: unknown, now = Date.now()): PartyRequest {
    const party = this.forCode(code);
    const cleanName = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 30) : "";
    const existing = party.requests.find((item) => item.track_id === track.id && item.status === "waiting");
    if (existing) {
      if (!existing.votes.includes(guest)) existing.votes.push(guest);
      this.save();
      return existing;
    }
    const mine = party.requests.filter((item) => item.guest === guest);
    if (mine.filter((item) => item.status === "waiting").length >= MAX_WAITING_PER_GUEST) {
      throw new PartyError(`You have ${MAX_WAITING_PER_GUEST} songs waiting already — vote for other people's while you wait`, 429);
    }
    const lastAt = mine.length ? Math.max(...mine.map((item) => item.at)) : -Infinity;
    if (now - lastAt < REQUEST_GAP_MS) throw new PartyError("One song at a time — try again in a few seconds", 429);
    const request: PartyRequest = {
      id: randomBytes(6).toString("base64url"), track_id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}),
      ...(cleanName ? { name: cleanName } : {}), guest, votes: [guest], at: now, status: "waiting",
    };
    party.requests.push(request);
    if (party.requests.length > 500) party.requests = party.requests.filter((item) => item.status === "waiting").slice(-500);
    this.save();
    return request;
  }

  /** One vote per guest per request; voting again takes it back. */
  vote(code: string, guest: string, requestId: unknown): void {
    const party = this.forCode(code);
    const request = party.requests.find((item) => item.id === requestId && item.status === "waiting");
    if (!request) throw new PartyError("That request has already been played or taken off the list", 404);
    request.votes = request.votes.includes(guest) ? request.votes.filter((item) => item !== guest) : [...request.votes, guest];
    this.save();
  }

  /** The host's answer to a request. */
  decide(id: string, status: "queued" | "dismissed"): PartyRequest {
    const request = this.party?.requests.find((item) => item.id === id);
    if (!request) throw new PartyError("That request isn't there any more", 404);
    request.status = status;
    this.save();
    return request;
  }

  /** Waiting requests, most votes first, then oldest first. */
  waiting(): PartyRequest[] {
    return (this.party?.requests ?? []).filter((item) => item.status === "waiting")
      .sort((a, b) => b.votes.length - a.votes.length || a.at - b.at);
  }

  /** What a guest may see about the requests (no guest IDs). */
  guestRequests(guest?: string) {
    return this.waiting().map((item) => ({
      id: item.id, title: item.title, ...(item.artist ? { artist: item.artist } : {}), ...(item.name ? { name: item.name } : {}),
      votes: item.votes.length, ...(guest ? { mine: item.guest === guest, voted: item.votes.includes(guest) } : {}),
    }));
  }
}
