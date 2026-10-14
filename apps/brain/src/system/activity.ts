/**
 * Is SynAmp busy right now — something a sleeping computer would interrupt?
 *
 * The Mac app asks every minute and keeps the Mac awake while the answer is
 * yes (Settings can turn that off). Busy means: SynAmp's player is playing,
 * a phone app streamed through SynAmp in the last few minutes, or the
 * library is being listened to. Nothing else, so the Mac still sleeps when
 * SynAmp is just sitting there.
 */

/** A phone app asking for audio within this long counts as still listening. */
export const STREAM_RECENT_MS = 10 * 60_000;
/** A "playing" session not touched for this long is a player that went away. */
export const SESSION_STALE_MS = 15 * 60_000;

export type ActivityInput = {
  now: number;
  session: { state: "idle" | "playing" | "paused"; updated_at: number } | null;
  lastStreamAt: number | null;
  analyzer: { running: { action: string } | null; worker: { state?: string; online?: boolean } | null };
};

export type Activity = { busy: boolean; reasons: Array<"playing" | "phone" | "listening"> };

export function activity({ now, session, lastStreamAt, analyzer }: ActivityInput): Activity {
  const reasons: Activity["reasons"] = [];
  if (session?.state === "playing" && now - session.updated_at < SESSION_STALE_MS) reasons.push("playing");
  if (lastStreamAt !== null && now - lastStreamAt < STREAM_RECENT_MS) reasons.push("phone");
  const working = analyzer.running !== null || (analyzer.worker?.online === true && analyzer.worker.state === "analyzing");
  if (working) reasons.push("listening");
  return { busy: reasons.length > 0, reasons };
}

/** Subsonic requests that mean "audio is going to a phone app now". */
export const isStreamRequest = (pathname: string) => /^\/rest\/(stream|download)(\.view)?$/.test(pathname);
