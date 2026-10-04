import { useEffect, useState } from "react";
import Describe, { ResultView } from "./Describe";
import type { Evaluation } from "./Describe";
import Player from "./Player";
import Listening from "./Listening";
import LibraryHealth from "./LibraryHealth";
import MissingTracks from "./MissingTracks";
import OrganiseLibrary from "./OrganiseLibrary";
import DiscographyGaps from "./DiscographyGaps";
import Settings from "./Settings";
import { newId } from "./ids";
import type { SessionView } from "./Player";

type Track = { id: string; title: string; artist?: string };
type Node = {
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

type Kind = Exclude<Node["type"], "smart">;

function tree(nodes: Node[], parentId: string | null, depth = 0): Array<{ node: Node; depth: number }> {
  return nodes.filter((node) => node.parentId === parentId).flatMap((node) => [
    { node, depth },
    ...tree(nodes, node.id, depth + 1),
  ]);
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("synamp-playlist-token") ?? "");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Track[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("playlist");
  const [parentId, setParentId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [mode, setMode] = useState<"merge" | "shuffle" | "interleave">("merge");
  const [trackId, setTrackId] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const selected = nodes.find((node) => node.id === selectedId);

  const [explain, setExplain] = useState<Evaluation | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    return call<T>(`/playlists${path}`, options);
  }

  async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    // An empty or non-JSON answer means the brain didn't answer (restarting, or the edge
    // couldn't reach it): say that, rather than a cryptic JSON parse error.
    const text = await response.text();
    let data: { error?: string } | undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    if (!response.ok) {
      if (response.status === 401) throw new Error("Enter the playlist access token.");
      throw new Error(data?.error ?? (response.status >= 500
        ? `The SynAmp server didn't answer (HTTP ${response.status}). It may be restarting — try again in a minute.`
        : `HTTP ${response.status}`));
    }
    if (data === undefined) throw new Error("The SynAmp server sent an empty answer. It may be restarting — try again in a minute.");
    return data as T;
  }

  async function refresh(selectId = selectedId) {
    const result = await api<{ nodes: Node[] }>("");
    setNodes(result.nodes);
    call<{ session: SessionView }>("/session").then((data) => setSession(data.session)).catch(() => undefined);
    if (selectId) {
      const detail = await api<{ tracks: Track[] }>(`/${selectId}/resolve`);
      setResolved(detail.tracks);
    } else setResolved([]);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(cause.message)).finally(() => setLoading(false));
    // Token changes should retry access; selection is handled by onSelect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  async function play(id: string) {
    setError("");
    try {
      const result = await call<{ session: SessionView }>("/session/queue", { method: "POST", body: JSON.stringify({ event_id: newId(), playlist_id: id }) });
      setSession(result.session);
    } catch (cause) { setError((cause as Error).message); }
  }

  /** Fetch with the access token, then hand the browser a file (an <a href> can't send the token). */
  async function download(path: string, filename: string) {
    const response = await fetch(`/api/v1${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
    const url = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /** A raw file upload (PUT), with the access token. */
  async function upload(path: string, body: Blob, headers: Record<string, string> = {}) {
    const response = await fetch(`/api/v1${path}`, {
      method: "PUT", body,
      headers: { "content-type": "application/octet-stream", ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
  }

  async function onSmartSaved(id: string) {
    const result = await api<{ nodes: Node[] }>("");
    setNodes(result.nodes);
    await onSelect(id, result.nodes);
    document.getElementById("playlist-detail")?.focus();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const payload = { type: kind, name, parentId: parentId || null, ...(kind === "rollup" ? { sourceId, mode } : {}) };
      const result = await api<{ node: Node }>("", { method: "POST", body: JSON.stringify(payload) });
      setName("");
      setSelectedId(result.node.id);
      await refresh(result.node.id);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function addTrack(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    try {
      await api(`/${selected.id}/tracks`, { method: "POST", body: JSON.stringify({ id: trackId, title, artist }) });
      setTrackId(""); setTitle(""); setArtist("");
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

  return (
    <div className="shell">
      <header className="shell__head"><span className="wordmark">SynAmp</span><span className="tagline">Playlist workshop</span></header>
      <main>
        <div className="intro"><p className="eyebrow">Phase 2 · first slice</p><h1>Build your listening day.</h1>
          <p>Make folders, fill playlists, then point a roll-up at any folder. Its tracks update whenever a source playlist changes.</p></div>
        {error && <p className="alert" role="alert">{error}</p>}
        {error.includes("access token") && <form className="token-form" onSubmit={(event) => {
          event.preventDefault();
          sessionStorage.setItem("synamp-playlist-token", token);
          refresh().then(() => setError("")).catch((cause) => setError(cause.message));
        }}><label>Playlist access token <input type="password" value={token} onChange={(event) => setToken(event.target.value)} /></label><button>Connect</button></form>}
        <LibraryHealth request={call} />
        <Describe request={call} onSaved={(id) => { onSmartSaved(id).catch((cause) => setError(cause.message)); }} />
        <div className="workspace">
          <aside className="panel sidebar"><div className="panel__head"><h2>Collection</h2><span>{nodes.length} nodes</span></div>
            {loading ? <p className="muted">Loading…</p> : nodes.length === 0 ? <p className="muted">No playlists yet. Start below.</p> :
              <div className="tree">{tree(nodes, null).map(({ node, depth }) =>
                <button key={node.id} className={`tree__item ${selectedId === node.id ? "is-selected" : ""}`} style={{ paddingLeft: 14 + depth * 18 }} onClick={() => onSelect(node.id)}>
                  <span className="tree__icon">{node.type === "folder" ? "▸" : node.type === "rollup" ? "◇" : node.type === "smart" ? "✦" : "♫"}</span><span>{node.name}</span>
                </button>)}</div>}
            <form className="create-form" onSubmit={create}><h3>Create</h3>
              <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="e.g. Afternoon focus" /></label>
              <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option value="playlist">Playlist</option><option value="folder">Folder</option><option value="rollup">Roll-up</option></select></label>
              <label>Inside folder<select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Collection root</option>{nodes.filter((node) => node.type === "folder").map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
              {kind === "rollup" && <><label>Source<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="">Choose a source</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="merge">Merge in order</option><option value="shuffle">Shuffle</option><option value="interleave">Interleave playlists</option></select></label></>}
              <button className="primary">Create {kind}</button></form>
          </aside>
          <section className="panel detail" id="playlist-detail" tabIndex={-1} aria-label="Playlist detail">{selected ? <><div className="panel__head"><div><p className="eyebrow">{selected.type}</p><h2>{selected.name}</h2></div><div className="detail-actions"><button className="primary" onClick={() => play(selected.id)}>▶ Play</button><button className="quiet" onClick={removeNode}>Delete</button></div></div>
            {selected.type === "rollup" && <p className="muted">{selected.mode} · source: {nodes.find((node) => node.id === selected.sourceId)?.name ?? "Unknown"}</p>}
            {selected.type === "playlist" && <form className="track-form" onSubmit={addTrack}><h3>Add a track</h3><p className="muted">Use any unique ID to test playlist logic. Real playback will need a Subsonic song ID; library search is coming next.</p>
              <div className="track-fields"><label>Track ID<input value={trackId} onChange={(event) => setTrackId(event.target.value)} required /></label><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Artist<input value={artist} onChange={(event) => setArtist(event.target.value)} /></label><button className="primary">Add</button></div></form>}
            {selected.type === "folder" && <p className="muted">Create lists inside this folder, or use it as a roll-up source.</p>}
            {selected.type === "smart" && <>
              {selected.prompt && <p className="muted">From “{selected.prompt}” — membership is recomputed every time you open it.</p>}
              {explain ? <ResultView result={explain} labels={Object.fromEntries((selected.plan?.constraints ?? []).map((item) => [item.id, item.source_phrase]))}
                onRestore={(trackId) => {
                  call("/feedback", { method: "POST", body: JSON.stringify({ event_id: newId(), signal: "restore", track_id: trackId, scope: "playlist", playlist_id: selected.id }) })
                    .then(() => onSelect(selected.id)).catch((cause) => setError((cause as Error).message));
                }} /> : <p className="muted">Loading…</p>}
            </>}
            {selected.type !== "smart" && <div className="results"><div className="panel__head"><h3>Resolved tracks</h3><span>{resolved.length} tracks</span></div>
              {resolved.length === 0 ? <p className="muted">Nothing here yet.</p> : <ol>{resolved.slice(0, 200).map((track, index) => <li key={`${index}-${track.id}`}><span className="track-number">{index + 1}</span><span className="track-title">{track.title}<small>{track.artist || track.id}</small></span>{selected.type === "playlist" && <button className="quiet" onClick={() => removeTrack(index)}>Remove</button>}</li>)}</ol>}
              {resolved.length > 200 && <p className="muted">Showing the first 200 tracks.</p>}</div>}
          </> : <div className="empty"><span>♫</span><h2>Select a playlist</h2><p>Create a playlist to collect tracks, or a folder to group them. Roll-ups turn a whole branch into one live list.</p></div>}</section>
        </div>
        <MissingTracks request={call} download={download} />
        <OrganiseLibrary request={call} upload={upload} />
        <DiscographyGaps request={call} />
        <Listening request={call} />
        <Settings request={call} />
        <Player request={call} session={session} onSession={setSession}
          playlistName={(id) => nodes.find((node) => node.id === id)?.name}
          onChanged={() => { if (selectedId) onSelect(selectedId).catch(() => undefined); }} />
      </main>
    </div>
  );
}
