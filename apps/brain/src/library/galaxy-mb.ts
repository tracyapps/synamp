/**
 * Galaxy collaboration enrichment from MusicBrainz (LIBRARY-EXPLORER LE11).
 *
 * A background pass matches galaxy artists to MusicBrainz artists and pulls
 * their artist-to-artist relationships (collaborations, band membership,
 * support) into a durable local cache. The galaxy map merges those into its
 * edges so the Web view can show MusicBrainz-verified links beside the
 * feat-credit candidates parsed from your files. Never on the request path:
 * the map only ever reads what the cache already holds.
 *
 * Politeness: everything goes through the one rate-limited MusicBrainz client,
 * one artist at a time, re-checked monthly like the discography gaps.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { MusicBrainz } from "./musicbrainz.ts";
import { artistKey } from "./naming.ts";

const DAY = 86_400_000;
export const RECHECK_AFTER_MS = 30 * DAY;

/** Relationship types that say "these artists made music together". Personal
 * ties (family, teacher) and business roles are deliberately left out. */
const MUSICAL: Record<string, string> = {
  collaborator: "collaborator",
  "member of": "band member",
  subgroup: "related group",
  "supporting musician": "supporting musician",
  "instrumental support": "supporting musician",
  "vocal support": "supporting musician",
};

export type GalaxyMbRecord = {
  /** The galaxy artist name this record enriches (the base credit name). */
  name: string;
  status: "matched" | "not_found" | "ambiguous" | "error";
  mbid?: string;
  mb_name?: string;
  relations: Array<{ target: string; type: string; mbid: string }>;
  checked_at: number;
  error?: string;
};

type State = { format: "synamp.galaxy-mb/1"; artists: Record<string, GalaxyMbRecord> };

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}

export class GalaxyMbStore {
  private path: string;
  state: State;
  revision = 0;
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.galaxy-mb/1", artists: loaded.format === "synamp.galaxy-mb/1" ? loaded.artists ?? {} : {} };
  }
  save(): void { this.revision++; writeJson(this.path, this.state); }
  set(record: GalaxyMbRecord): void { this.state.artists[artistKey(record.name)] = record; this.save(); }
  byName(name: string): GalaxyMbRecord | undefined { return this.state.artists[artistKey(name)]; }
}

/** An MBID already proven for this name by the discography work, if any. */
export type MbSeed = { mbid: string; name: string };

/**
 * Match one galaxy artist and collect its musical relationships. The MBID is
 * taken from discography matches when available; otherwise a MusicBrainz name
 * search must return exactly one strong same-name candidate — anything less
 * stays "ambiguous" (retried monthly, never guessed).
 */
export async function enrichArtist(name: string, mb: MusicBrainz, seed: MbSeed | undefined, now = Date.now()): Promise<GalaxyMbRecord> {
  const base = { name, checked_at: now };
  let mbid = seed?.mbid;
  let mb_name = seed?.name;
  if (!mbid) {
    const candidates = await mb.searchArtists(name);
    const same = candidates.filter(candidate => artistKey(candidate.name) === artistKey(name) || artistKey(candidate.sort_name ?? "") === artistKey(name));
    const strong = same.filter(candidate => candidate.score >= 90);
    if (!candidates.length) return { ...base, status: "not_found", relations: [] };
    if (strong.length !== 1 && !(strong.length > 1 && strong[0]!.score === 100 && strong.slice(1).every(candidate => candidate.score < 90))) {
      return { ...base, status: "ambiguous", relations: [] };
    }
    mbid = strong[0]!.id;
    mb_name = strong[0]!.name;
  }
  const relations: GalaxyMbRecord["relations"] = [];
  for (const relation of await mb.artistRelations(mbid!)) {
    const label = MUSICAL[relation.type];
    if (!label) continue;
    relations.push({ target: relation.name, type: label, mbid: relation.mbid });
  }
  return { ...base, status: "matched", mbid: mbid!, ...(mb_name ? { mb_name } : {}), relations };
}

/** Candidates for work: unseen, monthly-stale, or failed more than a day ago. */
export function dueArtists(names: Array<{ name: string; priority: number }>, store: GalaxyMbStore, now = Date.now()): Array<{ name: string; priority: number }> {
  return names.filter(({ name }) => {
    const record = store.byName(name);
    if (!record) return true;
    if (record.status === "error") return now - record.checked_at > DAY;
    return now - record.checked_at > RECHECK_AFTER_MS;
  }).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

/** Background enrichment: one artist at a time, MusicBrainz-paced, pausable. */
export class GalaxyEnricher {
  state: "idle" | "running" | "paused" | "waiting" = "idle";
  current = "";
  lastError = "";
  done = 0;
  matched = 0;
  private stop = false;
  private store: GalaxyMbStore;
  private mb: () => MusicBrainz;
  private names: () => Array<{ name: string; priority: number }>;
  private seeds: () => MbSeed[];
  private sleep: (ms: number) => Promise<void>;

  constructor(store: GalaxyMbStore, mb: () => MusicBrainz, names: () => Array<{ name: string; priority: number }>, seeds: () => MbSeed[], sleep?: (ms: number) => Promise<void>) {
    this.store = store; this.mb = mb; this.names = names; this.seeds = seeds;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.matched = Object.values(store.state.artists).filter(record => record.status === "matched").length;
  }

  start(): Promise<void> | undefined {
    if (this.state === "running" || this.state === "waiting") return undefined;
    const client = this.mb(); // throws without a contact, before anything starts
    this.stop = false;
    this.state = "running";
    return this.loop(client);
  }
  pause(): void { this.stop = true; if (this.state !== "idle") this.state = "paused"; }

  private async loop(client: MusicBrainz): Promise<void> {
    let backoff = 30_000;
    const attempted = new Set<string>();
    while (!this.stop) {
      const next = dueArtists(this.names(), this.store).find(({ name }) => !attempted.has(artistKey(name)));
      if (!next) { this.state = "idle"; this.current = ""; return; }
      this.current = next.name;
      const seed = this.seeds().find(candidate => artistKey(candidate.name) === artistKey(next.name));
      try {
        const record = await enrichArtist(next.name, client, seed);
        attempted.add(artistKey(next.name));
        if (this.store.byName(next.name)?.status !== "matched" && record.status === "matched") this.matched++;
        this.store.set(record);
        this.done++;
        backoff = 30_000;
        this.lastError = "";
      } catch (error) {
        const failure = error as { message?: string; retryable?: boolean; status?: number };
        this.lastError = failure.message ?? String(error);
        const retryable = failure.retryable ?? (failure.status === 0 || failure.status === 429 || failure.status === 503 || (failure.status ?? 500) >= 500);
        if (retryable) {
          this.state = "waiting";
          await this.sleep(backoff);
          backoff = Math.min(backoff * 2, 15 * 60_000);
          if (!this.stop) this.state = "running";
        } else {
          this.store.set({ name: next.name, status: "error", relations: [], checked_at: Date.now(), error: this.lastError });
          attempted.add(artistKey(next.name));
        }
      }
    }
    this.current = "";
  }
}

/**
 * The enrichment view the galaxy map consumes: musical relations whose target
 * is also a library artist, keyed to galaxy artist keys, pair-normalised.
 */
export function mbRelationEdges(store: GalaxyMbStore, nameKeys: Map<string, string>, nameKey: (name: string) => string): Array<{ a: string; b: string; type: string }> {
  const edges: Array<{ a: string; b: string; type: string }> = [];
  for (const record of Object.values(store.state.artists)) {
    if (record.status !== "matched") continue;
    const source = nameKeys.get(nameKey(record.name));
    if (!source) continue;
    for (const relation of record.relations) {
      const target = nameKeys.get(nameKey(relation.target));
      if (!target || target === source) continue;
      edges.push(source < target ? { a: source, b: target, type: relation.type } : { a: target, b: source, type: relation.type });
    }
  }
  return edges;
}
