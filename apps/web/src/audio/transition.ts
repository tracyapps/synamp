/*
 * How one song goes into the next, decided from the queue and this device's
 * settings. Pure (tested in tools/transition.test.mts).
 *
 *   - DJ mode: a long crossfade, sized to 16 beats of the outgoing song's
 *     tempo (6–12 s), or the crossfade setting (at least 8 s) without one.
 *   - Two songs from the same album, "Play albums straight through" on:
 *     gapless. Played from decoded audio when both are full-quality files of
 *     reasonable length, so the join is exact to the sample.
 *   - Otherwise the crossfade setting, or a plain cut.
 */

import type { Gapless, Transition } from "./engine";

export type Entry = { album_key?: string; live?: boolean; bpm?: number; gapless?: Gapless };
export type Settings = { crossfade: number; albumsStraight: boolean; skipBlend: boolean };

/** Long songs (and mixes) are streamed, not decoded whole: memory. */
const DECODE_LIMIT_S = 20 * 60;

export function canDecode(entry: Entry | undefined, lighter: boolean, deviceMemoryGb?: number): boolean {
  if (!entry || entry.live || lighter) return false;
  if (deviceMemoryGb !== undefined && deviceMemoryGb < 4) return false;
  const seconds = entry.gapless ? entry.gapless.samples / entry.gapless.rate : undefined;
  return seconds === undefined || seconds <= DECODE_LIMIT_S;
}

export function transitionFor(current: Entry | undefined, next: Entry | undefined, settings: Settings, mix: "dj" | undefined,
  lighter: boolean, deviceMemoryGb?: number): { transition: Transition; decode: boolean } {
  const decodable = (entry?: Entry) => canDecode(entry, lighter, deviceMemoryGb);
  if (!current || !next || next.live || current.live) return { transition: { kind: "cut", seconds: 0 }, decode: false };
  if (mix === "dj") {
    const seconds = current.bpm ? Math.min(12, Math.max(6, (16 * 60) / current.bpm)) : Math.max(8, settings.crossfade);
    return { transition: { kind: "crossfade", seconds: Math.round(seconds * 10) / 10 }, decode: false };
  }
  const sameAlbum = !!current.album_key && current.album_key === next.album_key;
  if (sameAlbum && (settings.albumsStraight || !settings.crossfade)) {
    return { transition: { kind: "gapless", seconds: 0 }, decode: decodable(current) && decodable(next) };
  }
  if (settings.crossfade > 0) return { transition: { kind: "crossfade", seconds: settings.crossfade }, decode: false };
  return { transition: { kind: "cut", seconds: 0 }, decode: false };
}

/** Skipping mid-song: how long the blend into the next song lasts (0 = a quick fade out, then the next song). */
export function skipBlendSeconds(settings: Settings, mix: "dj" | undefined): number {
  if (!settings.skipBlend) return 0;
  if (mix === "dj") return 6;
  return settings.crossfade ? Math.min(4, Math.max(2, settings.crossfade)) : 2.5;
}
