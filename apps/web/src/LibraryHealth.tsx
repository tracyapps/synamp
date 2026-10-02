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
const ago = (ms: number) => (ms < 90_000 ? "just now" : `${duration(ms / 1000).replace("about ", "")} ago`);

export default function LibraryHealth({ request }: { request: Request }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const detailsId = useId();
  const analysing = health?.analysis.reported && health.analysis.state !== "idle" && !health.analysis.stale;

  useEffect(() => {
    let cancelled = false;
    const load = () => request<Health>("/library/health")
      .then((data) => { if (!cancelled) { setHealth(data); setError(""); } })
      .catch((cause) => { if (!cancelled) setError((cause as Error).message); });
    load();
    const timer = setInterval(load, analysing ? 10_000 : 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [analysing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!health) return error ? <p className="alert" role="alert">Library health: {error}</p> : null;
  const a = health.analysis;
  const lib = health.library;

  let headline: string;
  let detail = "";
  if (!a.reported) {
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
        <button type="button" className="quiet" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "Details"}
        </button>
      </div>
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
            <p className="muted">Cross-format fingerprints are off for {n(a.fingerprints.tool_missing!)} tracks — install Chromaprint on the Mac (<code>brew install chromaprint</code>) to turn them on.</p>
          )}
          {a.recent_failures.length > 0 && <details>
            <summary>Files that couldn’t be read ({n(a.queue.failed)})</summary>
            <ul className="health__failures">{a.recent_failures.map((f) => <li key={f.path}><code>{f.path}</code> — {f.error}</li>)}</ul>
          </details>}
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
          <p className="muted">These counts come from the latest analyzer export. Fixing names, merging artists and the missing-tracks list come next.</p>
        </div>
      </div>
    </section>
  );
}
