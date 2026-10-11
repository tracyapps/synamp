/**
 * "It has words" / "it has no words": your answer about a song, which beats the
 * Mac's guess.
 *
 * The voice stage guesses from sound alone (listen.py: a window "has a voice"
 * when a singing or speech class passes 0.10). It misses voices buried in the
 * mix, so some sung songs come out "instrumental". When you say otherwise —
 * usually by leaving a song out of a "no words" playlist preview — that answer
 * is applied on top of the measurement (vocal_fraction / instrumental), the same
 * way spotcheck.ts applies tempo corrections.
 *
 * Each answer keeps a copy of what was measured at the time (vocal_fraction,
 * voice_peak), so the 0.10 threshold can later be checked and tuned against
 * your ears.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

export class WordCheckError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const WORDS = ["has_words", "no_words"] as const;
export type Words = (typeof WORDS)[number];
export type WordCheck = {
  words: Words;
  at: number;
  /** What the Mac measured when you answered (null: not listened to yet). */
  measured_vocal_fraction: number | null;
  measured_voice_peak: number | null;
  title?: string;
  artist?: string;
};
type State = { format: "synamp.wordchecks/1"; checks: Record<string, WordCheck> };

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export class WordChecks {
  private path: string;
  state: State;
  private rev = 0;
  private cache?: { key: string; library: Library };

  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    this.state = { format: "synamp.wordchecks/1", checks: loaded.checks ?? {} };
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
    this.rev++;
  }

  record(track: LibraryTrack, words: unknown, now = Date.now()): WordCheck {
    if (!WORDS.includes(words as Words)) throw new WordCheckError(`words must be one of ${WORDS.join(", ")}`);
    const check: WordCheck = {
      words: words as Words, at: now,
      measured_vocal_fraction: num(track.signals?.vocal_fraction),
      measured_voice_peak: num(track.signals?.voice_peak),
      ...(track.title ? { title: track.title.slice(0, 200) } : {}),
      ...(track.artist ? { artist: track.artist.slice(0, 200) } : {}),
    };
    this.state.checks[track.id] = check;
    this.save();
    return check;
  }

  forget(trackId: string): void {
    if (!this.state.checks[trackId]) throw new WordCheckError("No answer about words for that song", 404);
    delete this.state.checks[trackId];
    this.save();
  }

  get(trackId: string): WordCheck | undefined { return this.state.checks[trackId]; }

  /** The library with your answers applied: they replace the measured vocal_fraction and instrumental. */
  apply(library: Library): Library {
    const key = `${library.version}:${this.rev}`;
    if (this.cache?.key === key) return this.cache.library;
    let changed = false;
    const tracks = library.tracks.map((track) => {
      const check = this.state.checks[track.id];
      if (!check) return track;
      changed = true;
      const vocal = check.words === "has_words" ? 1 : 0;
      return { ...track, signals: { ...track.signals, vocal_fraction: vocal, instrumental: 1 - vocal } };
    });
    const result = changed ? { version: `${library.version}+w${this.rev}`, tracks } : library;
    this.cache = { key, library: result };
    return result;
  }

  /** How often the Mac's guess agreed with you (a guess of "instrumental" = vocal_fraction ≤ 0.1). */
  summary() {
    const checks = Object.values(this.state.checks);
    const measured = checks.filter((check) => check.measured_vocal_fraction !== null);
    const guessedNone = (check: WordCheck) => check.measured_vocal_fraction! <= 0.1;
    return {
      answered: checks.length,
      has_words: checks.filter((check) => check.words === "has_words").length,
      no_words: checks.filter((check) => check.words === "no_words").length,
      /** Songs you said have words that the Mac heard as instrumental. */
      missed_voices: measured.filter((check) => check.words === "has_words" && guessedNone(check)).length,
      /** Songs you said have no words that the Mac heard a voice in. */
      false_voices: measured.filter((check) => check.words === "no_words" && !guessedNone(check)).length,
    };
  }
}
