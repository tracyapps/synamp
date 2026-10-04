import { useEffect, useId, useState } from "react";
import "./styles/organise.css";
import AddMusic from "./AddMusic";
import type { IncomingStatus, Upload } from "./AddMusic";

/*
 * Organise the library: SynAmp proposes, you review, the librarian applies.
 * Nothing on disk changes until you approve decisions and press Apply, and
 * every applied batch can be undone.
 */

type Status = "proposed" | "approved" | "skipped";
type Decision = {
  id: string; kind: "artist" | "album" | "import"; title: string; changes: string[]; conflicts: string[];
  preview: Array<{ from: string; to: string }>; status: Status; changed: boolean;
  move_count: number; moves: Array<{ from: string; to: string }>;
};
type Outcome = {
  id: string; title: string; kind: string; status: "queued" | "applied" | "failed"; errors?: string[]; notes?: string[];
  moved_count: number; undo?: { status: "undone" | "failed"; errors?: string[] };
};
type Batch = {
  id: string; created_at: number; finished_at?: number; status: "queued" | "running" | "done" | "partial" | "failed";
  decisions: Outcome[]; undo?: { status: "queued" | "running" | "done" | "partial"; requested_at: number };
};
type Settings = { merge_artists: boolean; add_year: boolean; number_tracks: boolean; fold_disc_folders: boolean; compilations_folder: string };
type View = {
  summary: { total: number; proposed: number; approved: number; skipped: number; conflicts: number; changed: number; artist: number; album: number; import: number; approved_moves: number };
  settings: Settings; matching: number; offset: number; decisions: Decision[]; batches: Batch[]; busy: boolean;
  librarian: { last_seen: number; online: boolean; root?: string; incoming?: string; journal?: string; version?: string } | null;
  pending_export: boolean;
  incoming: IncomingStatus;
  upload_max_mb: number;
  progress: { job: string; batch: string; kind: "apply" | "undo"; done: number; total: number; current?: string; updated_at: number; claimed_at?: number } | null;
};

/** Where the librarian is with the current batch: shown at the top of the panel while it works. */
function BatchProgress({ progress, online }: { progress: NonNullable<View["progress"]>; online: boolean }) {
  const id = useId();
  const verb = progress.kind === "undo" ? "Undoing" : "Applying";
  const ago = Math.round((Date.now() - progress.updated_at) / 1000);
  if (!progress.claimed_at) {
    return (
      <div className="organise__progress" role="status">
        <p><strong>Waiting for the librarian</strong> to pick up a batch of {n(progress.total)} {progress.total === 1 ? "change" : "changes"}.
          {!online && <> It isn’t running — start it on the NAS with <code>sudo docker compose --env-file .env --profile app --profile librarian up -d librarian</code>.</>}</p>
      </div>
    );
  }
  return (
    <div className="organise__progress" role="status" aria-live="polite">
      <label htmlFor={id}><strong>{verb} {n(progress.done)} of {n(progress.total)}</strong>
        {progress.current && <> · now: {progress.current}</>}</label>
      <progress id={id} value={progress.done} max={progress.total} />
      <p className="muted">{ago < 120 ? `Updated ${ago} s ago.` : `No word from the librarian for ${Math.round(ago / 60)} min — it may still be busy with a big folder; its log shows each change as it goes (sudo docker compose logs -f librarian).`}
        {" "}You can close this page; it carries on.</p>
    </div>
  );
}
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const PAGE = 20;
const n = (value: number) => value.toLocaleString();
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const BATCH_TEXT: Record<Batch["status"], string> = { queued: "Waiting for the librarian", running: "Applying…", done: "Applied", partial: "Partly applied", failed: "Not applied" };

function Moves({ decision }: { decision: Decision }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="organise__moves">
      <button type="button" className="quiet" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show"} {n(decision.move_count)} file {decision.move_count === 1 ? "move" : "moves"}
      </button>
      {open && <div id={id}>
        <table>
          <caption className="visually-hidden">Files moved by: {decision.title}</caption>
          <thead><tr><th scope="col">Now</th><th scope="col">Becomes</th></tr></thead>
          <tbody>{decision.moves.map((move) => <tr key={move.from}><td><code>{move.from}</code></td><td><code>{move.to}</code></td></tr>)}</tbody>
        </table>
        {decision.move_count > decision.moves.length && <p className="muted">…and {n(decision.move_count - decision.moves.length)} more.</p>}
      </div>}
    </div>
  );
}

function DecisionCard({ decision, review }: { decision: Decision; review: (ids: string[], status: Status) => void }) {
  const choice = (status: Status, label: string, disabled = false) => (
    <button type="button" className={`chip ${decision.status === status ? "is-on" : ""}`} aria-pressed={decision.status === status} disabled={disabled}
      onClick={() => review([decision.id], status)}>{label}</button>
  );
  const blocked = decision.conflicts.length > 0;
  return (
    <article className={`organise__decision is-${decision.status}`} aria-labelledby={`d-${decision.id}`}>
      <div className="organise__decision-head">
        <h4 id={`d-${decision.id}`}><span className="organise__kind">{decision.kind === "artist" ? "Merge" : decision.kind === "import" ? "New" : "Album"}</span> {decision.title}</h4>
        <div className="organise__choice" role="group" aria-label={`Decision for ${decision.title}`}>
          {choice("approved", "Approve", blocked)}{choice("skipped", "Skip")}{choice("proposed", "Decide later")}
        </div>
      </div>
      {decision.changed && <p className="organise__note">This proposal changed since you last reviewed it, so it needs a fresh look.</p>}
      <ul className="organise__changes">{decision.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      {decision.preview.filter((p) => p.from !== p.to).map((p) => (
        <p key={p.from} className="organise__preview"><code>{p.from}</code> <span aria-hidden="true">→</span><span className="visually-hidden">becomes</span> <code>{p.to}</code></p>
      ))}
      {blocked && <div className="organise__conflicts" role="note">
        <strong>Can’t apply as it stands:</strong>
        <ul>{decision.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>}
      <Moves decision={decision} />
    </article>
  );
}

function SettingsForm({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const box = (key: Exclude<keyof Settings, "compilations_folder">, label: string, hint: string) => (
    <label className="organise__check"><input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />
      <span>{label}<small>{hint}</small></span></label>
  );
  return (
    <details className="organise__settings">
      <summary>Naming settings</summary>
      <form onSubmit={(e) => { e.preventDefault(); save(draft); }}>
        <fieldset>
          <legend className="visually-hidden">What to propose</legend>
          {box("merge_artists", "Merge artist spellings", "“Ani Difranco” and “DiFranco, Ani” become one folder")}
          {box("add_year", "Year on album folders", "Album (1998) — lets two versions of an album sit side by side")}
          {box("number_tracks", "Number track files", "01 - Title, or 1-01 - Title on multi-disc albums")}
          {box("fold_disc_folders", "Bring disc folders into the album", "CD1/ and CD2/ become one folder")}
        </fieldset>
        <label>Compilations folder
          <input value={draft.compilations_folder} onChange={(e) => setDraft({ ...draft, compilations_folder: e.target.value })} placeholder="leave empty to keep compilations where they are" />
        </label>
        <button className="quiet">Save settings</button>
      </form>
    </details>
  );
}

export default function OrganiseLibrary({ request, upload }: { request: Request; upload: Upload }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [kind, setKind] = useState<"all" | "artist" | "album" | "import">("all");
  const [status, setStatus] = useState<"all" | Status | "conflict">("proposed");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [confirming, setConfirming] = useState<"apply" | string | null>(null);
  const [message, setMessage] = useState("");
  const ids = useId();

  const query = () => new URLSearchParams({ kind, status, q, offset: String(offset), limit: String(PAGE) }).toString();
  const load = () => request<View>(`/organise?${query()}`).then(setView).catch((cause) => setMessage((cause as Error).message));
  const send = async (path: string, body: unknown, done?: string) => {
    try {
      setView(await request<View>(`${path}?${query()}`, { method: "POST", body: JSON.stringify(body) }));
      if (done) setMessage(done);
    } catch (cause) { setMessage((cause as Error).message); }
  };
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, view?.busy ? 3_000 : 60_000);
    return () => clearInterval(timer);
  }, [open, kind, status, q, offset, view?.busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = (decisionIds: string[], next: Status) => send("/organise/review", { ids: decisionIds, status: next });
  const reviewShown = (next: Status) => send("/organise/review", { filter: { kind, status, q }, status: next },
    next === "approved" ? "Approved everything shown that can be applied." : next === "skipped" ? "Skipped everything shown." : "Cleared.");
  const s = view?.summary;
  const lib = view?.librarian;
  const latestUndoable = view?.batches.find((b) => (b.status === "done" || b.status === "partial") && b.undo?.status !== "done");

  return (
    <section className="panel organise" aria-labelledby={`${ids}-title`}>
      <button type="button" className="listening__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span id={`${ids}-title`}>Organise the library{s ? ` — ${n(s.total)} ${s.total === 1 ? "proposal" : "proposals"}, ${n(s.approved)} approved` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="organise__body">
        {!view ? <p className="muted">Loading…</p> : <>
          <div className="organise__intro">
            <p>SynAmp proposes tidier names and folders, and where new music should go; nothing changes until you approve and press Apply. Every move is written to a journal and can be undone, and your analysis and play history follow the files.</p>
            <p role="status" className={lib?.online ? "organise__ok" : "organise__warn"}>
              {lib?.online ? <>The librarian is running{lib.root ? <> on <code>{lib.root}</code></> : null}.</>
                : lib ? <>The librarian hasn’t checked in since {when(lib.last_seen)}. Approved batches will wait for it.</>
                : <>The librarian isn’t running yet. It is the only part of SynAmp allowed to change files — see the brain README to start it. You can review now; batches wait for it.</>}
              {lib && !lib.journal && <> It has no journal set, so moved tracks would be re-analysed.</>}
              {lib && view.incoming.enabled && !lib.incoming && <> It can’t reach <code>incoming/</code> (no <code>LIBRARIAN_INCOMING_PATH</code>), so new music can be reviewed but not filed yet.</>}
            </p>
            {view.progress && <BatchProgress progress={view.progress} online={!!lib?.online} />}
            {view.pending_export && <p className="muted">Some moved files are still listed at their old place by the last analyzer export. They already play from the new place; the next analyzer scan and export makes it permanent.</p>}
          </div>

          <AddMusic upload={upload} incoming={view.incoming} maxMb={view.upload_max_mb}
            onUploaded={() => { setKind("import"); setStatus("proposed"); setOffset(0); request("/import/rescan", { method: "POST", body: "{}" }).then(() => load()).catch(() => load()); }}
            onRescan={() => send("/import/rescan", {}, "Checked incoming/.")} />

          <SettingsForm settings={view.settings} save={(next) => send("/organise/settings", next, "Settings saved — proposals updated.")} />

          <div className="organise__filters">
            <div className="organise__kinds" role="group" aria-label="Show">
              {([["all", `All (${n(s!.total)})`], ["import", `New music (${n(s!.import)})`], ["artist", `Artist merges (${n(s!.artist)})`], ["album", `Albums (${n(s!.album)})`]] as const).map(([key, label]) => (
                <button key={key} type="button" className={`chip ${kind === key ? "is-on" : ""}`} aria-pressed={kind === key} onClick={() => { setKind(key); setOffset(0); }}>{label}</button>
              ))}
            </div>
            <label>Status<select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setOffset(0); }}>
              <option value="proposed">To review ({n(s!.proposed)})</option>
              <option value="approved">Approved ({n(s!.approved)})</option>
              <option value="skipped">Skipped ({n(s!.skipped)})</option>
              <option value="conflict">Can’t apply ({n(s!.conflicts)})</option>
              <option value="all">All</option>
            </select></label>
            <label>Search<input type="search" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="artist, album or folder" /></label>
          </div>

          {view.matching > 0 && <div className="organise__bulk" role="group" aria-label={`All ${view.matching} shown`}>
            <span className="muted">{n(view.matching)} shown:</span>
            <button type="button" className="quiet" onClick={() => reviewShown("approved")}>Approve all</button>
            <button type="button" className="quiet" onClick={() => reviewShown("skipped")}>Skip all</button>
            <button type="button" className="quiet" onClick={() => reviewShown("proposed")}>Decide later</button>
          </div>}

          {view.decisions.length === 0
            ? <p className="muted">{s!.total ? "Nothing matches these filters." : "Nothing to propose — the library already follows the naming settings (or hasn’t been exported yet)."}</p>
            : view.decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} review={review} />)}
          {view.matching > PAGE && <nav className="missing__pages" aria-label="Pages">
            <button type="button" className="quiet" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <span>{n(offset + 1)}–{n(Math.min(offset + PAGE, view.matching))} of {n(view.matching)}</span>
            <button type="button" className="quiet" disabled={offset + PAGE >= view.matching} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </nav>}

          <div className="organise__apply">
            {view.busy ? <p>The librarian is working on a batch — progress is shown at the top of this panel.</p> : confirming === "apply" ? <>
              <p><strong>Apply {n(s!.approved)} approved {s!.approved === 1 ? "change" : "changes"}?</strong> This renames or moves {n(s!.approved_moves)} music files, plus the artwork beside them. It can be undone from the list below.</p>
              <button type="button" className="primary" onClick={() => { setConfirming(null); send("/organise/apply", {}, "Sent to the librarian."); }}>Yes, apply</button>
              <button type="button" className="quiet" onClick={() => setConfirming(null)}>Cancel</button>
            </> : <button type="button" className="primary" disabled={!s!.approved} onClick={() => setConfirming("apply")}>
              Apply {n(s!.approved)} approved {s!.approved === 1 ? "change" : "changes"}…
            </button>}
          </div>

          {view.batches.length > 0 && <div className="organise__batches">
            <h3>Recent batches</h3>
            {view.batches.map((batch) => {
              const applied = batch.decisions.filter((d) => d.status === "applied").length;
              const problems = batch.decisions.filter((d) => d.errors?.length || d.notes?.length || d.undo?.errors?.length);
              return (
                <div key={batch.id} className="organise__batch">
                  <p><strong>{when(batch.created_at)}</strong> · {BATCH_TEXT[batch.status]} · {applied} of {batch.decisions.length} {batch.decisions.length === 1 ? "decision" : "decisions"}
                    {batch.undo && <> · undo: {batch.undo.status === "done" ? "done" : batch.undo.status === "partial" ? "partly done" : "waiting"}</>}</p>
                  {problems.length > 0 && <ul>{problems.map((d) => <li key={d.id}>{d.title}: {[...(d.errors ?? []), ...(d.notes ?? []), ...(d.undo?.errors ?? [])].join("; ")}</li>)}</ul>}
                  {batch.id === latestUndoable?.id && !view.busy && (confirming === batch.id ? <>
                    <span>Put these files back where they were?</span>
                    <button type="button" className="primary" onClick={() => { setConfirming(null); send("/organise/undo", { batch: batch.id }, "Undo sent to the librarian."); }}>Yes, undo</button>
                    <button type="button" className="quiet" onClick={() => setConfirming(null)}>Cancel</button>
                  </> : <button type="button" className="quiet" onClick={() => setConfirming(batch.id)}>Undo this batch…</button>)}
                </div>
              );
            })}
          </div>}
          <p className="listening__message" role="status">{message}</p>
        </>}
      </div>}
    </section>
  );
}
