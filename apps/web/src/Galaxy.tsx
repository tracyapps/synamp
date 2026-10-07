import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import { AddToPlaylist, clock, useDebounced } from "./LibraryParts";
import type { TrackSummary } from "./LibraryParts";
import "./styles/galaxy.css";

type Planet = { key: string; name: string; tracks: number; albums: number; parsed_credit: boolean; raw_credits: string[] };
type Album = { key: string; title: string; artist: string; year?: number; tracks: number; total_tracks: number; matching_tracks: TrackSummary[] };
type Details = { artist: Planet; albums: Album[]; loose_tracks: TrackSummary[]; truncated: boolean };
type Point = { x: number; y: number };
type View = Point & { k: number };
type Presentation = { version: 1; pins: Record<string, Point>; view: View; sort: "alpha" | "count" };
const STORAGE = "synamp.galaxy.presentation.v1";
const INITIAL: View = { x: 0, y: 0, k: 1 };
const PAGE = 24;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function loadPresentation(): Presentation {
  const fallback: Presentation = { version: 1, pins: {}, view: INITIAL, sort: "alpha" };
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
    if (value?.version !== 1) return fallback;
    const pins: Record<string, Point> = {};
    if (value.pins && typeof value.pins === "object") for (const [key, position] of Object.entries(value.pins).slice(-200)) {
      const point = position as Point;
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) pins[key] = { x: clamp(point.x, -10000, 10000), y: clamp(point.y, -10000, 10000) };
    }
    const view = value.view && Number.isFinite(value.view.x) && Number.isFinite(value.view.y) && Number.isFinite(value.view.k)
      ? { x: clamp(value.view.x, -10000, 10000), y: clamp(value.view.y, -10000, 10000), k: clamp(value.view.k, .3, 3) } : INITIAL;
    return { version: 1, pins, view, sort: value.sort === "count" ? "count" : "alpha" };
  } catch { return fallback; }
}

/** A bounded window onto the real artist pool. The search and random draw query the full pool. */
export default function Galaxy({ request, play, playlists }: { request: Request; play: (body: Record<string, unknown>) => Promise<void>; playlists: PlaylistNode[] }) {
  const [saved] = useState(loadPresentation);
  const [query, setQuery] = useState(""); const q = useDebounced(query);
  const [sort, setSort] = useState<"alpha" | "count">(saved.sort);
  const [offset, setOffset] = useState(0);
  const [nodes, setNodes] = useState<Planet[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [message, say] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null); const [details, setDetails] = useState<Details | null>(null);
  const [profileLoading, setProfileLoading] = useState(false); const [randomBusy, setRandomBusy] = useState(false);
  const [extra, setExtra] = useState<Planet | null>(null); const [openAlbum, setOpenAlbum] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, Point>>(saved.pins); const [view, setView] = useState<View>(saved.view);
  const svg = useRef<SVGSVGElement>(null); const suppressClick = useRef(false);
  const mapArea = useRef<HTMLDivElement>(null); const [mapWidth, setMapWidth] = useState(1000);
  const randomTicket = useRef(0);
  const gesture = useRef<{ pointer: number; key: string | null; start: Point; position: Point; view: View; moved: boolean } | null>(null);
  const shown = extra && !nodes.some(node => node.key === extra.key) ? [extra, ...nodes].slice(0, PAGE) : nodes;
  const maximum = Math.max(1, ...shown.map(node => node.tracks));
  const worldWidth = mapWidth < 500 ? 360 : mapWidth < 750 ? 600 : 1000;
  const worldHeight = mapWidth < 500 ? 480 : 700;
  const columns = mapWidth < 500 ? 2 : mapWidth < 750 ? 3 : 6;

  useEffect(() => {
    const element = mapArea.current; if (!element) return;
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) setMapWidth(width); });
    observer.observe(element); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true; const controller = new AbortController(); setLoading(true); say("");
    request<{ total: number; nodes: Planet[] }>(`/library/galaxy?${new URLSearchParams({ q, sort, offset: String(offset), limit: String(PAGE) })}`, { signal: controller.signal })
      .then(result => { if (active) { setNodes(result.nodes); setTotal(result.total); } })
      .catch(cause => { if (active) { setNodes([]); setTotal(0); say((cause as Error).message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [request, q, sort, offset]);

  useEffect(() => {
    if (!selectedKey) { setDetails(null); setProfileLoading(false); return; }
    let active = true; const controller = new AbortController(); setDetails(null); setProfileLoading(true); setOpenAlbum(null);
    request<Details>(`/library/galaxy/artist?key=${encodeURIComponent(selectedKey)}`, { signal: controller.signal })
      .then(result => { if (active) setDetails(result); })
      .catch(cause => { if (active) say((cause as Error).message); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [request, selectedKey]);

  useEffect(() => {
    const limitedPins = Object.fromEntries(Object.entries(pins).slice(-200));
    try { localStorage.setItem(STORAGE, JSON.stringify({ version: 1, pins: limitedPins, view, sort })); } catch { /* Browsing stays usable when storage is blocked/full. */ }
  }, [pins, view, sort]);
  useEffect(() => () => { randomTicket.current++; }, []);

  const position = (node: Planet, index: number): Point => pins[node.key] ?? { x: worldWidth / columns * ((index % columns) + .5), y: (mapWidth < 500 ? 80 : 100) + Math.floor(index / columns) * (mapWidth < 500 ? 150 : 160) };
  const svgPoint = (clientX: number, clientY: number): Point => {
    const element = svg.current; const matrix = element?.getScreenCTM();
    if (!element || !matrix) return { x: clientX, y: clientY };
    const point = element.createSVGPoint(); point.x = clientX; point.y = clientY; return point.matrixTransform(matrix.inverse());
  };
  const beginGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gesture.current) return;
    const key = (event.target as Element).closest("[data-artist-key]")?.getAttribute("data-artist-key") ?? null;
    const index = shown.findIndex(node => node.key === key);
    gesture.current = { pointer: event.pointerId, key, start: svgPoint(event.clientX, event.clientY),
      position: index >= 0 ? position(shown[index]!, index) : { x: 0, y: 0 }, view, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current; if (!current || current.pointer !== event.pointerId) return;
    const point = svgPoint(event.clientX, event.clientY); const dx = point.x - current.start.x; const dy = point.y - current.start.y;
    if (Math.abs(dx) + Math.abs(dy) < 5 && !current.moved) return;
    current.moved = true;
    if (current.key) setPins(previous => ({ ...previous, [current.key!]: { x: current.position.x + dx / current.view.k, y: current.position.y + dy / current.view.k } }));
    else setView({ ...current.view, x: current.view.x + dx, y: current.view.y + dy });
  };
  const endGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    suppressClick.current = !!gesture.current.moved;
    if (!gesture.current.moved && gesture.current.key) setSelectedKey(gesture.current.key);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setTimeout(() => { suppressClick.current = false; }, 0);
  };
  const zoom = (factor: number) => setView(current => {
    const k = clamp(current.k * factor, .3, 3);
    return { k, x: worldWidth / 2 - (worldWidth / 2 - current.x) * k / current.k, y: worldHeight / 2 - (worldHeight / 2 - current.y) * k / current.k };
  });
  const changeSearch = (value: string) => {
    randomTicket.current++; setRandomBusy(false); setQuery(value); setOffset(0); setExtra(null); setSelectedKey(null); setView(INITIAL);
  };
  const random = async () => {
    const ticket = ++randomTicket.current; setRandomBusy(true);
    try {
      const result = await request<{ total: number; node: Planet | null }>(`/library/galaxy/random?q=${encodeURIComponent(q)}`);
      if (ticket !== randomTicket.current) return;
      if (!result.node) { say("No artists match this search."); return; }
      setExtra(result.node); setSelectedKey(result.node.key); setView(INITIAL);
      setPins(previous => { const next = { ...previous }; delete next[result.node!.key]; return next; });
      say(`Jumped to ${result.node.name}, chosen from all ${result.total.toLocaleString()} matching artists.`);
    } catch (cause) { if (ticket === randomTicket.current) say((cause as Error).message); }
    finally { if (ticket === randomTicket.current) setRandomBusy(false); }
  };
  const start = (ids: string[], what: string) => play({ track_ids: ids }).then(() => say(`Playing ${what}.`)).catch(cause => say((cause as Error).message));
  const songList = (tracks: TrackSummary[]) => <ol className="galaxy__tracks">{tracks.map(track => <li key={track.id}>
    <button className="galaxy__song" onClick={() => start([track.id], track.title)} aria-label={`Play ${track.title}`}><span>{track.title}<small>{track.artist}</small></span><span className="mono">{clock(track.duration_s)}</span></button>
    <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={say} />
  </li>)}</ol>;

  return <section className="section-card galaxy" aria-labelledby="galaxy-title">
    <div className="section-card__head"><h2 id="galaxy-title">Your artists</h2><span className="galaxy__mode">Artists → albums → songs</span></div>
    <div className="galaxy__toolbar">
      <label className="galaxy__search"><span className="visually-hidden">Find an artist in the full library</span><input className="input" type="search" placeholder="Find an artist…" maxLength={160} value={query} onChange={event => changeSearch(event.target.value)} /></label>
      <label>Arrange <select className="select" value={sort} onChange={event => { setSort(event.target.value as "alpha" | "count"); setOffset(0); setExtra(null); setPins({}); setView(INITIAL); }}><option value="alpha">A–Z</option><option value="count">Most songs</option></select></label>
      <button className="btn btn--ghost" disabled={randomBusy || loading || query !== q || !total} onClick={random}>{randomBusy ? "Finding…" : "↗ Random artist"}</button>
    </div>
    <div className="galaxy__workspace">
      <div className="galaxy__map-area" ref={mapArea}>
        <div className="galaxy__map-controls"><span>{loading ? "Loading artists…" : `${shown.length} planets on this page · ${total.toLocaleString()} artists in this search`}</span><div>
          <button className="btn btn--quiet btn--sm" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out" disabled={view.k <= .3}>−</button><output aria-label="Zoom level">{Math.round(view.k * 100)}%</output><button className="btn btn--quiet btn--sm" onClick={() => zoom(1.25)} aria-label="Zoom in" disabled={view.k >= 3}>+</button><button className="btn btn--quiet btn--sm" onClick={() => { setView(INITIAL); setPins({}); }}>Reset</button>
        </div></div>
        <svg ref={svg} className="galaxy__canvas" viewBox={`0 0 ${worldWidth} ${worldHeight}`} role="group" aria-label="Artist planets. Drag empty space to pan, or a planet to reposition. Use zoom buttons and artist list for keyboard navigation."
          onPointerDown={beginGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}>
          <defs><radialGradient id="galaxy-planet"><stop offset="0" stopColor="#414962" /><stop offset="1" stopColor="#222b41" /></radialGradient></defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {shown.map((node, index) => {
              const point = position(node, index); const radius = 56 * Math.sqrt(node.tracks / maximum);
              const selected = selectedKey === node.key;
              return <g key={node.key} data-artist-key={node.key} transform={`translate(${point.x} ${point.y})`} className={`galaxy__planet${selected ? " is-selected" : ""}`} role="button" tabIndex={0} aria-pressed={selected}
                aria-label={`${node.name}, ${node.tracks} music files${node.parsed_credit ? ", contains parsed credit candidates" : ""}`}
                onClick={() => { if (!suppressClick.current) setSelectedKey(node.key); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(node.key); } }}>
                <title>{node.name} · {node.tracks} files · {node.albums} album folders{node.parsed_credit ? " · parsed credits: candidate" : ""}</title>
                <circle className="galaxy__target" r={Math.max(radius, 30)} fill="transparent" />
                <circle className="galaxy__orb" r={radius} fill="url(#galaxy-planet)" />
                <text className="galaxy__label" y={radius + 20} textAnchor="middle">{node.name.length > 20 ? `${node.name.slice(0, 19)}…` : node.name}</text>
                <text className="galaxy__count" y={radius + 38} textAnchor="middle">{node.tracks.toLocaleString()} files{node.parsed_credit ? " · candidate" : ""}</text>
              </g>;
            })}
          </g>
          {!loading && !shown.length && <text x={worldWidth / 2} y={worldHeight / 2} textAnchor="middle" className="galaxy__empty">No matching artists.</text>}
        </svg>
        <p className="galaxy__legend">Planet area = music file count, relative to this page. Drag to pan or reposition. Parsed credits are candidates; album folders stay separate.</p>
        <div className="galaxy__paging"><button className="btn btn--quiet btn--sm" disabled={loading || offset === 0} onClick={() => { setOffset(Math.max(0, offset - PAGE)); setExtra(null); setView(INITIAL); }}>Previous artists</button><span>Page {Math.floor(offset / PAGE) + 1} of {Math.max(1, Math.ceil(total / PAGE))}</span><button className="btn btn--quiet btn--sm" disabled={loading || offset + PAGE >= total} onClick={() => { setOffset(offset + PAGE); setExtra(null); setView(INITIAL); }}>Next artists</button></div>
        <details className="galaxy__list"><summary>Artist list — keyboard alternative</summary><ul>{shown.map(node => <li key={node.key}><button className="btn btn--quiet" aria-pressed={selectedKey === node.key} onClick={() => setSelectedKey(node.key)}>{node.name}<span>{node.tracks} files</span></button></li>)}</ul></details>
      </div>
      <aside className="galaxy__details" aria-label="Selected artist details" aria-busy={profileLoading}>
        {profileLoading ? <p className="muted">Loading artist…</p> : details ? <>
          <div className="galaxy__artist-head"><span className="galaxy__avatar" aria-hidden="true">{details.artist.name.slice(0, 1)}</span><div><h3>{details.artist.name}</h3><p>{details.artist.tracks.toLocaleString()} files · {details.artist.albums} album folders</p></div></div>
          {details.artist.parsed_credit && <details className="galaxy__credits"><summary>Parsed credits · candidate grouping</summary><p>Explicit feat/ft/featuring credits are shown under their base artist for browsing. File tags and release identities are unchanged.</p><ul>{details.artist.raw_credits.map(credit => <li key={credit}>{credit}</li>)}</ul></details>}
          {details.truncated && <p className="galaxy__limit">First 2,000 songs loaded. Counts include the whole artist; playback actions use only the songs shown.</p>}
          <h4>Albums</h4>
          {!details.albums.length && <p className="muted">No album folders for this artist.</p>}
          <ul className="galaxy__albums">{details.albums.map(album => <li key={album.key}>
            <button className="galaxy__album" aria-expanded={openAlbum === album.key} onClick={() => setOpenAlbum(openAlbum === album.key ? null : album.key)}><span className="galaxy__album-art" aria-hidden="true">♪</span><span><strong>{album.title}</strong><small>{album.year ? `${album.year} · ` : ""}{album.tracks} matching files{album.total_tracks !== album.tracks ? ` of ${album.total_tracks} in folder` : ""}</small></span><span aria-hidden="true">{openAlbum === album.key ? "−" : "+"}</span></button>
            {openAlbum === album.key && <div className="galaxy__album-songs"><p className="galaxy__folder">{album.key}</p><button className="btn btn--ghost btn--sm" disabled={!album.matching_tracks.length} onClick={() => start(album.matching_tracks.map(track => track.id), `${album.title}, ${details.artist.name} songs`)}>Play these songs</button>{album.matching_tracks.length < album.tracks && <p className="muted">{album.matching_tracks.length} of {album.tracks} matching songs loaded.</p>}{songList(album.matching_tracks)}</div>}
          </li>)}</ul>
          {!!details.loose_tracks.length && <details className="galaxy__loose"><summary>Songs outside album folders ({details.loose_tracks.length})</summary>{songList(details.loose_tracks)}</details>}
        </> : <div className="galaxy__welcome"><span aria-hidden="true">✧</span><h3>Choose a planet</h3><p>Open an artist, then an album, then a song. Or pick a random artist from your whole search.</p></div>}
      </aside>
    </div>
    <p className="galaxy__status" role="status" aria-live="polite">{message}</p>
  </section>;
}
