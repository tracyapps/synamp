/**
 * A small, polite MusicBrainz client (https://musicbrainz.org/doc/MusicBrainz_API).
 *
 * MusicBrainz asks for about one request per second per IP and a User-Agent
 * with a way to contact the person running the software. Both are enforced
 * here: requests are queued and spaced, and the client refuses to start
 * without a contact. Release data in MusicBrainz's core is CC0.
 */

export const MB_API = "https://musicbrainz.org/ws/2";
const SPACING_MS = 1100;

export type MbTrack = { position: number; number: string; title: string; length_ms?: number };
export type MbMedium = { position: number; format?: string; tracks: MbTrack[] };
export type MbRelease = {
  id: string;
  title: string;
  artist: string;
  date?: string;
  country?: string;
  disambiguation?: string;
  status?: string;
  track_count: number;
  media: MbMedium[];
};
export type MbCandidate = Omit<MbRelease, "media"> & { score: number; formats: string[] };

export class MusicBrainzError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
  get retryable(): boolean { return this.status === 0 || this.status === 429 || this.status === 503 || this.status >= 500; }
}

type RawCredit = Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;
const credit = (raw: RawCredit | undefined) => (raw ?? []).map((part) => (part.name ?? part.artist?.name ?? "") + (part.joinphrase ?? "")).join("").trim();

/** Lucene escaping for MusicBrainz search terms. */
export function luceneEscape(text: string): string {
  return text.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

export class MusicBrainz {
  private contact: string;
  private doFetch: typeof fetch;
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;

  constructor(options: { contact: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }) {
    if (!options.contact.trim()) throw new MusicBrainzError("MusicBrainz asks for a contact (email or URL): set MUSICBRAINZ_CONTACT", 400);
    this.contact = options.contact.trim();
    this.doFetch = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  get userAgent(): string { return `SynAmp/0.1 ( ${this.contact} )`; }

  /** Every request goes through one queue, spaced at least SPACING_MS apart. */
  private get<T>(path: string): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.last + SPACING_MS - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      let response: Response;
      try {
        response = await this.doFetch(`${MB_API}${path}`, { headers: { "user-agent": this.userAgent, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      } catch (error) {
        throw new MusicBrainzError(`network: ${(error as Error).message}`);
      }
      if (!response.ok) throw new MusicBrainzError(`MusicBrainz answered HTTP ${response.status}`, response.status);
      return await response.json() as T;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async searchReleases(album: string, artist: string | undefined, limit = 8): Promise<MbCandidate[]> {
    const terms = [`release:"${luceneEscape(album)}"`];
    if (artist && !/^various( artists)?$/i.test(artist)) terms.push(`artist:"${luceneEscape(artist)}"`);
    const data = await this.get<{ releases?: Array<Record<string, unknown>> }>(
      `/release?query=${encodeURIComponent(terms.join(" AND "))}&limit=${limit}&fmt=json`);
    return (data.releases ?? []).map((raw) => ({
      id: String(raw.id),
      title: String(raw.title ?? ""),
      artist: credit(raw["artist-credit"] as RawCredit),
      ...(typeof raw.date === "string" && raw.date ? { date: raw.date } : {}),
      ...(typeof raw.country === "string" ? { country: raw.country } : {}),
      ...(typeof raw.disambiguation === "string" && raw.disambiguation ? { disambiguation: raw.disambiguation } : {}),
      ...(typeof raw.status === "string" ? { status: raw.status } : {}),
      score: Number(raw.score ?? 0),
      track_count: Number(raw["track-count"] ?? 0),
      formats: ((raw.media as Array<{ format?: string }>) ?? []).map((m) => m.format ?? "?"),
    }));
  }

  async release(id: string): Promise<MbRelease> {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new MusicBrainzError("Not a MusicBrainz release ID", 400);
    const raw = await this.get<Record<string, unknown>>(`/release/${id}?inc=recordings+artist-credits&fmt=json`);
    const media = ((raw.media as Array<Record<string, unknown>>) ?? []).map((medium, index) => ({
      position: Number(medium.position ?? index + 1),
      ...(typeof medium.format === "string" ? { format: medium.format } : {}),
      tracks: ((medium.tracks as Array<Record<string, unknown>>) ?? []).map((track, i) => ({
        position: Number(track.position ?? i + 1),
        number: String(track.number ?? track.position ?? i + 1),
        title: String(track.title ?? (track.recording as { title?: string } | undefined)?.title ?? ""),
        ...(typeof track.length === "number" ? { length_ms: track.length } : {}),
      })),
    }));
    return {
      id: String(raw.id),
      title: String(raw.title ?? ""),
      artist: credit(raw["artist-credit"] as RawCredit),
      ...(typeof raw.date === "string" && raw.date ? { date: raw.date } : {}),
      ...(typeof raw.country === "string" ? { country: raw.country } : {}),
      ...(typeof raw.disambiguation === "string" && raw.disambiguation ? { disambiguation: raw.disambiguation } : {}),
      ...(typeof raw.status === "string" ? { status: raw.status } : {}),
      track_count: media.reduce((sum, medium) => sum + medium.tracks.length, 0),
      media,
    };
  }
}
