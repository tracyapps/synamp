/* Short clips for checking a playlist preview by ear.

   One clip at a time. While a clip plays, the main player pauses, and it carries
   on when the clip ends or is stopped (Player.tsx listens for CLIP_EVENT). The
   clip fades out over its last second and a half rather than cutting off. */

import { useEffect, useState } from "react";

export const CLIP_EVENT = "synamp:clip";
export type ClipState = { trackId: string | null };

let audio: HTMLAudioElement | null = null;
let current: string | null = null;
let timers: number[] = [];

function announce(): void {
  window.dispatchEvent(new CustomEvent<ClipState>(CLIP_EVENT, { detail: { trackId: current } }));
}

function clearTimers(): void {
  for (const timer of timers) window.clearTimeout(timer);
  timers = [];
}

export function stopClip(): void {
  clearTimers();
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
  if (current !== null) { current = null; announce(); }
}

/** Plays `seconds` of the song from `startS`. Resolves false when the browser refused to play. */
export async function playClip(trackId: string, url: string, startS: number, seconds: number, onProblem?: (message: string) => void): Promise<boolean> {
  stopClip();
  audio ??= new Audio();
  audio.preload = "auto";
  audio.volume = 1;
  // A media fragment (#t=start,end) asks the browser to fetch only that part; the timers below are the real stop.
  audio.src = `${url}${url.includes("#") ? "" : `#t=${startS},${startS + seconds}`}`;
  current = trackId;
  announce();
  audio.onerror = () => { if (current === trackId) { onProblem?.("That clip couldn’t play."); stopClip(); } };
  audio.onended = () => { if (current === trackId) stopClip(); };
  // Not every browser honours #t= : make sure the clip starts where it should.
  audio.onloadedmetadata = () => { if (audio && current === trackId && Math.abs(audio.currentTime - startS) > 1) audio.currentTime = startS; };
  try {
    await audio.play();
  } catch (cause) {
    if (current === trackId) {
      onProblem?.((cause as Error).name === "NotAllowedError" ? "The browser blocked the clip. Press the button again." : "That clip couldn’t play.");
      stopClip();
    }
    return false;
  }
  const fadeFrom = Math.max(0, seconds - 1.5);
  for (let step = 1; step <= 6; step++) {
    timers.push(window.setTimeout(() => { if (audio && current === trackId) audio.volume = Math.max(0, 1 - step / 6); }, (fadeFrom + step * 0.25) * 1000));
  }
  timers.push(window.setTimeout(() => { if (current === trackId) stopClip(); }, seconds * 1000 + 100));
  return true;
}

/** The song whose clip is playing now, or null. */
export function useClip(): string | null {
  const [playing, setPlaying] = useState<string | null>(current);
  useEffect(() => {
    const on = (event: Event) => setPlaying((event as CustomEvent<ClipState>).detail.trackId);
    window.addEventListener(CLIP_EVENT, on);
    return () => window.removeEventListener(CLIP_EVENT, on);
  }, []);
  return playing;
}
