import { useEffect, useRef, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
type Preview = { selection_id: string; track_count: number; expires_at: number; sample: { id: string; title: string; artist?: string; album?: string }[] };
export default function FilterPlaylistDialog({ request, params, disabled, onCreated }: { request: Request; params: string; disabled: boolean; onCreated: (playlist: PlaylistNode, count: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("Library selection");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedParams = useRef("");
  const ticket = useRef(0);
  const mounted = useRef(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ticket.current++; }; }, []);
  useEffect(() => { if (!open) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [open]);
  useEffect(() => {
    if (open && selectedParams.current !== params && !saving) { ticket.current++; setPreview(null); setBusy(false); setError("The filters changed. Press “Count again” to see what the playlist would hold now."); }
  }, [params, open, saving]);
  async function load() {
    selectedParams.current = params;
    const id = ++ticket.current;
    setPreview(null); setError(""); setBusy(true);
    try { const result = await request<Preview>(`/library/explore/selection?${params}`); if (mounted.current && id === ticket.current) { setPreview(result); setNow(Date.now()); } }
    catch (cause) { if (mounted.current && id === ticket.current) setError((cause as Error).message); }
    finally { if (mounted.current && id === ticket.current) setBusy(false); }
  }
  function close() { if (saving) return; ticket.current++; setOpen(false); dialog.current?.close(); }
  async function create() {
    if (!preview || saving || preview.expires_at <= Date.now() || selectedParams.current !== params) return;
    setSaving(true); setError("");
    try {
      const result = await request<{ playlist: PlaylistNode; track_count: number }>("/library/explore/playlist", { method: "POST", body: JSON.stringify({ selection_id: preview.selection_id, name: name.trim() }) });
      if (mounted.current) { dialog.current?.close(); setOpen(false); onCreated(result.playlist, result.track_count); }
    } catch (cause) { if (mounted.current) setError((cause as Error).message); }
    finally { if (mounted.current) setSaving(false); }
  }
  return <><button className="btn btn--ghost btn--sm" disabled={disabled} aria-haspopup="dialog" onClick={() => { setOpen(true); dialog.current?.showModal(); void load(); }}>Create playlist</button>
    <dialog ref={dialog} className="browse__column-dialog library-view-dialog" aria-labelledby="filter-playlist-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className="browse__column-head"><h3 id="filter-playlist-title">Playlist from these filters</h3><button className="btn btn--quiet btn--sm" disabled={saving} aria-label="Close playlist preview" onClick={close}>Close</button></div>
      <p className="muted">Every song in your library that matches these filters — not just the ones on screen. Albums and artists that match don’t add all their songs: each song has to match on its own.</p>
      <label>Playlist name <input className="input" value={name} maxLength={120} disabled={saving} onChange={event => setName(event.target.value)} /></label>
      {busy && <p role="status">Counting the songs that match…</p>}{error && <p className="alert" role="alert">{error}</p>}
      {preview && <><p role="status"><strong>{preview.track_count.toLocaleString()} {preview.track_count === 1 ? "song matches" : "songs match"}</strong></p><ol className="library-selection-sample">{preview.sample.map(song => <li key={song.id}>{song.title}<span className="muted">{song.artist ? ` · ${song.artist}` : ""}{song.album ? ` · ${song.album}` : ""}</span></li>)}</ol><p className="muted">The first {preview.sample.length}, in the order you sorted. The playlist keeps exactly these songs; music you add later won’t join it by itself.</p>{preview.expires_at <= now && <p className="alert">This count is more than 10 minutes old. Press “Count again” before making the playlist.</p>}</>}
      <div className="browse__column-footer"><button className="btn btn--ghost btn--sm" disabled={busy || saving || disabled} onClick={() => void load()}>Count again</button><button className="btn btn--primary" disabled={busy || saving || disabled || !name.trim() || !preview?.track_count || preview.expires_at <= now || selectedParams.current !== params} onClick={() => void create()}>{saving ? "Making the playlist…" : "Make the playlist"}</button></div>
    </dialog></>;
}
