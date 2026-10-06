import { useEffect, useId, useMemo, useState } from "react";
import "./styles/discography.css";

/* Discography gaps: albums by artists you love that you don't have yet, and what's new. */

type Note = "want" | "ignore";
type Gap = { id: string; title: string; type: string; year?: string; date?: string; fresh?: "new" | "upcoming"; note?: Note; links: Array<{ label: string; url: string }> };
type ArtistGaps = { key: string; name: string; mbid: string; mb_name?: string; disambiguation?: string; have: number; total: number; gaps: Gap[]; score: number };
type Candidate = { id: string; name: string; disambiguation?: string; country?: string; type?: string; score: number };
type Settings = { auto_follow: number; albums: boolean; eps: boolean; singles: boolean; include_other: boolean };
type Report = {
  summary: { followed: number; checked: number; matched: number; with_gaps: number; gaps: number; fresh: number; needs_choice: number; not_found: number; waiting: number };
  artists: ArtistGaps[];
  review: Array<{ key: string; name: string; tracks: number; candidates: Candidate[]; not_found?: boolean }>;
  settings: Settings;
  checker: { state: "idle" | "running" | "paused" | "waiting"; current: string; done_this_run: number; last_error: string; contact_set: boolean };
};
type LibraryArtist = { key: string; name: string; tracks: number; albums: number; plays: number; loves: number; followed: boolean; status: string | null };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const n = (value: number) => value.toLocaleString();
const PER_PAGE = 15;
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

function GapRow({ gap, artist, onNote }: { gap: Gap; artist: string; onNote: (id: string, status: Note | "none") => void }) {
  const toggle = (status: Note, label: string) => (
    <button type="button" className={`chip ${gap.note === status ? "is-on" : ""}`} aria-pressed={gap.note === status}
      onClick={() => onNote(gap.id, gap.note === status ? "none" : status)}>{label}</button>
  );
  return (
    <li className={`gaps__item ${gap.note === "ignore" ? "is-ignored" : ""}`}>
      <div className="gaps__title">
        <strong>{gap.title}</strong>
        <span className="muted">{[gap.year, gap.type].filter(Boolean).join(" · ")}</span>
        {gap.fresh === "new" && <span className="gaps__badge">New</span>}
        {gap.fresh === "upcoming" && <span className="gaps__badge">Coming {gap.date}</span>}
      </div>
      <div className="gaps__choice" role="group" aria-label={`${gap.title}: your choice`}>{toggle("want", "Want")}{toggle("ignore", "Not interested")}</div>
      <p className="gaps__links"><span className="muted">Listen or buy:</span>{" "}
        {gap.links.map((link, i) => (
          <span key={link.label}>{i > 0 && " · "}<a href={link.url} target="_blank" rel="noopener noreferrer"
            aria-label={`${link.label}: ${artist}, ${gap.title} (opens in a new tab)`}>{link.label}</a></span>
        ))}</p>
    </li>
  );
}

function ChooseArtist({ request, artistKey, name, initial, onDone }: { request: Request; artistKey: string; name: string; initial: Candidate[]; onDone: (message: string) => void }) {
  const [candidates, setCandidates] = useState(initial);
  const [query, setQuery] = useState(name);
  const [busy, setBusy] = useState(false);
  async function pick(mbid: string | null) {
    setBusy(true);
    try { await request("/discography/choose", post({ key: artistKey, mbid })); onDone(mbid ? `Checking ${name}’s releases.` : `${name} won’t be checked.`); }
    catch (cause) { onDone((cause as Error).message); } finally { setBusy(false); }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { setCandidates((await request<{ candidates: Candidate[] }>("/discography/search", post({ key: artistKey, name: query }))).candidates); }
    catch (cause) { onDone((cause as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="choose" aria-busy={busy}>
      {candidates.length === 0 ? <p className="muted">No matches. Try another spelling.</p> : (
        <ul className="candidates">{candidates.map((c) => (
          <li key={c.id}><span><strong>{c.name}</strong>{c.disambiguation ? ` (${c.disambiguation})` : ""}
            <small>{[c.type, c.country, `match ${c.score}%`].filter(Boolean).join(" · ")}</small></span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => pick(c.id)}>This one</button></li>
        ))}</ul>
      )}
      <form className="choose__search" onSubmit={search}>
        <label>Search MusicBrainz for<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <button className="btn btn--ghost btn--sm" disabled={busy}>Search</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => pick(null)}>Not on MusicBrainz — skip</button>
      </form>
    </div>
  );
}

function Following({ request, onChanged }: { request: Request; onChanged: (message: string) => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<LibraryArtist[] | null>(null);
  const [total, setTotal] = useState(0);
  const load = () => request<{ artists: LibraryArtist[]; total: number }>(`/discography/artists?q=${encodeURIComponent(q)}`)
    .then((data) => { setList(data.artists); setTotal(data.total); }).catch((cause) => onChanged((cause as Error).message));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  async function follow(artist: LibraryArtist, value: boolean) {
    try { await request("/discography/follow", post({ key: artist.key, follow: value })); await load(); onChanged(value ? `Following ${artist.name}.` : `Stopped following ${artist.name}.`); }
    catch (cause) { onChanged((cause as Error).message); }
  }
  return (
    <div className="gaps__following">
      <p className="muted">Your top artists — by how much of them you keep, play and love — are followed automatically. Follow anyone else here, or stop following someone.</p>
      <label>Find an artist in your library<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${n(total)} artists`} /></label>
      {!list ? <p className="muted">Loading…</p> : (
        <table className="missing__table">
          <caption className="visually-hidden">Artists in your library</caption>
          <thead><tr><th scope="col">Artist</th><th scope="col">Albums</th><th scope="col">Plays</th><th scope="col">Loves</th><th scope="col"><span className="visually-hidden">Follow</span></th></tr></thead>
          <tbody>{list.map((artist) => (
            <tr key={artist.key}>
              <th scope="row">{artist.name}</th><td className="num">{n(artist.albums)}</td><td className="num">{n(artist.plays)}</td><td className="num">{n(artist.loves)}</td>
              <td><button type="button" className={`chip ${artist.followed ? "is-on" : ""}`} aria-pressed={artist.followed}
                aria-label={`Follow ${artist.name}`} onClick={() => follow(artist, !artist.followed)}>{artist.followed ? "Following" : "Follow"}</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

export default function DiscographyGaps({ request, startOpen = false }: { request: Request; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"gaps" | "fresh" | "review" | "follow">("gaps");
  const [query, setQuery] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [page, setPage] = useState(0);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const ids = useId();

  const load = () => request<Report>("/discography").then(setReport).catch((cause) => setMessage((cause as Error).message));
  const checking = report?.checker.state === "running" || report?.checker.state === "waiting";
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, checking ? 5_000 : 60_000);
    return () => clearInterval(timer);
  }, [open, checking]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path: string, body: unknown, done?: string) => {
    try { setReport(await request<Report>(path, post(body))); if (done) setMessage(done); }
    catch (cause) { setMessage((cause as Error).message); }
  };
  const note = (id: string, status: Note | "none") => act("/discography/note", { id, status });

  const artists = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return report.artists.map((artist) => ({
      ...artist,
      gaps: artist.gaps.filter((gap) => (showIgnored || gap.note !== "ignore") && (tab !== "fresh" || gap.fresh)
        && (!q || `${artist.name} ${gap.title}`.toLowerCase().includes(q))),
    })).filter((artist) => artist.gaps.length).sort((a, b) => b.score - a.score);
  }, [report, query, showIgnored, tab]);
  const pages = Math.max(1, Math.ceil(artists.length / PER_PAGE));
  const shown = artists.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const s = report?.summary;
  const c = report?.checker;

  return (
    <section className="panel gaps" aria-labelledby={`${ids}-title`}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span id={`${ids}-title`}>Discography gaps{s ? ` — ${n(s.gaps)} albums you don’t have${s.fresh ? `, ${n(s.fresh)} new` : ""}` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="gaps__body">
        {!report ? <p className="muted">Loading…</p> : <>
          <div className="missing__matcher" role="status">
            {!c!.contact_set ? <p>To look up discographies, set <code>MUSICBRAINZ_CONTACT</code> on the server (the same setting the missing-tracks list uses).</p>
              : checking ? <p>{c!.state === "waiting" ? `MusicBrainz is busy — waiting to retry (${c!.last_error}).` : `Looking up discographies — ${n(s!.waiting)} artists to go.`}{c!.current && <> Now: <strong>{c!.current}</strong></>}</p>
              : <p>Following {n(s!.followed)} artists · {n(s!.matched)} looked up · {n(s!.with_gaps)} with albums you don’t have{s!.waiting > 0 && <> · {n(s!.waiting)} not looked up yet</>}. Each artist is checked again monthly for new releases.</p>}
            {c!.contact_set && (checking
              ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => act("/discography/check", { action: "pause" })}>Pause</button>
              : s!.waiting > 0 && <button type="button" className="btn btn--primary" onClick={() => act("/discography/check", { action: "start" })}>{s!.checked ? "Look up the rest" : "Start looking up"}</button>)}
          </div>

          <div className="missing__tabs" role="group" aria-label="Show">
            {([["gaps", `Albums you don’t have (${n(s!.gaps)})`], ["fresh", `New & upcoming (${n(s!.fresh)})`], ["review", `Which artist? (${n(s!.needs_choice + s!.not_found)})`], ["follow", `Artists you follow (${n(s!.followed)})`]] as const).map(([key, label]) => (
              <button key={key} type="button" className={`chip ${tab === key ? "is-on" : ""}`} aria-pressed={tab === key} onClick={() => { setTab(key); setPage(0); }}>{label}</button>
            ))}
          </div>

          {(tab === "gaps" || tab === "fresh") && <>
            <div className="missing__filters">
              <label>Search<input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="artist or album" /></label>
              <label className="organise__check"><input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} /><span>Show ones marked “not interested”</span></label>
              <details className="organise__settings">
                <summary>What counts</summary>
                <fieldset className="gaps__settings">
                  <legend className="visually-hidden">Release types to list</legend>
                  {([["albums", "Albums"], ["eps", "EPs"], ["singles", "Singles"], ["include_other", "Live albums, compilations, soundtracks, remixes"]] as const).map(([key, label]) => (
                    <label key={key} className="organise__check"><input type="checkbox" checked={report.settings[key]} onChange={(e) => act("/discography/settings", { [key]: e.target.checked })} /><span>{label}</span></label>
                  ))}
                  <label>Follow my top
                    <input type="number" min={0} max={1000} defaultValue={report.settings.auto_follow}
                      onBlur={(e) => { if (Number(e.target.value) !== report.settings.auto_follow) act("/discography/settings", { auto_follow: Number(e.target.value) }, "Saved."); }} />
                    artists automatically</label>
                </fieldset>
              </details>
            </div>
            {shown.length === 0 ? <p className="muted">{tab === "fresh" ? "Nothing new from the artists you follow." : s!.matched ? "Nothing matches — or you have everything!" : "Start looking up to see what’s missing."}</p>
              : shown.map((artist) => (
                <div key={artist.key} className="missing__album">
                  <div className="missing__album-head">
                    <h4>{artist.name}{artist.disambiguation ? <small> ({artist.disambiguation})</small> : null}</h4>
                    <span className="muted">you have {n(artist.have)} of {n(artist.total)}</span>
                    <button type="button" className="btn btn--ghost btn--sm" aria-expanded={choosing === artist.key} onClick={() => setChoosing(choosing === artist.key ? null : artist.key)}>Wrong artist?</button>
                  </div>
                  {choosing === artist.key && <ChooseArtist request={request} artistKey={artist.key} name={artist.name} initial={[]} onDone={(text) => { setChoosing(null); setMessage(text); load(); }} />}
                  <ul className="gaps__list">{artist.gaps.map((gap) => <GapRow key={gap.id} gap={gap} artist={artist.mb_name ?? artist.name} onNote={note} />)}</ul>
                </div>
              ))}
            {pages > 1 && <nav className="missing__pages" aria-label="Pages">
              <button type="button" className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page + 1} of {pages} · {n(artists.length)} artists</span>
              <button type="button" className="btn btn--ghost btn--sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </nav>}
          </>}

          {tab === "review" && (report.review.length === 0 ? <p className="muted">Nothing waiting for you.</p> : report.review.map((item) => (
            <div key={item.key} className="missing__album">
              <div className="missing__album-head"><h4>{item.name}</h4><span className="muted">{n(item.tracks)} tracks in your library</span></div>
              <p className="muted">{item.not_found ? "MusicBrainz didn’t find this name. Try another spelling, or skip it." : "MusicBrainz knows more than one artist by this name. Which is yours?"}</p>
              <ChooseArtist request={request} artistKey={item.key} name={item.name} initial={item.candidates} onDone={(text) => { setMessage(text); load(); }} />
            </div>
          )))}

          {tab === "follow" && <Following request={request} onChanged={(text) => { setMessage(text); load(); }} />}
          <p className="listening__message" role="status">{message}</p>
        </>}
      </div>}
    </section>
  );
}
