import { useEffect, useId, useRef, useState } from "react";
import type { Request } from "./api";
import { SectionCard } from "./ui/kit";
import { ceiling, PER_SONG_GB, recommended, recommendedMore, songsFor } from "./analysis-memory";

/*
 * Settings → "Analysis on your Mac": how much memory the analysis may use, and
 * optionally more at set hours or while you're away from the Mac. The worker on
 * the Mac reads this and decides how many songs to analyse at once (about 3 GB
 * each). Rules mirror services/analyzer/src/synamp_analyzer/{pipeline,allowance}.py.
 */

type Memory = { mode: "steady" | "hours" | "away"; normal_gb: number | null; more_gb: number | null; from: string; to: string; away_minutes: number };
type Worker = { online: boolean; host?: string; memory_gb?: number; cores?: number;
  memory_now?: { gb: number; songs: number; why: "normal" | "hours" | "away"; at: number } };
type Control = { worker: Worker | null; settings: { memory: Memory } };

const songs = (count: number) => `${count} ${count === 1 ? "song" : "songs"} at a time`;

const WHY: Record<"normal" | "hours" | "away", string> = {
  normal: "your normal amount",
  hours: "your set hours",
  away: "you’re away from the Mac",
};

function Amount({ id, label, value, min, total, cores, onChange, hint }: {
  id: string; label: string; value: number; min: number; total: number; cores: number; onChange: (gb: number) => void; hint?: string;
}) {
  const text = `${value} GB of ${total} GB — about ${songs(songsFor(value, total, cores))}`;
  return (
    <div className="memory__amount">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={ceiling(total)} step={1} value={Math.min(value, ceiling(total))}
        aria-valuetext={text} aria-describedby={`${id}-out${hint ? ` ${id}-hint` : ""}`} onChange={(event) => onChange(Number(event.target.value))} />
      <output id={`${id}-out`} htmlFor={id} className="memory__out">{text}</output>
      {hint && <p id={`${id}-hint`} className="muted memory__hint">{hint}</p>}
    </div>
  );
}

export default function AnalysisMemory({ request }: { request: Request }) {
  const ids = useId();
  const [control, setControl] = useState<Control | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [said, setSaid] = useState("");
  const [problem, setProblem] = useState("");
  const timer = useRef<number | undefined>(undefined);
  /** Changes not yet sent: a quick run of changes goes out together, none lost. */
  const pending = useRef<Partial<Memory>>({});

  useEffect(() => {
    const load = () => request<Control>("/analyzer").then((next) => { setControl(next); setMemory((mine) => mine ?? next.settings.memory); }, (cause) => setProblem((cause as Error).message));
    load();
    const every = window.setInterval(load, 30_000); // "right now" follows the clock and the Mac
    return () => window.clearInterval(every);
  }, [request]);

  /** Change on screen at once; save after a short pause (a slider sends many changes). */
  function change(patch: Partial<Memory>, done: string) {
    setMemory((current) => current && { ...current, ...patch });
    setProblem("");
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const sending = pending.current;
      pending.current = {};
      try {
        const next = await request<Control>("/analyzer/settings", { method: "POST", body: JSON.stringify({ memory: sending }) });
        setControl(next);
        setSaid(`${done} Your Mac picks it up within a minute.`);
      } catch (cause) {
        pending.current = { ...sending, ...pending.current }; // kept, so the next change sends it again
        setProblem(`Couldn’t save that: ${(cause as Error).message}`);
      }
    }, 500);
  }

  if (!memory) return <SectionCard title="Analysis on your Mac" labelledBy={`${ids}-title`}><p className="muted">{problem || "Loading…"}</p></SectionCard>;

  const worker = control?.worker;
  const total = worker?.memory_gb ? Math.floor(worker.memory_gb) : 16;
  const cores = worker?.cores ?? 8;
  const known = !!worker?.memory_gb;
  const normal = memory.normal_gb ?? recommended(total);
  const more = Math.max(normal, memory.more_gb ?? recommendedMore(total));
  const now = worker?.memory_now;
  const mac = worker?.host ? worker.host.replace(/\.local$/, "") : "your Mac";

  return (
    <SectionCard title="Analysis on your Mac" labelledBy={`${ids}-title`}
      meta={<>How much of {mac}’s memory SynAmp may use while it listens to your music. More memory means more songs at once, so it finishes sooner.</>}>
      <div className="memory">
        <p className="memory__now" role="status">
          {!worker ? "The analyzer hasn’t been set up on a Mac yet, so these settings wait until it is."
            : !worker.online ? "The analyzer on your Mac isn’t running right now. These settings apply when it next starts."
            : now ? <>Right now: <strong>{now.gb} GB, {songs(now.songs)}</strong> ({WHY[now.why]}).</>
            : "The analyzer on your Mac will pick these settings up within a minute."}
          {!known && worker && " (It hasn’t said how much memory it has yet, so the numbers below assume 16 GB.)"}
        </p>

        <Amount id={`${ids}-normal`} label="Memory for analysis" value={normal} min={PER_SONG_GB} total={total} cores={cores}
          onChange={(gb) => change({ normal_gb: gb }, `Analysis can use ${gb} GB.`)} />
        <div className="memory__row">
          {memory.normal_gb === null
            ? <span className="muted">This is the recommended amount for this Mac.</span>
            : <button type="button" className="btn btn--ghost btn--sm" onClick={() => change({ normal_gb: null }, "Back to the recommended amount.")}>
                Use the recommended amount ({recommended(total)} GB)</button>}
        </div>

        <fieldset className="memory__when">
          <legend>Use more memory</legend>
          {([["steady", "No — the same amount all the time"], ["hours", "At set hours"], ["away", "When I’m away from the Mac"]] as const).map(([value, label]) => (
            <label key={value} className="memory__choice">
              <input type="radio" name={`${ids}-mode`} value={value} checked={memory.mode === value}
                onChange={() => change({ mode: value }, value === "steady" ? "Same amount all the time." : value === "hours" ? "More at set hours." : "More while you’re away from the Mac.")} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {memory.mode === "hours" && (
          <div className="memory__times">
            <label>From <input type="time" value={memory.from} onChange={(event) => event.target.value && change({ from: event.target.value }, `From ${event.target.value}.`)} /></label>
            <label>to <input type="time" value={memory.to} onChange={(event) => event.target.value && change({ to: event.target.value }, `Until ${event.target.value}.`)} /></label>
            <span className="muted">on your Mac’s clock. Overnight works too: 22:00 to 07:00.</span>
          </div>
        )}
        {memory.mode === "away" && (
          <label className="memory__away">Away means no keyboard, mouse or trackpad for
            <select className="select select--sm" value={memory.away_minutes} onChange={(event) => change({ away_minutes: Number(event.target.value) }, "Saved.")}>
              {[5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
            <span className="muted">It drops back as soon as you’re back, once the songs it started are done (a few seconds).</span>
          </label>
        )}
        {memory.mode !== "steady" && (
          <Amount id={`${ids}-more`} label={memory.mode === "hours" ? "Memory during those hours" : "Memory while you’re away"}
            value={more} min={normal} total={total} cores={cores}
            onChange={(gb) => change({ more_gb: gb }, `Up to ${gb} GB at those times.`)}
            hint={memory.more_gb === null ? `Recommended: ${recommendedMore(total)} GB, leaving the rest for macOS and anything left open.` : undefined} />
        )}

        <details className="memory__help">
          <summary>When should I change this?</summary>
          <div>
            <p><strong>Move it lower</strong> if, while SynAmp is analysing:</p>
            <ul>
              <li>your Mac feels slow — the pointer or typing lags, or apps take a while to switch</li>
              <li>the fans get loud or the Mac gets hot</li>
              <li>music, video calls or other apps stutter</li>
              <li>an app warns about memory, or Activity Monitor (Memory tab) shows <em>Memory Pressure</em> in yellow or red</li>
            </ul>
            <p><strong>Move it higher</strong> if nothing else is running and you’d like it done sooner.</p>
            <p>Or choose <strong>When I’m away from the Mac</strong> to get both: gentle while you work, faster when you step away.</p>
            <p className="muted">Each song being analysed needs about 3 GB. Changes take effect within a minute and nothing restarts; songs already started finish first. Very long pieces (over 15 minutes) are analysed one at a time and briefly need more. SynAmp never uses all of the Mac: it keeps 4 GB and two processor cores free.</p>
          </div>
        </details>
        <p className={problem ? "alert" : "muted memory__said"} role={problem ? "alert" : "status"}>{problem || said}</p>
      </div>
    </SectionCard>
  );
}
