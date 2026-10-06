import { useEffect, useState } from "react";

/*
 * How this device plays: crossfade length, whether albums play straight
 * through, and the volume. Kept in this browser (each device sounds different),
 * shared live between the player and the Settings screen.
 */

export type PlaybackPrefs = {
  /** Seconds of overlap between songs; 0 = no crossfade (the next song is lined up so it starts at once). */
  crossfade: number;
  /** Songs from the same album follow each other with no crossfade, as the album was made. */
  albumsStraight: boolean;
  /** 0–1. */
  volume: number;
};

const KEY = "synamp-playback";
const EVENT = "synamp:playback";
const DEFAULTS: PlaybackPrefs = { crossfade: 0, albumsStraight: true, volume: 1 };

export function readPrefs(): PlaybackPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PlaybackPrefs>;
    return {
      crossfade: Number.isFinite(saved.crossfade) ? Math.min(12, Math.max(0, saved.crossfade!)) : DEFAULTS.crossfade,
      albumsStraight: typeof saved.albumsStraight === "boolean" ? saved.albumsStraight : DEFAULTS.albumsStraight,
      volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume!)) : DEFAULTS.volume,
    };
  } catch { return DEFAULTS; }
}

export function writePrefs(change: Partial<PlaybackPrefs>): void {
  const next = { ...readPrefs(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: this session only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

export function usePrefs(): PlaybackPrefs {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => {
    const on = (event: Event) => setPrefs((event as CustomEvent<PlaybackPrefs>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return prefs;
}
