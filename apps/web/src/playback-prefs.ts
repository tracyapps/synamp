import { useEffect, useState } from "react";

/*
 * How this device plays: crossfade length, whether albums play straight
 * through, the volume, and how big the streams are. Kept in this browser (each device sounds different),
 * shared live between the player and the Settings screen.
 */

export type PlaybackPrefs = {
  /** Seconds of overlap between songs; 0 = no crossfade (the next song is lined up so it starts at once). */
  crossfade: number;
  /** Songs from the same album follow each other with no crossfade, as the album was made. */
  albumsStraight: boolean;
  /** 0–1. */
  volume: number;
  /** Stream size: the original file, a lighter copy, or decide by connection ("auto"). */
  quality: Quality;
  /** Skipping mid-song blends into the next song instead of cutting. */
  skipBlend: boolean;
};

export type Quality = "auto" | "full" | "lighter";
const QUALITIES: Quality[] = ["auto", "full", "lighter"];

const KEY = "synamp-playback";
const EVENT = "synamp:playback";
const DEFAULTS: PlaybackPrefs = { crossfade: 0, albumsStraight: true, volume: 1, quality: "auto", skipBlend: true };

export function readPrefs(): PlaybackPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PlaybackPrefs>;
    return {
      crossfade: Number.isFinite(saved.crossfade) ? Math.min(12, Math.max(0, saved.crossfade!)) : DEFAULTS.crossfade,
      albumsStraight: typeof saved.albumsStraight === "boolean" ? saved.albumsStraight : DEFAULTS.albumsStraight,
      volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume!)) : DEFAULTS.volume,
      quality: QUALITIES.includes(saved.quality as Quality) ? saved.quality! : DEFAULTS.quality,
      skipBlend: typeof saved.skipBlend === "boolean" ? saved.skipBlend : DEFAULTS.skipBlend,
    };
  } catch { return DEFAULTS; }
}

/** True when it's kept for next time; false when the browser won't store it (private mode: this visit only). */
export function writePrefs(change: Partial<PlaybackPrefs>): boolean {
  const next = { ...readPrefs(), ...change };
  let kept = true;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { kept = false; }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return kept;
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

/* --- Lighter streams on mobile data ------------------------------------------ */

type Connection = { type?: string; saveData?: boolean; addEventListener?: (type: "change", on: () => void) => void; removeEventListener?: (type: "change", on: () => void) => void };
const connection = (): Connection | undefined => (navigator as Navigator & { connection?: Connection }).connection;

/** Why "Automatic" picks a lighter stream right now — or null when it picks full quality. */
export type AwayReason = "mobile-data" | "data-saver" | "tailscale";

/**
 * Automatic's reasoning, from what this browser can tell:
 *  - Android Chrome says when it's on mobile data, and when Data Saver is on.
 *  - iPhones don't say, so the address is the clue: SynAmp opened through
 *    Tailscale (a *.ts.net name or a 100.64–100.127 address) means away from home.
 */
export function awayReason(hostname = window.location.hostname, conn = connection()): AwayReason | null {
  if (conn?.type === "cellular") return "mobile-data";
  if (conn?.saveData) return "data-saver";
  const host = hostname.toLowerCase();
  if (host.endsWith(".ts.net")) return "tailscale";
  const ip = host.match(/^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (ip && Number(ip[1]) >= 64 && Number(ip[1]) <= 127) return "tailscale";
  return null;
}

/** Should the next song come as a lighter stream? */
export function wantsLighter(prefs: PlaybackPrefs, reason: AwayReason | null = awayReason()): boolean {
  return prefs.quality === "lighter" || (prefs.quality === "auto" && reason !== null);
}

/** The stream link with the size this device wants (the brain sends the original if it can't make a lighter one). */
export function streamUrl(url: string, prefs: PlaybackPrefs): string {
  if (!wantsLighter(prefs)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}quality=lighter`;
}

/** Automatic's current reason, kept up to date when the connection changes (Wi-Fi → mobile data). */
export function useAwayReason(): AwayReason | null {
  const [reason, setReason] = useState(() => awayReason());
  useEffect(() => {
    const conn = connection();
    const on = () => setReason(awayReason());
    conn?.addEventListener?.("change", on);
    window.addEventListener("online", on);
    return () => { conn?.removeEventListener?.("change", on); window.removeEventListener("online", on); };
  }, []);
  return reason;
}
