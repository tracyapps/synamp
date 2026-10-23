/*
 * The floating artist card: library facts, the artist's collaboration links
 * (click one to travel there), mood/energy meters, and their albums with
 * songs ready to play. Guests — artists that only exist through featured
 * credits — get the travel links without an album list.
 */
import { useEffect, useState } from "react";
import type { Request } from "../api";
import type { PlaylistNode } from "../Playlists";
import { AddToPlaylist, clock } from "../LibraryParts";
import type { TrackSummary } from "../LibraryParts";
import type { GalaxyArtistDetails, GalaxyMapNode } from "./types";

export type Collaborator = { key: string; name: string; tracks: number; guest: boolean };

const meter = (label: string, value: number | undefined, max: number, unit = "", decimals = 0) => {
  if (value === undefined || !Number.isFinite(value)) return null;
  return <div className="galaxy__meter" key={label}>
    <span className="galaxy__meter-label">{label}</span>
    <span className="galaxy__meter-track"><span className="galaxy__meter-fill" style={{ width: `${Math.max(3, Math.min(100, value / max * 100))}%` }} /></span>
    <span className="galaxy__meter-value mono">{value.toFixed(decimals)}{unit}</span>
  </div>;
};

export default function ArtistCard({ request, play, playlists, node, collaborators, onJump, onClose, onSay }: {
  request: Request;
  play: (body: Record<string, unknown>) => Promise<void>;
  playlists: PlaylistNode[];
  node: GalaxyMapNode | null;
  collaborators: Collaborator[];
  onJump: (key: string) => void;
  onClose: () => void;
  onSay: (text: string) => void;
}) {
  const [details, setDetails] = useState<GalaxyArtistDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);

  useEffect(() => {
    setDetails(null); setOpenAlbum(null); setLoading(false);
    if (!node || node.guest) return;
    let active = true; const controller = new AbortController(); setLoading(true);
    request<GalaxyArtistDetails>(`/library/galaxy/artist?key=${encodeURIComponent(node.key)}`, { signal: controller.signal })
      .then(result => { if (active) setDetails(result); })
      .catch(cause => { if (active) onSay((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [request, node, onSay]);

  if (!node) return null;
  const era = node.decade !== undefined
    ? `Mostly the ${node.decade}s${node.year_first !== undefined && node.year_last !== undefined && node.year_first !== node.year_last ? ` · ${node.year_first}–${node.year_last}` : node.year_first !== undefined ? ` · ${node.year_first}` : ""}`
    : node.year_first !== undefined ? `${node.year_first}${node.year_last !== node.year_first ? `–${node.year_last}` : ""}` : "";
  const signals = node.signals;
  const playTracks = (tracks: TrackSummary[], what: string) => play({ track_ids: tracks.map(track => track.id) }).then(() => onSay(`Playing ${what}.`)).catch(cause => onSay((cause as Error).message));
  const songs = (count: number) => `${count.toLocaleString()} song${count === 1 ? "" : "s"}`;

  return <aside className="galaxy__card" aria-label={`${node.name} details`}>
    <div className="galaxy__card-controls">
      <button className="btn btn--quiet btn--sm" onClick={onClose}>Close ×</button>
    </div>
    <div className="galaxy__artist-head">
      <span className="galaxy__avatar" aria-hidden="true">{node.name.slice(0, 1)}</span>
      <div>
        <h3>{node.name}</h3>
        <p>{node.guest
          ? `Featured guest · appears on ${songs(node.appearances ?? 1)}`
          : `${songs(node.tracks)} · ${node.albums.toLocaleString()} album folder${node.albums === 1 ? "" : "s"}`}</p>
      </div>
    </div>

    {!!node.genres.length && <div className="galaxy__chips">{node.genres.map(genre => <span className="galaxy__chip" key={genre}>{genre}</span>)}</div>}
    {era && <p className="galaxy__era">{era}</p>}
    {signals && <div className="galaxy__meters">
      {meter("Tempo", signals.bpm, 200, " bpm", 0)}
      {meter("Mood", signals.valence, 1, "", 2)}
      {meter("Energy", signals.arousal, 1, "", 2)}
    </div>}

    <h4>Collaborations</h4>
    {collaborators.length
      ? <><p className="galaxy__hint">Featured-credit links found in your files. Follow one to travel there.</p>
        <div className="galaxy__chips">{collaborators.map(partner => (
          <button key={partner.key} className="galaxy__link-chip" onClick={() => onJump(partner.key)} aria-label={`Travel to ${partner.name}`}>
            {partner.name}<span>{partner.guest ? "guest · " : ""}{songs(partner.tracks)}</span>
          </button>
        ))}</div></>
      : <p className="galaxy__hint">No featured-credit links from this artist's files.</p>}

    {node.guest ? null : <>
      <h4>Albums</h4>
      {loading ? <p className="muted">Loading albums…</p> : details ? <>
        {details.truncated && <p className="galaxy__limit">First 2,000 songs loaded. Counts include the whole artist; playback uses only the songs shown.</p>}
        {!details.albums.length && <p className="muted">No album folders for this artist.</p>}
        <ul className="galaxy__albums">{details.albums.map(album => <li key={album.key}>
          <button className="galaxy__album" aria-expanded={openAlbum === album.key} onClick={() => setOpenAlbum(openAlbum === album.key ? null : album.key)}>
            <span className="galaxy__album-art" aria-hidden="true">♪</span>
            <span><strong>{album.title}</strong><small>{album.year ? `${album.year} · ` : ""}{album.tracks} matching song{album.tracks === 1 ? "" : "s"}{album.total_tracks !== album.tracks ? ` of ${album.total_tracks} in folder` : ""}</small></span>
            <span aria-hidden="true">{openAlbum === album.key ? "−" : "+"}</span>
          </button>
          {openAlbum === album.key && <div className="galaxy__album-songs">
            <p className="galaxy__folder">{album.key}</p>
            <button className="btn btn--ghost btn--sm" disabled={!album.matching_tracks.length} onClick={() => playTracks(album.matching_tracks, `${album.title}, ${node.name} songs`)}>Play these songs</button>
            {album.matching_tracks.length < album.tracks && <p className="muted">{album.matching_tracks.length} of {songs(album.tracks)} loaded.</p>}
            <ol className="galaxy__tracks">{album.matching_tracks.map(track => <li key={track.id}>
              <button className="galaxy__song" onClick={() => playTracks([track], track.title)} aria-label={`Play ${track.title}`}><span>{track.title}<small>{track.artist}</small></span><span className="mono">{clock(track.duration_s)}</span></button>
              <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={onSay} />
            </li>)}</ol>
          </div>}
        </li>)}</ul>
        {!!details.loose_tracks.length && <details className="galaxy__loose">
          <summary>Songs outside album folders ({details.loose_tracks.length})</summary>
          <ol className="galaxy__tracks">{details.loose_tracks.map(track => <li key={track.id}>
            <button className="galaxy__song" onClick={() => playTracks([track], track.title)} aria-label={`Play ${track.title}`}><span>{track.title}<small>{track.artist}</small></span><span className="mono">{clock(track.duration_s)}</span></button>
            <AddToPlaylist request={request} track={track} playlists={playlists} onAdded={onSay} />
          </li>)}</ol>
        </details>}
      </> : !loading && <p className="muted">Albums could not load.</p>}
    </>}
  </aside>;
}
