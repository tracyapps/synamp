import { useEffect, useId, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import Icon from "./ui/Icon";
import { albumHref, artistHref, openFromList } from "./library-route";
import type { MenuItem } from "./ui/ContextMenu";
import { Heart } from "./favourites";
import "./styles/library.css";

/*
 * Browsing the library: albums (search, sort, play, shuffle, open), and songs
 * matching a search, each of which can be played or added to a playlist.
 */

export type TrackSummary = { id: string; title: string; artist?: string; album?: string; year?: number; duration_s?: number; track_no?: number; disc_no?: number };
export type AlbumSummary = { key: string; title: string; artist: string; year?: number; tracks: number; duration_s?: number };
type Play = (body: Record<string, unknown>) => Promise<void>;

export const clock = (seconds?: number) => {
  if (!seconds) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Waits until typing pauses, so a search doesn't run on every key. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), ms); return () => clearTimeout(timer); }, [value, ms]);
  return settled;
}

/** "Add to playlist" as a native select: keyboard- and screen-reader-friendly with no custom menu. */
export function AddToPlaylist({ request, track, playlists, onAdded, disabled = false }: {
  request: Request; track: TrackSummary; playlists: PlaylistNode[]; onAdded: (message: string) => void; disabled?: boolean;
}) {
  const lists = playlists.filter((node) => node.type === "playlist");
  if (!lists.length) return null;
  return (
    <select className="select select--sm add-to" value="" disabled={disabled} aria-label={`Add “${track.title}” to a playlist`}
      onChange={(event) => {
        const node = lists.find((item) => item.id === event.target.value);
        if (!node) return;
        request(`/playlists/${node.id}/tracks`, { method: "POST", body: JSON.stringify({ id: track.id, title: track.title, artist: track.artist }) })
          .then(() => onAdded(`Added “${track.title}” to ${node.name}.`))
          .catch((cause) => onAdded((cause as Error).message));
      }}>
      <option value="">Add to…</option>
      {lists.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
    </select>
  );
}

/** An artist's name as a link to their page. */
export function ArtistLink({ name, className = "" }: { name?: string; className?: string }) {
  if (!name || name === "Unknown") return <>{name ?? "Unknown artist"}</>;
  const href = artistHref(name);
  return <a className={`artist-link ${className}`} href={href} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); openFromList(href); } }}>{name}</a>;
}

/** A link styled as a button that opens a Library page, remembering where you came from. */
export function PageLink({ href, label, children, className = "btn btn--quiet btn--sm btn--icon" }: { href: string; label: string; children: React.ReactNode; className?: string }) {
  return <a className={className} href={href} aria-label={label} title={label}
    onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); openFromList(href); } }}>{children}</a>;
}

/** The menu for an album (right-click, Menu key or Shift+F10 on its row). */
export function albumMenu(album: AlbumSummary, play: Play, say: (text: string) => void, toggle?: () => void, open?: boolean): MenuItem[] {
  const start = (body: Record<string, unknown>, what: string) => play({ album_key: album.key, ...body }).then(() => say(`Playing ${what}.`)).catch((cause) => say((cause as Error).message));
  return [
    { label: "Open album page", onSelect: () => openFromList(albumHref(album.key)) },
    ...(album.artist && album.artist !== "Unknown" ? [{ label: `Go to ${album.artist}`, onSelect: () => openFromList(artistHref(album.artist)) }] : []),
    ...(toggle ? [{ label: open ? "Hide songs" : "Show songs", onSelect: toggle }] : []),
    { label: "Play", onSelect: () => void start({}, album.title) },
    { label: "Shuffle", onSelect: () => void start({ shuffle: true }, `${album.title}, shuffled`) },
  ];
}

/** "O" on a focused album row opens its page (only while the row has focus, so it can't fire by accident). */
export function openKey(event: React.KeyboardEvent, href: string) {
  const target = event.target as HTMLElement;
  if (event.altKey || event.ctrlKey || event.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  if (event.key === "o" || event.key === "O") { event.preventDefault(); openFromList(href); }
}

/** An album's songs, loaded when first shown. Click a song to play the album from there. */
export function AlbumSongs({ album, request, play, playlists, say, disabled = false }: { album: AlbumSummary; request: Request; play: Play; playlists: PlaylistNode[]; say: (text: string) => void; disabled?: boolean }) {
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    request<{ tracks: TrackSummary[] }>(`/library/album?key=${encodeURIComponent(album.key)}`)
      .then((result) => { if (live) setTracks(result.tracks); }).catch((cause) => say((cause as Error).message));
    return () => { live = false; };
  }, [album.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tracks) return <p className="muted album__loading">Loading…</p>;
  return (
    <ol className="tracklist" aria-label={`Songs on ${album.title}`}>
      {tracks.map((track, index) => (
        <li key={track.id}>
          <button type="button" className="tracklist__play" disabled={disabled}
            onClick={() => play({ album_key: album.key, start_index: index }).then(() => say(`Playing ${track.title}.`)).catch((cause) => say((cause as Error).message))}>
            <span className="tracklist__n" aria-hidden="true">{track.track_no ?? index + 1}</span>
            <span className="tracklist__title">{track.title}<span className="visually-hidden">, play</span></span>
          </button>
          {track.artist && track.artist !== album.artist && <ArtistLink name={track.artist} className="tracklist__artist" />}
          <span className="tracklist__time mono">{clock(track.duration_s)}</span>
          <Heart kind="song" refId={track.id} name={track.title} say={say} />
          <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={say} disabled={disabled} />
        </li>
      ))}
    </ol>
  );
}

export function AlbumRow({ album, request, play, playlists, say, disabled = false, itemProps, onMenu, pick }: { album: AlbumSummary; request: Request; play: Play; playlists: PlaylistNode[]; say: (text: string) => void; disabled?: boolean;
  /** Extra attributes for the list item (its place in a long list). */
  itemProps?: Record<string, string | number>;
  /** Open the right-click menu for this album. */
  onMenu?: (event: React.MouseEvent, label: string, items: MenuItem[]) => void;
  /** A tick box to select it (the Library list). */
  pick?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const start = (body: Record<string, unknown>, what: string) => play({ album_key: album.key, ...body })
    .then(() => say(`Playing ${what}.`)).catch((cause) => say((cause as Error).message));
  const href = albumHref(album.key);
  return (
    <li className={`album ${open ? "is-open" : ""}`} {...itemProps}
      onContextMenu={onMenu ? (event) => onMenu(event, album.title, albumMenu(album, play, say, () => setOpen(!open), open)) : undefined}
      onKeyDown={(event) => openKey(event, href)}>
      <div className="album__row">
        {pick}
        <span className="album__art" aria-hidden="true" />
        <div className="album__text">
          <button type="button" className="album__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
            <Icon name="chevron" size={16} className="album__chevron" />
            <span className="album__title">{album.title}</span>
          </button>
          <p className="album__meta"><ArtistLink name={album.artist} />{album.year ? ` · ${album.year}` : ""} · {album.tracks} {album.tracks === 1 ? "song" : "songs"}{album.duration_s ? ` · ${clock(album.duration_s)}` : ""}</p>
        </div>
        <div className="album__actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={disabled} onClick={() => start({}, album.title)}><Icon name="play" size={16} />Play<span className="visually-hidden"> {album.title}</span></button>
          <button type="button" className="btn btn--quiet btn--sm btn--icon" disabled={disabled} onClick={() => start({ shuffle: true }, `${album.title}, shuffled`)} aria-label={`Shuffle ${album.title}`}><Icon name="shuffle" /></button>
          <Heart kind="album" refId={album.key} name={album.title} say={say} />
          <PageLink href={href} label={`Open the album page for ${album.title}`}><Icon name="open" /></PageLink>
        </div>
      </div>
      <div id={listId} hidden={!open}>
        {open && <AlbumSongs album={album} request={request} play={play} playlists={playlists} say={say} disabled={disabled} />}
      </div>
    </li>
  );
}
