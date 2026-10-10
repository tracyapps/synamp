import { useEffect, useId, useRef, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import type { GroupState } from "./library-selection";
import Icon from "./ui/Icon";

/*
 * The Library's collapsible groups: a group header (tick box + open/close),
 * a tri-state tick box, and the bar of things to do with what's ticked.
 */

export type GroupElement = { type: "group"; key: string; level: 0 | 1; label: string; count: number; open: boolean };

/** A tick box that can also show "some" (indeterminate), which plain HTML can't do declaratively. */
export function Check({ state, label, onChange, disabled = false }: { state: GroupState | boolean; label: string; onChange: (event: React.MouseEvent | React.ChangeEvent) => void; disabled?: boolean }) {
  const box = useRef<HTMLInputElement>(null);
  const mixed = state === "some";
  useEffect(() => { if (box.current) box.current.indeterminate = mixed; }, [mixed]);
  const checked = state === true || state === "all";
  return <input ref={box} type="checkbox" className="pick" checked={checked} aria-checked={mixed ? "mixed" : checked} aria-label={label} disabled={disabled} onChange={onChange} />;
}

const things = (count: number, kind: string) => `${count.toLocaleString()} ${count === 1 ? kind : `${kind}s`}`;

/** A group's header row content: tick everything in it, and open or close it. */
export function GroupHeader({ group, state, kind, onCheck, onToggle }: { group: GroupElement; state: GroupState; kind: string; onCheck: () => void; onToggle: () => void }) {
  return (
    <div className={`group-head group-head--${group.level}`}>
      <Check state={state} label={`Select everything in ${group.label}`} onChange={onCheck} />
      <button type="button" className="group-head__toggle" aria-expanded={group.open} onClick={onToggle}>
        <Icon name="chevron" size={16} className="album__chevron" />
        <span className="group-head__label">{group.label}</span>
        <span className="group-head__count">({things(group.count, kind)})</span>
      </button>
    </div>
  );
}

type Picked = { selection_id: string; track_count: number; row_count: number; album_count: number };

/**
 * What's ticked, and what to do with it. The brain counts the songs (whole
 * groups are ticked without being loaded) and hands back a receipt that every
 * button uses, so the songs played are exactly the ones counted.
 */
export function SelectionBar({ request, picked, counting, playlists, onClear, onDone, play, onPlaylistsChanged }: {
  request: Request; picked: Picked | null; counting: boolean; playlists: PlaylistNode[];
  onClear: () => void; onDone: (text: string) => void; play: (body: Record<string, unknown>) => Promise<void>; onPlaylistsChanged?: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const nameId = useId();
  const lists = playlists.filter((node) => node.type === "playlist");
  const ready = !!picked && !counting && !busy && picked.track_count > 0;
  const songs = picked ? things(picked.track_count, "song") : "";
  async function act(run: () => Promise<string>) {
    if (!picked) return;
    setBusy(true);
    try { onDone(await run()); } catch (cause) { onDone((cause as Error).message); } finally { setBusy(false); }
  }
  const post = <T,>(path: string, body: Record<string, unknown>) => request<T>(path, { method: "POST", body: JSON.stringify({ selection_id: picked!.selection_id, ...body }) });
  useEffect(() => { if (naming) dialog.current?.showModal(); else dialog.current?.close(); }, [naming]);
  const [more, setMore] = useState(false);
  const moreId = useId();
  const playNext = <button type="button" className="btn btn--ghost btn--sm" disabled={!ready} onClick={() => act(async () => { await play({ selection_id: picked!.selection_id, next: true }); return picked!.track_count > 200 ? "The first 200 songs play next." : `${songs} play next.`; })}><Icon name="queue" size={14} />Play next</button>;
  const addTo = lists.length > 0 && <select className="select select--sm" value="" disabled={!ready} aria-label="Add the selected songs to a playlist"
    onChange={(event) => { const node = lists.find((item) => item.id === event.target.value); if (node) act(async () => { await post("/library/explore/add", { playlist_id: node.id }); await onPlaylistsChanged?.(); return `Added ${songs} to ${node.name}.`; }); }}>
    <option value="">Add to playlist…</option>
    {lists.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
  </select>;
  return (
    <div className="selection-bar" role="region" aria-label="Selected">
      <p className="selection-bar__count" role="status">
        {counting || !picked ? "Counting…" : `${things(picked.row_count, "item")} selected · ${songs}`}
      </p>
      <div className="selection-bar__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={!ready} onClick={() => act(async () => { await play({ selection_id: picked!.selection_id }); return `Playing ${songs}.`; })}><Icon name="play" size={14} />Play</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!ready} onClick={() => act(async () => { await play({ selection_id: picked!.selection_id, shuffle: true }); return `Playing ${songs}, shuffled.`; })}><Icon name="shuffle" size={14} />Shuffle</button>
        <span className="selection-bar__wide">{playNext}{addTo}</span>
        <button type="button" className="btn btn--ghost btn--sm" aria-expanded={more} aria-controls={moreId} onClick={() => setMore(!more)}>More<Icon name="chevron" size={14} className="selection-bar__more-icon" /></button>
        <button type="button" className="btn btn--quiet btn--sm btn--icon" onClick={onClear} aria-label="Clear the selection" title="Clear the selection"><Icon name="close" /></button>
      </div>
      <div id={moreId} className="selection-bar__more" hidden={!more}>
        <span className="selection-bar__narrow">{playNext}{addTo}</span>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!ready} onClick={() => setNaming(true)}><Icon name="plus" size={14} />New playlist</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!ready} onClick={() => act(async () => { const r = await post<{ changed: number }>("/favourites/bulk", { on: true }); return r.changed ? `${things(r.changed, "favourite")} added.` : "They were all favourites already."; })}><Icon name="heart" size={14} />Favourite</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!ready} onClick={() => act(async () => { const r = await post<{ changed: number }>("/favourites/bulk", { on: false }); return r.changed ? `${things(r.changed, "favourite")} removed.` : "None of them were favourites."; })}>Unfavourite</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!ready} onClick={() => act(async () => { await post("/organise/focus", {}); window.location.hash = "#/care?focus=1"; return "Opened Library care for these albums."; })}><Icon name="care" size={14} />Tidy their details</button>
      </div>
      <dialog ref={dialog} className="selection-bar__dialog" aria-labelledby={`${nameId}-title`} onClose={() => setNaming(false)}>
        <form method="dialog" onSubmit={(event) => {
          event.preventDefault();
          const chosen = name.trim();
          if (!chosen) return;
          setNaming(false);
          act(async () => { const r = await post<{ playlist: { name: string } }>("/library/explore/playlist", { name: chosen }); await onPlaylistsChanged?.(); setName(""); return `Made ${r.playlist.name} with ${songs}.`; });
        }}>
          <h3 id={`${nameId}-title`}>New playlist from {songs}</h3>
          <label htmlFor={nameId}>Name</label>
          <input id={nameId} className="input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoFocus required />
          <div className="cluster"><button type="submit" className="btn btn--primary btn--sm">Make it</button><button type="button" className="btn btn--quiet btn--sm" onClick={() => setNaming(false)}>Cancel</button></div>
        </form>
      </dialog>
    </div>
  );
}
