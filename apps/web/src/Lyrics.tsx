import { useEffect, useId, useState } from "react";
import { SectionCard } from "./ui/kit";
import SaveNote, { useSaveNote } from "./ui/SaveNote";
import "./styles/lyrics.css";

/*
 * Settings → Lyrics: how many songs have their words, and the switch that lets
 * SynAmp look up missing ones on LRCLIB. Off until the owner turns it on, and it
 * says plainly what gets sent (apps/brain/src/library/lyrics.ts).
 */

type Progress = {
  lookup: boolean; songs: number; from_files: number; from_lrclib: number; instrumental: number; not_found: number;
  files_to_read: number; to_look_up: number; no_voice: number; working_on: "files" | "lookup" | null;
  problem: string | null; waiting_until: number | null;
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const n = (value: number) => value.toLocaleString();
const songs = (value: number) => `${n(value)} ${value === 1 ? "song" : "songs"}`;
/** One LRCLIB request every 1.5 s: about 2,400 an hour. */
function duration(count: number): string {
  const hours = count / 2400;
  if (hours < 1) return "under an hour";
  if (hours < 36) return `about ${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  return `about ${Math.round(hours / 24)} days`;
}
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Lyrics({ request }: { request: Request }) {
  const ids = useId();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const { note, mark } = useSaveNote();

  useEffect(() => {
    const load = () => request<Progress>("/lyrics").then(setProgress, (cause) => setProblem((cause as Error).message));
    load();
    const every = window.setInterval(load, 10_000);
    return () => window.clearInterval(every);
  }, [request]);

  async function toggle() {
    if (!progress) return;
    const on = !progress.lookup;
    setBusy(true);
    mark("lookup", "saving");
    try {
      setProgress(await request<Progress>("/lyrics", { method: "POST", body: JSON.stringify({ lookup: on }) }));
      mark("lookup", "saved", on ? "Looking up missing lyrics." : "No more lookups. Lyrics already found stay.");
    } catch (cause) {
      mark("lookup", "failed", (cause as Error).message);
    } finally { setBusy(false); }
  }

  const p = progress;
  return (
    <SectionCard title="Lyrics" labelledBy={`${ids}-title`}
      meta="The words of your songs, kept privately on your NAS. SynAmp reads them from your music files first.">
      {!p ? <p className="muted">{problem || "Loading…"}</p> : <div className="lyrics">
        <p className="lyrics__now" role="status">
          {p.files_to_read > 0
            ? <>Reading your music files for words: {songs(p.files_to_read)} to go.</>
            : <>Your music files have been read.</>}
          {" "}{n(p.from_files + p.from_lrclib)} of {songs(p.songs)} have lyrics so far.
        </p>
        <dl className="lyrics__facts">
          <div><dt>From your files</dt><dd>{n(p.from_files)}</dd></div>
          <div><dt>From LRCLIB</dt><dd>{n(p.from_lrclib)}</dd></div>
          <div><dt>Instrumental</dt><dd>{n(p.instrumental)}</dd></div>
          <div><dt>No singing heard</dt><dd>{n(p.no_voice)}</dd></div>
          <div><dt>Not found</dt><dd>{n(p.not_found)}</dd></div>
        </dl>

        <div className="lyrics__switch">
          <button type="button" role="switch" aria-checked={p.lookup} aria-describedby={`${ids}-what`} className={`switch ${p.lookup ? "is-on" : ""}`}
            disabled={busy} onClick={toggle}>
            <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Look up missing lyrics on LRCLIB
          </button>
          <SaveNote note={note} at="lookup" />
        </div>
        <p className="lyrics__what muted" id={`${ids}-what`}>
          When this is on, SynAmp sends each song’s title, artist, album and length to <strong>LRCLIB</strong> (lrclib.net), a free
          community lyrics site, one song at a time. Nothing else is sent. The words are kept on your NAS for you, and never shared.
          Songs SynAmp heard no singing in aren’t looked up.
        </p>
        {p.to_look_up > 0 && <p className="muted">
          {p.lookup ? <>{songs(p.to_look_up)} left to look up, {duration(p.to_look_up)} at a polite pace.</>
            : <>{songs(p.to_look_up)} could be looked up ({duration(p.to_look_up)} at a polite pace).</>}
        </p>}
        {p.lookup && p.problem && <p className="notice notice--warn" role="note">
          {p.problem}.{p.waiting_until ? ` SynAmp tries again at ${clock(p.waiting_until)}.` : ""}
        </p>}
      </div>}
    </SectionCard>
  );
}
