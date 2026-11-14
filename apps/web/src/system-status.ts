/* What SynAmp is doing right now, in plain words: for the status button in the
   top bar. The same answer the Mac menu shows (GET /api/v1/system/status; see
   apps/brain/src/system/status.ts). Kept apart from the component so it can be
   tested. */


export type SystemStatus = {
  player: { state: "playing" | "paused"; title: string; artist?: string } | null;
  phone: boolean;
  listening: { active: boolean; done: number; total: number; eta_seconds: number | null } | null;
  music: { ok: boolean; away: boolean; problem?: string } | null;
  anywhere: { ready: boolean; name?: string };
};

/** "ok": fine. "busy": working. "warn": needs a look. The words always say it too. */
export type Tone = "ok" | "busy" | "warn" | "plain";
export type Line = { key: string; text: string; tone: Tone; href?: string; link?: string };

const n = (value: number) => value.toLocaleString("en-US");

/** The same rounding as the Library panel's (analysis-progress.ts). */
export function timeLeft(seconds: number): string {
  if (seconds < 90) return "about a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours < 48 ? `about ${hours} h${rest ? ` ${rest} min` : ""}` : `about ${Math.round(hours / 24)} days`;
}

/** Every line there is something true to say, in a fixed order. */
export function lines(status: SystemStatus): Line[] {
  const out: Line[] = [];
  if (status.player) {
    const song = status.player.artist ? `${status.player.title}, by ${status.player.artist}` : status.player.title;
    out.push({ key: "player", text: `${status.player.state === "paused" ? "Paused" : "Playing"}: ${song}`, tone: status.player.state === "paused" ? "plain" : "busy" });
  }
  if (status.phone) out.push({ key: "phone", text: "Playing to a phone app", tone: "busy" });
  if (status.music) {
    out.push(status.music.ok
      ? { key: "music", text: "Music: connected", tone: "ok" }
      : { key: "music", tone: "warn", href: "#/library", link: "See what's wrong",
          text: status.music.away ? "Music: out of reach from the computer that listens, waiting" : "Music: not connected" });
  }
  const l = status.listening;
  if (l && l.total > 0) {
    if (l.done >= l.total) out.push({ key: "listening", text: `Your whole library is listened to: ${n(l.total)} songs`, tone: "ok" });
    else if (l.active) out.push({ key: "listening", tone: "busy", href: "#/library", link: "Details",
      text: `Listening to your library: ${n(l.done)} of ${n(l.total)} songs${l.eta_seconds === null ? "" : `, ${timeLeft(l.eta_seconds)} left`}` });
    else out.push({ key: "listening", tone: "plain", href: "#/library", link: "Carry on",
      text: `Listened to ${n(l.done)} of ${n(l.total)} songs so far. Not listening right now` });
  }
  out.push(status.anywhere.ready
    ? { key: "anywhere", text: `Listen anywhere: on${status.anywhere.name ? ` (${status.anywhere.name})` : ""}`, tone: "ok" }
    : { key: "anywhere", text: "Listen anywhere: not set up", tone: "plain", href: "#/anywhere", link: "Set it up" });
  return out;
}

/** The few words on the button itself: the one thing most worth knowing. */
export function headline(status: SystemStatus): { text: string; tone: Tone } {
  if (status.music && !status.music.ok) return { text: "Music not connected", tone: "warn" };
  if (status.player?.state === "playing") return { text: "Playing", tone: "busy" };
  if (status.phone) return { text: "Playing on a phone", tone: "busy" };
  if (status.listening?.active) return { text: "Listening to your library", tone: "busy" };
  return { text: "Ready", tone: "ok" };
}
