import { useEffect, useId, useRef, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import { AddToPlaylist, AlbumRow, clock, useDebounced } from "./LibraryParts";
import Icon from "./ui/Icon";
import LibraryTable from "./LibraryTable";
import { columnNames, readPresentation, TABLE_KEY } from "./library-table";
import type { Column } from "./library-table";

type Kind = "song" | "album" | "artist";
type Row = { key: string; type: Kind; title: string; artist?: string; album_artist?: string; album?: string; year?: number; count: number; duration_s?: number; genres: string[] };
type Page = { total: number; matched_total: number; rows: Row[]; groups: { label: string; count: number }[]; group_memberships_overlap: boolean };
type Rule = { field: string; mode: string; value: string; not: boolean };
const modes = { contains: "Contains words", exact: "Exact field", glob: "Wildcard (* / ?)", fuzzy: "Similar spelling" };
function preferences() {
  try { return readPresentation(JSON.parse(localStorage.getItem(TABLE_KEY) ?? localStorage.getItem("synamp-library-view-v1") ?? "null")); }
  catch { return readPresentation(null); }
}
const freshRule = (): Rule => ({ field: "artist", mode: "contains", value: "", not: false });

export default function LibraryExplorer({ request, play, playlists }: { request: Request; play: (body: Record<string, unknown>) => Promise<void>; playlists: PlaylistNode[] }) {
  const [initial] = useState(preferences);
  const [view, setView] = useState(initial.view);
  const [columns, setColumns] = useState(initial.columns);
  const [order, setOrder] = useState(initial.order);
  const [widths, setWidths] = useState(initial.widths);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("contains");
  const [types, setTypes] = useState<Kind[]>(["album"]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logic, setLogic] = useState("and");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<string>(initial.sort);
  const [direction, setDirection] = useState<string>(initial.direction);
  const [group, setGroup] = useState("none");
  const [groupKey, setGroupKey] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ticket = useRef(0);
  const pending = useRef(false);
  const searchId = useId();
  const ruleId = useId();
  const params = new URLSearchParams({ q: query.trim(), mode, types: types.join(","), rules: JSON.stringify(rules), logic, from, to, sort, direction, group, group_key: groupKey }).toString();
  const settled = useDebounced(params);
  const stale = settled !== params;
  useEffect(() => { try { localStorage.setItem(TABLE_KEY, JSON.stringify({ view, columns, order, widths, sort, direction })); } catch { /* private mode */ } }, [view, columns, order, widths, sort, direction]);

  async function load(offset = 0) {
    const id = ++ticket.current;
    pending.current = true; setBusy(true);
    try {
      const result = await request<Page>(`/library/explore?${settled}&offset=${offset}&limit=60`);
      if (id !== ticket.current) return;
      setPage(current => offset && current ? { ...result, rows: [...current.rows, ...result.rows] } : result);
      setError("");
    } catch (cause) { if (id === ticket.current) setError((cause as Error).message); }
    finally { if (id === ticket.current) { pending.current = false; setBusy(false); } }
  }
  useEffect(() => {
    // Invalidate immediately on input change, including during the debounce.
    ticket.current++; pending.current = false;
    if (stale) { setBusy(true); return; }
    void load();
    return () => { ticket.current++; };
  }, [settled, params, request]); // eslint-disable-line react-hooks/exhaustive-deps
  const actionable = !busy && !stale && !error;
  const say = (text: string) => setMessage(text);
  const changeRule = (index: number, change: Partial<Rule>) => { setRules(current => current.map((rule, i) => i === index ? { ...rule, ...change } : rule)); setGroupKey(""); };
  const inspectArtist = (row: Row) => {
    setQuery(""); setRules([{ field: "artist", mode: "exact", value: row.title, not: false }]);
    setTypes(["song", "album"]); setLogic("and"); setGroup("album"); setGroupKey("");
  };
  const actions = (row: Row) => row.type === "artist" ? <button className="btn btn--ghost btn--sm" disabled={!actionable} onClick={() => inspectArtist(row)}>Explore songs</button>
    : <div className="album__actions"><button className="btn btn--ghost btn--sm" disabled={!actionable} onClick={() => play(row.type === "album" ? { album_key: row.key } : { track_ids: [row.key] }).then(() => say(`Playing ${row.title}.`)).catch(cause => say(cause.message))}><Icon name="play" size={14} />Play</button>
      {row.type === "song" && actionable && <AddToPlaylist request={request} track={{ id: row.key, title: row.title, artist: row.artist }} playlists={playlists} onAdded={say} />}</div>;
  const cell = (row: Row, column: Exclude<Column, "actions">) => column === "duration" ? row.duration_s === 0 ? "0:00" : clock(row.duration_s) || "—" : column === "genre" ? row.genres.join(", ") || "—" : row[column] ?? "—";
  function reset() { setQuery(""); setMode("contains"); setTypes(["album"]); setRules([]); setLogic("and"); setFrom(""); setTo(""); setGroup("none"); setGroupKey(""); }

  return <section className="section-card browse" aria-labelledby="browse-title">
    <div className="section-card__head"><div><h2 id="browse-title" className="section-card__title">Library</h2>
      <p className="section-card__meta" role="status">{busy ? "Updating…" : page ? `${page.total.toLocaleString()} results${groupKey ? ` in ${groupKey}` : ""}` : "Loading…"}</p></div>
      <div className="browse__views" role="group" aria-label="Library view">{["list", "grid", "table"].map(value => <button key={value} className={`btn btn--sm ${view === value ? "btn--primary" : "btn--ghost"}`} aria-pressed={view === value} onClick={() => setView(value)}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}</div>
    </div>
    <div className="section-card__body">
      <div className="toolbar" role="search"><label className="search" htmlFor={searchId}><span className="visually-hidden">Search albums, artists and songs</span><Icon name="search" /><input id={searchId} className="input" type="search" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setGroupKey(""); }} placeholder="Search your library…" autoComplete="off" /></label>
        <label className="browse__sort">Sort <select className="select select--sm" value={sort} onChange={event => setSort(event.target.value)}>{Object.entries(columnNames).filter(([column]) => column !== "actions").map(([column, label]) => <option key={column} value={column}>{label}</option>)}</select></label>
        <button className="btn btn--ghost btn--sm" aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`} onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}>{direction === "asc" ? "↑ Ascending" : "↓ Descending"}</button>
      </div>
      <div className="browse__controls">
        <details className="browse__advanced"><summary>Advanced filters{rules.length || from || to || mode !== "contains" || types.join() !== "album" ? " · active" : ""}</summary>
          <div className="browse__filter-body">
            <fieldset className="browse__types"><legend>Show</legend>{(["album", "song", "artist"] as Kind[]).map(type => <label key={type}><input type="checkbox" checked={types.includes(type)} onChange={event => { setTypes(current => event.target.checked ? [...current, type] : current.filter(v => v !== type)); setGroupKey(""); }} />{type === "artist" ? "Artist credits" : `${type[0]!.toUpperCase()}${type.slice(1)}s`}</label>)}</fieldset>
            <div className="browse__filter-line"><label>Search matching <select className="select select--sm" value={mode} onChange={event => setMode(event.target.value)}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Combine search and rules <select className="select select--sm" value={logic} onChange={event => { setLogic(event.target.value); setGroupKey(""); }}><option value="and">AND · match all</option><option value="or">OR · match any</option></select></label></div>
            <div className="browse__filter-line"><label>Year from <input className="input" type="number" min="1" max="9999" value={from} onChange={event => { setFrom(event.target.value); setGroupKey(""); }} placeholder="Any" /></label><label>Year to <input className="input" type="number" min="1" max="9999" value={to} onChange={event => { setTo(event.target.value); setGroupKey(""); }} placeholder="Any" /></label></div>
            {rules.map((rule, index) => <div className="browse__rule" key={`${ruleId}-${index}`}><select className="select select--sm" aria-label={`Rule ${index + 1} field`} value={rule.field} onChange={event => changeRule(index, { field: event.target.value })}>{Object.entries({ any: "Any field", title: "Title", artist: "Artist / credit", album_artist: "Album artist", album: "Album", genre: "Genre" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select className="select select--sm" aria-label={`Rule ${index + 1} matching`} value={rule.mode} onChange={event => changeRule(index, { mode: event.target.value })}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input className="input" aria-label={`Rule ${index + 1} text`} maxLength={160} value={rule.value} onChange={event => changeRule(index, { value: event.target.value })} placeholder="Match text…" />
              <label><input type="checkbox" checked={rule.not} onChange={event => changeRule(index, { not: event.target.checked })} />NOT</label><button className="btn btn--quiet btn--sm" aria-label={`Remove rule ${index + 1}`} onClick={() => { setRules(current => current.filter((_, i) => i !== index)); setGroupKey(""); }}>Remove</button></div>)}
            <div className="cluster"><button className="btn btn--ghost btn--sm" disabled={rules.length >= 12} onClick={() => setRules(current => [...current, freshRule()])}>Add rule</button><button className="btn btn--quiet btn--sm" onClick={reset}>Reset filters</button></div>
            <p className="muted browse__hint">Year and types always narrow the result. Exact matches a whole field, ignoring case and accents. Wildcards match a whole field: * is any text, ? is one character. Similar spelling allows small typos. Artist credits preserve the names in your tags.</p>
          </div>
        </details>

      </div>
      <div className="browse__pivot"><label>Group by <select className="select select--sm" value={group} onChange={event => { setGroup(event.target.value); setGroupKey(""); }}>{Object.entries({ none: "None", album_artist: "Album artist", artist: "Artist / credit", album: "Album title", decade: "Decade", genre: "Genre" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {group !== "none" && <label>Explore group <select className="select select--sm" value={groupKey} onChange={event => setGroupKey(event.target.value)}><option value="">All groups ({page?.matched_total ?? "…"} results)</option>{page?.groups.map(g => <option key={g.label} value={g.label}>{g.label} · {g.count.toLocaleString()}</option>)}</select></label>}
      </div>
      {group !== "none" && <p className="muted browse__hint">Group counts cover every matching result{page?.group_memberships_overlap ? "; an item can belong to more than one group" : ""}. Album titles are browsing groups; separate folder releases keep their identity.</p>}
      <p className="browse__status" role="status">{message}</p>
      {error && <p className="alert" role="alert">{error} <button className="btn btn--quiet btn--sm" onClick={() => load()}>Retry</button></p>}
      <div aria-busy={busy} className={busy || error ? "browse__updating" : ""}>
        {page?.total === 0 && <p className="muted">{types.length ? "No results match these filters." : "Choose at least one type in Advanced filters."}</p>}
        {view === "table" ? <LibraryTable rows={page?.rows ?? []} columns={columns} order={order} widths={widths} sort={sort} direction={direction} setColumns={setColumns} setOrder={setOrder} setWidths={setWidths} cell={cell} actions={actions} onSort={column => { setSort(column); setDirection(sort === column && direction === "asc" ? "desc" : "asc"); }} />
          : <ul className={`albums browse__results ${view === "grid" ? "browse__grid" : ""}`} aria-label="Library results">{page?.rows.map(row => row.type === "album" ? <AlbumRow key={`album:${row.key}`} album={{ key: row.key, title: row.title, artist: row.artist ?? "Unknown", year: row.year, tracks: row.count, duration_s: row.duration_s }} request={request} play={play} playlists={playlists} say={say} disabled={!actionable} />
            : <li className="album" key={`${row.type}:${row.key}`}><div className="album__row"><span className="album__art" aria-hidden="true" /><div className="album__text"><p className="album__title">{row.title}</p><p className="album__meta">{row.type} · {row.artist}{row.year ? ` · ${row.year}` : ""}{row.type !== "song" ? ` · ${row.count} songs` : ""}{row.duration_s ? ` · ${clock(row.duration_s)}` : ""}</p>{row.type === "song" && <p className="album__meta">{row.album}</p>}</div>{actions(row)}</div></li>)}</ul>}
      </div>
      {page && page.rows.length < page.total && <div className="browse__more"><button className="btn btn--ghost" disabled={!actionable} onClick={() => { if (!pending.current) void load(page.rows.length); }}>Show more</button><span className="muted mono">{page.rows.length.toLocaleString()} of {page.total.toLocaleString()}</span></div>}
    </div>
  </section>;
}
