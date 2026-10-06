import { useEffect, useId, useState } from "react";
import "./styles/library-health.css";

/* Library health: analysis progress (reported by the analyzer on the Mac) and what the library index shows. */

type Analysis =
  | { reported: false }
  | {
    reported: true; stale: boolean; age_ms: number; state: "analyzing" | "idle" | "scanning"; host: string;
    catalog: { tracks: number; present: number; missing: number };
    queue: { pending: number; running: number; done: number; failed: number };
    stage_order: string[]; stages: Record<string, number>; fully_analysed: number;
    fingerprints: Record<string, number>;
    recent_failures: Array<{ path: string; error: string; attempts: number }>;
    run: { completed: number; failed: number; reused: number; remaining: number; current: string; rate_per_minute: number | null; eta_seconds: number | null };
  };
type Stats = {
  tracks: number; artists: number; albums: number; named_from_tags: number; named_from_folders: number;
  with_audio_identity: number; with_measurements: number; duplicate_groups: number; duplicate_extra_copies: number;
};
type Health = { analysis: Analysis; library: Stats };
type Command = {
  id: string; action: "update" | "scan" | "export" | "analyze"; requested_by: string; status: string; created_at: number; finished_at?: number; summary?: string; stop?: boolean;
  /** The worker is updating the library list inside this command (analysis waits for it). */
  activity?: { kind: "export"; done?: number; total?: number; at: number };
};
type Control = {
  worker: null | { online: boolean; last_seen: number; host?: string; library_ok?: boolean; library_path?: string; problem?: string };
  running: Command | null; queued: Command[]; recent: Command[];
  settings: { update_after_librarian: boolean };
};
const ACTION_NAMES: Record<Command["action"], string> = {
  update: "Scanning for changes and updating the library list",
  scan: "Scanning for changes",
  export: "Updating the library list",
  analyze: "Analysing",
};
const STATUS_NAMES: Record<string, string> = { done: "Done", failed: "Didn’t work", stopped: "Paused", cancelled: "Cancelled" };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const STAGE_NAMES: Record<string, string> = {
  identity: "Recognising songs (identity)",
  dsp_core: "Sound measurements",
  beat: "Beat & timing",
};
const n = (value: number) => value.toLocaleString();
const pct = (part: number, whole: number) => (whole ? Math.min(100, (100 * part) / whole) : 0);
function duration(seconds: number): string {
  if (seconds < 90) return "about a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours < 48 ? `about ${hours} h${rest ? ` ${rest} min` : ""}` : `about ${Math.round(hours / 24)} days`;
}
/** "26,300 of 46,151 (57%)", or "" before the count is known. */
const listProgress = (activity: NonNullable<Command["activity"]>) =>
  activity.total ? `${n(activity.done ?? 0)} of ${n(activity.total)} (${Math.floor(100 * (activity.done ?? 0) / activity.total)}%)` : "";
const ago = (ms: number) => (ms < 90_000 ? "just now" : `${duration(ms / 1000).replace("about ", "")} ago`);

export default function LibraryHealth({ request }: { request: Request }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [control, setControl] = useState<Control | null>(null);
  const [message, setMessage] = useState("");
  const detailsId = useId();
  const working = !!(control?.running || control?.queued.length);
  const analysing = health?.analysis.reported && health.analysis.state !== "idle" && !health.analysis.stale;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      request<Health>("/library/health")
        .then((data) => { if (!cancelled) { setHealth(data); setError(""); } })
        .catch((cause) => { if (!cancelled) setError((cause as Error).message); });
      request<Control>("/analyzer").then((data) => { if (!cancelled) setControl(data); }).catch(() => undefined);
    };
    load();
    const timer = setInterval(load, analysing || working ? 5_000 : 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [analysing, working]); // eslint-disable-line react-hooks/exhaustive-deps

  // Messages are for the moment: clear them after a while.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 8_000);
    return () => clearTimeout(timer);
  }, [message]);

  async function act(path: string, body: unknown, done: string) {
    try {
      setControl(await request<Control>(path, { method: "POST", body: JSON.stringify(body) }));
      setMessage(done);
    } catch (cause) { setMessage((cause as Error).message); }
  }

  if (!health) return error ? <p className="alert" role="alert">Library health: {error}</p> : null;
  const a = health.analysis;
  const lib = health.library;

  let headline: string;
  let detail = "";
  const listUpdate = control?.running?.activity;
  if (listUpdate && control?.running?.action === "analyze") {
    // Analysis stops reporting while this runs, so say why rather than "stopped reporting".
    headline = "Analysis is waiting while the library list updates";
    detail = `${listUpdate.total ? `Reading song details: ${listProgress(listUpdate)}. ` : ""}Analysis carries on by itself when it’s done.`;
  } else if (!a.reported) {
    headline = "The analyzer hasn’t reported yet.";
    detail = "Run it on your Mac with SYNAMP_BRAIN_URL (this address) and SYNAMP_BRAIN_TOKEN set, and progress will show here.";
  } else if (a.stale) {
    headline = `Analysis stopped reporting ${ago(a.age_ms)}.`;
    detail = "The Mac may be asleep or the run was stopped. It picks up where it left off when it runs again.";
  } else if (a.state === "analyzing") {
    headline = `Analysing your library — ${n(a.fully_analysed)} of ${n(a.catalog.present)} tracks done`;
    detail = [a.run.eta_seconds !== null ? `${duration(a.run.eta_seconds)} left` : "estimating time left…",
      a.run.current ? `now: ${a.run.current}` : ""].filter(Boolean).join(" · ");
  } else {
    headline = `${n(a.fully_analysed)} of ${n(a.catalog.present)} tracks fully analysed`;
    detail = `Last report ${ago(a.age_ms)} from ${a.host}.`;
  }

  return (
    <section className="panel health" aria-labelledby={`${detailsId}-title`}>
      <div className="health__summary">
        <div className="health__text">
          <p className="eyebrow" id={`${detailsId}-title`}>Library</p>
          <p className="health__headline" aria-live="polite">{headline}</p>
          {detail && <p className="health__detail">{detail}</p>}
        </div>
        {a.reported && (
          <progress className="health__bar" max={a.catalog.present || 1} value={a.fully_analysed}
            aria-label={`Fully analysed: ${n(a.fully_analysed)} of ${n(a.catalog.present)} tracks`} />
        )}
        <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "Details"}
        </button>
      </div>
      {control && <AnalyzerControls control={control} act={act} message={message} />}
      <div id={detailsId} hidden={!open} className="health__details">
        {a.reported && <div>
          <h3>Analysis</h3>
          <ul className="health__stages">
            {a.stage_order.map((stage) => (
              <li key={stage}>
                <span>{STAGE_NAMES[stage] ?? stage}</span>
                <progress max={a.catalog.present || 1} value={a.stages[stage] ?? 0} aria-label={`${STAGE_NAMES[stage] ?? stage}: ${n(a.stages[stage] ?? 0)} of ${n(a.catalog.present)}`} />
                <span className="health__num">{pct(a.stages[stage] ?? 0, a.catalog.present).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
          <dl className="health__facts">
            <div><dt>Waiting</dt><dd>{n(a.queue.pending + a.queue.running)}</dd></div>
            <div><dt>Couldn’t read</dt><dd>{n(a.queue.failed)}</dd></div>
            <div><dt>Missing from disk</dt><dd>{n(a.catalog.missing)}</dd></div>
            {a.run.rate_per_minute !== null && <div><dt>Speed</dt><dd>{a.run.rate_per_minute.toFixed(1)} tracks/min</dd></div>}
            {a.run.reused > 0 && <div><dt>Recognised, not re-analysed</dt><dd>{n(a.run.reused)}</dd></div>}
          </dl>
          {(a.fingerprints.tool_missing ?? 0) > 0 && (
            <p className="muted">Cross-format fingerprints are off for {n(a.fingerprints.tool_missing!)} tracks. Install Chromaprint on the Mac (<code>brew install chromaprint</code>, once) to turn them on — the analyzer picks it up by itself and fills in the tracks it already did.</p>
          )}
          {a.recent_failures.length > 0 && <details>
            <summary>Files that couldn’t be read ({n(a.queue.failed)})</summary>
            <ul className="health__failures">{a.recent_failures.map((f) => <li key={f.path}><code>{f.path}</code> — {f.error}</li>)}</ul>
          </details>}
        </div>}
        {control && control.recent.length > 0 && <div>
          <h3>Recent analyzer jobs</h3>
          <ul className="health__jobs">{control.recent.map((c) => (
            <li key={c.id}><strong>{STATUS_NAMES[c.status] ?? c.status}</strong> · {ACTION_NAMES[c.action]}{c.requested_by === "the librarian" ? " (after organising)" : ""}
              {c.finished_at ? <span className="muted"> · {ago(Date.now() - c.finished_at)}</span> : null}
              {c.summary && <span className="health__job-summary">{c.summary}</span>}</li>
          ))}</ul>
        </div>}
        <div>
          <h3>Collection</h3>
          <dl className="health__facts">
            <div><dt>Tracks</dt><dd>{n(lib.tracks)}</dd></div>
            <div><dt>Artists</dt><dd>{n(lib.artists)}</dd></div>
            <div><dt>Albums</dt><dd>{n(lib.albums)}</dd></div>
            <div><dt>Named from tags</dt><dd>{n(lib.named_from_tags)}</dd></div>
            <div><dt>Named from folders only</dt><dd>{n(lib.named_from_folders)}</dd></div>
            <div><dt>Duplicate copies</dt><dd>{n(lib.duplicate_extra_copies)} in {n(lib.duplicate_groups)} {lib.duplicate_groups === 1 ? "group" : "groups"}</dd></div>
          </dl>
          <p className="muted">These counts come from the latest library list the analyzer sent.</p>
        </div>
      </div>
    </section>
  );
}

/** The analyzer on the Mac, as buttons: what it's doing, and what you can ask it to do. */
function AnalyzerControls({ control, act, message }: { control: Control; act: (path: string, body: unknown, done: string) => void; message: string }) {
  const w = control.worker;
  const running = control.running;
  const analysing = running?.action === "analyze" || control.queued.some((c) => c.action === "analyze");
  const busy = !!running || control.queued.length > 0;
  let status: React.ReactNode;
  if (!w) {
    status = <>The analyzer isn’t set up to run in the background yet. On the Mac, in the analyzer folder, run once: <code>uv run synamp-analyze install-agent</code>. After that, everything happens from these buttons.</>;
  } else if (!w.online) {
    status = <>The analyzer on {w.host ?? "the Mac"} isn’t answering (last heard from {ago(Date.now() - w.last_seen)}). It runs whenever the Mac is awake and you’re logged in; anything you ask for waits until then.</>;
  } else if (running?.activity) {
    const after = running.action === "analyze" ? " Analysis carries on after it." : "";
    status = <>Updating the library list{running.activity.total ? <> — reading song details, {listProgress(running.activity)}.</> : "…"}{after}
      {running.stop && running.action === "analyze" && " Pause takes effect when this is done."}</>;
  } else if (running) {
    status = <>{ACTION_NAMES[running.action]}{running.stop ? " — pausing after the current track" : "…"}{running.requested_by === "the librarian" ? " (after organising)" : ""}</>;
  } else if (w.problem) {
    status = <>{w.problem}</>;
  } else {
    status = <>The analyzer on {w.host ?? "the Mac"} is ready.</>;
  }
  return (
    <div className="health__controls">
      <p className={`health__worker ${w?.online && !w.problem ? "is-ok" : "is-warn"}`} role="status">{status}</p>
      {running?.activity?.total ? (
        <progress className="health__list-bar" max={running.activity.total} value={running.activity.done ?? 0}
          aria-label={`Library list update: ${listProgress(running.activity)}`} />
      ) : null}
      <div className="health__buttons" role="group" aria-label="Analyzer">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
          onClick={() => act("/analyzer/request", { action: "update" }, "Asked the analyzer to look for changes.")}>Scan for changes</button>
        {analysing
          ? <button type="button" className="btn btn--ghost btn--sm" disabled={!!running?.stop} onClick={() => act("/analyzer/stop", {}, "Pausing after the current track.")}>Pause analysis</button>
          : <button type="button" className="btn btn--primary" disabled={busy && !analysing}
            onClick={() => act("/analyzer/request", { action: "analyze" }, "Analysis will start in a moment. It keeps the Mac awake while it works.")}>Start analysis</button>}
        {control.queued.length > 0 && <span className="muted">{control.queued.length} waiting</span>}
      </div>
      <label className="organise__check health__auto">
        <input type="checkbox" checked={control.settings.update_after_librarian}
          onChange={(e) => act("/analyzer/settings", { update_after_librarian: e.target.checked }, e.target.checked ? "Will scan after organising." : "Won’t scan after organising.")} />
        <span>Scan for changes automatically after organising or adding music</span>
      </label>
      {message && <p className="listening__message" role="status">{message}</p>}
    </div>
  );
}
