/**
 * A short clip of a song, for checking a playlist preview by ear: about 30
 * seconds from a third of the way in, where most songs have got going (past the
 * intro, usually into a verse or chorus). Short songs play from the start.
 */

export const CLIP_SECONDS = 30;

export function clipWindow(duration: number | null | undefined, seconds = CLIP_SECONDS): { start_s: number; seconds: number } {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return { start_s: 0, seconds };
  if (duration <= seconds * 1.5) return { start_s: 0, seconds: Math.min(seconds, Math.round(duration)) };
  const start = Math.min(duration * 0.35, duration - seconds - 5);
  return { start_s: Math.max(0, Math.round(start)), seconds };
}
