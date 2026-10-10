import { useEffect, useId, useRef, useState } from "react";
import { cardsPerRow, PAGE_SIZE, pagesFor } from "./library-window";
import type { Piece } from "./library-window";
import type { Ref } from "react";
import { useLibraryWindow } from "./useLibraryWindow";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import { AddToPlaylist, AlbumRow, AlbumSongs, albumMenu, ArtistLink, clock, openKey, PageLink, useDebounced } from "./LibraryParts";
import { useContextMenu } from "./ui/ContextMenu";
import type { MenuItem } from "./ui/ContextMenu";
import { albumHref, artistHref, openFromList } from "./library-route";
import Icon from "./ui/Icon";
import LibraryTable from "./LibraryTable";
import { columnNames, readPresentation, TABLE_KEY } from "./library-table";
import type { Column } from "./library-table";
import useLibraryView from "./useLibraryView";
import SavedLibraryViews from "./SavedLibraryViews";
import FilterPlaylistDialog from "./FilterPlaylistDialog";
import { defaultLibraryView } from "./library-view-state";
import type { LibraryViewState } from "./library-view-state";

type Kind = "song" | "album" | "artist";
type Row = { key: string; type: Kind; title: string; artist?: string; album_artist?: string; album?: string; year?: number; count: number; duration_s?: number; genres: string[]; album_key?: string };
type Page = { library_version?: string; total: number; matched_total: number; rows: Row[]; groups: { label: string; count: number }[]; group_memberships_overlap: boolean };
/** Starting guesses for a row's height (px) before any are drawn; real heights are measured. */
const ESTIMATE = { table: 50, list: 65, grid: 150 } as const;
const GRID_MIN = 230, GRID_GAP = 14;
type Rule = LibraryViewState["rules"][number];
const modes = { contains: "Contains words", exact: "Exact field", glob: "Wildcard (* / ?)", fuzzy: "Similar spelling" };
function preferences() {
  try { return readPresentation(JSON.parse(localStorage.getItem(TABLE_KEY) ?? localStorage.getItem("synamp-library-view-v1") ?? "null")); }
  catch { return readPresentation(null); }
}
const freshRule = (): Rule => ({ field: "artist", mode: "contains", value: "", not: false });
/** The Show buttons: one kind of thing at a time, or everything. */
const SHOW: Array<[string, Kind[]]> = [["Artists", ["artist"]], ["Albums", ["album"]], ["Songs", ["song"]], ["Everything", ["artist", "album", "song"]]];

export default function LibraryExplorer({ request, play, playlists, onPlaylistsChanged }: { request: Request; play: (body: Record<string, unknown>) => Promise<void>; playlists: PlaylistNode[]; onPlaylistsChanged?: () => Promise<unknown> }) {
  const [initial] = useState(preferences);
  const { state, update, apply, restoreError, validationError } = useLibraryView(initial);
  const { view, q: query, mode, types, rules, logic, from, to, sort, direction, group, group_key: groupKey } = state;
  const setView = (value: LibraryViewState["view"]) => update("view", value);
  const setQuery = (value: string) => update("q", value);
  const setMode = (value: LibraryViewState["mode"]) => update("mode", value);
  const setTypes = (value: Kind[] | ((old: Kind[]) => Kind[])) => update("types", value);
  const setRules = (value: Rule[] | ((old: Rule[]) => Rule[])) => update("rules", value);
  const setLogic = (value: LibraryViewState["logic"]) => update("logic", value);
  const setFrom = (value: string) => update("from", value);
  const setTo = (value: string) => update("to", value);
  const setSort = (value: LibraryViewState["sort"]) => update("sort", value);
  const setDirection = (value: LibraryViewState["direction"]) => update("direction", value);
  const setGroup = (value: LibraryViewState["group"]) => update("group", value);
  const setGroupKey = (value: string) => update("group_key", value);
  const [columns, setColumns] = useState(initial.columns);
  const [order, setOrder] = useState(initial.order);
  const [widths, setWidths] = useState(initial.widths);
  const [page, setPage] = useState<Page | null>(null);
  /** Pages of results fetched so far, by page number: only the ones near the screen are ever asked for. */
  const [pages, setPages] = useState<Map<number, Row[]>>(() => new Map());
  const asked = useRef(new Set<number>());
  const listBox = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(1);
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

  /** A new search, filter or sort: the first page, and the count. */
  async function load() {
    const id = ++ticket.current;
    pending.current = true; setBusy(true);
    try {
      const result = await request<Page>(`/library/explore?${settled}&offset=0&limit=${PAGE_SIZE}`);
      if (id !== ticket.current) return;
      asked.current = new Set([0]);
      setPages(new Map([[0, result.rows]]));
      setPage(result);
      // Scrolled down into the old results: go back to the top of the new ones.
      const box = listBox.current;
      if (box && box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: "start" });
      setError("");
    } catch (cause) { if (id === ticket.current) setError((cause as Error).message); }
    finally { if (id === ticket.current) { pending.current = false; setBusy(false); } }
  }
  /** More rows as they come near the screen (quietly: the list stays usable). */
  async function fetchPage(number: number) {
    const id = ticket.current;
    asked.current.add(number);
    try {
      const result = await request<Page>(`/library/explore?${settled}&offset=${number * PAGE_SIZE}&limit=${PAGE_SIZE}`);
      if (id !== ticket.current) return;
      if (page?.library_version && result.library_version !== page.library_version) {
        // The library changed underneath (an analysis export): start this view again from the new list.
        void load();
        return;
      }
      setPages(current => new Map(current).set(number, result.rows));
    } catch (cause) {
      asked.current.delete(number);
      if (id === ticket.current) setError((cause as Error).message);
    }
  }
  useEffect(() => {
    // Invalidate immediately on input change, including during the debounce.
    ticket.current++; pending.current = false;
    if (stale) { setBusy(true); return; }
    void load();
    return () => { ticket.current++; };
  }, [settled, params, request]); // eslint-disable-line react-hooks/exhaustive-deps
  const actionable = !busy && !stale && !error && !restoreError && !validationError;
  const say = (text: string) => setMessage(text);
  const changeRule = (index: number, change: Partial<Rule>) => { setRules(current => current.map((rule, i) => i === index ? { ...rule, ...change } : rule)); setGroupKey(""); };
  const { open: openMenu, menu } = useContextMenu();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleAlbum = (key: string) => setExpanded(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const inspectArtist = (row: Row) => {
    apply({ ...state, q: "", rules: [{ field: "artist", mode: "exact", value: row.title, not: false }], types: ["song", "album"], logic: "and", group: "album", group_key: "" });
  };
  const playRow = (row: Row, shuffle = false) => play(row.type === "artist" ? { artist: row.title, ...(shuffle ? { shuffle: true } : {}) } : row.type === "album" ? { album_key: row.key, ...(shuffle ? { shuffle: true } : {}) } : { track_ids: [row.key] })
    .then(() => say(`Playing ${row.type === "artist" ? `everything by ${row.title}` : row.title}${shuffle ? ", shuffled" : ""}.`)).catch(cause => say(cause.message));
  const albumOf = (row: Row) => ({ key: row.key, title: row.title, artist: row.artist ?? "Unknown", year: row.year, tracks: row.count, duration_s: row.duration_s });
  /** What the right-click menu offers for a row. */
  const menuFor = (row: Row): MenuItem[] => row.type === "album" ? albumMenu(albumOf(row), play, say, () => toggleAlbum(row.key), expanded.has(row.key))
    : row.type === "artist" ? [
      { label: "Open artist page", onSelect: () => openFromList(artistHref(row.title)) },
      { label: "Play all", onSelect: () => void playRow(row) },
      { label: "Shuffle", onSelect: () => void playRow(row, true) },
      { label: "Show their albums and songs in this list", onSelect: () => inspectArtist(row) },
    ] : [
      { label: "Play", onSelect: () => void playRow(row) },
      ...(row.album_key ? [{ label: "Open album page", onSelect: () => openFromList(albumHref(row.album_key!)) }] : []),
      ...(row.artist ? [{ label: `Go to ${row.artist}`, onSelect: () => openFromList(artistHref(row.artist!)) }] : []),
    ];
  const pageOf = (row: Row) => row.type === "artist" ? artistHref(row.title) : row.type === "album" ? albumHref(row.key) : row.album_key ? albumHref(row.album_key) : null;
  const rowEvents = (row: Row) => {
    const href = pageOf(row);
    return { onContextMenu: (event: React.MouseEvent) => openMenu(event, row.title, menuFor(row)), ...(href ? { onKeyDown: (event: React.KeyboardEvent) => openKey(event, href) } : {}) };
  };
  const actions = (row: Row) => <div className="album__actions">
    {row.type !== "song" ? <><button className="btn btn--ghost btn--sm" disabled={!actionable} onClick={() => playRow(row)}><Icon name="play" size={14} />{row.type === "artist" ? "Play all" : "Play"}<span className="visually-hidden"> {row.title}</span></button>
      <button className="btn btn--quiet btn--sm btn--icon" disabled={!actionable} onClick={() => playRow(row, true)} aria-label={`Shuffle ${row.title}`}><Icon name="shuffle" /></button></>
      : <button className="btn btn--ghost btn--sm" disabled={!actionable} onClick={() => playRow(row)}><Icon name="play" size={14} />Play<span className="visually-hidden"> {row.title}</span></button>}
    {row.type === "song" && actionable && <AddToPlaylist request={request} track={{ id: row.key, title: row.title, artist: row.artist }} playlists={playlists} onAdded={say} />}
    {pageOf(row) && <PageLink href={pageOf(row)!} label={row.type === "artist" ? `Open the artist page for ${row.title}` : `Open the album page for ${row.type === "album" ? row.title : row.album ?? "this song’s album"}`}><Icon name="open" /></PageLink>}
  </div>;
  /** Table: the title cell. Albums open their songs underneath; artists link to their page. */
  const titleCell = (row: Row) => row.type === "album"
    ? <button type="button" className="album__toggle" aria-expanded={expanded.has(row.key)} aria-controls={`songs-${encodeURIComponent(row.key)}`} onClick={() => toggleAlbum(row.key)}><Icon name="chevron" size={16} className="album__chevron" />{row.title}</button>
    : row.type === "artist" ? <ArtistLink name={row.title} /> : row.title;
  const detail = (row: Row) => row.type === "album" && expanded.has(row.key)
    ? <div id={`songs-${encodeURIComponent(row.key)}`}><AlbumSongs album={albumOf(row)} request={request} play={play} playlists={playlists} say={say} disabled={!actionable} /></div> : null;
  const cell = (row: Row, column: Exclude<Column, "actions">) => column === "duration" ? row.duration_s === 0 ? "0:00" : clock(row.duration_s) || "—" : column === "genre" ? row.genres.join(", ") || "—" : row[column] ?? "—";
  function reset() { apply(defaultLibraryView({ view, sort, direction })); }

  // Grid: how many cards fit across, so a "line" of the window is one row of cards.
  useEffect(() => {
    const element = listBox.current;
    if (!element || view !== "grid") { setPerRow(1); return; }
    const measure = () => setPerRow(cardsPerRow(element.clientWidth, GRID_MIN, GRID_GAP));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, [view]);
  const total = page?.total ?? 0;
  const win = useLibraryWindow({ total, perLine: view === "grid" ? perRow : 1, estimate: ESTIMATE[view], gap: view === "grid" ? GRID_GAP : 0, reset: `${settled}|${view}|${page?.library_version}` });
  useEffect(() => {
    if (!page || stale) return;
    for (const number of pagesFor(win.first, win.last, total)) if (!asked.current.has(number)) void fetchPage(number);
  }, [win.first, win.last, total, page, stale]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowAt = (index: number): Row | undefined => pages.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE];
  const listItem = (piece: Piece) => {
    if (piece.kind === "gap") {
      const height = view === "grid" ? Math.max(0, piece.height - GRID_GAP) : piece.height;
      return <li key={`gap-${piece.from}`} className="browse__spacer" aria-hidden="true" style={{ height }} />;
    }
    const row = rowAt(piece.index);
    const position = { "data-index": piece.index, "aria-posinset": piece.index + 1, "aria-setsize": total };
    if (!row) return <li key={`wait-${piece.index}`} className="album browse__waiting" data-waiting="" style={{ height: win.expected(piece.index) }} {...position}><div className="album__row"><span className="album__art" aria-hidden="true" /><p className="muted album__meta">Loading…</p></div></li>;
    if (row.type === "album") return <AlbumRow key={`album:${row.key}`} itemProps={position} album={albumOf(row)} request={request} play={play} playlists={playlists} say={say} disabled={!actionable} onMenu={openMenu} />;
    if (row.type === "artist") return <li className="album album--artist" key={`artist:${row.key}`} {...position} {...rowEvents(row)}><div className="album__row"><span className="album__art album__art--artist" aria-hidden="true"><Icon name="artist" size={20} /></span><div className="album__text"><p className="album__title"><ArtistLink name={row.title} /></p><p className="album__meta">{row.count.toLocaleString()} {row.count === 1 ? "song" : "songs"}{row.duration_s ? ` · ${clock(row.duration_s)}` : ""}</p></div>{actions(row)}</div></li>;
    return <li className="album album--song" key={`song:${row.key}`} {...position} {...rowEvents(row)}><div className="album__row"><span className="album__art album__art--song" aria-hidden="true"><Icon name="note" size={18} /></span><div className="album__text"><p className="album__title">{row.title}</p><p className="album__meta"><ArtistLink name={row.artist} />{row.album ? <> · {row.album_key ? <PageLink href={albumHref(row.album_key)} label={`Open the album page for ${row.album}`} className="artist-link">{row.album}</PageLink> : row.album}</> : null}{row.year ? ` · ${row.year}` : ""}{row.duration_s ? ` · ${clock(row.duration_s)}` : ""}</p></div>{actions(row)}</div></li>;
  };

  return <section className="section-card browse" aria-labelledby="browse-title">
    <div className="section-card__head"><div><h2 id="browse-title" className="section-card__title">Library</h2>
      <p className="section-card__meta" role="status">{busy ? "Updating…" : page ? `${page.total.toLocaleString()} results${groupKey ? ` in ${groupKey}` : ""}` : "Loading…"}</p></div>
      <div className="browse__views" role="group" aria-label="Library view">{(["list", "grid", "table"] as const).map(value => <button key={value} className={`btn btn--sm ${view === value ? "btn--primary" : "btn--ghost"}`} aria-pressed={view === value} onClick={() => setView(value)}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}<SavedLibraryViews state={state} disabled={!!restoreError || !!validationError} apply={apply} /></div>
    </div>
    <div className="section-card__body">
      {restoreError && <p className="alert" role="alert">{restoreError} Saved data and the link have been preserved. <button className="btn btn--quiet btn--sm" onClick={reset}>Reset filters</button></p>}
      {validationError && <p className="alert" role="alert">{validationError}</p>}
      <div className="browse__show" role="group" aria-label="Show">{SHOW.map(([label, kinds]) => {
        const on = kinds.length === types.length && kinds.every(kind => types.includes(kind));
        return <button key={label} type="button" className={`btn btn--sm ${on ? "btn--primary" : "btn--ghost"}`} aria-pressed={on} onClick={() => { setTypes(kinds); setGroupKey(""); }}>{label}</button>;
      })}</div>
      <div className="toolbar" role="search"><label className="search" htmlFor={searchId}><span className="visually-hidden">Search albums, artists and songs</span><Icon name="search" /><input id={searchId} className="input" type="search" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setGroupKey(""); }} placeholder="Search your library…" autoComplete="off" /></label>
        <label className="browse__sort">Sort <select className="select select--sm" value={sort} onChange={event => setSort(event.target.value as LibraryViewState["sort"])}>{Object.entries(columnNames).filter(([column]) => column !== "actions").map(([column, label]) => <option key={column} value={column}>{label}</option>)}</select></label>
        <button className="btn btn--ghost btn--sm" aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`} onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}>{direction === "asc" ? "↑ Ascending" : "↓ Descending"}</button>
      </div>
      <div className="browse__controls">
        <details className="browse__advanced"><summary>Advanced filters{rules.length || from || to || mode !== "contains" ? " · active" : ""}</summary>
          <div className="browse__filter-body">
            <div className="browse__filter-line"><label>Search matching <select className="select select--sm" value={mode} onChange={event => setMode(event.target.value as LibraryViewState["mode"])}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Combine search and rules <select className="select select--sm" value={logic} onChange={event => { setLogic(event.target.value as LibraryViewState["logic"]); setGroupKey(""); }}><option value="and">AND · match all</option><option value="or">OR · match any</option></select></label></div>
            <div className="browse__filter-line"><label>Year from <input className="input" type="number" min="1" max="9999" value={from} onChange={event => { setFrom(event.target.value); setGroupKey(""); }} placeholder="Any" /></label><label>Year to <input className="input" type="number" min="1" max="9999" value={to} onChange={event => { setTo(event.target.value); setGroupKey(""); }} placeholder="Any" /></label></div>
            {rules.map((rule, index) => <div className="browse__rule" key={`${ruleId}-${index}`}><select className="select select--sm" aria-label={`Rule ${index + 1} field`} value={rule.field} onChange={event => changeRule(index, { field: event.target.value as Rule["field"] })}>{Object.entries({ any: "Any field", title: "Title", artist: "Artist / credit", album_artist: "Album artist", album: "Album", genre: "Genre" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select className="select select--sm" aria-label={`Rule ${index + 1} matching`} value={rule.mode} onChange={event => changeRule(index, { mode: event.target.value as Rule["mode"] })}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input className="input" aria-label={`Rule ${index + 1} text`} maxLength={160} value={rule.value} onChange={event => changeRule(index, { value: event.target.value })} placeholder="Match text…" />
              <label><input type="checkbox" checked={rule.not} onChange={event => changeRule(index, { not: event.target.checked })} />NOT</label><button className="btn btn--quiet btn--sm" aria-label={`Remove rule ${index + 1}`} onClick={() => { setRules(current => current.filter((_, i) => i !== index)); setGroupKey(""); }}>Remove</button></div>)}
            <div className="cluster"><button className="btn btn--ghost btn--sm" disabled={rules.length >= 12} onClick={() => setRules(current => [...current, freshRule()])}>Add rule</button><button className="btn btn--quiet btn--sm" onClick={reset}>Reset filters</button></div>
            <p className="muted browse__hint">Year and types always narrow the result. Exact matches a whole field, ignoring case and accents. Wildcards match a whole field: * is any text, ? is one character. Similar spelling allows small typos. Artist credits preserve the names in your tags.</p>
          </div>
        </details>

      </div>
      <div className="browse__pivot"><label>Group by <select className="select select--sm" value={group} onChange={event => { setGroup(event.target.value as LibraryViewState["group"]); setGroupKey(""); }}>{Object.entries({ none: "None", album_artist: "Album artist", artist: "Artist / credit", album: "Album title", decade: "Decade", genre: "Genre" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {group !== "none" && <label>Explore group <select className="select select--sm" value={groupKey} onChange={event => setGroupKey(event.target.value)}><option value="">All groups ({page?.matched_total ?? "…"} results)</option>{page?.groups.map(g => <option key={g.label} value={g.label}>{g.label} · {g.count.toLocaleString()}</option>)}</select></label>}
        <FilterPlaylistDialog request={request} params={params} disabled={!actionable || !types.length} onCreated={(playlist, count) => {
          say(`Created ${playlist.name} with ${count.toLocaleString()} songs.`);
          onPlaylistsChanged?.().catch(() => say(`Created ${playlist.name}; reopen Playlists to refresh the list.`));
        }} />
      </div>
      {group !== "none" && <p className="muted browse__hint">Group counts cover every matching result{page?.group_memberships_overlap ? "; an item can belong to more than one group" : ""}. Album titles are browsing groups; separate folder releases keep their identity.</p>}
      <p className="browse__status" role="status">{message}</p>
      {error && <p className="alert" role="alert">{error} <button className="btn btn--quiet btn--sm" onClick={() => load()}>Retry</button></p>}
      <div aria-busy={busy} className={busy || error ? "browse__updating" : ""} ref={listBox}>
        {page?.total === 0 && <p className="muted">{types.length ? "No results match these filters." : "Choose Artists, Albums, Songs or Everything above."}</p>}
        {view === "table" ? <LibraryTable pieces={win.pieces} rowAt={rowAt} total={total} body={win} columns={columns} order={order} widths={widths} sort={sort} direction={direction} setColumns={setColumns} setOrder={setOrder} setWidths={setWidths} cell={cell} actions={actions} titleCell={titleCell} detail={detail} rowEvents={rowEvents} onSort={column => { setSort(column); setDirection(sort === column && direction === "asc" ? "desc" : "asc"); }} />
          : <ul ref={win.containerRef as Ref<HTMLUListElement>} onFocus={win.onFocus} onBlur={win.onBlur} className={`albums browse__results ${view === "grid" ? "browse__grid" : ""}`} aria-label={`Library results, ${total.toLocaleString()}`}>{win.pieces.map(listItem)}</ul>}
      </div>
      <p className="muted browse__hint">Tip: right-click anything in the list (or press the Menu key on it) for more. Press O on an album, song or artist to open its page.</p>
    </div>
    {menu}
  </section>;
}
