import { useEffect, useId, useRef, useState } from "react";
import "./styles/organise.css";
import { describe, keepVisible, NOTHING_PICKED, pick, pickAll, type Picked, summarise } from "./organise-select";
import AddMusic from "./AddMusic";
import type { IncomingStatus, Upload } from "./AddMusic";
import Icon from "./ui/Icon";
import SaveNote, { type SaveState, useSaveNote } from "./ui/SaveNote";
import { DUPLICATES_FOLDER, type Finder, folderOf, type Folder, macName } from "./finder";

/*
 * Organise the library: SynAmp proposes, you review, the librarian applies.
 * Nothing on disk changes until you approve decisions and press Apply, and
 * every applied batch can be undone.
 */

type Status = "proposed" | "approved" | "skipped";
type Decision = {
  id: string; kind: "artist" | "album" | "import"; title: string; changes: string[]; conflicts: string[];
  preview: Array<{ from: string; to: string }>; status: Status; changed: boolean;
  move_count: number; moves: Array<{ from: string; to: string; to_area?: "incoming" }>;
  /** Copies of one recording that met here: which stays, which is set aside. */
  duplicates?: DuplicatePair[];
};
type DuplicateCopy = { id: string; path: string; quality: string };
type DuplicatePair = { pair: string; how: "identical" | "recording"; keep: DuplicateCopy; aside: DuplicateCopy; why: string; chosen_by: "SynAmp" | "you" };
type Outcome = {
  id: string; title: string; kind: string; status: "queued" | "applied" | "failed"; errors?: string[]; notes?: string[];
  moved_count: number; undo?: { status: "undone" | "failed"; errors?: string[] };
};
type Batch = {
  id: string; created_at: number; finished_at?: number; status: "queued" | "running" | "done" | "partial" | "failed";
  decisions: Outcome[]; undo?: { status: "queued" | "running" | "done" | "partial"; requested_at: number };
};
type Settings = { merge_artists: boolean; add_year: boolean; number_tracks: boolean; fold_disc_folders: boolean; set_aside_duplicates: boolean; compilations_folder: string };
type View = {
  summary: { total: number; proposed: number; approved: number; skipped: number; conflicts: number; changed: number; artist: number; album: number; import: number; approved_moves: number; set_aside: number };
  settings: Settings; matching: number; offset: number; decisions: Decision[]; batches: Batch[]; busy: boolean;
  librarian: { last_seen: number; online: boolean; root?: string; incoming?: string; journal?: string; version?: string } | null;
  pending_export: boolean;
  incoming: IncomingStatus;
  upload_max_mb: number;
  /** "Pause file changes" is on: the librarian takes no new batches. */
  paused: { at: number } | null;
  /** "Open in Finder" works while the Mac that analyses the music is connected. */
  finder?: Finder | null;
  progress: { job: string; batch: string; kind: "apply" | "undo"; done: number; total: number; current?: string; updated_at: number; claimed_at?: number } | null;
};

/** Where the librarian is with the current batch: shown at the top of the panel while it works. */
function BatchProgress({ progress, online, paused }: { progress: NonNullable<View["progress"]>; online: boolean; paused: boolean }) {
  const id = useId();
  const verb = progress.kind === "undo" ? "Undoing" : "Applying";
  const ago = Math.round((Date.now() - progress.updated_at) / 1000);
  if (!progress.claimed_at) {
    return (
      <div className="organise__progress" role="status">
        <p><strong>{paused ? "Paused" : "Waiting for the librarian"}</strong>{paused ? <> — a batch of {n(progress.total)} {progress.total === 1 ? "change" : "changes"} starts when you switch file changes back on.</>
          : <> to pick up a batch of {n(progress.total)} {progress.total === 1 ? "change" : "changes"}.</>}
          {!online && !paused && <> It isn’t running — start it on the NAS with <code>dc up -d librarian</code>.</>}</p>
      </div>
    );
  }
  return (
    <div className="organise__progress" role="status" aria-live="polite">
      <label htmlFor={id}><strong>{verb} {n(progress.done)} of {n(progress.total)}</strong>
        {progress.current && <> · now: {progress.current}</>}</label>
      <progress id={id} value={progress.done} max={progress.total} />
      <p className="muted">{ago < 120 ? `Updated ${ago} s ago.` : `No word from the librarian for ${Math.round(ago / 60)} min — it may still be busy with a big folder; its log shows each change as it goes (sudo docker compose logs -f librarian).`}
        {" "}You can close this page; it carries on.{paused && " File changes are paused: this batch finishes, then nothing new starts."}</p>
    </div>
  );
}
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const PAGE_SIZES = [20, 50, 100] as const;
const n = (value: number) => value.toLocaleString();
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const BATCH_TEXT: Record<Batch["status"], string> = { queued: "Waiting for the librarian", running: "Applying…", done: "Applied", partial: "Partly applied", failed: "Not applied" };

/** Opens a folder in Finder on the Mac that analyses the music, and says so beside the button. */
function FinderButton({ finder, folder, at, saved, reveal, label = "Open in Finder" }: {
  finder?: Finder | null; folder: Folder | null; at: string; saved: SaveState; reveal: Reveal; label?: string;
}) {
  if (!finder || !folder) return null;
  const where = folder.path ? `${folder.area === "incoming" ? "incoming/" : ""}${folder.path}` : folder.area;
  return <>
    <button type="button" className="btn btn--ghost btn--sm" onClick={() => reveal(folder, at)}>
      <Icon name="folder" size={16} /> {label}<span className="visually-hidden">: {where}, on {macName(finder)}</span>
    </button>
    <SaveNote note={saved} at={at} />
  </>;
}
type Reveal = (folder: Folder, at: string) => void;

function Moves({ decision, finder, saved, reveal }: { decision: Decision; finder?: Finder | null; saved: SaveState; reveal: Reveal }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="organise__moves">
      <div className="organise__moves-actions">
        <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"} {n(decision.move_count)} file {decision.move_count === 1 ? "move" : "moves"}
        </button>
        <FinderButton finder={finder} folder={folderOf(decision)} at={`finder-${decision.id}`} saved={saved} reveal={reveal} />
      </div>
      {open && <div id={id}>
        <table>
          <caption className="visually-hidden">Files moved by: {decision.title}</caption>
          <thead><tr><th scope="col">Now</th><th scope="col">Becomes</th></tr></thead>
          <tbody>{decision.moves.map((move) => <tr key={move.from}><td><code>{move.from}</code></td>
            <td>{move.to_area && <span className="organise__aside-tag">Set aside: </span>}<code>{move.to_area ? `${move.to_area}/` : ""}{move.to}</code></td></tr>)}</tbody>
        </table>
        {decision.move_count > decision.moves.length && <p className="muted">…and {n(decision.move_count - decision.moves.length)} more.</p>}
      </div>}
    </div>
  );
}

/** Two copies of one recording: which stays, which is set aside, and a way to pick the other. */
function Duplicates({ decision, keep, saved }: { decision: Decision; keep: (decision: string, pair: string, track: string | null) => void; saved: SaveState }) {
  const id = useId();
  const pairs = decision.duplicates ?? [];
  if (!pairs.length) return null;
  return (
    <div className="organise__dupes">
      <h5 id={id}>{pairs.length === 1 ? "A second copy of the same recording" : `${n(pairs.length)} second copies of the same recording`}</h5>
      <p className="muted">The better copy stays; the other moves to <code>incoming/_duplicates/</code> — nothing is deleted, and Undo brings it back.</p>
      <ul aria-labelledby={id}>
        {pairs.map((pair) => (
          <li key={pair.pair} className="organise__dupe">
            <dl>
              <dt>Keeps</dt><dd><code>{pair.keep.path}</code> <span className="organise__quality">{pair.keep.quality}</span></dd>
              <dt>Sets aside</dt><dd><code>{pair.aside.path}</code> <span className="organise__quality">{pair.aside.quality}</span></dd>
              <dt>Why</dt><dd id={`why-${pair.pair}`}>{pair.chosen_by === "you" ? "You chose this copy." : pair.why}
                {pair.how === "recording" && pair.chosen_by !== "you" && <> Same recording by its fingerprint, but not identical audio — if one is a remaster or another edition, pick the one you want.</>}</dd>
            </dl>
            <div className="organise__dupe-actions">
              <button type="button" className="btn btn--ghost btn--sm" aria-describedby={`why-${pair.pair}`} onClick={() => keep(decision.id, pair.pair, pair.aside.id)}>
                Keep the other copy instead<span className="visually-hidden">: {pair.aside.path}</span>
              </button>
              {pair.chosen_by === "you" && <button type="button" className="btn btn--ghost btn--sm" onClick={() => keep(decision.id, pair.pair, null)}>Go back to SynAmp’s pick</button>}
            </div>
          </li>
        ))}
      </ul>
      <SaveNote note={saved} at={`dupes-${decision.id}`} />
    </div>
  );
}

/** Copies set aside as duplicates: where they are, and a way to look. */
function SetAside({ finder, count, saved, reveal }: { finder?: Finder | null; count?: number; saved: SaveState; reveal: Reveal }) {
  if (!count) return null; // nothing set aside yet
  return (
    <div className="organise__set-aside">
      <p><strong>{n(count)} {count === 1 ? "copy" : "copies"}</strong> set aside in <code>incoming/_duplicates/</code>. Nothing there is deleted; have a look whenever you like.</p>
      {finder ? <div className="organise__moves-actions">
        <FinderButton finder={finder} folder={DUPLICATES_FOLDER} at="finder-duplicates" saved={saved} reveal={reveal} label="Open the duplicates folder in Finder" />
      </div> : <p className="muted">“Open in Finder” works while the Mac that analyses your music is connected.</p>}
    </div>
  );
}

function DecisionCard({ decision, review, keep, selected, onSelect, saved, finder, reveal }: {
  decision: Decision; review: (ids: string[], status: Status) => void; keep: (decision: string, pair: string, track: string | null) => void;
  selected: boolean; onSelect: (id: string, shift: boolean) => void; saved: SaveState; finder?: Finder | null; reveal: Reveal;
}) {
  const choice = (status: Status, label: string, disabled = false) => (
    <button type="button" className={`chip ${decision.status === status ? "is-on" : ""}`} aria-pressed={decision.status === status} disabled={disabled}
      onClick={() => review([decision.id], status)}>{label}</button>
  );
  const blocked = decision.conflicts.length > 0;
  return (
    <article className={`organise__decision is-${decision.status} ${selected ? "is-selected" : ""}`} aria-labelledby={`d-${decision.id}`}>
      <div className="organise__decision-head">
        <div className="organise__decision-title">
          {/* Shift-click selects everything between this and the last one you clicked. */}
          <input type="checkbox" className="organise__select" checked={selected} aria-labelledby={`d-${decision.id}`}
            onChange={() => undefined} onClick={(event) => onSelect(decision.id, event.shiftKey)} />
          <h4 id={`d-${decision.id}`}><span className="organise__kind">{decision.kind === "artist" ? "Merge" : decision.kind === "import" ? "New" : "Album"}</span> {decision.title}</h4>
        </div>
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
      <Duplicates decision={decision} keep={keep} saved={saved} />
      <Moves decision={decision} finder={finder} saved={saved} reveal={reveal} />
    </article>
  );
}

/**
 * What went wrong in a batch, as one line ("312 files were no longer there, 4 files were already there")
 * that opens into a scrolling list, one album per row, each opening to its files.
 */
function BatchProblems({ batch }: { batch: Batch }) {
  const rows = batch.decisions
    .map((d) => ({ id: d.id, title: d.title, problems: [...(d.errors ?? []), ...(d.notes ?? []), ...(d.undo?.errors ?? [])] }))
    .filter((row) => row.problems.length);
  if (!rows.length) return null;
  const all = rows.flatMap((row) => row.problems);
  const summary = summarise(all);
  const download = () => {
    const text = rows.map((row) => `${row.title}\n${row.problems.map((p) => `  - ${p}`).join("\n")}`).join("\n\n") + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `synamp-batch-${new Date(batch.created_at).toISOString().slice(0, 16).replace(/[:T]/g, "-")}-problems.txt` });
    document.body.append(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <details className="organise__problems">
      <summary>
        <span className="organise__problems-count">{rows.length.toLocaleString()} {rows.length === 1 ? "decision" : "decisions"} ran into problems</span>
        <span className="organise__problems-kinds"> — {describe(summary)}</span>
      </summary>
      <div className="organise__problems-body">
        {summary.some((item) => item.kind === "gone") && <p className="muted">“No longer there” means the file had already moved or gone before the librarian got to it (often by an earlier batch, or another app). SynAmp leaves those alone; a fresh look at the proposals picks up where things are now.</p>}
        <button type="button" className="btn btn--ghost btn--sm" onClick={download}>Download the full list</button>
        <ul className="organise__problems-list">
          {rows.map((row) => (
            <li key={row.id}>
              <details>
                <summary>{row.title} <span className="muted">· {describe(summarise(row.problems))}</span></summary>
                <ul>{row.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function SettingsForm({ settings, save, saved }: { settings: Settings; save: (next: Settings) => void; saved: SaveState }) {
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
          {box("set_aside_duplicates", "Set aside second copies of the same recording", "When a merge meets an identical recording, keep the better copy and move the other to incoming/_duplicates (never deleted)")}
        </fieldset>
        <label>Compilations folder
          <input value={draft.compilations_folder} onChange={(e) => setDraft({ ...draft, compilations_folder: e.target.value })} placeholder="leave empty to keep compilations where they are" />
        </label>
        <div className="organise__save-row">
          <button className="btn btn--ghost btn--sm">Save settings</button>
          <SaveNote note={saved} at="settings" />
        </div>
      </form>
    </details>
  );
}

export default function OrganiseLibrary({ request, upload, startOpen = false }: { request: Request; upload: Upload; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [view, setView] = useState<View | null>(null);
  const [kind, setKind] = useState<"all" | "artist" | "album" | "import">("all");
  const [status, setStatus] = useState<"all" | Status | "conflict" | "duplicates">("proposed");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [picked, setPicked] = useState<Picked>(NOTHING_PICKED);
  const [olderBatches, setOlderBatches] = useState(false);
  const allBox = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<"apply" | string | null>(null);
  const [message, setMessage] = useState("");
  const saved = useSaveNote();
  const ids = useId();

  const query = () => new URLSearchParams({ kind, status, q, offset: String(offset), limit: String(pageSize) }).toString();
  const load = () => request<View>(`/organise?${query()}`).then(setView).catch((cause) => setMessage((cause as Error).message));
  /** `at`: say "Saved" (or what went wrong) right there, instead of at the bottom of the panel. */
  const send = async (path: string, body: unknown, done?: string, at?: string) => {
    if (at) saved.mark(at, "saving");
    try {
      setView(await request<View>(`${path}?${query()}`, { method: "POST", body: JSON.stringify(body) }));
      if (at) saved.mark(at, "saved", done);
      else if (done) setMessage(done);
    } catch (cause) {
      if (at) saved.mark(at, "failed", (cause as Error).message);
      else setMessage((cause as Error).message);
    }
  };
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, view?.busy ? 3_000 : 60_000);
    return () => clearInterval(timer);
  }, [open, kind, status, q, offset, pageSize, view?.busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ticks only make sense for what's on screen: drop the rest when the page changes.
  const order = view?.decisions.map((decision) => decision.id) ?? [];
  const orderKey = order.join("\n");
  useEffect(() => setPicked((current) => keepVisible(current, order)), [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedCount = picked.selected.size;
  const allPicked = order.length > 0 && order.every((id) => picked.selected.has(id));
  useEffect(() => { if (allBox.current) allBox.current.indeterminate = pickedCount > 0 && !allPicked; }, [pickedCount, allPicked]);
  const reviewPicked = async (next: Status) => {
    const chosen = [...picked.selected];
    try {
      const answer = await request<View & { reviewed: number }>(`/organise/review?${query()}`, { method: "POST", body: JSON.stringify({ ids: chosen, status: next }) });
      setView(answer);
      setPicked(NOTHING_PICKED);
      const left = chosen.length - answer.reviewed;
      setMessage(next === "approved" ? `Approved ${n(answer.reviewed)}.${left > 0 ? ` ${n(left)} can’t be approved as ${left === 1 ? "it stands" : "they stand"} (see “Can’t apply as it stands”).` : ""}`
        : next === "skipped" ? `Skipped ${n(answer.reviewed)}.` : `Moved ${n(answer.reviewed)} back to “to review”.`);
    } catch (cause) { setMessage((cause as Error).message); }
  };

  const keep = (decision: string, pair: string, track: string | null) => send("/organise/keep", { pair, keep: track },
    track ? "Switched which copy stays. The proposal changed, so approve it again when it looks right." : "Back to SynAmp’s pick. Approve the proposal again when it looks right.",
    `dupes-${decision}`);
  const reveal: Reveal = async (folder, at) => {
    const on = view?.finder ? macName(view.finder) : "your Mac";
    saved.mark(at, "saving", undefined, `Asking ${on} to open it…`);
    try {
      await request("/analyzer/reveal", { method: "POST", body: JSON.stringify(folder) });
      saved.mark(at, "saved", `a Finder window opens on ${on} in a few seconds.`, "Asked");
    } catch (cause) { saved.mark(at, "failed", (cause as Error).message, "Couldn’t open it"); }
  };
  const review = (decisionIds: string[], next: Status) => send("/organise/review", { ids: decisionIds, status: next });
  const reviewShown = (next: Status) => send("/organise/review", { filter: { kind, status, q }, status: next },
    next === "approved" ? "Approved everything shown that can be applied." : next === "skipped" ? "Skipped everything shown." : "Cleared.");
  const s = view?.summary;
  const lib = view?.librarian;
  const latestUndoable = view?.batches.find((b) => (b.status === "done" || b.status === "partial") && b.undo?.status !== "done");

  return (
    <section className="panel organise" aria-labelledby={`${ids}-title`}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span id={`${ids}-title`}>Organise the library{s ? ` — ${n(s.total)} ${s.total === 1 ? "proposal" : "proposals"}, ${n(s.approved)} approved` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="organise__body">
        {!view ? <p className="muted">Loading…</p> : <>
          <div className="organise__intro">
            <p>SynAmp proposes tidier names and folders, and where new music should go; nothing changes until you approve and press Apply. Every move is written to a journal and can be undone, and your analysis and play history follow the files.</p>
            <p role="status" className={lib?.online ? "organise__ok" : "organise__warn"}>
              {lib?.online ? <>The librarian is {view.paused ? "paused" : "running"}{lib.root ? <> on <code>{lib.root}</code></> : null}.</>
                : lib ? <>The librarian hasn’t checked in since {when(lib.last_seen)}. Approved batches will wait for it.</>
                : <>The librarian isn’t running yet. It is the only part of SynAmp allowed to change files and starts with the rest of SynAmp on the NAS (<code>dc up -d librarian</code>). You can review now; batches wait for it.</>}
              {lib && !lib.journal && <> It has no journal set, so moved tracks would be re-analysed.</>}
              {lib && view.incoming.enabled && !lib.incoming && <> It can’t reach <code>incoming/</code> (no <code>LIBRARIAN_INCOMING_PATH</code>), so new music can be reviewed but not filed yet.</>}
            </p>
            <div className="organise__pause">
              <button type="button" role="switch" aria-checked={!!view.paused} className={`switch ${view.paused ? "is-on" : ""}`}
                aria-describedby={`${ids}-pause-hint`}
                onClick={() => send("/organise/pause", { paused: !view.paused }, view.paused ? "File changes are back on." : "File changes paused.", "pause")}>
                <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
                <span>Pause file changes</span>
              </button>
              <SaveNote note={saved.note} at="pause" />
              <p className="muted" id={`${ids}-pause-hint`}>
                {view.paused ? <>Paused since {when(view.paused.at)}. You can keep reviewing and applying; batches wait until you switch this off.</>
                  : <>Holds the librarian: nothing in your music folders changes while this is on. A batch already under way finishes first.</>}
              </p>
            </div>
            {view.progress && <BatchProgress progress={view.progress} online={!!lib?.online} paused={!!view.paused} />}
            {view.pending_export && <p className="muted">Some moved files are still listed at their old place by the last analyzer export. They already play from the new place; the next analyzer scan and export makes it permanent.</p>}
          </div>

          <AddMusic upload={upload} incoming={view.incoming} maxMb={view.upload_max_mb}
            onUploaded={() => { setKind("import"); setStatus("proposed"); setOffset(0); request("/import/rescan", { method: "POST", body: "{}" }).then(() => load()).catch(() => load()); }}
            onRescan={() => send("/import/rescan", {}, "Checked incoming/.")} />

          <SettingsForm settings={view.settings} saved={saved.note} save={(next) => send("/organise/settings", next, "Proposals updated.", "settings")} />

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
              <option value="duplicates">Sets aside copies ({n(s!.set_aside ?? 0)} {(s!.set_aside ?? 0) === 1 ? "copy" : "copies"})</option>
              <option value="all">All</option>
            </select></label>
            <label>Search<input type="search" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="artist, album or folder" /></label>
            <label className="organise__per-page">Per page<select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select></label>
          </div>

          {/* The selection bar sticks to the top while you scroll the proposals, and stops where they end. */}
          <div className="organise__list">
          {view.decisions.length > 0 && <div className="organise__selectbar" role="group" aria-label="Selected proposals">
            <label className="organise__check organise__select-all"><input ref={allBox} type="checkbox" checked={allPicked} onChange={() => setPicked((current) => pickAll(current, order))} />
              <span>Select all on this page</span></label>
            <span className="organise__picked" role="status">{pickedCount ? `${n(pickedCount)} selected` : <span className="muted">Tick proposals to decide on them together. Shift-click selects a run.</span>}</span>
            {pickedCount > 0 && <span className="organise__picked-actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => reviewPicked("approved")}>Approve selected</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewPicked("skipped")}>Skip selected</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewPicked("proposed")}>Decide later</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPicked(NOTHING_PICKED)}>Clear</button>
            </span>}
          </div>}

          {view.matching > 0 && <div className="organise__bulk" role="group" aria-label={`All ${view.matching} shown`}>
            <span className="muted">Every one of the {n(view.matching)} shown, on all pages:</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewShown("approved")}>Approve all</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewShown("skipped")}>Skip all</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewShown("proposed")}>Decide later</button>
          </div>}

          {view.decisions.length === 0
            ? <p className="muted">{s!.total ? "Nothing matches these filters." : "Nothing to propose — the library already follows the naming settings (or hasn’t been exported yet)."}</p>
            : view.decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} review={review} keep={keep} saved={saved.note} finder={view.finder} reveal={reveal}
              selected={picked.selected.has(decision.id)} onSelect={(id, shift) => setPicked((current) => pick(current, order, id, shift))} />)}
          {view.matching > pageSize && <nav className="missing__pages" aria-label="Pages">
            <button type="button" className="btn btn--ghost btn--sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button>
            <span>{n(offset + 1)}–{n(Math.min(offset + pageSize, view.matching))} of {n(view.matching)}</span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={offset + pageSize >= view.matching} onClick={() => setOffset(offset + pageSize)}>Next</button>
          </nav>}
          </div>

          <div className="organise__apply">
            {view.busy ? <p>The librarian is working on a batch — progress is shown at the top of this panel.</p> : confirming === "apply" ? <>
              <p><strong>Apply {n(s!.approved)} approved {s!.approved === 1 ? "change" : "changes"}?</strong> This renames or moves {n(s!.approved_moves)} music files, plus the artwork beside them. It can be undone from the list below.</p>
              <button type="button" className="btn btn--primary" onClick={() => { setConfirming(null); send("/organise/apply", {}, "Sent to the librarian."); }}>Yes, apply</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(null)}>Cancel</button>
            </> : <button type="button" className="btn btn--primary" disabled={!s!.approved} onClick={() => setConfirming("apply")}>
              Apply {n(s!.approved)} approved {s!.approved === 1 ? "change" : "changes"}…
            </button>}
          </div>

          <SetAside finder={view.finder} count={view.incoming.enabled ? view.incoming.set_aside ?? 0 : undefined} saved={saved.note} reveal={reveal} />

          {view.batches.length > 0 && <div className="organise__batches">
            <h3>Recent batches</h3>
            {view.batches.filter((batch, index) => olderBatches || index < 3 || batch.id === latestUndoable?.id).map((batch) => {
              const applied = batch.decisions.filter((d) => d.status === "applied").length;
              return (
                <div key={batch.id} className="organise__batch">
                  <p><strong>{when(batch.created_at)}</strong> · {BATCH_TEXT[batch.status]} · {applied} of {batch.decisions.length} {batch.decisions.length === 1 ? "decision" : "decisions"}
                    {batch.undo && <> · undo: {batch.undo.status === "done" ? "done" : batch.undo.status === "partial" ? "partly done" : "waiting"}</>}</p>
                  <BatchProblems batch={batch} />
                  {batch.id === latestUndoable?.id && !view.busy && (confirming === batch.id ? <>
                    <span>Put these files back where they were?</span>
                    <button type="button" className="btn btn--primary" onClick={() => { setConfirming(null); send("/organise/undo", { batch: batch.id }, "Undo sent to the librarian."); }}>Yes, undo</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(null)}>Cancel</button>
                  </> : <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(batch.id)}>Undo this batch…</button>)}
                </div>
              );
            })}
            {view.batches.length > 3 && <button type="button" className="btn btn--ghost btn--sm" aria-expanded={olderBatches} onClick={() => setOlderBatches(!olderBatches)}>
              {olderBatches ? "Show only the latest 3" : `Show ${n(view.batches.length - 3)} older ${view.batches.length - 3 === 1 ? "batch" : "batches"}`}</button>}
          </div>}
          <p className="listening__message" role="status">{message}</p>
        </>}
      </div>}
    </section>
  );
}
