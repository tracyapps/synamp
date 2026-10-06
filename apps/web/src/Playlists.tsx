import { useEffect, useId, useState } from "react";
import { useDebounced } from "./Library";
import type { TrackSummary } from "./Library";
import Describe, { ResultView } from "./Describe";
import type { Evaluation } from "./Describe";
import { newId } from "./ids";
import type { Request } from "./api";
import Icon from "./ui/Icon";
import type { IconName } from "./ui/Icon";
import { EmptyState, ScreenHead } from "./ui/kit";
import "./styles/playlists.css";

export type Track = { id: string; title: string; artist?: string };
export type PlaylistNode = {
  id: string;
  name: string;
  parentId: string | null;
  type: "folder" | "playlist" | "rollup" | "smart";
  prompt?: string;
  plan?: { constraints: Array<{ id: string; source_phrase: string }> };
  tracks?: Track[];
  sourceId?: string;
  mode?: "merge" | "shuffle" | "interleave";
};
type Kind = Exclude<PlaylistNode["type"], "smart">;

const TYPE_ICON: Record<PlaylistNode["type"], IconName> = { folder: "folder", playlist: "note", rollup: "rollup", smart: "smart" };
const TYPE_NAME: Record<PlaylistNode["type"], string> = { folder: "Folder", playlist: "Playlist", rollup: "Roll-up", smart: "Smart playlist" };

function tree(nodes: PlaylistNode[], parentId: string | null, depth = 0): Array<{ node: PlaylistNode; depth: number }> {
  return nodes.filter((node) => node.parentId === parentId).flatMap((node) => [
    { node, depth },
    ...tree(nodes, node.id, depth + 1),
  ]);
}

/** The Playlists screen: describe a playlist, and the folders/playlists/roll-ups workshop. */
export default function Playlists({ request, nodes, loading, refreshNodes, play, headingId }: {
  request: Request;
  nodes: PlaylistNode[];
  loading: boolean;
  refreshNodes: () => Promise<PlaylistNode[]>;
  play: (body: Record<string, unknown>) => Promise<void>;
  headingId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Track[]>([]);
  const [explain, setExplain] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("playlist");
  const [parentId, setParentId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [mode, setMode] = useState<"merge" | "shuffle" | "interleave">("merge");
  const selected = nodes.find((node) => node.id === selectedId);
  const api = <T,>(path: string, options: RequestInit = {}) => request<T>(`/playlists${path}`, options);

  async function onSelect(id: string, list = nodes) {
    setSelectedId(id);
    setError("");
    setExplain(null);
    try {
      if (list.find((node) => node.id === id)?.type === "smart") {
        const result = await api<{ result: Evaluation }>(`/${id}/explain`);
        setExplain(result.result);
        setResolved([]);
      } else {
        const result = await api<{ tracks: Track[] }>(`/${id}/resolve`);
        setResolved(result.tracks);
      }
    } catch (cause) { setError((cause as Error).message); }
  }

  async function refresh(selectId: string | null = selectedId) {
    const list = await refreshNodes();
    if (selectId) await onSelect(selectId, list);
    else setResolved([]);
  }

  async function onSmartSaved(id: string) {
    const list = await refreshNodes();
    await onSelect(id, list);
    document.getElementById("playlist-detail")?.focus();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const payload = { type: kind, name, parentId: parentId || null, ...(kind === "rollup" ? { sourceId, mode } : {}) };
      const result = await api<{ node: PlaylistNode }>("", { method: "POST", body: JSON.stringify(payload) });
      setName("");
      await refresh(result.node.id);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function addTrack(track: TrackSummary) {
    if (!selected) return;
    setError("");
    try {
      await api(`/${selected.id}/tracks`, { method: "POST", body: JSON.stringify({ id: track.id, title: track.title, artist: track.artist }) });
      await refresh(selected.id);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function removeTrack(index: number) {
    if (!selected) return;
    try {
      await api(`/${selected.id}/tracks/${index}`, { method: "DELETE" });
      await refresh(selected.id);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function removeNode() {
    if (!selected || !confirm(`Delete “${selected.name}”?`)) return;
    try {
      await api(`/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      await refresh(null);
    } catch (cause) { setError((cause as Error).message); }
  }

  const playSelected = (shuffle = false) => selected && play({ playlist_id: selected.id, ...(shuffle ? { shuffle: true } : {}) })
    .catch((cause) => setError((cause as Error).message));

  return (
    <div className="screen">
      <ScreenHead id={headingId} eyebrow="Listen" title="Playlists">
        <p>Describe a playlist in your own words, or build them by hand: folders, playlists, and roll-ups that combine a whole folder into one live list.</p>
      </ScreenHead>
      <Describe request={request} onSaved={(id) => { onSmartSaved(id).catch((cause) => setError(cause.message)); }} />
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="workshop">
        <section className="section-card workshop__tree" aria-labelledby="collection-title">
          <div className="section-card__head"><h2 id="collection-title" className="section-card__title">Collection</h2><p className="section-card__meta">{nodes.length} {nodes.length === 1 ? "item" : "items"}</p></div>
          <div className="section-card__body">
            {loading ? <p className="muted">Loading…</p> : nodes.length === 0 ? <p className="muted">No playlists yet. Start below.</p> :
              <ul className="tree" aria-label="Folders and playlists">{tree(nodes, null).map(({ node, depth }) =>
                <li key={node.id}>
                  <button type="button" className="tree__item" aria-current={selectedId === node.id ? "true" : undefined}
                    style={{ paddingLeft: 12 + depth * 18 }} onClick={() => onSelect(node.id)}>
                    <Icon name={TYPE_ICON[node.type]} className="tree__icon" /><span>{node.name}</span>
                    <span className="visually-hidden">, {TYPE_NAME[node.type]}</span>
                  </button>
                </li>)}</ul>}
            <form className="create-form" onSubmit={create}><h3>Create</h3>
              <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="e.g. Afternoon focus" /></label>
              <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option value="playlist">Playlist</option><option value="folder">Folder</option><option value="rollup">Roll-up</option></select></label>
              <label>Inside folder<select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Collection (top level)</option>{nodes.filter((node) => node.type === "folder").map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
              {kind === "rollup" && <><label>Source<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="">Choose a source</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="merge">Merge in order</option><option value="shuffle">Shuffle</option><option value="interleave">Interleave playlists</option></select></label></>}
              <button className="btn btn--primary btn--block">Create {kind === "rollup" ? "roll-up" : kind}</button></form>
          </div>
        </section>
        <section className="section-card workshop__detail" id="playlist-detail" tabIndex={-1} aria-label={selected ? selected.name : "Playlist detail"}>
          {selected ? <>
            <div className="section-card__head">
              <div><p className="eyebrow">{TYPE_NAME[selected.type]}</p><h2 className="section-card__title workshop__name">{selected.name}</h2></div>
              <div className="cluster">
                <button type="button" className="btn btn--primary" onClick={() => playSelected()}><Icon name="play" />Play</button>
                <button type="button" className="btn btn--ghost" onClick={() => playSelected(true)}><Icon name="shuffle" />{selected.type === "folder" ? "Shuffle everything inside" : "Shuffle"}</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={removeNode}>Delete</button>
              </div>
            </div>
            <div className="section-card__body">
              {selected.type === "rollup" && <p className="muted">{selected.mode === "merge" ? "Merged in order" : selected.mode === "shuffle" ? "Shuffled" : "Interleaved"} · from {nodes.find((node) => node.id === selected.sourceId)?.name ?? "a missing source"}</p>}
              {selected.type === "playlist" && <SongPicker request={request} onPick={addTrack} />}
              {selected.type === "folder" && <p className="muted">Play runs every playlist inside, in order; Shuffle mixes them all together, folders inside folders included. To keep a mix like that, make a roll-up of this folder.</p>}
              {selected.type === "smart" && <>
                {selected.prompt && <p className="muted">From “{selected.prompt}” — membership is recomputed every time you open it.</p>}
                {explain ? <ResultView result={explain} labels={Object.fromEntries((selected.plan?.constraints ?? []).map((item) => [item.id, item.source_phrase]))}
                  onRestore={(trackId) => {
                    request("/feedback", { method: "POST", body: JSON.stringify({ event_id: newId(), signal: "restore", track_id: trackId, scope: "playlist", playlist_id: selected.id }) })
                      .then(() => onSelect(selected.id)).catch((cause) => setError((cause as Error).message));
                  }} /> : <p className="muted">Loading…</p>}
              </>}
              {selected.type !== "smart" && <div className="results"><div className="between"><h3>Tracks</h3><span className="mono muted">{resolved.length} {resolved.length === 1 ? "track" : "tracks"}</span></div>
                {resolved.length === 0 ? <p className="muted">Nothing here yet.</p> : <ol>{resolved.slice(0, 200).map((track, index) => <li key={`${index}-${track.id}`}><span className="track-number">{String(index + 1).padStart(2, "0")}</span><span className="track-title">{track.title}<small>{track.artist || track.id}</small></span>{selected.type === "playlist" && <button type="button" className="btn btn--quiet btn--sm" onClick={() => removeTrack(index)}>Remove<span className="visually-hidden"> {track.title}</span></button>}</li>)}</ol>}
                {resolved.length > 200 && <p className="muted">Showing the first 200 tracks.</p>}</div>}
            </div>
          </> : <EmptyState icon="playlists" title="Select a playlist">Create a playlist to collect tracks, or a folder to group them. Roll-ups turn a whole folder into one live list.</EmptyState>}
        </section>
      </div>
    </div>
  );
}

/** Find songs in the library and add them to the selected playlist. */
function SongPicker({ request, onPick }: { request: Request; onPick: (track: TrackSummary) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ total: number; tracks: TrackSummary[] } | null>(null);
  const [said, setSaid] = useState("");
  const q = useDebounced(query.trim());
  const id = useId();
  useEffect(() => {
    if (!q) { setFound(null); return; }
    request<{ total: number; tracks: TrackSummary[] }>(`/library/search?q=${encodeURIComponent(q)}&limit=8`).then(setFound).catch((cause) => setSaid((cause as Error).message));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="track-form">
      <h3>Add songs</h3>
      <div className="search" style={{ marginTop: 10 }}>
        <Icon name="search" />
        <input id={id} className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your library by song, artist or album" aria-label="Search your library for songs to add" autoComplete="off" />
      </div>
      {found && (found.total === 0 ? <p className="muted">No songs match “{q}”.</p> : (
        <ol className="picker">
          {found.tracks.map((track) => (
            <li key={track.id}>
              <span className="track-title">{track.title}<small>{[track.artist, track.album].filter(Boolean).join(" · ")}</small></span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPick(track).then(() => setSaid(`Added “${track.title}”.`))}>
                <Icon name="plus" size={16} />Add<span className="visually-hidden"> {track.title}</span></button>
            </li>
          ))}
        </ol>
      ))}
      <p className="muted picker__status" role="status">{said}</p>
    </div>
  );
}
