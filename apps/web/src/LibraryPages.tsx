import { useEffect, useRef, useState } from "react";
import type { Request } from "./api";
import type { PlaylistNode } from "./Playlists";
import { AddToPlaylist, AlbumRow, AlbumSongs, ArtistLink, clock, PageLink } from "./LibraryParts";
import type { AlbumSummary, TrackSummary } from "./LibraryParts";
import { albumHref, backToList } from "./library-route";
import { useContextMenu } from "./ui/ContextMenu";
import Icon from "./ui/Icon";

/*
 * The Library's own pages: an artist (their albums, the albums they appear on,
 * and every song), and an album (its songs, play and shuffle). Opened from the
 * list by a link, a button, the O key or the right-click menu; Back returns to
 * the same place in the list.
 */

type Play = (body: Record<string, unknown>) => Promise<void>;
type ArtistAlbum = AlbumSummary & { songs_by_artist: number };
type ArtistData = {
  artist: { name: string; songs: number; albums: number; duration_s?: number };
  albums: ArtistAlbum[]; appears_on: ArtistAlbum[];
  songs: Array<TrackSummary & { album_key: string }>; truncated: boolean;
};
type Props = { request: Request; play: Play; playlists: PlaylistNode[] };

const n = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString()} ${value === 1 ? one : many}`;

function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Arriving on a page puts you at its heading, as moving between screens does.
  useEffect(() => { heading.current?.focus(); document.getElementById("main")?.scrollTo(0, 0); }, [title]);
  return (
    <div className="library-page__head">
      <button type="button" className="btn btn--quiet btn--sm library-page__back" onClick={backToList}><Icon name="back" size={16} />Library</button>
      <p className="eyebrow">{eyebrow}</p>
      <h2 ref={heading} id="library-page-title" tabIndex={-1} className="library-page__title">{title}</h2>
      {children}
    </div>
  );
}

function usePage<T>(request: Request, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let live = true;
    setData(null); setProblem("");
    request<T>(path).then((result) => { if (live) setData(result); }, (cause) => { if (live) setProblem((cause as Error).message); });
    return () => { live = false; };
  }, [request, path]);
  return { data, problem };
}

export function ArtistPage({ name, request, play, playlists }: Props & { name: string }) {
  const { data, problem } = usePage<ArtistData>(request, `/library/artist?name=${encodeURIComponent(name)}`);
  const [message, setMessage] = useState("");
  const [showSongs, setShowSongs] = useState(false);
  const { open, menu } = useContextMenu();
  const say = setMessage;
  const start = (body: Record<string, unknown>, what: string) => play({ artist: data?.artist.name ?? name, ...body }).then(() => say(`Playing ${what}.`)).catch((cause) => say((cause as Error).message));
  const albumList = (albums: ArtistAlbum[]) => (
    <ul className="albums">
      {albums.map((album) => (
        <AlbumRow key={album.key} album={album} request={request} play={play} playlists={playlists} say={say} onMenu={open} />
      ))}
    </ul>
  );
  return (
    <section className="section-card library-page" aria-labelledby="library-page-title">
      {!data ? (
        <div className="section-card__body"><PageHead eyebrow="Artist" title={name} /><p className={problem ? "alert" : "muted"} role={problem ? "alert" : "status"}>{problem || "Loading…"}</p></div>
      ) : <div className="section-card__body">
        <PageHead eyebrow="Artist" title={data.artist.name}>
          <p className="muted library-page__facts">{n(data.artist.albums, "album")} · {n(data.artist.songs, "song")}{data.artist.duration_s ? ` · ${clock(data.artist.duration_s)}` : ""}</p>
          <div className="cluster">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => start({}, `everything by ${data.artist.name}`)}><Icon name="play" size={16} />Play all</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => start({ shuffle: true }, `${data.artist.name}, shuffled`)}><Icon name="shuffle" size={16} />Shuffle</button>
          </div>
        </PageHead>
        <p className="browse__status" role="status">{message}</p>
        {data.albums.length > 0 && <><h3 className="library-page__section">Albums</h3>{albumList(data.albums)}</>}
        {data.appears_on.length > 0 && <><h3 className="library-page__section">Appears on</h3>
          <p className="muted library-page__hint">Other artists’ albums with songs by {data.artist.name}.</p>{albumList(data.appears_on)}</>}
        <h3 className="library-page__section">
          <button type="button" className="album__toggle" aria-expanded={showSongs} aria-controls="artist-songs" onClick={() => setShowSongs(!showSongs)}>
            <Icon name="chevron" size={16} className="album__chevron" />All songs ({data.artist.songs.toLocaleString()})
          </button>
        </h3>
        <div id="artist-songs" hidden={!showSongs}>
          {showSongs && <ol className="tracklist tracklist--wide" aria-label={`Songs by ${data.artist.name}`}>
            {data.songs.map((track, index) => (
              <li key={track.id}>
                <button type="button" className="tracklist__play" onClick={() => start({ start_index: index }, track.title)}>
                  <span className="tracklist__title">{track.title}<span className="visually-hidden">, play</span></span>
                </button>
                <PageLink href={albumHref(track.album_key)} label={`Open the album page for ${track.album ?? "this album"}`} className="tracklist__album">{track.album ?? "Album"}</PageLink>
                <span className="tracklist__time mono">{clock(track.duration_s)}</span>
                <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={say} />
              </li>
            ))}
          </ol>}
          {showSongs && data.truncated && <p className="muted">Showing the first 2,000. Play all plays every one.</p>}
        </div>
        <p className="muted library-page__hint">Tip: right-click an album (or press the Menu key on it) for more, or press O on it to open its page.</p>
      </div>}
      {menu}
    </section>
  );
}

export function AlbumPage({ albumKey, request, play, playlists }: Props & { albumKey: string }) {
  const { data, problem } = usePage<{ album: AlbumSummary; tracks: TrackSummary[] }>(request, `/library/album?key=${encodeURIComponent(albumKey)}`);
  const [message, setMessage] = useState("");
  const start = (body: Record<string, unknown>, what: string) => play({ album_key: albumKey, ...body }).then(() => setMessage(`Playing ${what}.`)).catch((cause) => setMessage((cause as Error).message));
  return (
    <section className="section-card library-page" aria-labelledby="library-page-title">
      <div className="section-card__body">
        {!data ? <><PageHead eyebrow="Album" title={albumKey.split("/").pop() ?? "Album"} /><p className={problem ? "alert" : "muted"} role={problem ? "alert" : "status"}>{problem || "Loading…"}</p></> : <>
          <PageHead eyebrow="Album" title={data.album.title}>
            <p className="library-page__facts"><ArtistLink name={data.album.artist} /><span className="muted">{data.album.year ? ` · ${data.album.year}` : ""} · {n(data.album.tracks, "song")}{data.album.duration_s ? ` · ${clock(data.album.duration_s)}` : ""}</span></p>
            <div className="cluster">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => start({}, data.album.title)}><Icon name="play" size={16} />Play</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => start({ shuffle: true }, `${data.album.title}, shuffled`)}><Icon name="shuffle" size={16} />Shuffle</button>
            </div>
          </PageHead>
          <p className="browse__status" role="status">{message}</p>
          <AlbumSongs album={data.album} request={request} play={play} playlists={playlists} say={setMessage} />
        </>}
      </div>
    </section>
  );
}
