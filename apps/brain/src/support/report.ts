/**
 * "Send feedback": the details a tester can choose to attach to a note.
 *
 * Nothing here is sent anywhere. The brain only answers the web app, which
 * shows the tester every word before they copy it, save it, or email it
 * themselves. No secret telemetry (docs/business/execution-backlog.md, B07).
 *
 * Two kinds of detail, both optional in the web app:
 * - About this install: version, server, library and analysis counts, which
 *   optional features are on. Numbers and yes/no only.
 * - Recent problems SynAmp noticed: the brain's own error messages since it
 *   started, with music paths, quoted names, people's folders, email
 *   addresses and anything that looks like a key or token taken out.
 *
 * Song, album and folder names stay out unless the tester ticks "Include song
 * and folder names" (`names`), and even then secrets are still taken out.
 */

/** Where problems go: set by the person running the tester programme (SUPPORT_EMAIL). Empty: copy or save only. */
export const DEFAULT_SUPPORT_EMAIL = "";

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/** Bearer tokens, keys and signatures in URLs or headers. */
const SECRET_PARAM = /\b((?:token|t|sig|signature|key|api_key|apikey|secret|password|pass|p|s|u|access_token|session)=)[^&\s"'<>]+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;
/** Long runs of hex or base64-ish characters: keys, hashes, session IDs. */
const LONG_TOKEN = /\b(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{32,}={0,2}/g;
/** Someone's home folder on a Mac or Linux machine. */
const HOME = /\/(Users|home)\/[^/\s"'`]+/g;
/** Text in quotes: in error messages, this is almost always a song, album, artist or file name. */
const QUOTED = /(?<![\p{L}\p{N}])'([^\n]{1,300}?)'(?![\p{L}\p{N}])|"([^"\n]{1,300})"|‘([^’\n]{1,300})’|“([^”\n]{1,300})”/gu;

export type RedactOptions = {
  /** Folders whose contents are music (library, incoming): shown as <music>/… */
  musicRoots: string[];
  /** Keep song, album and folder names. Secrets, emails and home folders still go. */
  names: boolean;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One message, made safe to share. */
export function redact(input: string, options: RedactOptions): string {
  let text = input.slice(0, 2000);
  text = text.replace(BEARER, "$1 [hidden]").replace(SECRET_PARAM, "$1[hidden]").replace(EMAIL, "[email]");
  for (const root of options.musicRoots.filter((r) => r && r !== "/").sort((a, b) => b.length - a.length)) {
    const base = escape(root.replace(/\/+$/, ""));
    // With names: just the start of the path changes. Without: everything after it up to a
    // quote or the end of the line goes (file names have spaces, so there's no safer end).
    text = options.names
      ? text.replace(new RegExp(`${base}(?![\\w.-])`, "g"), "<music>")
      : text.replace(new RegExp(`${base}(?![\\w.-])(/[^\\n"'\`’”]*)?`, "g"), (_m, rest: string | undefined) => (rest && rest !== "/" ? "<music>/…" : "<music>"));
  }
  text = text.replace(HOME, "/$1/<you>");
  if (!options.names) {
    text = text.replace(QUOTED, (match: string, ...inner: Array<string | undefined>) => {
      const quoted = inner.slice(0, 4).find((part) => part !== undefined) ?? "";
      return quoted.startsWith("<music>") ? match : `${match[0]}…${match[match.length - 1]}`;
    });
  }
  return text.replace(LONG_TOKEN, "[hidden]");
}

export type Problem = { at: number; where: string; message: string; times: number; last_at: number };

/**
 * The brain's recent error messages, kept in memory only (they go when the
 * brain restarts) and never written to disk or sent anywhere by the brain.
 * The same message again just counts up, so one noisy problem can't push the others out.
 */
export class RecentProblems {
  private items: Problem[] = [];
  private max: number;
  constructor(max = 25) { this.max = max; }

  record(where: string, error: unknown, now = Date.now()): void {
    const message = describe(error).slice(0, 2000);
    if (!message) return;
    // The same problem from another line of code is still the same problem: compare the first line.
    const headline = message.split("\n")[0];
    const same = this.items.find((item) => item.where === where && item.message.split("\n")[0] === headline);
    if (same) { same.times++; same.last_at = now; same.message = message; return; }
    this.items.push({ at: now, where: where.slice(0, 120), message, times: 1, last_at: now });
    if (this.items.length > this.max) this.items.shift();
  }

  /** Newest first, made safe to share. */
  list(options: RedactOptions): Problem[] {
    return [...this.items].reverse().map((item) => ({ ...item, where: redact(item.where, options), message: redact(item.message, options) }));
  }

  get size(): number { return this.items.length; }

  /**
   * Keep a copy of everything the brain logs as an error or warning. The log
   * itself is unchanged (Container Manager still shows it).
   */
  watchConsole(target: Pick<Console, "error" | "warn"> = console): void {
    for (const level of ["error", "warn"] as const) {
      const original = target[level].bind(target);
      target[level] = (...args: unknown[]) => {
        try {
          const [first, ...rest] = args;
          const where = typeof first === "string" && rest.length ? first : level === "warn" ? "warning" : "error";
          this.record(where, rest.length && typeof first === "string" ? rest.length === 1 ? rest[0] : rest.map(describe).join(" ") : first);
        } catch { /* never let feedback bookkeeping break logging */ }
        original(...args);
      };
    }
  }
}

/** An error as one short text: its message and the first few lines of where it happened. */
export function describe(error: unknown): string {
  if (error instanceof Error) {
    const where = (error.stack ?? "").split("\n").slice(1).map((line) => line.trim()).filter((line) => line.startsWith("at ")).slice(0, 3);
    const code = (error as { code?: unknown }).code;
    return [`${error.name}${typeof code === "string" ? ` (${code})` : ""}: ${error.message}`, ...where].join("\n");
  }
  if (typeof error === "string") return error;
  try { return JSON.stringify(error) ?? String(error); } catch { return String(error); }
}

export type Facts = {
  version: { release?: string; short?: string; built_at?: number; update_waiting?: boolean } | null;
  server: { node: string; platform: string; arch: string; uptime_ms: number; memory_mb: number };
  disks: Array<{ label: string; free_gb: number | null; total_gb: number | null }>;
  navidrome: { ok: boolean; problem?: string };
  library: { tracks: number; artists: number; albums: number; with_measurements: number } | null;
  analysis: {
    reported: boolean; state?: string; stale?: boolean; age_ms?: number; analyzer_version?: string; host?: string;
    queue?: { pending: number; running: number; done: number; failed: number }; fully_analysed?: number;
    recent_failures?: Array<{ path: string; error: string }>;
  };
  features: Record<string, boolean>;
  first_picks?: { count: number; listened: number } | null;
};

export type Section = { title: string; lines: string[] };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const ago = (ms: number) => ms < 90_000 ? "just now" : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} minutes ago` : ms < 36 * 3_600_000 ? `${Math.round(ms / 3_600_000)} hours ago` : `${Math.round(ms / 86_400_000)} days ago`;
const span = (ms: number) => ms < 90 * 60_000 ? plural(Math.max(1, Math.round(ms / 60_000)), "minute") : ms < 36 * 3_600_000 ? plural(Math.round(ms / 3_600_000), "hour") : plural(Math.round(ms / 86_400_000), "day");
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

const FEATURE_NAMES: Record<string, string> = {
  access_token: "Access token required",
  lyrics_lookup: "Look up lyrics on LRCLIB",
  lastfm: "Last.fm set up",
  phone_playlists: "Playlists sent to phone apps",
  update_checks: "Check for new versions",
  party: "Party running",
  import: "Add music (incoming folder) set up",
};

/** The "about this install" part of a report, as plain lines a person can read. */
export function installSections(facts: Facts, options: RedactOptions & { now?: number }): Section[] {
  const now = options.now ?? Date.now();
  const v = facts.version;
  const version = !v ? ["Version: development copy (not built by Container Manager)"]
    : [`Version: ${v.release ?? v.short ?? "unknown"}${v.release && v.short ? ` (${v.short})` : ""}${v.built_at ? `, built ${day(v.built_at)}` : ""}`,
      ...(v.update_waiting ? ["A newer copy is on the NAS, waiting to be built"] : [])];
  const s = facts.server;
  const server = [
    ...version,
    `Server: Node ${s.node} on ${s.platform} ${s.arch}, running for ${span(s.uptime_ms)}, using ${s.memory_mb} MB`,
    ...facts.disks.map((d) => `${d.label}: ${d.free_gb === null ? "free space unknown" : `${d.free_gb} GB free${d.total_gb ? ` of ${d.total_gb} GB` : ""}`}`),
    `Navidrome: ${facts.navidrome.ok ? "answering" : facts.navidrome.problem ?? "not answering"}`,
  ];
  const lib = facts.library;
  const library = lib
    ? [`${plural(lib.tracks, "song")}, ${plural(lib.artists, "artist")}, ${plural(lib.albums, "album")}`, `${plural(lib.with_measurements, "song")} listened to so far`]
    : ["The library list couldn't be read"];
  if (facts.first_picks) library.push(`Listen to these first: ${facts.first_picks.listened} of ${plural(facts.first_picks.count, "pick")} ready`);
  const a = facts.analysis;
  const analysis = !a.reported ? ["The Mac hasn't reported yet"] : [
    `State: ${a.state}${a.stale ? " (stopped reporting — the Mac may be asleep)" : ""}, last report ${ago(a.age_ms ?? 0)}`,
    ...(a.analyzer_version ? [`Analyzer version: ${a.analyzer_version}${options.names && a.host ? ` on ${redact(a.host, options)}` : ""}`] : []),
    ...(a.queue ? [`Queue: ${a.queue.pending} waiting, ${a.queue.running} now, ${a.queue.done} done, ${a.queue.failed} failed`] : []),
    ...(a.fully_analysed !== undefined ? [`Fully listened to: ${plural(a.fully_analysed, "song")}`] : []),
    ...(a.recent_failures?.length ? [`Songs that couldn't be read lately: ${a.recent_failures.length}`,
      ...a.recent_failures.slice(0, 10).map((f) => `  - ${options.names ? `${redact(f.path, options)}: ` : ""}${redact(f.error, options)}`)] : []),
  ];
  const features = Object.entries(facts.features).map(([key, on]) => `${FEATURE_NAMES[key] ?? key}: ${on ? "yes" : "no"}`);
  return [
    { title: "This install", lines: server },
    { title: "Library", lines: library },
    { title: "Listening on the Mac", lines: analysis },
    { title: "Optional features", lines: features },
  ];
}

/** The "recent problems" part of a report. */
export function problemSection(problems: Problem[], now = Date.now()): Section {
  if (!problems.length) return { title: "Recent problems SynAmp noticed", lines: ["None since the server last started."] };
  return {
    title: "Recent problems SynAmp noticed",
    lines: problems.flatMap((p) => [
      `- ${ago(now - p.last_at)}${p.times > 1 ? ` (${p.times} times, first ${ago(now - p.at)})` : ""}, ${p.where}:`,
      ...p.message.split("\n").map((line) => `    ${line}`),
    ]),
  };
}
