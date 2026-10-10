import { useEffect, useId, useRef, useState } from "react";
import "./styles/moodcheck.css";

/*
 * "How does this feel?": listen to a song and say where it sits from calm to
 * lively and from sad to happy. The answers are the yardstick for SynAmp's mood
 * readings (see apps/brain/src/library/moodcheck.ts). SynAmp's own guess is
 * shown only after you answer, so it can't sway you.
 */

type Scale = 1 | 2 | 3 | 4 | 5;
type Track = { id: string; title: string; artist?: string; album?: string; year?: number; duration_s?: number; stream_url: string };
type Axis = { answered: number; agreement: number | null };
type Summary = { answered: number; skipped: number; lively: Axis; happy: Axis; with_moods: number; enough: number };
type View = { track: Track | null; summary: Summary; answered?: { id: string; lively: Scale | null; happy: Scale | null; skipped: boolean } };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const LIVELY = ["Very calm", "Calm", "In between", "Lively", "Very lively"] as const;
const HAPPY = ["Very sad", "Sad", "In between", "Happy", "Very happy"] as const;

/** Plain words for a rank agreement between −1 and 1. */
function agreementText(axis: Axis, enough: number): string {
  if (axis.agreement === null) {
    const more = Math.max(0, enough - axis.answered);
    return more ? `${more} more ${more === 1 ? "answer" : "answers"} before SynAmp can say how well it agrees with you` : "not enough difference in your answers to say yet";
  }
  const r = axis.agreement;
  const words = r >= 0.6 ? "agrees with you well" : r >= 0.4 ? "agrees with you somewhat" : r >= 0.2 ? "agrees with you a little" : "doesn’t agree with you yet";
  return `SynAmp’s reading ${words} (${axis.answered} answers)`;
}

function Choices({ name, legend, labels, value, onChange, hint }: {
  name: string; legend: string; labels: readonly string[];
  /** undefined = not answered yet; null = "can't say". */
  value: Scale | null | undefined; onChange: (value: Scale | null) => void; hint: string;
}) {
  return (
    <fieldset className="moodcheck__scale" aria-describedby={`${name}-hint`}>
      <legend>{legend}</legend>
      <p className="muted moodcheck__hint" id={`${name}-hint`}>{hint}</p>
      <div className="moodcheck__options">
        {labels.map((label, index) => (
          <label key={label} className="moodcheck__option">
            <input type="radio" name={name} value={index + 1} checked={value === index + 1} onChange={() => onChange((index + 1) as Scale)} />
            <span>{label}</span>
          </label>
        ))}
        <label className="moodcheck__option moodcheck__option--quiet">
          <input type="radio" name={name} value="" checked={value === null} onChange={() => onChange(null)} />
          <span>Can’t say</span>
        </label>
      </div>
    </fieldset>
  );
}

export default function MoodCheck({ request, startOpen = false }: { request: Request; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [view, setView] = useState<View | null>(null);
  const [lively, setLively] = useState<Scale | null | undefined>(undefined);
  const [happy, setHappy] = useState<Scale | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [last, setLast] = useState<{ id: string; title: string } | null>(null);
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = () => request<View>("/moodcheck").then(setView).catch((cause) => setMessage((cause as Error).message));
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body: Record<string, unknown>) {
    if (!view?.track) return;
    const track = view.track;
    setBusy(true); setMessage("");
    try {
      const next = await request<View>("/moodcheck", { method: "POST", body: JSON.stringify({ track_id: track.id, ...body }) });
      setView(next);
      setLively(undefined); setHappy(undefined);
      setLast({ id: track.id, title: track.title });
      const a = next.answered;
      const said = a?.skipped ? "skipped" : [a?.lively ? LIVELY[a.lively - 1] : null, a?.happy ? HAPPY[a.happy - 1] : null].filter(Boolean).join(", ").toLowerCase();
      setMessage(`Saved “${track.title}”: ${said}. Here’s the next one.`);
      headingRef.current?.focus(); // the next song is announced from the top of the card
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    if (!last) return;
    setBusy(true);
    try {
      setView(await request<View>("/moodcheck/forget", { method: "POST", body: JSON.stringify({ track_id: last.id }) }));
      setMessage(`Took back your answer for “${last.title}”.`);
      setLast(null);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  const t = view?.track;
  const s = view?.summary;
  // Start a third of the way in: past the intro, usually into the body of the song.
  const startAt = t?.duration_s && t.duration_s > 90 ? Math.round(t.duration_s / 3) : 0;
  return (
    <section className="panel moodcheck" aria-labelledby={`${id}-title`}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <span id={`${id}-title`}>How does this feel?{s && s.answered ? ` — ${s.answered} answered` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="moodcheck__body" id={`${id}-body`}>
        <p className="moodcheck__intro">SynAmp is learning to hear moods. Listen to a song and say how it feels to you. Your answers are what SynAmp checks its readings against, and nothing in your playlists changes until they agree. There are no wrong answers.</p>
        {!view ? <p className="muted">{message || "Loading…"}</p> : <>
          {t ? (
            <div className="moodcheck__card">
              <h3 ref={headingRef} tabIndex={-1}>{t.title}</h3>
              <p className="muted">{[t.artist, t.album, t.year].filter(Boolean).join(" · ")}</p>
              <audio className="moodcheck__audio" controls preload="none" src={`${t.stream_url}${startAt ? `#t=${startAt}` : ""}`}
                aria-label={`Play ${t.title}`} key={t.id} />
              <Choices name={`${id}-lively`} legend="Calm or lively?" labels={LIVELY} value={lively} onChange={setLively}
                hint="How much energy the music has: a lullaby is very calm, a stadium anthem very lively." />
              <Choices name={`${id}-happy`} legend="Sad or happy?" labels={HAPPY} value={happy} onChange={setHappy}
                hint="How the music feels, whatever the words say. Bittersweet or mixed? Choose In between." />
              <div className="moodcheck__actions">
                <button type="button" className="btn btn--primary" disabled={busy || (!lively && !happy)} onClick={() => send({ lively: lively ?? null, happy: happy ?? null })}>Save and next</button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => send({ skip: true })}>Skip this song</button>
              </div>
            </div>
          ) : (
            <p className="muted">{s?.with_moods ? "You’ve answered every song that has a mood reading so far. More arrive as your Mac keeps listening." : "No songs have mood readings yet. They arrive as your Mac listens to your library — check back in a while."}</p>
          )}
          <p className="moodcheck__message" role="status">{message}{last && <> <button type="button" className="linklike" disabled={busy} onClick={undo}>Undo</button></>}</p>

          {s && s.answered > 0 && <div className="moodcheck__results">
            <h3>So far</h3>
            <ul className="moodcheck__agreement">
              <li><strong>Calm or lively:</strong> {agreementText(s.lively, s.enough)}.</li>
              <li><strong>Sad or happy:</strong> {agreementText(s.happy, s.enough)}.</li>
            </ul>
            <p className="muted">{s.with_moods.toLocaleString()} {s.with_moods === 1 ? "song has" : "songs have"} a mood reading so far.
              {s.answered < 40 && " About 40 answers give a fair picture."}</p>
          </div>}
        </>}
      </div>}
    </section>
  );
}
