import { useEffect, useId, useRef, useState } from "react";
import type { Request } from "./api";
import { useDebounced } from "./Library";
import Icon from "./ui/Icon";
import { ScreenHead } from "./ui/kit";
import "./styles/radio.css";

/*
 * World radio: tens of thousands of stations from radio-browser.info, searched
 * and relayed by the brain (apps/brain/src/radio/radio.ts). Playing a station
 * takes over the player bar until you go back to your own music.
 */

export type Station = {
  id: string; name: string; listen_url: string; homepage?: string; tags: string[];
  country?: string; countrycode?: string; language?: string; codec?: string; bitrate?: number;
};
type Country = { code: string; name: string; stations: number };

export const stationMeta = (station: Station) =>
  [station.country, station.tags.slice(0, 3).join(", "), [station.codec, station.bitrate ? `${station.bitrate} kbps` : ""].filter(Boolean).join(" ")]
    .filter(Boolean).join(" · ");

const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "FM";

function StationRow({ station, playing, favourite, onPlay, onFavourite }: {
  station: Station; playing: boolean; favourite: boolean; onPlay: () => void; onFavourite: () => void;
}) {
  return (
    <li className={`station ${playing ? "is-playing" : ""}`}>
      <span className="station__badge" aria-hidden="true">{initials(station.name)}</span>
      <div className="station__text">
        <p className="station__name">{station.name}{playing && <span className="badge badge--live station__live"><span className="status-dot status-dot--live" aria-hidden="true" />On now</span>}</p>
        <p className="station__meta">{stationMeta(station)}</p>
      </div>
      <div className="station__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onPlay}><Icon name="play" size={16} />Play<span className="visually-hidden"> {station.name}</span></button>
        <button type="button" className="btn btn--quiet btn--sm btn--icon" aria-pressed={favourite} onClick={onFavourite}
          aria-label={`Keep ${station.name} in your stations`} title={favourite ? "In your stations" : "Add to your stations"}>
          <Icon name="heart" />
        </button>
      </div>
    </li>
  );
}

export default function Radio({ request, headingId, current, onPlay }: {
  request: Request; headingId: string; current: Station | null; onPlay: (station: Station) => void;
}) {
  const [favourites, setFavourites] = useState<Station[]>([]);
  const [moods, setMoods] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<Country[]>([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [country, setCountry] = useState("");
  const [stations, setStations] = useState<Station[] | null>(null);
  const [error, setError] = useState("");
  const q = useDebounced(query.trim(), 350);
  const ids = useId();
  const ticket = useRef(0);

  useEffect(() => {
    request<{ favourites: Station[]; moods: Record<string, string> }>("/radio").then((result) => { setFavourites(result.favourites); setMoods(result.moods); }).catch((cause) => setError((cause as Error).message));
    request<{ countries: Country[] }>("/radio/countries").then((result) => setCountries(result.countries)).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mine = ++ticket.current;
    setStations(null);
    const params = new URLSearchParams({ q, tag, country });
    request<{ stations: Station[] }>(`/radio/search?${params}`)
      .then((result) => { if (mine === ticket.current) { setStations(result.stations); setError(""); } })
      .catch((cause) => { if (mine === ticket.current) { setStations([]); setError((cause as Error).message); } });
  }, [q, tag, country]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFavourite = (station: Station) => favourites.some((item) => item.id === station.id);
  const toggleFavourite = (station: Station) => request<{ favourites: Station[] }>(isFavourite(station) ? "/radio/favourites/remove" : "/radio/favourites",
    { method: "POST", body: JSON.stringify({ id: station.id }) }).then((result) => setFavourites(result.favourites)).catch((cause) => setError((cause as Error).message));
  const row = (station: Station) => <StationRow key={station.id} station={station} playing={current?.id === station.id} favourite={isFavourite(station)}
    onPlay={() => onPlay(station)} onFavourite={() => toggleFavourite(station)} />;
  const filtered = !!(q || tag || country);
  const countryName = countries.find((item) => item.code === country)?.name;
  const moodName = Object.entries(moods).find(([, value]) => value === tag)?.[0];

  return (
    <div className="screen">
      <ScreenHead id={headingId} eyebrow="Listen" title="Radio">
        <p>Stations from all over the world, free and live. SynAmp passes the sound through your own server, so stations don’t see your phone or computer.</p>
      </ScreenHead>
      {favourites.length > 0 && (
        <section className="section-card" aria-labelledby={`${ids}-fav`}>
          <div className="section-card__head"><h2 id={`${ids}-fav`} className="section-card__title">Your stations</h2><p className="section-card__meta">{favourites.length}</p></div>
          <div className="section-card__body"><ul className="stations">{favourites.map(row)}</ul></div>
        </section>
      )}
      <section className="section-card" aria-labelledby={`${ids}-find`}>
        <div className="section-card__head">
          <div><h2 id={`${ids}-find`} className="section-card__title">{filtered ? "Stations" : "Popular right now"}</h2>
            <p className="section-card__meta">{[moodName ?? (tag || ""), countryName ?? "", q ? `“${q}”` : ""].filter(Boolean).join(" · ") || "most listened to, worldwide"}</p></div>
        </div>
        <div className="section-card__body">
          <div className="toolbar" role="search">
            <div className="search">
              <Icon name="search" />
              <input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by station name" aria-label="Search stations by name" autoComplete="off" />
            </div>
            <label className="radio__country">Country
              <select className="select select--sm" value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="">Anywhere</option>
                {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <div className="radio__moods" role="group" aria-label="Kind of station">
            <button type="button" className="chip" aria-pressed={!tag} onClick={() => setTag("")}>Any kind</button>
            {Object.entries(moods).map(([label, value]) => (
              <button key={value} type="button" className="chip" aria-pressed={tag === value} onClick={() => setTag(tag === value ? "" : value)}>{label}</button>
            ))}
          </div>
          <p className="muted radio__note">Kinds are the tags stations give themselves, so a few may surprise you.</p>
          {error && <p className="alert" role="alert">{error}</p>}
          {stations === null ? <p className="muted" role="status">Finding stations…</p>
            : stations.length === 0 ? <p className="muted" role="status">No stations found{q ? ` called “${q}”` : ""}. Try fewer words, or another country.</p>
            : <ul className="stations" aria-live="polite" aria-busy={false}>{stations.map(row)}</ul>}
        </div>
      </section>
    </div>
  );
}

/** The player bar while a station is on. */
export function RadioBar({ station, onStop }: { station: Station; onStop: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [paused, setPaused] = useState(true);
  const [status, setStatus] = useState("Tuning in…");
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    setStatus("Tuning in…");
    el.src = station.listen_url;
    el.play().catch(() => setStatus("Press play to start — the browser blocked autoplay."));
    return () => { el.pause(); el.removeAttribute("src"); el.load(); };
  }, [station.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    const el = audio.current!;
    // Live radio can't pause: stop drops the stream, play starts it again from now.
    if (el.paused) { el.src = station.listen_url; el.play().catch((cause) => setStatus(String(cause))); }
    else { el.pause(); el.removeAttribute("src"); el.load(); setPaused(true); setStatus("Stopped."); }
  };
  return (
    <section className="player player--radio" aria-label="Radio player">
      <audio ref={audio} onPlaying={() => { setPaused(false); setStatus(""); }} onWaiting={() => setStatus("Buffering…")}
        onError={() => { if (audio.current?.getAttribute("src")) { setPaused(true); setStatus("This station isn’t playing right now. Try another."); } }} />
      <div className="player__now">
        <span className="player__cover player__cover--radio" aria-hidden="true">{initials(station.name)}</span>
        <div className="player__text">
          <p className="player__title">{station.name}</p>
          <p className="player__meta">Radio · {stationMeta(station)}</p>
        </div>
      </div>
      <div className="player__transport">
        <button type="button" className="player__btn player__play" onClick={toggle} aria-label={paused ? "Play" : "Stop"}><Icon name={paused ? "play" : "pause"} size={20} /></button>
      </div>
      <div className="player__right">
        <p className="player__status" role="status">{status}</p>
        {station.homepage && <a className="btn btn--quiet btn--sm" href={station.homepage} target="_blank" rel="noopener noreferrer">Website<span className="visually-hidden"> (opens in a new tab)</span></a>}
        <button type="button" className="btn btn--ghost btn--sm" onClick={onStop}><Icon name="queue" />Back to your music</button>
      </div>
    </section>
  );
}
