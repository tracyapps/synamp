/**
 * Arc sequencing — deterministic re-ordering of an already-filtered strict list.
 *
 * This module NEVER filters, adds, or scores: it only permutes the tracks
 * evaluatePlan() already chose, so every hard guard (explicit exclusions,
 * hidden-by-you, caps) stays true at every position.
 *
 * Pace/energy proxy — “intensity” below means exactly this measured proxy
 * (documented, produced fields only — A1 §2 conventions):
 *   intensity = weighted average of clamped components, null components skipped:
 *     bpm            [60, 180]  weight 0.35  — damped ×0.5 when tempo_confidence
 *                                             is < 0.5 OR unknown (octave errors are
 *                                             a known failure class on hard material)
 *     onset_rate     [0, 8]     weight 0.25
 *     percussiveness [0, 1]     weight 0.20
 *     lufs_integrated[-24, -4]  weight 0.20  — loudness ≠ perceived intensity (CC-43..45),
 *                                             so it gets the smallest weight
 *   Pacing leads, then event density, then texture, then level.
 *
 * Coverage gate: usable measurements on ≥ 60 % of the list, else the ranked order
 * is returned untouched with an honest note ("not enough measured pace/energy data").
 *
 * Unknown-intensity placement (deterministic, documented): a track with no
 * usable components keeps its original position in the list; the measured
 * tracks are ordered into the remaining slots per the arc. Unknown never
 * counts as low ("null is never zero").
 *
 * Arcs (fixed key = ascending intensity where "asc" is the measured sort):
 *   build    → asc (low → high)
 *   cooldown → desc (high → low)
 *   peak     → asc even-indexes then desc odd-indexes: rises to the top, then relaxes
 *   wave     → interleave upper half / lower half starting high (alternating, deterministic)
 */

import type { QueryPlan } from "./plan.ts";
import type { Library, LibraryTrack, ResultTrack } from "./evaluate.ts";

export type SequencedTracks = { tracks: ResultTrack[]; applied: string[] };

const COVERAGE_MIN = 0.6;

type Component = { field: string; low: number; high: number; weight: number; dampWhenConfidenceLow?: boolean };

const COMPONENTS: readonly Component[] = [
  { field: "bpm", low: 60, high: 180, weight: 0.35, dampWhenConfidenceLow: true },
  { field: "onset_rate", low: 0, high: 8, weight: 0.25 },
  { field: "percussiveness", low: 0, high: 1, weight: 0.2 },
  { field: "lufs_integrated", low: -24, high: -4, weight: 0.2 },
];

function measured(track: LibraryTrack, field: string): number | null {
  const value = track.signals?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function intensityOf(track: LibraryTrack): number | null {
  let sum = 0;
  let weight = 0;
  for (const component of COMPONENTS) {
    const value = measured(track, component.field);
    if (value === null) continue;
    let term = Math.min(1, Math.max(0, (value - component.low) / (component.high - component.low)));
    if (component.dampWhenConfidenceLow) {
      const confidence = measured(track, "tempo_confidence");
      if (confidence === null || confidence < 0.5) term *= 0.5;
    }
    sum += component.weight * term;
    weight += component.weight;
  }
  return weight > 0 ? sum / weight : null;
}

function percent(coverage: number): number {
  return Math.round(coverage * 100);
}

/** Deterministic merge: unknowns keep their original slots; measured tracks fill the rest. */
function arrange(tracks: ResultTrack[], intensities: Array<number | null>, ascending: number[]): ResultTrack[] {
  const pool = [...ascending];
  const out: ResultTrack[] = [];
  for (let position = 0; position < tracks.length; position++) {
    if (intensities[position] === null) out.push(tracks[position]!);
    else {
      const next = pool.shift();
      // Defensive check (F1 hotfix): an arc order shorter than the measured slots is a
      // bug in this module — fail loudly instead of emitting `undefined` (which would
      // serialise to `null` and break the resolve/queue paths downstream).
      if (next === undefined) throw new Error("sequence: arc order exhausted the pool for a measured slot — internal bug, no track emitted");
      out.push(tracks[next]!);
    }
  }
  return out;
}

function arcOrder(tracks: ResultTrack[], intensities: Array<number | null>, arc: string): ResultTrack[] {
  const positions = tracks.map((_, index) => index);
  const known = positions.filter((index) => intensities[index] !== null);
  known.sort((a, b) => (intensities[a]! - intensities[b]!) || a - b); // ascending, stable on input order
  if (arc === "build") return arrange(tracks, intensities, known);
  if (arc === "cooldown") return arrange(tracks, intensities, [...known].reverse());
  if (arc === "peak") {
    const evens = known.filter((_, index) => index % 2 === 0);
    const odds = known.filter((_, index) => index % 2 === 1);
    return arrange(tracks, intensities, [...evens, ...odds.reverse()]);
  }
  if (arc === "wave") {
    const half = Math.ceil(known.length / 2);
    const lower = known.slice(0, half);
    const upper = known.slice(half);
    const alternated: number[] = [];
    // Odd counts give the lower half one extra element; interleave over the LONGER
    // side with tight guards so every measured track is emitted exactly once (F1).
    const count = Math.max(lower.length, upper.length);
    for (let index = 0; index < count; index++) {
      const high = upper[index];
      const low = lower[index];
      if (high !== undefined) alternated.push(high);
      if (low !== undefined) alternated.push(low);
    }
    return arrange(tracks, intensities, alternated);
  }
  return [...tracks]; // unreachable through the validator; kept honest if it ever is
}

/**
 * Apply the plan's arc to the strict list. Returns the input order unchanged
 * (with a note) when there is not enough measured pace/energy data; `flat` / no arc
 * is a no-op with no notes.
 */
export function sequenceTracks(tracks: ResultTrack[], plan: QueryPlan, opts: { library: Library }): SequencedTracks {
  const arc = plan.sequencing?.arc;
  if (!arc || arc === "flat") return { tracks: [...tracks], applied: [] };

  const byId = new Map(opts.library.tracks.map((track) => [track.id, track]));
  const intensities = tracks.map((track) => {
    const libraryTrack = byId.get(track.id);
    return libraryTrack ? intensityOf(libraryTrack) : null;
  });
  const measuredCount = intensities.filter((value) => value !== null).length;
  const coverage = tracks.length ? measuredCount / tracks.length : 0;

  if (coverage < COVERAGE_MIN) {
    return {
      tracks: [...tracks],
      applied: [`arc ${arc}: not enough measured pace/energy data (${percent(coverage)}% coverage) — kept the ranked order`],
    };
  }

  const ordered = arcOrder(tracks, intensities, arc);
  const unknown = tracks.length - measuredCount;
  const proxy = "measured pace/energy proxy (bpm, onsets, percussion, loudness)";
  const note = unknown
    ? `arc ${arc}: ordered by ${proxy} — ${percent(coverage)}% coverage, ${unknown} track${unknown === 1 ? "" : "s"} without measurements kept in place`
    : `arc ${arc}: ordered by ${proxy} — ${percent(coverage)}% coverage`;
  return { tracks: ordered, applied: [note] };
}
