/**
 * Optional Last.fm scrobbling, fed from the listening log.
 *
 * Off until the listener connects an account and turns it on. Then every play
 * the brain hears about — in the SynAmp player or in another app through the
 * Subsonic proxy — is checked against Last.fm's rules and sent.
 *
 *   - The outbox is DERIVED from the append-only event log, not a second queue:
 *     "eligible plays during an on-period, minus those already sent or refused".
 *     Restarts and outages therefore lose nothing; Last.fm accepts plays up to
 *     about two weeks old, older ones come back as refused and are shown.
 *   - Names leave the house only if they came from tags (the file's own, or
 *     Navidrome's). Folder-guessed names are held, never sent.
 *   - Retry only what Last.fm says to retry (offline / unavailable / rate
 *     limit), with backoff. A bad session pauses sending until reconnect.
 *     Anything else is recorded as refused, once.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import type { ListeningEvent } from "../session/events.ts";
import { LastfmError } from "./client.ts";
import type { LastfmClient, ScrobbleItem } from "./client.ts";

export const MIN_TRACK_SECONDS = 30;
export const HALF_OR_SECONDS = 240;

type State = {
  enabled: boolean;
  session?: { key: string; name: string };
  /** On-periods; a play counts if it started inside one. */
  periods: Array<{ from: number; to?: number }>;
  sent: string[];
  refused: Record<string, { code: number; message: string }>;
  backoff_until?: number;
  backoff_ms?: number;
  needs_reconnect?: boolean;
  last_error?: string;
  last_sent_at?: number;
};

export type Candidate = { event_id: string; item?: ScrobbleItem; held?: string };

/** Last.fm's rule: longer than 30 s, and played for half its length or 4 minutes. */
export function qualifies(playedMs: number, durationS: number | undefined): boolean {
  if (!durationS || durationS <= MIN_TRACK_SECONDS) return false;
  return playedMs / 1000 >= Math.min(durationS / 2, HALF_OR_SECONDS);
}

/** Turns one log event into a scrobble candidate, or nothing if it isn't a play. */
export function candidateFor(event: ListeningEvent, tracks: ReadonlyMap<string, LibraryTrack>): Candidate | null {
  if (event.signal === "external_play") {
    // The other app already applied its own play rule; Navidrome's tags supply the names.
    const d = event.detail ?? {};
    const title = typeof d.title === "string" ? d.title : "";
    const artist = typeof d.artist === "string" ? d.artist : "";
    const duration = typeof d.duration_s === "number" ? d.duration_s : undefined;
    if (!title || !artist) return { event_id: event.id, held: "song details were not available from the library core" };
    if (duration !== undefined && duration <= MIN_TRACK_SECONDS) return null;
    const started = typeof d.played_at === "number" ? d.played_at : event.ts;
    return { event_id: event.id, item: {
      artist, track: title, timestamp: Math.floor(started / 1000),
      ...(typeof d.album === "string" && d.album ? { album: d.album } : {}),
      ...(duration ? { duration } : {}),
    } };
  }
  if (event.signal !== "full_play" && event.signal !== "skip_late" && event.signal !== "skip_early") return null;
  const track = tracks.get(event.track_id);
  const durationS = event.duration_ms ? event.duration_ms / 1000 : track?.duration_s;
  if (!qualifies(event.play_ms ?? 0, durationS)) return null;
  if (!track) return { event_id: event.id, held: "track is not in the library index" };
  if (track.metadata_source !== "tags" || !track.artist) return { event_id: event.id, held: "names were guessed from folders, not read from tags" };
  return { event_id: event.id, item: {
    artist: track.artist, track: track.title, timestamp: Math.floor((event.ts - (event.play_ms ?? 0)) / 1000),
    ...(track.album ? { album: track.album } : {}),
    ...(track.album_artist && track.album_artist !== track.artist ? { albumArtist: track.album_artist } : {}),
    ...(durationS ? { duration: durationS } : {}),
  } };
}

export type ScrobblerStatus = {
  configured: boolean;
  connected: boolean;
  user?: string;
  enabled: boolean;
  needs_reconnect: boolean;
  pending: number;
  held: Array<{ reason: string; count: number }>;
  sent: number;
  refused: Array<{ event_id: string; code: number; message: string }>;
  last_error?: string;
  last_sent_at?: number;
  retry_at?: number;
};

export class Scrobbler {
  private path: string;
  private client?: LastfmClient;
  private state: State;
  private nonces = new Map<string, number>();
  private busy = false;
  now: () => number = Date.now;

  constructor(path: string, client?: LastfmClient) {
    this.path = path;
    this.client = client;
    try {
      this.state = { periods: [], sent: [], refused: {}, enabled: false, ...JSON.parse(readFileSync(path, "utf8")) as Partial<State> } as State;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = { enabled: false, periods: [], sent: [], refused: {} };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state, null, 2) + "\n", { mode: 0o600 }); // holds the session key
    renameSync(temp, this.path);
  }

  get configured(): boolean { return !!this.client; }

  // --- connecting -------------------------------------------------------------
  /** Starts web auth. The state nonce is what protects the (unauthenticated) callback. */
  connectUrl(callbackBase: string): string {
    if (!this.client) throw new LastfmError(-1, "Last.fm is not configured: set LASTFM_API_KEY and LASTFM_API_SECRET");
    const nonce = randomBytes(18).toString("base64url");
    this.nonces.set(nonce, this.now() + 10 * 60_000);
    return this.client.authUrl(`${callbackBase.replace(/\/$/, "")}/api/v1/lastfm/callback?state=${nonce}`);
  }

  async completeConnect(state: string | null, token: string | null): Promise<string> {
    if (!this.client) throw new LastfmError(-1, "Last.fm is not configured");
    const expiry = state ? this.nonces.get(state) : undefined;
    if (!state || !expiry || expiry < this.now()) throw new LastfmError(-1, "This sign-in link expired or was not started here. Start again from SynAmp.");
    this.nonces.delete(state);
    if (!token || !/^[A-Za-z0-9_-]{8,64}$/.test(token)) throw new LastfmError(-1, "Last.fm did not return a token");
    const session = await this.client.getSession(token);
    this.state.session = session;
    this.state.needs_reconnect = false;
    this.state.last_error = undefined;
    this.setEnabled(true);
    return session.name;
  }

  disconnect(): void {
    this.setEnabled(false);
    delete this.state.session;
    this.save();
  }

  setEnabled(on: boolean): void {
    const open = this.state.periods.at(-1);
    if (on && !this.state.session) throw new LastfmError(-1, "Connect a Last.fm account first");
    if (on && (!open || open.to !== undefined)) this.state.periods.push({ from: this.now() });
    if (!on && open && open.to === undefined) open.to = this.now();
    this.state.enabled = on;
    this.save();
  }

  // --- the outbox ---------------------------------------------------------------
  private inPeriod(ts: number): boolean {
    return this.state.periods.some((period) => ts >= period.from && (period.to === undefined || ts <= period.to));
  }

  candidates(events: readonly ListeningEvent[], library: Library): Candidate[] {
    const tracks = new Map(library.tracks.map((track) => [track.id, track]));
    const sent = new Set(this.state.sent);
    const out: Candidate[] = [];
    for (const event of events) {
      if (!this.inPeriod(event.ts) || sent.has(event.id) || this.state.refused[event.id]) continue;
      const candidate = candidateFor(event, tracks);
      if (candidate) out.push(candidate);
    }
    return out.sort((a, b) => (a.item?.timestamp ?? 0) - (b.item?.timestamp ?? 0));
  }

  status(events: readonly ListeningEvent[], library: Library): ScrobblerStatus {
    const candidates = this.candidates(events, library);
    const held = new Map<string, number>();
    for (const candidate of candidates) if (candidate.held) held.set(candidate.held, (held.get(candidate.held) ?? 0) + 1);
    return {
      configured: this.configured,
      connected: !!this.state.session,
      ...(this.state.session ? { user: this.state.session.name } : {}),
      enabled: this.state.enabled,
      needs_reconnect: !!this.state.needs_reconnect,
      pending: candidates.filter((candidate) => candidate.item).length,
      held: [...held].map(([reason, count]) => ({ reason, count })),
      sent: this.state.sent.length,
      refused: Object.entries(this.state.refused).slice(-20).map(([event_id, value]) => ({ event_id, ...value })),
      ...(this.state.last_error ? { last_error: this.state.last_error } : {}),
      ...(this.state.last_sent_at ? { last_sent_at: this.state.last_sent_at } : {}),
      ...(this.state.backoff_until && this.state.backoff_until > this.now() ? { retry_at: this.state.backoff_until } : {}),
    };
  }

  private backoff(message: string): void {
    const next = Math.min(60 * 60_000, Math.max(60_000, (this.state.backoff_ms ?? 30_000) * 2));
    this.state.backoff_ms = next;
    this.state.backoff_until = this.now() + next;
    this.state.last_error = message;
  }

  /** Sends what is due, oldest first, 50 at a time. Safe to call often. */
  async flush(events: readonly ListeningEvent[], library: Library): Promise<{ sent: number; refused: number }> {
    const result = { sent: 0, refused: 0 };
    const session = this.state.session;
    // Off means off: plays from an on-period wait (Last.fm takes up to ~2 weeks back) until it is on again.
    if (!this.client || !session || !this.state.enabled || this.busy || this.state.needs_reconnect) return result;
    if (this.state.backoff_until && this.state.backoff_until > this.now()) return result;
    this.busy = true;
    try {
      let due = this.candidates(events, library).filter((candidate): candidate is Candidate & { item: ScrobbleItem } => !!candidate.item);
      while (due.length) {
        const batch = due.slice(0, 50);
        due = due.slice(50);
        let results;
        try {
          results = await this.client.scrobble(session.key, batch.map((candidate) => candidate.item));
        } catch (error) {
          const failure = error instanceof LastfmError ? error : new LastfmError(0, String(error));
          if (failure.needsReconnect) { this.state.needs_reconnect = true; this.state.last_error = "Last.fm needs you to reconnect"; }
          else if (failure.retryable) this.backoff(failure.message);
          else {
            // Malformed by Last.fm's judgement: record once, don't loop on it.
            for (const candidate of batch) this.state.refused[candidate.event_id] = { code: failure.code, message: failure.message };
            result.refused += batch.length;
            this.state.last_error = failure.message;
            continue;
          }
          break;
        }
        results.forEach((item, index) => {
          const id = batch[index]!.event_id;
          if (item.accepted) { this.state.sent.push(id); result.sent++; }
          else if (item.code === 5) this.backoff("Last.fm daily scrobble limit reached"); // stays pending
          else { this.state.refused[id] = { code: item.code, message: item.message ?? "ignored" }; result.refused++; }
        });
        if (result.sent) { this.state.last_sent_at = this.now(); this.state.backoff_ms = undefined; this.state.backoff_until = undefined; this.state.last_error = undefined; }
      }
    } finally {
      this.busy = false;
      this.save();
    }
    return result;
  }

  /** Best effort; failures are ignored (now-playing is cosmetic on Last.fm). */
  async nowPlaying(item: Omit<ScrobbleItem, "timestamp">): Promise<void> {
    if (!this.client || !this.state.session || !this.state.enabled || this.state.needs_reconnect) return;
    try { await this.client.updateNowPlaying(this.state.session.key, item); } catch { /* cosmetic */ }
  }
}
