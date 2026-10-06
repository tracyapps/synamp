import { useEffect, useId, useRef, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import Icon from "./ui/Icon";
import { EmptyState } from "./ui/kit";
import "./styles/library.css";

/*
 * Browsing the library: albums (search, sort, play, shuffle, open), and songs
 * matching a search, each of which can be played or added to a playlist.
 */

export type TrackSummary = { id: string; title: string; artist?: string; album?: string; year?: number; duration_s?: number; track_no?: number; disc_no?: number };
type AlbumSummary = { key: string; title: string; artist: string; year?: number; tracks: number; duration_s?: number };
type Play = (body: Record<string, unknown>) => Promise<void>;

const n = (value: number) => value.toLocaleString();
const clock = (seconds?: number) => {
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
export function AddToPlaylist({ request, track, playlists, onAdded }: {
  request: Request; track: TrackSummary; playlists: PlaylistNode[]; onAdded: (message: string) => void;
}) {
  const lists = playlists.filter((node) => node.type === "playlist");
  if (!lists.length) return null;
  return (
    <select className="select select--sm add-to" value="" aria-label={`Add “${track.title}” to a playlist`}
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

function AlbumRow({ album, request, play, playlists, say }: { album: AlbumSummary; request: Request; play: Play; playlists: PlaylistNode[]; say: (text: string) => void }) {
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
    <li className="album">
      <div className="album__row">
        <span className="album__art" aria-hidden="true" />
        <div className="album__text">
          <p className="album__title">{album.title}</p>
          <p className="album__meta">{album.artist}{album.year ? ` · ${album.year}` : ""} · {album.tracks} {album.tracks === 1 ? "track" : "tracks"}{album.duration_s ? ` · ${clock(album.duration_s)}` : ""}</p>
        </div>
        <div className="album__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => start({}, album.title)}><Icon name="play" size={16} />Play<span className="visually-hidden"> {album.title}</span></button>
          <button type="button" className="btn btn--quiet btn--sm btn--icon" onClick={() => start({ shuffle: true }, `${album.title}, shuffled`)} aria-label={`Shuffle ${album.title}`}><Icon name="shuffle" /></button>
          <button type="button" className="btn btn--quiet btn--sm" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>{open ? "Hide" : "Tracks"}<span className="visually-hidden"> of {album.title}</span></button>
        </div>
      </div>
      <div id={listId} hidden={!open}>
        {open && (!tracks ? <p className="muted album__loading">Loading…</p> : (
          <ol className="tracklist">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <button type="button" className="tracklist__play" onClick={() => start({ start_index: index }, track.title)}>
                  <span className="tracklist__n" aria-hidden="true">{track.track_no ?? index + 1}</span>
                  <span className="tracklist__title">{track.title}{track.artist && track.artist !== album.artist && <small>{track.artist}</small>}</span>
                  <span className="visually-hidden">, play</span>
                </button>
                <span className="tracklist__time mono">{clock(track.duration_s)}</span>
                <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={say} />
              </li>
            ))}
          </ol>
        ))}
      </div>
    </li>
  );
}

export default function Library({ request, play, playlists }: { request: Request; play: Play; playlists: PlaylistNode[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("artist");
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [songs, setSongs] = useState<{ total: number; tracks: TrackSummary[] } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const q = useDebounced(query.trim());
  const searchId = useId();
  const latest = useRef(0);

  async function load(offset = 0) {
    const ticket = ++latest.current;
    try {
      const page = await request<{ total: number; albums: AlbumSummary[] }>(`/library/albums?q=${encodeURIComponent(q)}&sort=${sort}&offset=${offset}&limit=60`);
      if (ticket !== latest.current) return; // a newer search already answered
      setTotal(page.total);
      setAlbums((current) => (offset ? [...current, ...page.albums] : page.albums));
      setError("");
    } catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => { load(0); }, [q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!q) { setSongs(null); return; }
    request<{ total: number; tracks: TrackSummary[] }>(`/library/search?q=${encodeURIComponent(q)}&limit=12`).then(setSongs).catch(() => setSongs(null));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (text: string) => setMessage(text);
  const playSongs = (index: number) => songs && play({ track_ids: songs.tracks.map((track) => track.id), start_index: index })
    .then(() => say(`Playing “${songs.tracks[index]!.title}”.`)).catch((cause) => say((cause as Error).message));

  return (
    <section className="section-card browse" aria-labelledby="browse-title">
      <div className="section-card__head">
        <div><h2 id="browse-title" className="section-card__title">{q ? "Search" : "Albums"}</h2>
          <p className="section-card__meta">{total === null ? "Loading…" : q ? `${n(total)} ${total === 1 ? "album matches" : "albums match"}` : `${n(total)} ${total === 1 ? "album" : "albums"}`}</p></div>
      </div>
      <div className="section-card__body">
        <div className="toolbar" role="search">
          <label className="search" htmlFor={searchId}>
            <span className="visually-hidden">Search albums, artists and songs</span>
            <Icon name="search" />
            <input id={searchId} className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search albums, artists, songs…" autoComplete="off" />
          </label>
          <label className="browse__sort">Sort by
            <select className="select select--sm" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="artist">Artist</option><option value="title">Album title</option><option value="year">Newest first</option>
            </select>
          </label>
        </div>
        <p className="browse__status" role="status">{message}</p>
        {error && <p className="alert" role="alert">{error}</p>}
        {songs && songs.total > 0 && (
          <section className="browse__songs" aria-labelledby="songs-title">
            <h3 id="songs-title">Songs <span className="mono muted">{songs.total > songs.tracks.length ? `${songs.tracks.length} of ${n(songs.total)}` : n(songs.total)}</span></h3>
            <ol className="tracklist">
              {songs.tracks.map((track, index) => (
                <li key={track.id}>
                  <button type="button" className="tracklist__play" onClick={() => playSongs(index)}>
                    <span className="tracklist__n" aria-hidden="true"><Icon name="play" size={14} /></span>
                    <span className="tracklist__title">{track.title}<small>{[track.artist, track.album].filter(Boolean).join(" · ")}</small></span>
                    <span className="visually-hidden">, play</span>
                  </button>
                  <span className="tracklist__time mono">{clock(track.duration_s)}</span>
                  <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={say} />
                </li>
              ))}
            </ol>
          </section>
        )}
        {q && songs && songs.total > 0 && <h3 className="browse__albums-head">Albums</h3>}
        {total === 0 ? (
          q ? <p className="muted">No albums match “{q}”.</p>
            : <EmptyState icon="library" title="No albums yet">Albums appear here once the analyzer on your Mac has sent its first library list.</EmptyState>
        ) : (
          <ul className="albums" aria-label="Albums">
            {albums.map((album) => <AlbumRow key={album.key} album={album} request={request} play={play} playlists={playlists} say={say} />)}
          </ul>
        )}
        {total !== null && albums.length < total && (
          <div className="browse__more"><button type="button" className="btn btn--ghost" onClick={() => load(albums.length)}>Show more albums</button>
            <span className="muted mono">{n(albums.length)} of {n(total)}</span></div>
        )}
      </div>
    </section>
  );
}
