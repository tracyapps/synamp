import { useEffect, useId, useMemo, useState } from "react";
import "./styles/missing.css";

/* The missing-tracks list: every hole in every album, with your own status, tags and notes. */

type Status = "missing" | "want" | "ordered" | "have_source" | "ignore";
type Row = {
  id: string; album_key: string; artist: string; album: string; year?: string; edition?: string;
  disc: number; discs: number; position: number; number: string; title: string; length_ms?: number;
  album_have: number; album_total: number; status: Status; tags: string[]; note: string;
};
type Candidate = { id: string; title: string; artist: string; date?: string; country?: string; disambiguation?: string; track_count: number; formats: string[]; score: number };
type Report = {
  summary: { albums: number; checked: number; matched: number; complete: number; with_gaps: number; missing_tracks: number; needs_review: number; no_match: number; skipped: number; errors: number; found_again: number };
  rows: Row[];
  review: Array<{ key: string; title: string; artist: string; tracks: number; candidates: Candidate[]; not_found?: boolean }>;
  found: Array<{ id: string; note: { status: Status; tags: string[]; note: string } }>;
  matcher: { state: "idle" | "running" | "paused" | "waiting"; current: string; done_this_run: number; last_error: string; waiting: number; contact_set: boolean };
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const STATUS_LABELS: Record<Status, string> = { missing: "Missing", want: "Want", ordered: "Ordered", have_source: "Have the CD", ignore: "Don’t need" };
const n = (value: number) => value.toLocaleString();
const length = (ms?: number) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}` : "");
const ALBUMS_PER_PAGE = 20;
type SortKey = "artist" | "album" | "gaps";

function CandidateList({ candidates, onPick }: { candidates: Candidate[]; onPick: (id: string) => void }) {
  if (!candidates.length) return <p className="muted">No candidates. Try searching with a different title or artist.</p>;
  return (
    <ul className="candidates">
      {candidates.map((c) => (
        <li key={c.id}>
          <span><strong>{c.title}</strong> — {c.artist}
            <small>{[c.date?.slice(0, 4), c.country, c.formats.join(" + "), `${c.track_count} tracks`, c.disambiguation].filter(Boolean).join(" · ")}</small>
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPick(c.id)}>This one</button>
        </li>
      ))}
    </ul>
  );
}

function ChooseEdition({ request, albumKey, title, artist, initial, onDone }: {
  request: Request; albumKey: string; title: string; artist: string; initial: Candidate[]; onDone: (message: string) => void;
}) {
  const [candidates, setCandidates] = useState(initial);
  const [q, setQ] = useState({ title, artist });
  const [busy, setBusy] = useState(false);
  const formId = useId();
  async function pick(id: string | null) {
    setBusy(true);
    try {
      await request("/albums/choose", { method: "POST", body: JSON.stringify({ key: albumKey, release_id: id }) });
      onDone(id ? "Edition updated." : "Marked as not on MusicBrainz — it won’t be checked again.");
    } catch (cause) { onDone((cause as Error).message); } finally { setBusy(false); }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { setCandidates((await request<{ candidates: Candidate[] }>("/albums/search", { method: "POST", body: JSON.stringify({ key: albumKey, ...q }) })).candidates); }
    catch (cause) { onDone((cause as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="choose" aria-busy={busy}>
      <CandidateList candidates={candidates} onPick={(id) => pick(id)} />
      <form className="choose__search" onSubmit={search} aria-labelledby={`${formId}-l`}>
        <span id={`${formId}-l`} className="muted">Search MusicBrainz:</span>
        <label>Album<input value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} /></label>
        <label>Artist<input value={q.artist} onChange={(e) => setQ({ ...q, artist: e.target.value })} /></label>
        <button className="btn btn--ghost btn--sm" disabled={busy}>Search</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => pick(null)}>Not on MusicBrainz — skip it</button>
      </form>
    </div>
  );
}

function TrackRow({ row, save }: { row: Row; save: (id: string, change: Partial<Pick<Row, "status" | "tags" | "note">>) => void }) {
  const [tags, setTags] = useState(row.tags.join(", "));
  const [note, setNote] = useState(row.note);
  const label = `${row.title} (${row.album})`;
  const commitTags = () => { const next = tags.split(",").map((t) => t.trim()).filter(Boolean); if (next.join() !== row.tags.join()) save(row.id, { tags: next }); };
  return (
    <tr className={row.status === "ignore" ? "is-ignored" : undefined}>
      <td className="num">{row.discs > 1 ? `${row.disc}-` : ""}{row.number}</td>
      <td>{row.title}</td>
      <td className="num">{length(row.length_ms)}</td>
      <td>
        <select aria-label={`Status of ${label}`} value={row.status} onChange={(e) => save(row.id, { status: e.target.value as Status })}>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </td>
      <td><input aria-label={`Tags for ${label}, comma separated`} value={tags} placeholder="tags" onChange={(e) => setTags(e.target.value)}
        onBlur={commitTags} onKeyDown={(e) => { if (e.key === "Enter") commitTags(); }} /></td>
      <td><input aria-label={`Note for ${label}`} value={note} placeholder="note" onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if (note !== row.note) save(row.id, { note }); }} onKeyDown={(e) => { if (e.key === "Enter" && note !== row.note) save(row.id, { note }); }} /></td>
    </tr>
  );
}

export default function MissingTracks({ request, download, startOpen = false }: { request: Request; download: (path: string, filename: string) => Promise<void>; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"missing" | "review" | "found">("missing");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | Status | "open">("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "artist", dir: 1 });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const ids = useId();

  const load = () => request<Report>("/missing").then(setReport).catch((cause) => setMessage((cause as Error).message));
  const matching = report?.matcher.state === "running" || report?.matcher.state === "waiting";
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, matching ? 5_000 : 60_000);
    return () => clearInterval(timer);
  }, [open, matching]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(id: string, change: Partial<Pick<Row, "status" | "tags" | "note">>) {
    try {
      await request(`/missing/${id}`, { method: "POST", body: JSON.stringify(change) });
      setReport((current) => current && { ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, ...change } : row)) });
      setMessage("Saved.");
    } catch (cause) { setMessage((cause as Error).message); }
  }
  async function matcherAction(action: "start" | "pause") {
    try { await request("/missing/match", { method: "POST", body: JSON.stringify({ action }) }); await load(); }
    catch (cause) { setMessage((cause as Error).message); }
  }

  const allTags = useMemo(() => [...new Set(report?.rows.flatMap((r) => r.tags) ?? [])].sort(), [report]);
  const albums = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    const rows = report.rows.filter((row) =>
      (!q || `${row.artist} ${row.album} ${row.title}`.toLowerCase().includes(q)) &&
      (status === "" || (status === "open" ? row.status !== "ignore" && row.status !== "have_source" : row.status === status)) &&
      (!tag || row.tags.includes(tag)));
    const groups = new Map<string, Row[]>();
    for (const row of rows) groups.set(row.album_key, [...(groups.get(row.album_key) ?? []), row]);
    return [...groups.values()].sort((a, b) => {
      const x = a[0]!, y = b[0]!;
      const by = sort.key === "gaps" ? (x.album_total - x.album_have) - (y.album_total - y.album_have)
        : sort.key === "album" ? x.album.localeCompare(y.album) : x.artist.localeCompare(y.artist) || x.album.localeCompare(y.album);
      return by * sort.dir;
    });
  }, [report, query, status, tag, sort]);
  const pages = Math.max(1, Math.ceil(albums.length / ALBUMS_PER_PAGE));
  const shown = albums.slice(page * ALBUMS_PER_PAGE, (page + 1) * ALBUMS_PER_PAGE);
  const s = report?.summary;
  const m = report?.matcher;

  const sortButton = (key: SortKey, label: string) => (
    <button type="button" className={`chip ${sort.key === key ? "is-on" : ""}`} aria-pressed={sort.key === key}
      onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
      {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <section className="panel missing" aria-labelledby={`${ids}-title`}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span id={`${ids}-title`}>Missing tracks{s ? ` — ${n(s.missing_tracks)} in ${n(s.with_gaps)} albums` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="missing__body">
        {!report ? <p className="muted">Loading…</p> : <>
          <div className="missing__matcher" role="status">
            {!m!.contact_set ? (
              <p>To check albums against MusicBrainz, set <code>MUSICBRAINZ_CONTACT</code> (your email or a URL) on the server — MusicBrainz asks every app for one.</p>
            ) : matching ? (
              <p>{m!.state === "waiting" ? `MusicBrainz is busy — waiting to retry (${m!.last_error}).` : `Checking albums with MusicBrainz — ${n(m!.waiting)} to go.`}
                {m!.current && <> Now: <code>{m!.current}</code></>}</p>
            ) : (
              <p>{n(s!.checked)} of {n(s!.albums)} album folders checked · {n(s!.complete)} complete · {n(s!.with_gaps)} with gaps
                {m!.waiting > 0 && <> · {n(m!.waiting)} not checked yet</>}. MusicBrainz allows about one request a second, so a full library takes a few hours in the background.</p>
            )}
            {m!.contact_set && (matching
              ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => matcherAction("pause")}>Pause</button>
              : m!.waiting > 0 && <button type="button" className="btn btn--primary" onClick={() => matcherAction("start")}>{s!.checked ? "Check the rest" : "Start checking"}</button>)}
          </div>

          <div className="missing__tabs" role="group" aria-label="Show">
            {([["missing", `Missing (${n(s!.missing_tracks)})`], ["review", `Needs your choice (${n(s!.needs_review + s!.no_match)})`], ["found", `Found again (${n(s!.found_again)})`]] as const).map(([key, label]) => (
              <button key={key} type="button" className={`chip ${tab === key ? "is-on" : ""}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === "missing" && <>
            <div className="missing__filters">
              <label>Search<input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="artist, album or title" /></label>
              <label>Status<select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}>
                <option value="">All</option><option value="open">Still to find</option>
                {(Object.keys(STATUS_LABELS) as Status[]).map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
              </select></label>
              {allTags.length > 0 && <label>Tag<select value={tag} onChange={(e) => { setTag(e.target.value); setPage(0); }}>
                <option value="">Any</option>{allTags.map((t) => <option key={t}>{t}</option>)}</select></label>}
              <div className="missing__sort" role="group" aria-label="Sort albums by">{sortButton("artist", "Artist")}{sortButton("album", "Album")}{sortButton("gaps", "Most missing")}</div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => download("/missing.csv", "synamp-missing-tracks.csv").catch((c) => setMessage((c as Error).message))}>Download CSV</button>
            </div>
            {shown.length === 0 ? <p className="muted">{report.rows.length ? "Nothing matches these filters." : "No gaps found yet."}</p> : shown.map((group) => {
              const first = group[0]!;
              return (
                <div key={first.album_key} className="missing__album">
                  <div className="missing__album-head">
                    <h4>{first.artist} — {first.album}{first.year ? ` (${first.year})` : ""}{first.edition ? <small> [{first.edition}]</small> : null}</h4>
                    <span className="muted">have {first.album_have} of {first.album_total} · <code>{first.album_key}</code></span>
                    <button type="button" className="btn btn--ghost btn--sm" aria-expanded={editing === first.album_key} onClick={() => setEditing(editing === first.album_key ? null : first.album_key)}>Wrong edition?</button>
                  </div>
                  {editing === first.album_key && <EditionLoader request={request} albumKey={first.album_key} onDone={(text) => { setEditing(null); setMessage(text); load(); }} />}
                  <table className="missing__table">
                    <caption className="visually-hidden">Missing from {first.album}</caption>
                    <thead><tr><th scope="col">#</th><th scope="col">Title</th><th scope="col">Length</th><th scope="col">Status</th><th scope="col">Tags</th><th scope="col">Note</th></tr></thead>
                    <tbody>{group.map((row) => <TrackRow key={row.id} row={row} save={save} />)}</tbody>
                  </table>
                </div>
              );
            })}
            {pages > 1 && <nav className="missing__pages" aria-label="Pages">
              <button type="button" className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page + 1} of {pages} · {n(albums.length)} albums</span>
              <button type="button" className="btn btn--ghost btn--sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </nav>}
          </>}

          {tab === "review" && (report.review.length === 0 ? <p className="muted">Nothing waiting for you.</p> : report.review.map((item) => (
            <div key={item.key} className="missing__album">
              <div className="missing__album-head"><h4>{item.artist} — {item.title}</h4><span className="muted">{item.tracks} {item.tracks === 1 ? "file" : "files"} · <code>{item.key}</code></span></div>
              <p className="muted">{item.not_found
                ? "MusicBrainz didn’t find this one automatically. Try a different spelling below, or skip it."
                : "Which release is this folder? Pick the edition you own."}</p>
              <ChooseEdition request={request} albumKey={item.key} title={item.title} artist={item.artist} initial={item.candidates} onDone={(text) => { setMessage(text); load(); }} />
            </div>
          )))}

          {tab === "found" && (report.found.length === 0 ? <p className="muted">When a track you noted turns up in the library, it moves here.</p> : (
            <ul className="missing__found">{report.found.map((f) => <li key={f.id}>{STATUS_LABELS[f.note.status]}{f.note.tags.length ? ` · ${f.note.tags.join(", ")}` : ""}{f.note.note ? ` · ${f.note.note}` : ""} <code>{f.id}</code></li>)}</ul>
          ))}
          <p className="listening__message" role="status">{message}</p>
        </>}
      </div>}
    </section>
  );
}

function EditionLoader({ request, albumKey, onDone }: { request: Request; albumKey: string; onDone: (message: string) => void }) {
  const [data, setData] = useState<{ album: { title: string; artist: string }; record: { alternatives?: Candidate[] } | null } | null>(null);
  useEffect(() => { request<typeof data>(`/albums/record?key=${encodeURIComponent(albumKey)}`).then(setData).catch((c) => onDone((c as Error).message)); }, [albumKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p className="muted">Loading editions…</p>;
  return <ChooseEdition request={request} albumKey={albumKey} title={data.album.title} artist={data.album.artist} initial={data.record?.alternatives ?? []} onDone={onDone} />;
}
