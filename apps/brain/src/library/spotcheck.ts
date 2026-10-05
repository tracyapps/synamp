/**
 * "Check the measurements": you listen to a random analysed track and say
 * whether its measured tempo is right.
 *
 * Tempo is the measurement most likely to be wrong in a way a person can hear:
 * a 120 BPM song is often measured as 60 or 240 (an "octave error"). Each
 * answer does two things:
 *
 * - It counts towards an accuracy figure, so we know how far to trust the
 *   tempo across the library (overall, and split by the analyzer's own
 *   confidence).
 * - It corrects that track: "the real tempo is half" halves its BPM for smart
 *   playlists, a tapped tempo replaces it. A correction holds only while the
 *   analyzer's measurement is the one you checked; if the track is re-analysed
 *   and measures differently, the new measurement wins and the track can be
 *   checked again.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

export class SpotCheckError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/**
 * How the beat you feel relates to the measured one. "other_level" covers the
 * three-based relations (×3, ×⅓, ×1.5, ×⅔): a 6/8 song tapped on its two big
 * beats per bar against a measurement of its six eighth notes, and the like.
 * "no_beat": free time, ambient, rubato — no tempo to trust.
 */
export const VERDICTS = ["right", "half", "double", "other_level", "wrong", "no_beat", "skip"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Check = {
  verdict: Verdict;
  /** What the analyzer said when you checked. */
  measured_bpm: number;
  confidence?: number;
  /** What you tapped, if you did. */
  tapped_bpm?: number;
  at: number;
  title?: string;
  artist?: string;
};
type State = { format: "synamp.spotchecks/1"; checks: Record<string, Check> };

/** Two tempos this close count as the same (tapping is never exact). */
export const TOLERANCE = 0.08;
const close = (a: number, b: number) => Math.abs(a / b - 1) <= TOLERANCE;
/** A tapped tempo, compared with the measured one. */
export function verdictFromTap(measured: number, tapped: number): Verdict {
  if (close(tapped, measured)) return "right";
  if (close(tapped, measured / 2)) return "half";
  if (close(tapped, measured * 2)) return "double";
  if ([3, 1 / 3, 1.5, 2 / 3].some((ratio) => close(tapped, measured * ratio))) return "other_level";
  return "wrong";
}

/** The analyzer's own confidence, split where it matters. */
export const CONFIDENT = 0.5;

const bpmOf = (track: LibraryTrack): number | null => {
  const value = track.signals?.bpm;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
};
const confidenceOf = (track: LibraryTrack): number | undefined => {
  const value = track.signals?.tempo_confidence;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export class SpotChecks {
  private path: string;
  state: State;
  private rev = 0;
  private cache?: { key: string; library: Library };

  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.spotchecks/1", checks: loaded.checks ?? {} };
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
    this.rev++;
  }

  /** Still standing: checked against the measurement the track has now. */
  private current(track: LibraryTrack): Check | undefined {
    const check = this.state.checks[track.id];
    const bpm = bpmOf(track);
    return check && bpm !== null && close(bpm, check.measured_bpm) ? check : undefined;
  }

  /** A random analysed track you haven't checked yet (or whose measurement changed since). */
  next(library: Library, random = Math.random): LibraryTrack | null {
    const candidates = library.tracks.filter((track) => track.path && bpmOf(track) !== null && !this.current(track));
    if (!candidates.length) return null;
    return candidates[Math.floor(random() * candidates.length)] ?? null;
  }

  record(track: LibraryTrack, input: Record<string, unknown>, now = Date.now()): Check {
    const measured = bpmOf(track);
    if (measured === null) throw new SpotCheckError("That track has no measured tempo yet");
    let tapped: number | undefined;
    if (input.tapped_bpm !== undefined && input.tapped_bpm !== null && input.tapped_bpm !== "") {
      tapped = Number(input.tapped_bpm);
      if (!Number.isFinite(tapped) || tapped < 20 || tapped > 300) throw new SpotCheckError("A tapped tempo should be between 20 and 300 BPM");
    }
    let verdict = input.verdict as Verdict | undefined;
    if (verdict === undefined && tapped !== undefined) verdict = verdictFromTap(measured, tapped);
    if (!verdict || !VERDICTS.includes(verdict)) throw new SpotCheckError(`verdict must be one of ${VERDICTS.join(", ")}`);
    const confidence = confidenceOf(track);
    const check: Check = {
      verdict, measured_bpm: measured, at: now,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(tapped !== undefined ? { tapped_bpm: round1(tapped) } : {}),
      ...(track.title ? { title: track.title.slice(0, 200) } : {}),
      ...(track.artist ? { artist: track.artist.slice(0, 200) } : {}),
    };
    this.state.checks[track.id] = check;
    this.save();
    return check;
  }

  /** Take back the last answer for a track. */
  forget(trackId: string): void {
    if (!this.state.checks[trackId]) throw new SpotCheckError("That track hasn't been checked", 404);
    delete this.state.checks[trackId];
    this.save();
  }

  /** The tempo you said is right, or null when there's no correction to make. */
  corrected(track: LibraryTrack): number | null {
    const check = this.current(track);
    if (!check) return null;
    if (check.verdict === "half") return round1(check.measured_bpm / 2);
    if (check.verdict === "double") return round1(check.measured_bpm * 2);
    if ((check.verdict === "wrong" || check.verdict === "other_level") && check.tapped_bpm) return check.tapped_bpm;
    return null;
  }

  /** The library with your corrections applied (and confirmed tempos marked as certain). */
  apply(library: Library): Library {
    const key = `${library.version}:${this.rev}`;
    if (this.cache?.key === key) return this.cache.library;
    let changed = false;
    const tracks = library.tracks.map((track) => {
      const check = this.state.checks[track.id] ? this.current(track) : undefined;
      if (!check || check.verdict === "skip") return track;
      if (check.verdict === "no_beat") {
        changed = true; // keep the number, but nothing should trust it
        return { ...track, signals: { ...track.signals, tempo_confidence: 0 } };
      }
      const bpm = this.corrected(track);
      if ((check.verdict === "wrong" || check.verdict === "other_level") && bpm === null) return track; // we don't know the right value
      changed = true;
      return { ...track, signals: { ...track.signals, ...(bpm !== null ? { bpm } : {}), tempo_confidence: 1 } };
    });
    const result = changed ? { version: `${library.version}+t${this.rev}`, tracks } : library;
    this.cache = { key, library: result };
    return result;
  }

  summary(library: Library) {
    const tracks = new Map(library.tracks.map((track) => [track.id, track]));
    // Accuracy is about songs that have a beat to measure.
    const answered = Object.entries(this.state.checks).filter(([, check]) => check.verdict !== "skip" && check.verdict !== "no_beat");
    const count = (list: Array<[string, Check]>) => {
      const by = { right: 0, half: 0, double: 0, other_level: 0, wrong: 0, no_beat: 0 };
      for (const [, check] of list) by[check.verdict as keyof typeof by]++;
      const total = list.length;
      // "Right at some level" = the measurement found the pulse, maybe at a different count.
      const related = by.right + by.half + by.double + by.other_level;
      return { checked: total, ...by, accuracy: total ? by.right / total : null, pulse_found: total ? related / total : null };
    };
    const analysed = library.tracks.filter((track) => bpmOf(track) !== null).length;
    return {
      ...count(answered),
      skipped: Object.values(this.state.checks).filter((check) => check.verdict === "skip").length,
      no_beat: Object.values(this.state.checks).filter((check) => check.verdict === "no_beat").length,
      confident: count(answered.filter(([, c]) => (c.confidence ?? 0) >= CONFIDENT)),
      unsure: count(answered.filter(([, c]) => (c.confidence ?? 0) < CONFIDENT)),
      corrections: library.tracks.filter((track) => this.state.checks[track.id] && this.corrected(track) !== null).length,
      analysed_with_tempo: analysed,
      recent: Object.entries(this.state.checks).sort((a, b) => b[1].at - a[1].at).slice(0, 6)
        .map(([id, check]) => ({ id, ...check, still_applies: tracks.has(id) ? !!this.current(tracks.get(id)!) : false })),
    };
  }
}
