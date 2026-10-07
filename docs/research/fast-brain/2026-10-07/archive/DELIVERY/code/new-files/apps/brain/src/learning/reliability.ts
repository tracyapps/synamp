/**
 * Per-axis reliability for the learning centroids (A3 §3.3c, dispatch §3).
 *
 * The centroid term standardizes each axis with robust library stats and
 * weights every observation by how much its raw measurement can be trusted:
 *
 *   - `bpm` → `tempo_confidence`: null or ≤ 0.2 is unusable (too uncertain to
 *     learn from); < 0.5 is down-weighted by the confidence itself. Human
 *     spot-check corrections arrive in the library data as confidence 1 by
 *     design (spotcheck.ts), so they need no special case here.
 *   - other produced scalar axes → weight 1.0 (placeholder until producers
 *     expose uncertainty — an honest gap, not a claim).
 *   - declared / missing fields → unusable. Never zero-filled: an unmeasured
 *     axis contributes nothing and is reported, never treated as neutral.
 *
 * `null is never zero`: every result carries the reason when unusable and a
 * human sentence when usable-but-degraded ("tempo confidence 0.4 — down-weighted").
 */

import { SIGNALS } from "../query/signals.ts";
import type { LibraryTrack } from "../query/evaluate.ts";

export type AxisReliability = {
  usable: boolean;
  /** Weight in (0, 1] when usable; 0 otherwise. */
  weight: number;
  /** The measured value when usable; undefined otherwise. */
  value?: number;
  /** Human sentence when degraded/unusable. */
  note?: string;
};

/** The declared axis subset for the keep/skip centroids (A3 §3.3c). */
export const CENTROID_AXES = ["bpm", "lufs_integrated", "crest_factor", "onset_rate", "percussiveness"] as const;

export type AxisMeta = { field: string; name: string; unit: string; decimals: number };

/** Human display metadata; order matches CENTROID_AXES. */
export const AXIS_META: readonly AxisMeta[] = [
  { field: "bpm", name: "tempo", unit: "BPM", decimals: 0 },
  { field: "lufs_integrated", name: "loudness", unit: "LUFS", decimals: 1 },
  { field: "crest_factor", name: "crest factor", unit: "dB", decimals: 1 },
  { field: "onset_rate", name: "note onsets", unit: "onsets/s", decimals: 1 },
  { field: "percussiveness", name: "percussiveness", unit: "", decimals: 2 },
];

const round2 = (value: number) => Number(value.toFixed(2));

/**
 * Reliability of one track's value on one axis. Pure; reads only the track.
 */
export function axisReliability(track: LibraryTrack, field: string): AxisReliability {
  const spec = SIGNALS.get(field);
  if (!spec || spec.status !== "produced") {
    return { usable: false, weight: 0, note: `${field} has no producer yet — not used for learning` };
  }
  const raw = track.signals?.[field];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { usable: false, weight: 0, note: `${field} not measured on this track — skipped` };
  }
  if (field === "bpm") {
    const confidence = track.signals?.["tempo_confidence"];
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
      return { usable: false, weight: 0, note: "tempo confidence missing — tempo not used for learning" };
    }
    if (confidence <= 0.2) {
      return { usable: false, weight: 0, note: `tempo confidence ${round2(confidence)} — too low, tempo not used for learning` };
    }
    if (confidence < 0.5) {
      return { usable: true, weight: confidence, value: raw, note: `tempo confidence ${round2(confidence)} — down-weighted` };
    }
    return { usable: true, weight: 1, value: raw };
  }
  return { usable: true, weight: 1, value: raw };
}
