/**
 * Shared types and parameter tables for the epoch-scoped learning layer
 * (`epoch-v1`, A3 §3 / mainline decisions 1–3).
 *
 * Design contract (frozen):
 *   - everything is a pure function of (event log, library, options, `now`);
 *   - implicit behaviour (skips, repeats, full plays, other-app plays) only ever
 *     scores inside the ACTIVE epoch and dies at its boundary (a hard mask, not
 *     just decay); explicit signals are the only cross-epoch channel;
 *   - null is never zero: a missing measurement contributes nothing and is
 *     reported, never filled in;
 *   - magnitudes/confidences below are candidate values inherited from the v1
 *     dossier and A3 §3.2 — they are testable hypotheses, not tuned evidence.
 */

import type { Library } from "../query/evaluate.ts";

export type Daypart = "morning" | "afternoon" | "evening" | "night";

/** Fixed display order (also the sort order used in evidence lists). */
export const DAYPARTS: readonly Daypart[] = ["morning", "afternoon", "evening", "night"];

/** "declared" (default): explicit thumbs persist whatever scope they carry.
 *  "global_only": playlist-scoped thumbs become epoch-scoped (strict reading, A3 P25). */
export type ScopePersistence = "declared" | "global_only";

export type PolicyOptions = {
  /** Deterministic "as of" time (ms). No other clock is ever read. */
  now: number;
  /** IANA timezone for day boundaries and dayparts. Default: server local via Intl. */
  timezone?: string;
  /** The library, for artist propagation, centroid axes and proposal labels. */
  library?: Library;
  /** Maps moved/renamed track ids to their current id (Library.canonicalId). */
  canonical?: (id: string) => string;
  /** See ScopePersistence. Default "declared". */
  scopePersistence?: ScopePersistence;
  /** Exploration budget flag, default OFF. Inspect/pick with explore.ts; this view never scores it. */
  exploration?: boolean;
};

export type Epoch = {
  /** "ep1:" + sha256hex(t_start, t_end, first_event_id).slice(0, 15). */
  id: string;
  t_start: number;
  t_end: number;
  first_event_id: string;
  event_count: number;
  /** Distinct non-empty session ids present, sorted; [] when every event lacked one. */
  session_ids: string[];
  /** Daypart (local time) of the epoch START; a label, not a boundary. */
  daypart: Daypart;
  /** Local calendar date (YYYY-MM-DD) of the epoch start. */
  date: string;
};

export type EpochContext = {
  epoch: Epoch | null;
  daypart: Daypart | null;
  date: string | null;
  /** now − t_end in whole minutes for the active epoch; null when none. */
  minutes_since_activity: number | null;
  note: string;
};

export type ProposalKind =
  | "track_repeat_skip"
  | "artist_repeat_skip"
  | "not_now_pattern"
  | "external_play_positive"
  | "repeat_positive";

/**
 * A suggestion, never a score change (A3 §3.4). The only cross-epoch learning
 * channel: it applies nothing until the user confirms it as an explicit signal
 * or a plan edit.
 */
export type Proposal = {
  /** Stable hash of (kind, subject) — same pattern, same id across derivations. */
  id: string;
  kind: ProposalKind;
  /** Track id (current/canonical) or artist name, depending on subject_type. */
  subject: string;
  subject_type: "track" | "artist";
  /** One plain sentence the user can read. */
  thesis: string;
  evidence: { epochs: number; dates: number; dayparts: Daypart[] };
  suggested_action: string;
};

export type Adjustment = { value: number; parts: Array<{ label: string; value: number }> };

/**
 * The single combined view (decision 3): explicit-persistent cells + epoch
 * entity + artist propagation + reliability-weighted centroids, all inside ONE
 * value. Saturation stays in evaluate.ts (`0.15·tanh(v/2)`).
 */
export type EpochPolicyView = {
  policy_version: "epoch-v1";
  /** Events that shaped this view (explicit signals all-time + implicit inside the live epoch + applied resets). */
  events: number;
  /** Tracks hidden from a playlist by an explicit remove (persistent; restore undoes). */
  removed(playlistId: string): ReadonlySet<string>;
  /** Combined signed preference for a track, optionally within one playlist. */
  adjust(trackId: string, playlistId?: string): Adjustment;
  /** The active epoch, or null when nothing is live (learning paused). */
  epoch: Epoch | null;
  /** Tracks hidden for the rest of the active epoch (repeat early-skip / not_now); empty when none. */
  epochHides(): ReadonlySet<string>;
  /** Cross-epoch proposals (A3 §3.4); the only channel that outlives an epoch. */
  proposals(): Proposal[];
  /** Human-readable honesty notes ("no active session…", "tempo confidence 0.4 — down-weighted"). */
  reliabilityNotes(): string[];
};

// --- evidence tables (A3 §3.2 magnitudes) --------------------------------------

export type EvidenceWeight = {
  /** Signed magnitude of one event before confidence weighting. */
  magnitude: number;
  /** Confidence multiplier (implicit feedback varies in confidence). */
  confidence: number;
  /** Human label used as the score part's reason. */
  label: string;
};

export type EpochEvidenceSignal = "full_play" | "repeat" | "skip_early" | "skip_late" | "external_play" | "not_now";

/** Epoch layer (L2): contribution = magnitude · confidence · 0.5^((now−ts)/30min). */
export const EPOCH_EVIDENCE: Record<EpochEvidenceSignal, EvidenceWeight> = {
  full_play: { magnitude: 0.5, confidence: 0.5, label: "heard it through this session" },
  repeat: { magnitude: 1.0, confidence: 0.7, label: "replayed this session" },
  skip_early: { magnitude: -0.6, confidence: 0.5, label: "skipped early this session" },
  skip_late: { magnitude: -0.1, confidence: 0.2, label: "skipped late this session" },
  external_play: { magnitude: 0.25, confidence: 0.5, label: "played in your other apps this session" },
  not_now: { magnitude: -1.0, confidence: 0.9, label: "not now — hidden until this session ends" },
};

export type PersistentEvidence = EvidenceWeight & { half_life_days: number };

/**
 * Persistent layer (L1): explicit, deliberate signals only. Labels are kept
 * byte-identical to feedback.ts heuristic-v1 so an explicit-only stream derives
 * the same parts under both policies. `external_play` no longer scores here
 * (moved to the epoch layer, A3 §3.6 delta 3).
 */
export const PERSISTENT_EVIDENCE: Record<
  "love" | "thumb_up_playlist" | "thumb_up_global" | "thumb_down_playlist" | "thumb_down_global",
  PersistentEvidence
> = {
  love: { magnitude: 2, confidence: 1, half_life_days: 180, label: "you loved this" },
  thumb_up_playlist: { magnitude: 1, confidence: 0.9, half_life_days: 30, label: "thumbs up here" },
  thumb_up_global: { magnitude: 1, confidence: 0.9, half_life_days: 180, label: "thumbs up" },
  thumb_down_playlist: { magnitude: -1, confidence: 0.9, half_life_days: 30, label: "thumbs down here" },
  thumb_down_global: { magnitude: -1, confidence: 0.9, half_life_days: 180, label: "thumbs down" },
};

/** Epoch layer magnitudes used by the reliability-weighted centroids (A3 §3.3c). */
export const FEATURE = {
  beta: 0.5,
  gamma: 0.15,
  min_keeps: 3,
  min_rejects: 2,
  coverage: 0.6,
  spread_floor: 0.25,
  total_cap: 1.0,
  axis_cap: 0.5,
  artist_pi: 0.35,
  artist_cap: 0.8,
} as const;
