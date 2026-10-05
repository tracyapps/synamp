/**
 * Library health: what the analyzer is doing (reported from the machine it runs
 * on) and what the library index says about the collection.
 *
 * The analyzer runs on the Mac; the brain runs on the NAS. The analyzer POSTs a
 * progress report every ~15 s while it works, and once when a scan or run ends.
 * The brain keeps the latest one (on disk, so a restart still shows it) and
 * flags it as stale when reports stop — usually the Mac went to sleep.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library } from "../query/evaluate.ts";

export const PROGRESS_FORMAT = "synamp.analysis-progress/1";
/** Two missed reports and a margin: after this, "analyzing" is shown as "stopped reporting". */
export const STALE_AFTER_MS = 2 * 60_000;

export class HealthError extends Error {
  status = 400;
}

type Progress = Record<string, unknown> & { format: string; state: string; received_at: number };

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const text = (value: unknown, max = 300) => (typeof value === "string" ? value.slice(0, max) : undefined);

/** Keeps only the fields the UI uses, with types checked: the report comes over the network. */
export function cleanProgress(input: unknown, now = Date.now()): Progress {
  if (!isObject(input) || input.format !== PROGRESS_FORMAT) throw new HealthError(`Expected a ${PROGRESS_FORMAT} report`);
  const state = ["analyzing", "idle", "scanning"].includes(String(input.state)) ? String(input.state) : "idle";
  const catalog = isObject(input.catalog) ? input.catalog : {};
  const queue = isObject(input.queue) ? input.queue : {};
  const stages = isObject(input.stages) ? input.stages : {};
  const run = isObject(input.run) ? input.run : {};
  const order = Array.isArray(input.stage_order) ? input.stage_order.filter((s): s is string => typeof s === "string").slice(0, 20) : Object.keys(stages);
  const optionalNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
  return {
    format: PROGRESS_FORMAT,
    received_at: now,
    state,
    analyzer_version: text(input.analyzer_version, 40) ?? "unknown",
    host: text(input.host, 120) ?? "unknown",
    catalog: { tracks: count(catalog.tracks), present: count(catalog.present), missing: count(catalog.missing) },
    queue: { pending: count(queue.pending), running: count(queue.running), done: count(queue.done), failed: count(queue.failed) },
    stage_order: order,
    stages: Object.fromEntries(order.map((stage) => [stage, count(stages[stage])])),
    fully_analysed: count(input.fully_analysed),
    fingerprints: isObject(input.fingerprints) ? Object.fromEntries(Object.entries(input.fingerprints).slice(0, 10).map(([k, v]) => [k.slice(0, 40), count(v)])) : {},
    recent_failures: Array.isArray(input.recent_failures) ? input.recent_failures.slice(0, 20).filter(isObject).map((f) => ({
      path: text(f.path) ?? "", error: text(f.error) ?? "", attempts: count(f.attempts),
    })) : [],
    run: {
      started_at: optionalNumber(run.started_at), completed: count(run.completed), failed: count(run.failed),
      reused: count(run.reused), remaining: count(run.remaining), current: text(run.current, 200) ?? "",
      rate_per_minute: optionalNumber(run.rate_per_minute), eta_seconds: optionalNumber(run.eta_seconds),
      ...(isObject(run.last_scan) ? { last_scan: Object.fromEntries(Object.entries(run.last_scan).slice(0, 20).map(([k, v]) => [k.slice(0, 40), count(v)])) } : {}),
    },
  };
}

export class AnalysisStatus {
  private path: string;
  private latest: Progress | null = null;

  constructor(path: string) {
    this.path = path;
    try { this.latest = JSON.parse(readFileSync(path, "utf8")) as Progress; } catch { this.latest = null; }
  }

  record(input: unknown, now = Date.now()): Progress {
    const progress = cleanProgress(input, now);
    this.latest = progress;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(progress) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
    return progress;
  }

  view(now = Date.now()) {
    if (!this.latest) return { reported: false as const };
    const age = now - this.latest.received_at;
    const stale = this.latest.state !== "idle" && age > STALE_AFTER_MS;
    return { reported: true as const, stale, age_ms: age, ...this.latest };
  }
}

/** What the library index (the analyzer export) says about the collection. */
export function libraryStats(library: Library) {
  const tracks = library.tracks;
  const byHash = new Map<string, number>();
  let tagged = 0, folderNamed = 0, hashed = 0, analysed = 0;
  for (const track of tracks) {
    if (track.metadata_source === "tags") tagged++;
    else folderNamed++;
    if (track.audio_hash) { hashed++; byHash.set(track.audio_hash, (byHash.get(track.audio_hash) ?? 0) + 1); }
    if (track.signals && Object.keys(track.signals).length) analysed++;
  }
  const groups = [...byHash.values()].filter((n) => n > 1);
  const artists = new Set(tracks.map((track) => track.artist?.toLowerCase()).filter(Boolean));
  const albums = new Set(tracks.filter((track) => track.album).map((track) => `${track.artist?.toLowerCase() ?? ""}\u0000${track.album!.toLowerCase()}`));
  return {
    version: library.version,
    tracks: tracks.length,
    artists: artists.size,
    albums: albums.size,
    named_from_tags: tagged,
    named_from_folders: folderNamed,
    with_audio_identity: hashed,
    with_measurements: analysed,
    duplicate_groups: groups.length,
    duplicate_extra_copies: groups.reduce((sum, n) => sum + n - 1, 0),
  };
}
