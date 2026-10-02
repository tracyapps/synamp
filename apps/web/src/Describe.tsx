import { useId, useState } from "react";
import "./styles/describe.css";

/* Shapes mirror apps/brain/src/query/evaluate.ts — kept minimal on purpose. */
type ResultTrack = {
  id: string; title: string; artist?: string; album?: string; score: number;
  channels: string[]; reasons: string[]; unverified: string[];
  near_miss?: { constraint: string; phrase: string; label: string };
};
type Ask = { ask: string; reason: string; nearest_supported?: string; unenforced?: boolean };
export type Evaluation = {
  plan_hash: string; library_version: string;
  strict: ResultTrack[]; near_miss: ResultTrack[];
  counts: { library: number; strict_total: number; excluded_by: Record<string, number>; unknown_by: Record<string, number>; unverified_by: Record<string, number>; capped: number };
  relaxations_applied: Array<{ detail: string }>;
  underfilled: boolean; unenforced: Ask[]; unsupported: Ask[]; warnings: string[]; missing_exemplars: string[];
};
type Constraint = { id: string; source_phrase: string; hard: boolean; explicit_exclusion?: boolean };
type DraftResponse = {
  parser: string;
  recognized: Array<{ phrase: string; becomes: string }>;
  unparsed: string[];
  validation: { ok: true; plan: { constraints: Constraint[]; assumptions?: string[] }; hash: string; warnings: string[] }
    | { ok: false; errors: Array<{ path: string; message: string }>; unsupported: Ask[] };
  preview: Evaluation | null;
};

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const EXAMPLES = [
  "I need to focus. no words, no piano, nothing too slow/relaxing.",
  "upbeat, between 110 and 130 bpm, no synths",
  "exclude punk or country",
  "chill electronic, no words",
];

function TrackList({ tracks, nearMiss = false }: { tracks: ResultTrack[]; nearMiss?: boolean }) {
  return (
    <ol className="smart-list">
      {tracks.map((track, index) => (
        <li key={track.id}>
          <span className="track-number" aria-hidden="true">{index + 1}</span>
          <div className="smart-list__body">
            <span className="track-title">{track.title}<small>{[track.artist, track.album].filter(Boolean).join(" · ") || track.id}</small></span>
            {nearMiss && track.near_miss && <p className="smart-list__miss">{track.near_miss.label}</p>}
            <details>
              <summary>Why {nearMiss ? "it was close" : "it’s here"}</summary>
              <ul>
                {track.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                {track.unverified.map((note) => <li key={note} className="is-unverified">Unverified — {note}</li>)}
              </ul>
            </details>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Renders an evaluation: strict tier, honest counts, then the separate near-miss tier. */
export function ResultView({ result, labels }: { result: Evaluation; labels?: Record<string, string> }) {
  const [showNear, setShowNear] = useState(false);
  const nearId = useId();
  const name = (id: string) => labels?.[id] ? `“${labels[id]}”` : id;
  const excluded = Object.entries(result.counts.excluded_by).sort((a, b) => b[1] - a[1]);
  return (
    <div className="smart-result">
      {result.unenforced.length > 0 && (
        <div className="notice notice--warn" role="note">
          <strong>Not enforced:</strong>
          <ul>{result.unenforced.map((ask) => <li key={ask.ask}>{ask.ask} — {ask.reason}</li>)}</ul>
        </div>
      )}
      <p className="smart-result__summary" aria-live="polite">
        <strong>{result.strict.length}</strong> {result.strict.length === 1 ? "track matches" : "tracks match"} every rule
        {" "}out of {result.counts.library} in the library.
        {result.underfilled && " That’s fewer than you asked for — nothing was padded or loosened without your say."}
      </p>
      {excluded.length > 0 && (
        <dl className="smart-counts">
          {excluded.map(([id, count]) => (
            <div key={id}>
              <dt>{name(id)}</dt>
              <dd>{count} excluded{result.counts.unknown_by[id] ? ` (${result.counts.unknown_by[id]} not measured yet)` : ""}</dd>
            </div>
          ))}
          {result.counts.capped > 0 && <div><dt>Variety caps</dt><dd>{result.counts.capped} skipped</dd></div>}
        </dl>
      )}
      {result.relaxations_applied.length > 0 && <p className="muted">Loosened as the plan allowed: {result.relaxations_applied.map((step) => step.detail).join("; ")}.</p>}
      {result.strict.length > 0 ? <TrackList tracks={result.strict} /> : <p className="muted">No track satisfies every rule yet.</p>}
      {result.near_miss.length > 0 && (
        <section className="near-miss" aria-labelledby={`${nearId}-h`}>
          <h4 id={`${nearId}-h`}>Near misses <span>({result.near_miss.length})</span></h4>
          <p className="muted">These break exactly one of your rules, narrowly or because it hasn’t been measured. They are never mixed into the list above.</p>
          <button type="button" className="quiet" aria-expanded={showNear} aria-controls={nearId} onClick={() => setShowNear(!showNear)}>
            {showNear ? "Hide near misses" : "Show near misses"}
          </button>
          <div id={nearId} hidden={!showNear}><TrackList tracks={result.near_miss} nearMiss /></div>
        </section>
      )}
    </div>
  );
}

export default function Describe({ request, onSaved }: { request: Request; onSaved: (id: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const promptId = useId();

  async function preview(event?: React.FormEvent, text = prompt) {
    event?.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError("");
    try {
      setDraft(await request<DraftResponse>("/plans/draft", { method: "POST", body: JSON.stringify({ prompt: text }) }));
      if (!name) setName(text.replace(/[.!?].*$/, "").slice(0, 60));
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function save() {
    if (!draft?.validation.ok) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ node: { id: string } }>("/playlists", {
        method: "POST",
        body: JSON.stringify({ type: "smart", name: name.trim() || "Smart playlist", plan: draft.validation.plan, prompt }),
      });
      onSaved(result.node.id);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  const labels = draft?.validation.ok ? Object.fromEntries(draft.validation.plan.constraints.map((item) => [item.id, item.source_phrase])) : {};
  return (
    <section className="panel describe" aria-labelledby={`${promptId}-title`}>
      <div className="panel__head"><div><p className="eyebrow">Smart playlist · draft parser</p><h2 id={`${promptId}-title`}>Describe what you want to hear</h2></div></div>
      <form className="describe__form" onSubmit={preview}>
        <label htmlFor={promptId}>In your own words</label>
        <textarea id={promptId} value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} maxLength={500}
          placeholder="e.g. I need to focus. no words, no piano, nothing too slow" aria-describedby={`${promptId}-hint`} />
        <p id={`${promptId}-hint`} className="muted">“No …” rules are strict: a track is only included when it has been measured and passes.</p>
        <div className="describe__actions">
          <button className="primary" disabled={busy || !prompt.trim()}>{busy ? "Working…" : "Preview"}</button>
          <span className="muted">Try:</span>
          {EXAMPLES.map((example) => (
            <button type="button" key={example} className="chip" onClick={() => { setPrompt(example); setName(""); preview(undefined, example); }}>{example}</button>
          ))}
        </div>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
      {draft && (
        <div className="describe__out">
          <div className="describe__understood">
            <h3>What I understood</h3>
            {draft.recognized.length ? (
              <ul className="rules">{draft.recognized.map((item, index) => <li key={index}><q>{item.phrase}</q> <span aria-hidden="true">→</span><span className="visually-hidden">becomes</span> <code>{item.becomes}</code></li>)}</ul>
            ) : <p className="muted">Nothing I can turn into a rule yet.</p>}
            {draft.validation.ok && draft.validation.plan.assumptions?.map((note) => <p key={note} className="muted">{note}</p>)}
            {!draft.validation.ok && <div className="notice" role="note">{draft.validation.errors.map((item) => <p key={item.path}>{item.message}</p>)}</div>}
            {(draft.validation.ok ? draft.preview?.unsupported ?? [] : draft.validation.unsupported).filter((ask) => !ask.unenforced).map((ask) => (
              <p key={ask.ask} className="muted">Can’t do yet: {ask.ask} — {ask.reason}</p>
            ))}
            {draft.validation.ok && draft.validation.warnings.length > 0 && (
              <details className="describe__warnings"><summary>Data notes ({draft.validation.warnings.length})</summary>
                <ul>{draft.validation.warnings.map((note) => <li key={note}>{note}</li>)}</ul></details>
            )}
            <p className="muted describe__parser">{draft.parser}</p>
          </div>
          {draft.preview && <>
            <ResultView result={draft.preview} labels={labels} />
            <div className="describe__save">
              <label>Playlist name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>
              <button className="primary" onClick={save} disabled={busy}>Save as smart playlist</button>
              <p className="muted">Saves the rules, not the tracks — newly analysed music joins automatically.</p>
            </div>
          </>}
        </div>
      )}
    </section>
  );
}
