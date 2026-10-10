/**
 * "How does this feel?": you listen to a song and say where it sits on two
 * scales, calm ↔ lively and sad ↔ happy. Your answers are the yardstick for
 * SynAmp's mood readings (moods.* from the voice stage: AudioSet's seven
 * music-mood classes, which are weak on their own).
 *
 * Each answer keeps a copy of the song's measurements at the time, so the next
 * step (turning readings into arousal and valence) can be fitted to your ears
 * and checked against them. Until then nothing here changes a playlist.
 *
 * The song to ask about is chosen to cover the whole range: the library is cut
 * into a 3 × 3 grid by the readings' first guess (calmer/livelier, sadder/
 * happier), and the next song comes from the square with the fewest answers.
 * The first guess is never shown before you answer, so it can't sway you.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { AUDIO_MOODS } from "../query/signals.ts";

export class MoodCheckError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** 1 = very calm / very sad … 5 = very lively / very happy. null = can't say. */
export type Scale = 1 | 2 | 3 | 4 | 5 | null;
export type MoodAnswer = {
  lively: Scale;
  happy: Scale;
  skipped?: true;
  at: number;
  title?: string;
  artist?: string;
  /** The song's numeric measurements when you answered (moods.*, loudness, pulse…). */
  signals: Record<string, number>;
};
type State = { format: "synamp.moodchecks/1"; answers: Record<string, MoodAnswer> };

type Moods = Record<(typeof AUDIO_MOODS)[number], number>;

/** The song's mood readings, or null when it hasn't been listened to with moods yet. */
export function moodsOf(track: LibraryTrack): Moods | null {
  const out: Partial<Moods> = {};
  for (const name of AUDIO_MOODS) {
    const value = track.signals?.[`moods.${name}`];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    out[name] = value;
  }
  return out as Moods;
}

/**
 * A first guess from the readings alone, used only to spread the questions and
 * to measure agreement. Not a calibrated scale: the next step fits one to your answers.
 */
export function firstGuess(moods: Moods): { lively: number; happy: number } {
  return {
    lively: moods.exciting + moods.angry + moods.scary + 0.5 * moods.happy - moods.tender - moods.sad,
    happy: moods.happy + moods.funny + moods.tender - moods.sad - moods.angry - moods.scary,
  };
}

/** Rank correlation (Spearman, ties shared) — does the reading go up when your answer does? */
export function rankAgreement(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const ranks = (values: number[]) => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const out = new Array<number>(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++;
      for (let k = i; k <= j; k++) out[order[k]!.index] = (i + j) / 2;
      i = j + 1;
    }
    return out;
  };
  const a = ranks(xs);
  const b = ranks(ys);
  const mean = (list: number[]) => list.reduce((sum, n) => sum + n, 0) / list.length;
  const ma = mean(a);
  const mb = mean(b);
  let top = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    top += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? top / Math.sqrt(da * db) : null;
}

/** Fewer answers than this on a scale and the agreement figure isn't shown. */
export const ENOUGH = 8;

const scale = (value: unknown, name: string): Scale => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new MoodCheckError(`${name} must be 1 to 5, or left out for "can't say"`);
  return n as Scale;
};

export class MoodChecks {
  private path: string;
  state: State;

  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.moodchecks/1", answers: loaded.answers ?? {} };
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  /** The next song to ask about, from the least-answered part of the range. */
  next(library: Library, random = Math.random): LibraryTrack | null {
    const read = library.tracks.flatMap((track) => {
      const moods = track.path ? moodsOf(track) : null;
      return moods ? [{ track, guess: firstGuess(moods) }] : [];
    });
    if (!read.length) return null;
    const cuts = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [sorted[Math.floor(sorted.length / 3)]!, sorted[Math.floor((2 * sorted.length) / 3)]!];
    };
    const livelyCuts = cuts(read.map((item) => item.guess.lively));
    const happyCuts = cuts(read.map((item) => item.guess.happy));
    const third = (value: number, [low, high]: number[]) => (value < low! ? 0 : value < high! ? 1 : 2);
    const cells = new Map<number, { open: LibraryTrack[]; answered: number }>();
    for (const { track, guess } of read) {
      const cell = third(guess.lively, livelyCuts) * 3 + third(guess.happy, happyCuts);
      const entry = cells.get(cell) ?? { open: [], answered: 0 };
      if (this.state.answers[track.id]) entry.answered++;
      else entry.open.push(track);
      cells.set(cell, entry);
    }
    const open = [...cells.entries()].filter(([, entry]) => entry.open.length).sort((a, b) => a[1].answered - b[1].answered || a[0] - b[0]);
    if (!open.length) return null;
    const fewest = open[0]![1].answered;
    const tied = open.filter(([, entry]) => entry.answered === fewest);
    const pick = tied[Math.floor(random() * tied.length)]![1].open;
    return pick[Math.floor(random() * pick.length)] ?? null;
  }

  record(track: LibraryTrack, input: Record<string, unknown>, now = Date.now()): MoodAnswer {
    if (!moodsOf(track)) throw new MoodCheckError("That song hasn't been listened to for moods yet");
    const skipped = input.skip === true;
    const lively = skipped ? null : scale(input.lively, "lively");
    const happy = skipped ? null : scale(input.happy, "happy");
    if (!skipped && lively === null && happy === null) throw new MoodCheckError("Choose at least one answer, or skip this song");
    const signals: Record<string, number> = {};
    for (const [key, value] of Object.entries(track.signals ?? {})) {
      if (typeof value === "number" && Number.isFinite(value)) signals[key] = value;
    }
    const answer: MoodAnswer = {
      lively, happy, at: now, signals,
      ...(skipped ? { skipped: true as const } : {}),
      ...(track.title ? { title: track.title.slice(0, 200) } : {}),
      ...(track.artist ? { artist: track.artist.slice(0, 200) } : {}),
    };
    this.state.answers[track.id] = answer;
    this.save();
    return answer;
  }

  forget(trackId: string): void {
    if (!this.state.answers[trackId]) throw new MoodCheckError("That song hasn't been answered", 404);
    delete this.state.answers[trackId];
    this.save();
  }

  /** How well the readings' first guess agrees with you, per scale. */
  summary(library: Library) {
    const answers = Object.values(this.state.answers).filter((answer) => !answer.skipped);
    const axis = (key: "lively" | "happy") => {
      const pairs = answers.flatMap((answer) => {
        const moods: Partial<Moods> = {};
        for (const name of AUDIO_MOODS) {
          const value = answer.signals[`moods.${name}`];
          if (typeof value !== "number") return [];
          moods[name] = value;
        }
        const yours = answer[key];
        return yours === null ? [] : [[firstGuess(moods as Moods)[key], yours] as const];
      });
      return {
        answered: pairs.length,
        agreement: pairs.length >= ENOUGH ? rankAgreement(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null,
      };
    };
    return {
      answered: answers.length,
      skipped: Object.values(this.state.answers).filter((answer) => answer.skipped).length,
      lively: axis("lively"),
      happy: axis("happy"),
      with_moods: library.tracks.filter((track) => moodsOf(track)).length,
      enough: ENOUGH,
    };
  }
}
