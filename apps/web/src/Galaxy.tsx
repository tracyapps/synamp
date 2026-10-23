import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import { useDebounced } from "./LibraryParts";
import { GalaxyEngine } from "./galaxy/engine";
import ArtistCard from "./galaxy/ArtistCard";
import type { Collaborator } from "./galaxy/ArtistCard";
import { groupOf, groupSort } from "./galaxy/layouts";
import type { GroupLike } from "./galaxy/layouts";
import { PALETTES } from "./galaxy/palettes";
import type { GalaxyColorBy, GalaxyGrouping, GalaxyMap, GalaxyMapNode, GalaxyView, ThemeId } from "./galaxy/types";
import { COLORBY_LABELS, GROUPING_LABELS, VIEW_LABELS } from "./galaxy/types";
import "./styles/galaxy.css";

type Preferences = { view: GalaxyView; grouping: GalaxyGrouping; theme: ThemeId; colorBy: GalaxyColorBy };
const STORAGE = "synamp.galaxy.explorer.v1";
const DEFAULTS: Preferences = { view: "cluster", grouping: "genre", theme: "nebula", colorBy: "group" };
const LIST_CAP = 400;

function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
    if (!value) return DEFAULTS;
    return {
      view: value.view in VIEW_LABELS ? value.view : DEFAULTS.view,
      grouping: value.grouping in GROUPING_LABELS ? value.grouping : DEFAULTS.grouping,
      theme: value.theme in PALETTES ? value.theme : DEFAULTS.theme,
      colorBy: value.colorBy in COLORBY_LABELS ? value.colorBy : DEFAULTS.colorBy,
    };
  } catch { return DEFAULTS; }
}

/** Same group colours the engine paints, computed here for the legend chips. */
function legendEntries(map: GalaxyMap, grouping: GalaxyGrouping, theme: ThemeId): { label: string; color: string; count: number }[] {
  const palette = PALETTES[theme];
  const buckets = new Map<string, number>();
  for (const artist of map.artists) {
    if (artist.guest) continue;
    const label = groupOf(artist, grouping);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  const groups: GroupLike[] = [...buckets.entries()].map(([id, count]) => ({ id, label: id, count, tracks: 0 }));
  return groups.sort(groupSort(grouping)).map((group, index) => ({ label: group.label, count: group.count, color: palette.groups[index % palette.groups.length]! }));
}

export default function Galaxy({ request, play, playlists }: { request: Request; play: (body: Record<string, unknown>) => Promise<void>; playlists: PlaylistNode[] }) {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [map, setMap] = useState<GalaxyMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, say] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [randomBusy, setRandomBusy] = useState(false);
  const [query, setQuery] = useState(""); const q = useDebounced(query);
  const [listOpen, setListOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GalaxyEngine | null>(null);
  const { view, grouping, theme, colorBy } = prefs;

  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch { /* this visit only */ }
  }, [prefs]);

  useEffect(() => {
    let active = true; const controller = new AbortController(); setLoading(true); say("");
    request<GalaxyMap>("/library/galaxy/map", { signal: controller.signal })
      .then(result => { if (active) setMap(result); })
      .catch(cause => { if (active) say((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [request]);

  // The engine is created once the canvas exists, fed the map when it lands,
  // and told about every setting change from then on.
  useEffect(() => {
    if (!canvas.current) return;
    let created: GalaxyEngine;
    try {
      created = new GalaxyEngine(canvas.current, { select: key => { setSelectedKey(key); }, status: text => { say(text); } });
    } catch (cause) {
      say((cause as Error).message);
      return;
    }
    engine.current = created;
    return () => { created.destroy(); engine.current = null; };
  }, []);

  useEffect(() => { if (map && engine.current) engine.current.setData(map); }, [map]);
  useEffect(() => { engine.current?.setView(view); }, [view]);
  useEffect(() => { engine.current?.setGrouping(grouping); }, [grouping]);
  useEffect(() => { engine.current?.setTheme(theme); }, [theme]);
  useEffect(() => { engine.current?.setColorBy(colorBy); }, [colorBy]);
  useEffect(() => { engine.current?.setSearch(q); }, [q]);
  useEffect(() => { engine.current?.setSelected(selectedKey); }, [selectedKey]);

  const byKey = useMemo(() => new Map((map?.artists ?? []).map(artist => [artist.key, artist])), [map]);
  const selected = selectedKey ? byKey.get(selectedKey) ?? null : null;
  const collaborators = useMemo<Collaborator[]>(() => {
    if (!map || !selectedKey) return [];
    const partners: Collaborator[] = [];
    for (const edge of map.edges) {
      if (edge.a === selectedKey) partners.push({ key: edge.b, name: byKey.get(edge.b)?.name ?? "?", tracks: edge.tracks, guest: !!byKey.get(edge.b)?.guest });
      else if (edge.b === selectedKey) partners.push({ key: edge.a, name: byKey.get(edge.a)?.name ?? "?", tracks: edge.tracks, guest: !!byKey.get(edge.a)?.guest });
    }
    return partners.sort((a, b) => b.tracks - a.tracks || a.name.localeCompare(b.name));
  }, [map, selectedKey, byKey]);

  const matches = useMemo(() => {
    if (!map || !q.trim()) return null;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const found = map.artists.filter(artist => {
      const haystack = `${artist.name} ${artist.genres.join(" ")}`.toLowerCase();
      return words.every(word => haystack.includes(word));
    });
    return { total: found.length, first: found[0] ?? null };
  }, [map, q]);

  const jump = useCallback((key: string) => {
    engine.current?.focus(key);
    setSelectedKey(key);
  }, []);

  const random = async () => {
    setRandomBusy(true);
    try {
      // In the Web view the trip should land on the connected map, not outside it.
      if (view === "web") {
        const pick = engine.current?.randomActive();
        if (pick) { jump(pick.key); say(`Jumped to ${pick.name} among the connected artists.`); }
        else say("No connected artists to draw from yet.");
        return;
      }
      const result = await request<{ total: number; node: { key: string; name: string } | null }>("/library/galaxy/random");
      if (!result.node) { say("No artists to draw from."); return; }
      jump(result.node.key);
      say(`Jumped to ${result.node.name}, chosen from all ${result.total.toLocaleString()} artists.`);
    } catch (cause) { say((cause as Error).message); }
    finally { setRandomBusy(false); }
  };

  const legend = useMemo(() => map ? legendEntries(map, grouping, theme) : [], [map, grouping, theme]);
  const stats = map
    ? `${map.artists.length.toLocaleString()} artists · ${map.total_tracks.toLocaleString()} songs${map.edges.length ? ` · ${map.edges.length.toLocaleString()} collaboration links` : ""}`
    : "";

  const artists: GalaxyMapNode[] = useMemo(() => (map?.artists ?? []).slice(0, LIST_CAP), [map]);

  return <section className="galaxy" aria-labelledby="galaxy-title">
    <h2 id="galaxy-title" className="visually-hidden">Galaxy — explore your library</h2>
    <div className="galaxy__toolbar">
      <label className="galaxy__search">
        <span className="visually-hidden">Dim everything except matching artists</span>
        <input className="input" type="search" placeholder="Dim everything except…" maxLength={160} value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && matches?.first) { event.preventDefault(); jump(matches.first.key); } }} />
      </label>
      {matches && <span className="galaxy__matches">{matches.total === 0 ? "No matches" : `${matches.total.toLocaleString()} match${matches.total === 1 ? "" : "es"}`}{matches.first ? " · Enter travels" : ""}</span>}
      <div className="galaxy__seg" role="group" aria-label="View">
        {(Object.keys(VIEW_LABELS) as GalaxyView[]).map(id => (
          <button key={id} className={`galaxy__seg-btn${view === id ? " is-on" : ""}`} aria-pressed={view === id}
            onClick={() => setPrefs(current => ({ ...current, view: id }))}>{VIEW_LABELS[id]}</button>
        ))}
      </div>
      <label><span className="galaxy__arrange-label">Group</span>
        <select className="select" aria-label="Group artists by" value={grouping} onChange={event => setPrefs(current => ({ ...current, grouping: event.target.value as GalaxyGrouping }))}>
          {(Object.keys(GROUPING_LABELS) as GalaxyGrouping[]).map(id => <option key={id} value={id}>{GROUPING_LABELS[id]}</option>)}
        </select></label>
      <label><span className="galaxy__arrange-label">Colour</span>
        <select className="select" aria-label="Colour artists by" value={colorBy} onChange={event => setPrefs(current => ({ ...current, colorBy: event.target.value as GalaxyColorBy }))}>
          {(Object.keys(COLORBY_LABELS) as GalaxyColorBy[]).map(id => <option key={id} value={id}>{COLORBY_LABELS[id]}</option>)}
        </select></label>
      <label><span className="galaxy__arrange-label">Theme</span>
        <select className="select" aria-label="Colour theme" value={theme} onChange={event => setPrefs(current => ({ ...current, theme: event.target.value as ThemeId }))}>
          {Object.values(PALETTES).map(palette => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
        </select></label>
      <button className="btn btn--ghost galaxy__random" disabled={randomBusy || loading || !map} onClick={random}>
        <span aria-hidden="true">↗</span><span className="galaxy__random-label">{randomBusy ? "Finding…" : "Surprise me"}</span>
      </button>
      <button className="btn btn--quiet" onClick={() => engine.current?.reflow()} title="Return dragged artists to their groups">Re-form</button>
    </div>

    <div className="galaxy__stage">
      <canvas ref={canvas} className="galaxy__canvas" tabIndex={0} role="img"
        aria-label={loading ? "Loading your library." : map
          ? `${VIEW_LABELS[view]} view of ${map.artists.length.toLocaleString()} artists, grouped by ${GROUPING_LABELS[grouping].toLowerCase()}. Drag empty space to pan, drag an artist to move it, wheel or pinch to zoom, click an artist to open its card. Double-click empty space to zoom back out. The artist list below the scene offers full keyboard navigation.`
          : "Your library could not load."}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const pan: Record<string, [number, number]> = { ArrowLeft: [64, 0], ArrowRight: [-64, 0], ArrowUp: [0, 64], ArrowDown: [0, -64] };
          if (pan[event.key]) { event.preventDefault(); const [dx, dy] = pan[event.key]!; engine.current?.panBy(dx, dy); }
          else if (event.key === "+" || event.key === "=") { event.preventDefault(); engine.current?.zoomBy(1.3); }
          else if (event.key === "-") { event.preventDefault(); engine.current?.zoomBy(1 / 1.3); }
          else if (event.key === "0") { event.preventDefault(); engine.current?.fitView(); }
          else if (event.key === "Escape") setSelectedKey(null);
        }} />
      <div className="galaxy__stats"><span>{loading ? "Loading your library…" : stats}</span></div>
      <div className="galaxy__zoom">
        <button className="btn btn--quiet btn--sm" aria-label="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.3)}>−</button>
        <button className="btn btn--quiet btn--sm" aria-label="Zoom in" onClick={() => engine.current?.zoomBy(1.3)}>+</button>
        <button className="btn btn--quiet btn--sm" aria-label="Fit everything in view" onClick={() => engine.current?.fitView()}>⤢</button>
      </div>
      {!!legend.length && colorBy === "group" && <div className="galaxy__legend" aria-label="Group colours">
        {legend.slice(0, 9).map(entry => <span key={entry.label} className="galaxy__legend-chip"><i style={{ background: entry.color }} />{entry.label}<em>{entry.count}</em></span>)}
        {legend.length > 9 && <span className="galaxy__legend-chip galaxy__legend-more">+{legend.length - 9} more</span>}
      </div>}
      {!!legend.length && colorBy === "decade" && <div className="galaxy__legend"><span className="galaxy__legend-chip">Colour runs old → new across your eras</span></div>}
      {(colorBy === "mood" || colorBy === "energy") && <div className="galaxy__legend"><span className="galaxy__legend-chip">Colour runs low → high {colorBy === "mood" ? "mood" : "energy"} · grey means not measured</span></div>}
      <ArtistCard request={request} play={play} playlists={playlists} node={selected} collaborators={collaborators}
        onJump={jump} onClose={() => { setSelectedKey(null); canvas.current?.focus(); }} onSay={say} />
      <details className="galaxy__list" open={listOpen && !selected} onToggle={event => setListOpen(event.currentTarget.open)}>
        <summary>Artist list — keyboard alternative</summary>
        <ul>{artists.map(artist => <li key={artist.key}>
          <button className="btn btn--quiet" onClick={() => jump(artist.key)}>
            {artist.name}<span>{artist.tracks.toLocaleString()} songs{artist.guest ? " · guest" : ""}</span>
          </button>
        </li>)}</ul>
        {map && map.artists.length > LIST_CAP && <p className="galaxy__list-more">First {LIST_CAP} of {map.artists.length.toLocaleString()} artists, most songs first.</p>}
      </details>
    </div>
    <p className="galaxy__status" role="status" aria-live="polite">{message}</p>
  </section>;
}
