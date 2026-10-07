/**
 * Epoch-scoped learning core (`epoch-v1`) — one combined, bounded, explainable
 * value (A3 §3.2–3.7; mainline decisions 1–3).
 *
 * adjust(track) = L1 explicit-persistent cells
 *               + L2 epoch entity evidence (this session only)
 *               + artist propagation (π, capped)
 *               + reliability-weighted keep/skip centroids (small, gated)
 *
 * Saturation stays in evaluate.ts (`0.15·tanh(v/2)`) — this module returns the
 * raw sum plus per-part reasons, so the bonus can never outweigh the request.
 *
 * The L1/L2 split is the anti-leak core: implicit behaviour (skips, repeats,
 * full plays, other-app plays) is scored ONLY while its epoch is live (≤30 min
 * since the last event) and is killed — not decayed — at the boundary; skips
 * hidden on the 2nd occurrence and `not_now` hides die with the epoch too.
 * Explicit signals (love/thumbs/remove) are the only cross-epoch channel —
 * plus proposals, which change nothing until confirmed.
 *
 * Everything is a pure function of (events, opts, now): no clock reads, no
 * mutable state, identical inputs ⇒ byte-identical outputs with a fixed
 * part order.
 */

import { HALF_LIFE_DAYS } from "../session/feedback.ts";
import type { ListeningEvent } from "../session/events.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { activeEpoch, compareEvents, resolveEpochRuns } from "./epochs.ts";
import type { EpochRun } from "./epochs.ts";
import { AXIS_META, axisReliability } from "./reliability.ts";
import { generateProposals } from "./proposals.ts";
import type { Adjustment, EpochPolicyView, PolicyOptions, Proposal } from "./types.ts";
import { EPOCH_EVIDENCE, FEATURE, PERSISTENT_EVIDENCE } from "./types.ts";

export const EPOCH_POLICY_VERSION = "epoch-v1";
/** P3: minutes-scale forgetting inside an epoch (30 min half-life). */
export const EPOCH_HALF_LIFE_MS = 30 * 60_000;
/** P17: artist propagation needs at least this many events among the artist's other tracks… */
export const ARTIST_MIN_EVENTS = 2;
/** …or an absolute raw sum this large. */
export const ARTIST_MIN_SUM = 1.0;
/** Strict-mode thumbs (scope_persistence = global_only): ±1.0 magnitude, 0.9 confidence, epoch half-life. */
const SESSION_THUMB_UP = { label: "thumbs up (this session)", value: 0.9 };
const SESSION_THUMB_DOWN = { label: "thumbs down (this session)", value: -0.9 };

const DAY_MS = 86_400_000;
const round2 = (value: number) => Math.round(value * 100) / 100;
const listKey = (playlistId: string, trackId: string) => `${playlistId}\u0000${trackId}`;
const epochDecay = (ts: number, now: number) => Math.pow(0.5, Math.max(0, now - ts) / EPOCH_HALF_LIFE_MS);
const persistentDecay = (ts: number, now: number, days: number) => Math.pow(0.5, Math.max(0, now - ts) / (days * DAY_MS));

const medianOf = (sorted: readonly number[]): number => {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

type Cell = { value: number; parts: Map<string, number> };
const bump = (map: Map<string, Cell>, key: string, label: string, value: number): void => {
  const cell = map.get(key) ?? { value: 0, parts: new Map<string, number>() };
  cell.value += value;
  cell.parts.set(label, (cell.parts.get(label) ?? 0) + value);
  map.set(key, cell);
};

type EntityCell = { value: number; events: number; parts: Map<string, number> };
const addEntity = (map: Map<string, EntityCell>, key: string, label: string, value: number): void => {
  const cell = map.get(key) ?? { value: 0, events: 0, parts: new Map<string, number>() };
  cell.value += value;
  cell.events += 1;
  cell.parts.set(label, (cell.parts.get(label) ?? 0) + value);
  map.set(key, cell);
};
const addWeight = (map: Map<string, number>, key: string, value: number): void => {
  map.set(key, (map.get(key) ?? 0) + value);
};

/** Fixed display order for the epoch entity labels (determinism: stable label order). */
const ENTITY_LABEL_ORDER: readonly string[] = [
  EPOCH_EVIDENCE.full_play.label,
  EPOCH_EVIDENCE.repeat.label,
  EPOCH_EVIDENCE.skip_early.label,
  EPOCH_EVIDENCE.skip_late.label,
  EPOCH_EVIDENCE.external_play.label,
  EPOCH_EVIDENCE.not_now.label,
  SESSION_THUMB_UP.label,
  SESSION_THUMB_DOWN.label,
];

type AxisStat = { median: number; scale: number };
type AxisModel = { mean: number; spread: number; gate: number; covered: number; coverage: number };

export function deriveEpochPolicy(events: readonly ListeningEvent[], opts: PolicyOptions): EpochPolicyView {
  if (!opts || !Number.isFinite(opts.now)) {
    throw new Error("deriveEpochPolicy requires opts.now — the derivation never reads the wall clock");
  }
  const now = opts.now;
  const canonical = opts.canonical ?? ((id: string) => id);
  const scopePersistence = opts.scopePersistence ?? "declared";
  const library = opts.library;

  // --- epochs + the active evidence set (decisions 1–2, A3 §3.1) ---------------
  const runs = resolveEpochRuns(events, { timezone: opts.timezone });
  const epochs = runs.map((run) => run.epoch);
  const active = activeEpoch(epochs, now);
  const activeRun: EpochRun | null = active ? runs.find((run) => run.epoch === active) ?? null : null;

  // A `learning_reset` marker bounds the active epoch evidence: events before
  // the latest matching marker do not score and hides are recomputed from the
  // remainder, so they clear. The marker is matched by containment in the
  // epoch it was appended into (its detail.epoch_id, if present, is display
  // provenance — the id moves when the marker extends the epoch). Absence of
  // any marker changes nothing.
  let resetApplied = false;
  let evidence: readonly ListeningEvent[] = activeRun ? activeRun.events : [];
  if (activeRun) {
    let lastReset = -1;
    activeRun.events.forEach((event, index) => {
      if (event.signal !== "learning_reset") return;
      const scope = event.detail?.["scope"];
      if (scope === undefined || scope === "epoch") lastReset = index;
    });
    if (lastReset >= 0) {
      resetApplied = true;
      evidence = activeRun.events.slice(lastReset + 1);
    }
  }

  let count = 0;

  // --- L1: explicit-persistent cells (same semantics as v1 minus the moved
  // signals: no implicit cells, no not_now, no external_play, no strict-mode
  // playlist thumbs). ---------------------------------------------------------
  const sorted = [...events].sort(compareEvents);
  const removedCells = new Map<string, Map<string, boolean>>();
  const globalCells = new Map<string, Cell>();
  const playlistCells = new Map<string, Cell>();
  const negativesBy = new Map<string, Map<string, number>>();

  for (const event of sorted) {
    if (!Number.isFinite(event.ts)) continue; // torn input never breaks (or poisons) a replay
    const t = canonical(event.track_id);
    const g = persistentDecay(event.ts, now, HALF_LIFE_DAYS.global);
    const p = persistentDecay(event.ts, now, HALF_LIFE_DAYS.playlist);
    const pid = event.scope === "playlist" ? event.scope_id : undefined;
    switch (event.signal) {
      case "love":
        bump(globalCells, t, PERSISTENT_EVIDENCE.love.label, PERSISTENT_EVIDENCE.love.magnitude * g);
        count++;
        break;
      case "thumb_up":
        if (scopePersistence === "global_only" && pid) { count++; break; } // epoch-scoped under the strict reading (P25)
        if (pid) bump(playlistCells, listKey(pid, t), PERSISTENT_EVIDENCE.thumb_up_playlist.label, PERSISTENT_EVIDENCE.thumb_up_playlist.magnitude * p);
        else if (event.scope === "global") bump(globalCells, t, PERSISTENT_EVIDENCE.thumb_up_global.label, PERSISTENT_EVIDENCE.thumb_up_global.magnitude * g);
        count++;
        break;
      case "thumb_down":
        if (event.reason === "not_now") { count++; break; } // epoch hide + small epoch negative only (A3 §3.6 delta 4)
        if (scopePersistence === "global_only" && pid) { count++; break; }
        if (pid) bump(playlistCells, listKey(pid, t), PERSISTENT_EVIDENCE.thumb_down_playlist.label, PERSISTENT_EVIDENCE.thumb_down_playlist.magnitude * p);
        else if (event.scope === "global") bump(globalCells, t, PERSISTENT_EVIDENCE.thumb_down_global.label, PERSISTENT_EVIDENCE.thumb_down_global.magnitude * g);
        if (pid) {
          const map = negativesBy.get(t) ?? new Map<string, number>();
          map.set(pid, event.ts);
          negativesBy.set(t, map);
        }
        count++;
        break;
      case "remove":
      case "restore":
        if (event.reason === "not_now") { count++; break; } // like thumb_down not_now: this moment only
        if (pid) {
          const map = removedCells.get(pid) ?? new Map<string, boolean>();
          map.set(t, event.signal === "remove");
          removedCells.set(pid, map);
          const negative = negativesBy.get(t) ?? new Map<string, number>();
          if (event.signal === "remove") negative.set(pid, event.ts);
          else negative.delete(pid);
          negativesBy.set(t, negative);
        }
        count++;
        break;
      default:
        break;
    }
  }

  // Promotion (v1 semantics preserved): a negative is global when explicit or
  // corroborated across ≥ 2 playlists.
  for (const [t, byPlaylist] of negativesBy) {
    if (byPlaylist.size < 2) continue;
    const latest = Math.max(...byPlaylist.values());
    bump(globalCells, t, `turned down in ${byPlaylist.size} playlists`, -1 * persistentDecay(latest, now, HALF_LIFE_DAYS.global));
  }

  // --- L2: epoch entity evidence + hides + centroid seed sets -----------------
  const entity = new Map<string, EntityCell>();
  const skipCounts = new Map<string, number>();
  const notNowTracks = new Set<string>();
  const keptWeights = new Map<string, number>(); // K: keep-events + explicit positives in E
  const rejectedWeights = new Map<string, number>(); // R: corroborated negatives in E

  for (const event of evidence) {
    const t = canonical(event.track_id);
    const d = epochDecay(event.ts, now);
    switch (event.signal) {
      case "full_play":
        addEntity(entity, t, EPOCH_EVIDENCE.full_play.label, EPOCH_EVIDENCE.full_play.magnitude * EPOCH_EVIDENCE.full_play.confidence * d);
        addWeight(keptWeights, t, EPOCH_EVIDENCE.full_play.confidence * d);
        count++;
        break;
      case "repeat":
        addEntity(entity, t, EPOCH_EVIDENCE.repeat.label, EPOCH_EVIDENCE.repeat.magnitude * EPOCH_EVIDENCE.repeat.confidence * d);
        addWeight(keptWeights, t, EPOCH_EVIDENCE.repeat.confidence * d);
        count++;
        break;
      case "skip_early": {
        addEntity(entity, t, EPOCH_EVIDENCE.skip_early.label, EPOCH_EVIDENCE.skip_early.magnitude * EPOCH_EVIDENCE.skip_early.confidence * d);
        const k = (skipCounts.get(t) ?? 0) + 1;
        skipCounts.set(t, k);
        if (k >= 2) addWeight(rejectedWeights, t, EPOCH_EVIDENCE.skip_early.confidence * d); // hide-grade (P15)
        count++;
        break;
      }
      case "skip_late":
        addEntity(entity, t, EPOCH_EVIDENCE.skip_late.label, EPOCH_EVIDENCE.skip_late.magnitude * EPOCH_EVIDENCE.skip_late.confidence * d);
        count++;
        break;
      case "external_play":
        addEntity(entity, t, EPOCH_EVIDENCE.external_play.label, EPOCH_EVIDENCE.external_play.magnitude * EPOCH_EVIDENCE.external_play.confidence * d);
        count++;
        break;
      case "love": // explicit positive in E seeds the keep side (L1 does the scoring)
        addWeight(keptWeights, t, PERSISTENT_EVIDENCE.love.confidence * d);
        break;
      case "thumb_up":
        addWeight(keptWeights, t, PERSISTENT_EVIDENCE.thumb_up_playlist.confidence * d);
        if (scopePersistence === "global_only" && event.scope === "playlist") {
          addEntity(entity, t, SESSION_THUMB_UP.label, SESSION_THUMB_UP.value * d);
        }
        break;
      case "thumb_down":
        if (event.reason === "not_now") {
          addEntity(entity, t, EPOCH_EVIDENCE.not_now.label, EPOCH_EVIDENCE.not_now.magnitude * EPOCH_EVIDENCE.not_now.confidence * d);
          notNowTracks.add(t); // hide n=1 (P16)
          addWeight(rejectedWeights, t, EPOCH_EVIDENCE.not_now.confidence * d);
        } else {
          if (scopePersistence === "global_only" && event.scope === "playlist") {
            addEntity(entity, t, SESSION_THUMB_DOWN.label, SESSION_THUMB_DOWN.value * d);
          }
          if (event.reason === "wrong_energy" || event.reason === "wrong_vibe") addWeight(rejectedWeights, t, 0.9 * d);
        }
        break;
      case "remove":
        if (event.reason === "not_now") {
          addEntity(entity, t, EPOCH_EVIDENCE.not_now.label, EPOCH_EVIDENCE.not_now.magnitude * EPOCH_EVIDENCE.not_now.confidence * d);
          notNowTracks.add(t);
          addWeight(rejectedWeights, t, EPOCH_EVIDENCE.not_now.confidence * d);
        } else if (event.reason === "wrong_energy" || event.reason === "wrong_vibe") {
          addWeight(rejectedWeights, t, 0.9 * d);
        }
        break;
      case "learning_reset":
        break; // bounds the slice; scores nothing itself
      default:
        break;
    }
  }
  if (resetApplied) count++;

  const hides = new Set<string>();
  for (const [t, k] of skipCounts) if (k >= 2) hides.add(t);
  for (const t of notNowTracks) hides.add(t);

  // --- artist propagation (A3 eq. 2; P17) -------------------------------------
  const trackById = new Map<string, LibraryTrack>();
  const artistOf = new Map<string, string>();
  if (library) {
    for (const track of library.tracks) {
      trackById.set(track.id, track);
      if (track.artist) artistOf.set(track.id, track.artist);
    }
  }
  const artistAgg = new Map<string, { sum: number; events: number }>();
  for (const [t, cell] of entity) {
    const artist = artistOf.get(t);
    if (!artist) continue;
    const agg = artistAgg.get(artist) ?? { sum: 0, events: 0 };
    agg.sum += cell.value;
    agg.events += cell.events;
    artistAgg.set(artist, agg);
  }
  const artistContribution = (t: string): number => {
    const artist = artistOf.get(t);
    if (!artist) return 0;
    const agg = artistAgg.get(artist);
    if (!agg) return 0;
    const own = entity.get(t);
    const sumOther = agg.sum - (own ? own.value : 0);
    const eventsOther = agg.events - (own ? own.events : 0);
    if (eventsOther < ARTIST_MIN_EVENTS && Math.abs(sumOther) < ARTIST_MIN_SUM) return 0; // min-evidence gate
    return Math.max(-FEATURE.artist_cap, Math.min(FEATURE.artist_cap, FEATURE.artist_pi * sumOther));
  };

  // --- reliability-weighted keep/skip centroids (A3 §3.3c; P18–P20) -----------
  const stats = new Map<string, AxisStat>();
  if (library) {
    for (const meta of AXIS_META) {
      const values: number[] = [];
      for (const track of library.tracks) {
        const reliability = axisReliability(track, meta.field);
        if (reliability.usable && reliability.value !== undefined) values.push(reliability.value);
      }
      if (values.length < 4) continue; // too little to standardize honestly
      values.sort((a, b) => a - b);
      const median = medianOf(values);
      const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
      const scale = 1.4826 * medianOf(deviations);
      if (scale > 0) stats.set(meta.field, { median, scale });
    }
  }

  const buildAxisModel = (weights: Map<string, number>, minTracks: number): Map<string, AxisModel> => {
    const models = new Map<string, AxisModel>();
    const n = weights.size;
    for (const meta of AXIS_META) {
      const stat = stats.get(meta.field);
      const entries: Array<{ z: number; rw: number }> = [];
      if (stat) {
        for (const [id, weight] of weights) {
          const track = trackById.get(id);
          if (!track) continue;
          const reliability = axisReliability(track, meta.field);
          if (!reliability.usable || reliability.value === undefined) continue;
          entries.push({ z: (reliability.value - stat.median) / stat.scale, rw: reliability.weight * weight });
        }
      }
      if (!stat || !entries.length) {
        models.set(meta.field, { mean: 0, spread: 1, gate: 0, covered: 0, coverage: 0 });
        continue;
      }
      const totalWeight = entries.reduce((sum, entry) => sum + entry.rw, 0);
      const mean = entries.reduce((sum, entry) => sum + entry.rw * entry.z, 0) / totalWeight;
      const variance = entries.reduce((sum, entry) => sum + entry.rw * (entry.z - mean) ** 2, 0) / totalWeight;
      const spread = Math.max(FEATURE.spread_floor, Math.sqrt(variance));
      const coverage = entries.length / n;
      const gate = n >= minTracks ? Math.min(1, coverage / FEATURE.coverage) * (1 / (1 + spread * spread)) : 0;
      models.set(meta.field, { mean, spread, gate, covered: entries.length, coverage });
    }
    return models;
  };
  const keepModel = buildAxisModel(keptWeights, FEATURE.min_keeps);
  const rejectModel = buildAxisModel(rejectedWeights, FEATURE.min_rejects);
  const kernel = (z: number, model: AxisModel) => Math.exp(-0.5 * ((z - model.mean) / model.spread) ** 2);

  const featureContribution = (track: LibraryTrack): { total: number; parts: Array<{ label: string; value: number }> } => {
    const parts: Array<{ label: string; value: number }> = [];
    let total = 0;
    for (const meta of AXIS_META) {
      const stat = stats.get(meta.field);
      if (!stat) continue;
      const reliability = axisReliability(track, meta.field);
      if (!reliability.usable || reliability.value === undefined) continue;
      const z = (reliability.value - stat.median) / stat.scale;
      const keep = keepModel.get(meta.field);
      const reject = rejectModel.get(meta.field);
      if (!keep || !reject) continue;
      let contribution = 0;
      if (keep.gate > 0) contribution += keep.gate * FEATURE.beta * kernel(z, keep);
      if (reject.gate > 0) contribution -= reject.gate * FEATURE.gamma * kernel(z, reject);
      if (Math.abs(contribution) < 0.005) continue;
      total += contribution;
      const model = contribution > 0 ? keep : reject;
      const center = stat.median + model.mean * stat.scale;
      const unit = meta.unit ? ` ${meta.unit}` : "";
      const target = `${meta.name} ~${center.toFixed(meta.decimals)}${unit}`;
      const label =
        contribution > 0
          ? `${target} — you kept ${keptWeights.size} such tracks this session`
          : `${target} — near this session's skips`;
      parts.push({ label, value: round2(contribution) });
    }
    return { total: Math.max(-FEATURE.total_cap, Math.min(FEATURE.total_cap, total)), parts };
  };

  // --- reliability notes (deterministic order) ---------------------------------
  const tempoNotes: string[] = [];
  {
    const seen = new Set<string>();
    for (const id of [...keptWeights.keys()].sort()) {
      if (tempoNotes.length >= 3) break;
      const track = trackById.get(id);
      if (!track) continue;
      const reliability = axisReliability(track, "bpm");
      if (reliability.usable && reliability.weight < 1 && reliability.note && !seen.has(reliability.note)) {
        seen.add(reliability.note);
        tempoNotes.push(reliability.note);
      }
    }
  }

  const buildNotes = (): string[] => {
    if (!active) return ["no active session — learning is paused"];
    const notes: string[] = [];
    if (resetApplied) notes.push("session learning was reset — only what happened after the reset counts");
    const learnedSomething = entity.size > 0 || keptWeights.size > 0 || rejectedWeights.size > 0 || hides.size > 0;
    if (!learnedSomething) notes.push("nothing learned yet this session");
    const nK = keptWeights.size;
    const nR = rejectedWeights.size;
    if (nK > 0 && nK < FEATURE.min_keeps) {
      notes.push(`feature bands not learned yet: only ${nK} kept track${nK === 1 ? "" : "s"} this session (need ${FEATURE.min_keeps})`);
    } else if (nK >= FEATURE.min_keeps) {
      if (!library) {
        notes.push("feature bands not learned this session: the library is not loaded");
      } else {
        for (const meta of AXIS_META) {
          const model = keepModel.get(meta.field);
          if (!model || model.coverage >= FEATURE.coverage) continue;
          const stat = stats.get(meta.field);
          notes.push(
            stat
              ? `${meta.name} band not learned this session: ${model.covered} of ${nK} kept tracks have a usable value`
              : `${meta.name} band not learned this session: too few ${meta.name} measurements in the library to standardize`,
          );
        }
      }
    }
    if (nR === 1) notes.push(`skip side not learned yet: only 1 skipped track this session (need ${FEATURE.min_rejects})`);
    notes.push(...tempoNotes);
    return notes;
  };
  const noteList = buildNotes();

  // --- the combined value -------------------------------------------------------
  const adjust = (trackId: string, playlistId?: string): Adjustment => {
    const t = canonical(trackId);
    const parts: Array<{ label: string; value: number }> = [];
    let value = 0;

    const globalCell = globalCells.get(t);
    if (globalCell) {
      value += globalCell.value;
      for (const [label, cellValue] of globalCell.parts) {
        const rounded = round2(cellValue);
        if (rounded !== 0) parts.push({ label, value: rounded });
      }
    }
    const playlistCell = playlistId ? playlistCells.get(listKey(playlistId, t)) : undefined;
    if (playlistCell) {
      value += playlistCell.value;
      for (const [label, cellValue] of playlistCell.parts) {
        const rounded = round2(cellValue);
        if (rounded !== 0) parts.push({ label, value: rounded });
      }
    }

    const entityCell = entity.get(t);
    if (entityCell) {
      value += entityCell.value;
      for (const label of ENTITY_LABEL_ORDER) {
        const cellValue = entityCell.parts.get(label);
        if (cellValue === undefined) continue;
        const rounded = round2(cellValue);
        if (rounded !== 0) parts.push({ label, value: rounded });
      }
    }

    const artistName = artistOf.get(t);
    if (artistName !== undefined) {
      const artistValue = artistContribution(t);
      if (artistValue !== 0) {
        value += artistValue;
        const rounded = round2(artistValue);
        if (rounded !== 0) parts.push({ label: `other tracks by ${artistName} this session`, value: rounded });
      }
    }

    const track = trackById.get(t);
    if (active && track) {
      const feature = featureContribution(track);
      value += feature.total;
      parts.push(...feature.parts);
    }

    return { value, parts };
  };

  const removed = (playlistId: string): ReadonlySet<string> => {
    const cells = removedCells.get(playlistId);
    return new Set(cells ? [...cells].filter(([, on]) => on).map(([id]) => id) : []);
  };

  const proposals: Proposal[] = generateProposals(runs, {
    now,
    library,
    canonical,
    excludeEpochId: active ? active.id : null,
  });

  return {
    policy_version: "epoch-v1",
    events: count,
    removed,
    adjust,
    epoch: active,
    epochHides: () => new Set(hides),
    proposals: () => proposals.slice(),
    reliabilityNotes: () => noteList.slice(),
  };
}
