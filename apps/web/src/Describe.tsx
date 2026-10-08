import { useEffect, useId, useRef, useState } from "react";
import "./styles/describe.css";
import { Callout } from "./ui/kit";

/* Shapes mirror apps/brain/src/query/evaluate.ts — kept minimal on purpose. */
type ResultTrack = {
  id: string; title: string; artist?: string; album?: string; score: number;
  channels: string[]; reasons: string[]; unverified: string[];
  near_miss?: { constraint: string; phrase: string; label: string };
};
type Ask = { ask: string; reason: string; nearest_supported?: string; unenforced?: boolean };
/* Goal interpretation (brain /plans/draft `interpretation`) — summaries only, no raw plans. */
type InterpretationReading = { label: string; confidence: number; assumptions: string[]; caveats?: string[]; culture_notes?: string[]; chosen: boolean };
type Interpretation = {
  parser: string;
  accuracy: "specific" | "partial" | "vague" | "contradictory" | "impossible";
  chosen_index: number;
  readings: InterpretationReading[];
  asks: Ask[];
  audit: Array<{ phrase: string; becomes: string; kind: "hard" | "soft" | "goal" | "exclusion" | "unparsed" | "note" }>;
};
/** "a", "a and b", "a, b and c" */
const list = (items: string[], word = "and") => items.length > 1 ? `${items.slice(0, -1).join(", ")}${word === "or" ? "," : ""} ${word} ${items.at(-1)}` : items[0] ?? "";
const quoted = (phrases: string[]) => list(phrases.map((phrase) => `“${phrase}”`)) || "this";

export type Evaluation = {
  plan_hash: string; library_version: string;
  strict: ResultTrack[]; near_miss: ResultTrack[];
  counts: { library: number; strict_total: number; excluded_by: Record<string, number>; unknown_by: Record<string, number>; unverified_by: Record<string, number>; capped: number; hidden_by_you: number; hidden_by_session: number };
  /** Persistent playlist removes only (Restore works on these). Session hides are counted separately. */
  hidden: Array<{ id: string; title: string; artist?: string }>;
  relaxations_applied: Array<{ detail: string }>;
  underfilled: boolean; unenforced: Ask[]; unsupported: Ask[]; warnings: string[]; missing_exemplars: string[];
  /** Rules that need analysis SynAmp can't do yet (older brains don't send this). */
  blind_spots?: Array<{ stage: string; about: string; phrases: string[]; hard: boolean }>;
  /** Arc notes from /plans/draft, /plans/evaluate and the smart-playlist explain (only when an arc re-ordered). */
  sequencing_applied?: string[];
};
type Constraint = { id: string; source_phrase: string; hard: boolean; explicit_exclusion?: boolean };
type DraftResponse = {
  parser: string;
  recognized: Array<{ phrase: string; becomes: string }>;
  unparsed: string[];
  validation: { ok: true; plan: { constraints: Constraint[]; assumptions?: string[] }; hash: string; warnings: string[] }
    | { ok: false; errors: Array<{ path: string; message: string }>; unsupported: Ask[] };
  interpretation?: Interpretation;
  preview: Evaluation | null;
};

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const EXAMPLES = [
  "I need to focus. no words, no piano, nothing too slow/relaxing.",
  "upbeat, between 110 and 130 bpm, no synths",
  "exclude punk or country",
  "chill electronic, no words",
];

const ACCURACY_HINT: Record<Interpretation["accuracy"], string> = {
  specific: "a clear request",
  partial: "mostly clear — some parts rest on assumptions",
  contradictory: "this pulls two ways — see the readings",
  vague: "not enough to act on yet",
  impossible: "it names something I can’t measure",
};

/**
 * C2 F6: the interpreter's confidence is a heuristic rule constant, not a calibrated
 * probability — so it is shown as a word, never as a fabricated “N% sure”.
 */
const confidenceWord = (confidence: number): string =>
  confidence >= 0.6 ? "likely" : confidence >= 0.35 ? "possibly" : "a guess";

/** How the interpreter read the request: accuracy, alternative readings, asks, and the audit trail. */
function InterpretationView({ interpretation }: { interpretation: Interpretation }) {
  const { accuracy, readings, asks, audit } = interpretation;
  return (
    <div className="describe__interpretation">
      <p className="describe__accuracy-line">
        <span className={`describe__accuracy describe__accuracy--${accuracy}`}>{accuracy}</span>
        <span className="muted">{ACCURACY_HINT[accuracy]}</span>
      </p>
      {asks.length > 0 && (
        <div className="describe__asks" role="note">
          <p className="muted">A little more would sharpen this:</p>
          <ul>{asks.map((ask) => <li key={ask.ask}>{ask.ask}<small> — {ask.reason}</small></li>)}</ul>
        </div>
      )}
      {readings.length > 1 && (
        <ul className="describe__readings">
          {readings.map((reading) => (
            <li key={reading.label} className={reading.chosen ? "is-chosen" : undefined}>
              <span>{reading.label}</span>
              {reading.chosen && <span className="describe__chosen">applied</span>}
              <small>{confidenceWord(reading.confidence)}</small>
            </li>
          ))}
        </ul>
      )}
      {readings.length === 1 && readings[0] && (
        <p className="describe__single-reading">Read as: <strong>{readings[0].label}</strong></p>
      )}
      {readings.some((reading) => reading.assumptions.length || reading.caveats?.length || reading.culture_notes?.length) && (
        <details className="describe__audit">
          <summary>Assumptions and limits</summary>
          {readings.map((reading) => (
            <div key={reading.label}>
              <p><strong>{reading.label}</strong></p>
              <ul>{[...new Set([...reading.assumptions, ...(reading.caveats ?? []), ...(reading.culture_notes ?? [])])]
                .map((note) => <li key={note}>{note}</li>)}</ul>
            </div>
          ))}
        </details>
      )}
      {audit.length > 0 && (
        <details className="describe__audit">
          <summary>How I read it ({audit.length})</summary>
          <ul className="rules">
            {audit.map((entry, index) => (
              <li key={`${entry.phrase}-${index}`}>
                <q>{entry.phrase}</q> <span aria-hidden="true">→</span><span className="visually-hidden">becomes</span> <code>{entry.becomes}</code>
                <span className="describe__audit-kind">{entry.kind}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

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
export function ResultView({ result, labels, onRestore }: { result: Evaluation; labels?: Record<string, string>; onRestore?: (trackId: string) => void }) {
  const [showNear, setShowNear] = useState(false);
  const nearId = useId();
  const name = (id: string) => labels?.[id] ? `“${labels[id]}”` : id;
  const excluded = Object.entries(result.counts.excluded_by).sort((a, b) => b[1] - a[1]);
  const spots = result.blind_spots ?? [];
  const hardPhrases = [...new Set(spots.filter((spot) => spot.hard).flatMap((spot) => spot.phrases))];
  const softPhrases = [...new Set(spots.flatMap((spot) => spot.phrases))].filter((phrase) => !hardPhrases.includes(phrase));
  return (
    <div className="smart-result">
      {result.unenforced.length > 0 && (
        <div className="notice notice--warn" role="note">
          <strong>Not enforced:</strong>
          <ul>{result.unenforced.map((ask) => <li key={ask.ask}>{ask.ask} — {ask.reason}</li>)}</ul>
        </div>
      )}
      {spots.length > 0 && (
        <Callout tone="warn">
          <p><strong>SynAmp can’t hear {list(spots.map((spot) => spot.about), "or")} yet.</strong>
            {hardPhrases.length > 0 && <> So {quoted(hardPhrases)} can’t be checked, and no song can pass {hardPhrases.length === 1 ? "it" : "them"} — that’s why nothing is found.</>}
            {softPhrases.length > 0 && <> {hardPhrases.length ? "And" : "So"} {quoted(softPhrases)} only partly works: these picks lean on what SynAmp can measure (tempo, steadiness, loudness, brightness), so expect some songs that don’t fit.</>}
            {" "}The listening step for this is being built; once your library has been through it, {hardPhrases.length + softPhrases.length > 1 ? "these rules" : "this"} will work fully.</p>
        </Callout>
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
          {result.counts.hidden_by_you > 0 && <div><dt>Removed by you</dt><dd>{result.counts.hidden_by_you} hidden</dd></div>}
        </dl>
      )}
      {result.counts.hidden_by_session > 0 && (
        <p className="muted describe__session-hides">
          {result.counts.hidden_by_session} hidden while this session lasts — clears when the session ends (use “Forget this session” on The Brain to clear now).
        </p>
      )}
      {result.relaxations_applied.length > 0 && <p className="muted">Loosened as the plan allowed: {result.relaxations_applied.map((step) => step.detail).join("; ")}.</p>}
      {result.sequencing_applied && result.sequencing_applied.length > 0 && (
        <p className="muted describe__sequencing">Order: {result.sequencing_applied.join("; ")}</p>
      )}
      {result.strict.length > 0 ? <TrackList tracks={result.strict} /> : <p className="muted">No track satisfies every rule yet.</p>}
      {onRestore && result.hidden.length > 0 && (
        <details className="hidden-by-you">
          <summary>Removed by you ({result.hidden.length})</summary>
          <ul>{result.hidden.map((track) => (
            <li key={track.id}>{track.title}{track.artist ? <small> · {track.artist}</small> : null}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRestore(track.id)}>Restore</button></li>
          ))}</ul>
        </details>
      )}
      {result.near_miss.length > 0 && (
        <section className="near-miss" aria-labelledby={`${nearId}-h`}>
          <h4 id={`${nearId}-h`}>Near misses <span>({result.near_miss.length})</span></h4>
          <p className="muted">These break exactly one of your rules, narrowly or because it hasn’t been measured. They are never mixed into the list above.</p>
          <button type="button" className="btn btn--ghost btn--sm" aria-expanded={showNear} aria-controls={nearId} onClick={() => setShowNear(!showNear)}>
            {showNear ? "Hide near misses" : "Show near misses"}
          </button>
          <div id={nearId} hidden={!showNear}><TrackList tracks={result.near_miss} nearMiss /></div>
        </section>
      )}
    </div>
  );
}

type Pick = { id: string; title: string; artist?: string };

/**
 * "Sounds like these songs": search the library and pick up to five. They go to
 * the brain as track IDs, so a title with "and" in it, or two songs with the
 * same name, can't be misread.
 */
function SoundsLike({ request, picked, onChange }: { request: Request; picked: Pick[]; onChange: (next: Pick[]) => void }) {
  const ids = useId();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Pick[]>([]);
  const [said, setSaid] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** After adding or removing, keep keyboard focus somewhere sensible (the clicked button is gone). */
  const refocus = () => requestAnimationFrame(() => (box.current ?? list.current?.querySelector("button"))?.focus());
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      request<{ tracks: Pick[] }>(`/library/search?limit=8&q=${encodeURIComponent(q.trim())}`)
        .then((answer) => { if (live) { setFound(answer.tracks); setSaid(`${answer.tracks.length} ${answer.tracks.length === 1 ? "song" : "songs"} found`); } }, () => undefined);
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [q, request]);
  const label = (track: Pick) => `${track.title}${track.artist ? ` — ${track.artist}` : ""}`;
  return (
    <div className="describe__like">
      <label htmlFor={`${ids}-q`}>Sounds like these songs <span className="muted">(optional, up to 5)</span></label>
      {picked.length > 0 && (
        <ul ref={list} className="describe__picked" aria-label="Songs it should sound like">
          {picked.map((track) => (
            <li key={track.id}><span>{label(track)}</span>
              <button type="button" className="btn btn--ghost btn--sm" aria-label={`Remove ${label(track)}`}
                onClick={() => { onChange(picked.filter((item) => item.id !== track.id)); setSaid(`Removed ${track.title}.`); refocus(); }}>Remove</button></li>
          ))}
        </ul>
      )}
      {picked.length < 5 && <input ref={box} id={`${ids}-q`} type="search" value={q} placeholder="Find a song by title or artist" autoComplete="off"
        aria-describedby={`${ids}-hint`} onChange={(event) => setQ(event.target.value)} />}
      <p id={`${ids}-hint`} className="muted describe__like-hint">SynAmp compares how songs sound, once the analysis has listened to them.</p>
      {found.length > 0 && picked.length < 5 && (
        <ul className="describe__found" aria-label="Matching songs">
          {found.filter((track) => !picked.some((item) => item.id === track.id)).map((track) => (
            <li key={track.id}><button type="button" className="btn btn--ghost btn--sm"
              onClick={() => { onChange([...picked, { id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}) }]); setQ(""); setFound([]); setSaid(`Added ${track.title}.`); refocus(); }}>
              Add <span className="describe__found-name">{label(track)}</span></button></li>
          ))}
        </ul>
      )}
      <p className="visually-hidden" role="status">{said}</p>
    </div>
  );
}

export default function Describe({ request, onSaved }: { request: Request; onSaved: (id: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [like, setLike] = useState<Pick[]>([]);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const promptId = useId();

  async function preview(event?: React.FormEvent, text = prompt) {
    event?.preventDefault();
    if (!text.trim() && !like.length) return;
    setBusy(true); setError("");
    try {
      setDraft(await request<DraftResponse>("/plans/draft", { method: "POST", body: JSON.stringify({ prompt: text, like: like.map((track) => track.id) }) }));
      if (!name) setName((text.trim() ? text.replace(/[.!?].*$/, "") : `Like ${like.map((track) => track.title).join(" and ")}`).slice(0, 60));
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
        <SoundsLike request={request} picked={like} onChange={setLike} />
        <div className="describe__actions">
          <button className="btn btn--primary" disabled={busy || (!prompt.trim() && !like.length)}>{busy ? "Working…" : "Preview"}</button>
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
            {draft.interpretation && <InterpretationView interpretation={draft.interpretation} />}
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
              <button className="btn btn--primary" onClick={save} disabled={busy}>Save as smart playlist</button>
              <p className="muted">Saves the rules, not the tracks — newly analysed music joins automatically.</p>
            </div>
          </>}
        </div>
      )}
    </section>
  );
}
