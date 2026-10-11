/* What the analysis progress report means, in plain words: kept apart from the
   component so it can be tested. The report comes from the analyzer on the Mac
   (via the brain); see services/analyzer status.py. */

export type StageUpdate = { total: number; waiting: number };
export type ProgressReport = {
  state: "analyzing" | "idle" | "scanning";
  catalog: { present: number };
  queue: { failed: number };
  fully_analysed: number;
  /** Every stage done at least once. Missing from older analyzers. */
  analysed_once?: number;
  /** Stages being redone with newer code, per stage. Missing from older analyzers. */
  updates?: Record<string, StageUpdate>;
  run: { eta_seconds: number | null };
};

export const STAGE_NAMES: Record<string, string> = {
  identity: "Recognising songs",
  dsp_core: "Tempo, energy & loudness",
  beat: "Beat & timing",
  tonal: "Key",
  voice: "Singing, instruments & mood",
};
/** For "updating 20,000 songs for …". */
const UPDATE_WORDS: Record<string, string> = {
  identity: "song recognition",
  dsp_core: "tempo, energy and loudness",
  beat: "beat and timing",
  tonal: "key",
  voice: "singing, instruments and mood",
};

const n = (value: number) => value.toLocaleString("en-US");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
/** Each step's words already contain "and", so steps are joined with "plus". */
const listWords = (words: string[]) => words.join(", plus ");

export function timeLeft(seconds: number): string {
  if (seconds < 90) return "about a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours < 48 ? `about ${hours} h${rest ? ` ${rest} min` : ""}` : `about ${Math.round(hours / 24)} days`;
}

export type Overview = {
  /** Songs with every step done at least once, out of the songs on disk. */
  once: number;
  present: number;
  failed: number;
  /** Songs not yet through the first pass (not counting ones that couldn't be read). */
  firstPassLeft: number;
  /** Re-doing steps with newer code: how far along, and what for. Null when nothing is being redone. */
  update: null | { done: number; total: number; waiting: number; what: string };
};

export function overview(report: ProgressReport): Overview {
  const present = report.catalog.present;
  const failed = report.queue.failed;
  const once = Math.min(present, report.analysed_once ?? report.fully_analysed);
  const firstPassLeft = Math.max(0, present - once - failed);
  const active = Object.entries(report.updates ?? {}).filter(([, u]) => u.waiting > 0);
  const update = active.length === 0 ? null : {
    total: active.reduce((sum, [, u]) => sum + u.total, 0),
    waiting: active.reduce((sum, [, u]) => sum + u.waiting, 0),
    done: active.reduce((sum, [, u]) => sum + (u.total - u.waiting), 0),
    what: listWords(active.map(([stage]) => UPDATE_WORDS[stage] ?? stage)),
  };
  return { once, present, failed, firstPassLeft, update };
}

export type Summary = {
  headline: string;
  /** Second line under the headline (may be empty). */
  detail: string;
  bar: { value: number; max: number; label: string };
};

/** Headline, detail line and main bar for a fresh report (the stale / not-reported cases are the component's). */
export function summarise(report: ProgressReport, now: { current?: string } = {}): Summary {
  const o = overview(report);
  const working = report.state !== "idle";
  const eta = working && report.run.eta_seconds !== null ? `${timeLeft(report.run.eta_seconds)} left` : working ? "estimating time left…" : "";
  const unreadable = o.failed ? `${plural(o.failed, "song")} couldn’t be read.` : "";

  if (o.firstPassLeft === 0 && o.update) {
    // The first pass is finished; what's left is redoing a step with newer code.
    return {
      headline: `Every song analysed — now updating ${plural(o.update.waiting, "song")} for ${o.update.what}`,
      detail: [eta, unreadable].filter(Boolean).join(" · "),
      bar: { value: o.update.done, max: o.update.total || 1, label: `Updating ${o.update.what}: ${n(o.update.done)} of ${n(o.update.total)} done` },
    };
  }
  const bar = { value: o.once, max: o.present || 1, label: `Analysed: ${n(o.once)} of ${n(o.present)} songs` };
  if (o.firstPassLeft === 0) {
    return {
      headline: o.failed ? `${n(o.once)} of ${n(o.present)} songs analysed` : `All ${plural(o.present, "song")} analysed`,
      detail: [working ? eta : "", unreadable].filter(Boolean).join(" · "),
      bar,
    };
  }
  const also = o.update ? `Also updating ${plural(o.update.waiting, "song")} for ${o.update.what}.` : "";
  return {
    headline: working
      ? `Analysing your library — ${n(o.once)} of ${n(o.present)} songs done`
      : `${n(o.once)} of ${n(o.present)} songs analysed`,
    detail: [working ? eta : "", working && now.current ? `now: ${now.current}` : "", also].filter(Boolean).join(" · "),
    bar,
  };
}
