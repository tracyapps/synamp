import { useEffect, useId, useRef, useState } from "react";
import "./styles/spotcheck.css";

/*
 * "Check the measurements": listen to a random analysed track and say whether
 * its measured tempo is right. Answers give an accuracy figure and correct the
 * track for smart playlists (see apps/brain/src/library/spotcheck.ts).
 */

type Verdict = "right" | "half" | "double" | "wrong" | "skip";
type Track = {
  id: string; title: string; artist?: string; album?: string; year?: number; duration_s?: number;
  bpm: number; tempo_confidence: number | null; stream_url: string;
};
type Counts = { checked: number; right: number; half: number; double: number; wrong: number; accuracy: number | null };
type Summary = Counts & {
  skipped: number; confident: Counts; unsure: Counts; corrections: number; analysed_with_tempo: number;
  recent: Array<{ id: string; verdict: Verdict; measured_bpm: number; tapped_bpm?: number; title?: string; artist?: string; still_applies: boolean }>;
};
type View = { track: Track | null; summary: Summary; checked?: { id: string; verdict: Verdict; title?: string } };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const VERDICT_TEXT: Record<Verdict, string> = {
  right: "sounds right", half: "real tempo is half", double: "real tempo is double", wrong: "something else", skip: "skipped",
};
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const bpmText = (n: number) => `${Math.round(n)} BPM`;
/** Tapping along: the tempo from the gaps between taps (a pause of 2 s starts over). */
function tappedBpm(taps: number[]): number | null {
  if (taps.length < 4) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]!).slice(-8).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  return median > 0 ? 60_000 / median : null;
}

export default function SpotCheck({ request }: { request: Request }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [last, setLast] = useState<{ id: string; title: string } | null>(null);
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = () => request<View>("/spotcheck").then(setView).catch((cause) => setMessage((cause as Error).message));
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function tap() {
    const now = performance.now();
    setTaps((list) => (list.length && now - list[list.length - 1]! > 2000 ? [now] : [...list, now]).slice(-12));
  }
  const tapped = tappedBpm(taps);

  async function answer(body: Record<string, unknown>) {
    if (!view?.track) return;
    const track = view.track;
    setBusy(true); setMessage("");
    try {
      const next = await request<View>("/spotcheck", { method: "POST", body: JSON.stringify({ track_id: track.id, ...body }) });
      setView(next);
      setTaps([]);
      setLast({ id: track.id, title: track.title });
      setMessage(`Saved “${track.title}”: ${VERDICT_TEXT[next.checked?.verdict ?? "skip"]}. Here’s the next one.`);
      headingRef.current?.focus(); // the next track is announced from the top of the card
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    if (!last) return;
    setBusy(true);
    try {
      setView(await request<View>("/spotcheck/forget", { method: "POST", body: JSON.stringify({ track_id: last.id }) }));
      setMessage(`Took back your answer for “${last.title}”.`);
      setLast(null);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  const t = view?.track;
  const s = view?.summary;
  const unsure = t && t.tempo_confidence !== null && t.tempo_confidence < 0.5;
  const startAt = t?.duration_s && t.duration_s > 120 ? 45 : 0; // skip the intro, where the beat often hasn't started
  return (
    <section className="panel spotcheck" aria-labelledby={`${id}-title`}>
      <button type="button" className="listening__toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <span id={`${id}-title`}>Check the measurements{s && s.checked ? ` — ${s.checked} checked, ${pct(s.accuracy)} right` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="spotcheck__body" id={`${id}-body`}>
        <p className="spotcheck__intro">Listen to a random analysed track and say whether its tempo is right. A few minutes of this tells us how far to trust the measurements — and every answer fixes that track for smart playlists.</p>
        {!view ? <p className="muted">{message || "Loading…"}</p> : <>
          {t ? (
            <div className="spotcheck__card">
              <h3 ref={headingRef} tabIndex={-1}>{t.title}</h3>
              <p className="muted">{[t.artist, t.album, t.year].filter(Boolean).join(" · ")}</p>
              <p className="spotcheck__measured">SynAmp measured <strong>{bpmText(t.bpm)}</strong>
                {unsure && <span className="spotcheck__unsure"> · the analyzer wasn’t sure</span>}</p>
              <audio className="spotcheck__audio" controls preload="none" src={`${t.stream_url}${startAt ? `#t=${startAt}` : ""}`}
                aria-label={`Play ${t.title}`} key={t.id} />

              <div className="spotcheck__tap">
                <button type="button" className="spotcheck__tap-button" onClick={tap} aria-describedby={`${id}-tap-hint`}>Tap along</button>
                <p className="muted" id={`${id}-tap-hint`}>Optional: press it on every beat (or tab to it and press Space). Four taps or more give a tempo.</p>
                <p className="spotcheck__tapped" role="status">{tapped ? <>Your tempo: <strong>{bpmText(tapped)}</strong> ({taps.length} taps)</> : taps.length ? `${taps.length} ${taps.length === 1 ? "tap" : "taps"}…` : ""}</p>
                {taps.length > 0 && <button type="button" className="linklike" onClick={() => setTaps([])}>Start tapping over</button>}
              </div>

              <div className="spotcheck__answers" role="group" aria-label="Is the measured tempo right?">
                {tapped && <button type="button" className="primary" disabled={busy} onClick={() => answer({ tapped_bpm: Math.round(tapped * 10) / 10 })}>Use my tapped tempo ({bpmText(tapped)})</button>}
                <button type="button" className={tapped ? "quiet" : "primary"} disabled={busy} onClick={() => answer({ verdict: "right" })}>Sounds right</button>
                <button type="button" className="quiet" disabled={busy} onClick={() => answer({ verdict: "half" })}>Real tempo is half ({bpmText(t.bpm / 2)})</button>
                <button type="button" className="quiet" disabled={busy} onClick={() => answer({ verdict: "double" })}>Real tempo is double ({bpmText(t.bpm * 2)})</button>
                <button type="button" className="quiet" disabled={busy} onClick={() => answer({ verdict: "wrong" })}>Something else</button>
                <button type="button" className="quiet" disabled={busy} onClick={() => answer({ verdict: "skip" })}>Skip this one</button>
              </div>
            </div>
          ) : (
            <p className="muted">Nothing to check right now — every analysed track has an answer. More arrive as the analysis carries on.</p>
          )}
          <p className="spotcheck__message" role="status">{message}{last && <> <button type="button" className="linklike" disabled={busy} onClick={undo}>Undo</button></>}</p>

          {s && s.checked > 0 && <div className="spotcheck__results">
            <h3>So far</h3>
            <dl className="health__facts">
              <div><dt>Checked</dt><dd>{s.checked}</dd></div>
              <div><dt>Right</dt><dd>{pct(s.accuracy)}</dd></div>
              <div><dt>Half / double</dt><dd>{s.half} / {s.double}</dd></div>
              <div><dt>Something else</dt><dd>{s.wrong}</dd></div>
              <div><dt>Tempos corrected</dt><dd>{s.corrections}</dd></div>
            </dl>
            <p className="muted">When the analyzer was confident: {s.confident.checked ? `${pct(s.confident.accuracy)} right (${s.confident.checked} checked)` : "none checked yet"}. When it wasn’t: {s.unsure.checked ? `${pct(s.unsure.accuracy)} right (${s.unsure.checked} checked)` : "none checked yet"}.
              {s.checked < 20 && " About 20 answers give a useful picture."}</p>
          </div>}
        </>}
      </div>}
    </section>
  );
}
