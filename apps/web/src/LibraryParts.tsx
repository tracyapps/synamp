import { useEffect, useId, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import Icon from "./ui/Icon";
import "./styles/library.css";

/*
 * Browsing the library: albums (search, sort, play, shuffle, open), and songs
 * matching a search, each of which can be played or added to a playlist.
 */

export type TrackSummary = { id: string; title: string; artist?: string; album?: string; year?: number; duration_s?: number; track_no?: number; disc_no?: number };
type AlbumSummary = { key: string; title: string; artist: string; year?: number; tracks: number; duration_s?: number };
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

export function AlbumRow({ album, request, play, playlists, say, disabled = false, itemProps }: { album: AlbumSummary; request: Request; play: Play; playlists: PlaylistNode[]; say: (text: string) => void; disabled?: boolean;
  /** Extra attributes for the list item (its place in a long list). */
  itemProps?: Record<string, string | number> }) {
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const listId = useId();
  const start = (body: Record<string, unknown>, what: string) => play({ album_key: album.key, ...body })
    .then(() => say(`Playing ${what}.`)).catch((cause) => say((cause as Error).message));
  useEffect(() => {
    if (!open || tracks) return;
    request<{ tracks: TrackSummary[] }>(`/library/album?key=${encodeURIComponent(album.key)}`)
      .then((result) => setTracks(result.tracks)).catch((cause) => say((cause as Error).message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <li className="album" {...itemProps}>
      <div className="album__row">
        <span className="album__art" aria-hidden="true" />
        <div className="album__text">
          <p className="album__title">{album.title}</p>
          <p className="album__meta">{album.artist}{album.year ? ` · ${album.year}` : ""} · {album.tracks} {album.tracks === 1 ? "track" : "tracks"}{album.duration_s ? ` · ${clock(album.duration_s)}` : ""}</p>
        </div>
        <div className="album__actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={disabled} onClick={() => start({}, album.title)}><Icon name="play" size={16} />Play<span className="visually-hidden"> {album.title}</span></button>
          <button type="button" className="btn btn--quiet btn--sm btn--icon" disabled={disabled} onClick={() => start({ shuffle: true }, `${album.title}, shuffled`)} aria-label={`Shuffle ${album.title}`}><Icon name="shuffle" /></button>
          <button type="button" className="btn btn--quiet btn--sm" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>{open ? "Hide" : "Tracks"}<span className="visually-hidden"> of {album.title}</span></button>
        </div>
      </div>
      <div id={listId} hidden={!open}>
        {open && (!tracks ? <p className="muted album__loading">Loading…</p> : (
          <ol className="tracklist">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <button type="button" className="tracklist__play" disabled={disabled} onClick={() => start({ start_index: index }, track.title)}>
                  <span className="tracklist__n" aria-hidden="true">{track.track_no ?? index + 1}</span>
                  <span className="tracklist__title">{track.title}{track.artist && track.artist !== album.artist && <small>{track.artist}</small>}</span>
                  <span className="visually-hidden">, play</span>
                </button>
                <span className="tracklist__time mono">{clock(track.duration_s)}</span>
                <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={say} disabled={disabled} />
              </li>
            ))}
          </ol>
        ))}
      </div>
    </li>
  );
}
