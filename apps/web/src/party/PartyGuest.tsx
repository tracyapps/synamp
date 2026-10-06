import { useEffect, useState } from "react";
import { useDebounced } from "../Library";
import Icon from "../ui/Icon";
import mark from "../assets/synamp-mark.svg";
import wordmark from "../assets/synamp-wordmark.svg";
import { partyCall, spaced } from "./shared";
import type { PartyView } from "./shared";
import "../styles/party.css";

/*
 * The page a guest's phone opens from the QR code: what's playing, ask for a
 * song, vote for other people's. No account, no app, no access token — the
 * party code in the address is the key, and it stops working when the party ends.
 */

type Found = { id: string; title: string; artist?: string; album?: string };

export default function PartyGuest({ code }: { code: string }) {
  const [view, setView] = useState<PartyView | null>(null);
  const [gone, setGone] = useState("");
  const [name, setName] = useState(() => { try { return localStorage.getItem("synamp-party-name") ?? ""; } catch { return ""; } });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useDebounced(query.trim(), 300);

  const load = () => partyCall<PartyView>(code).then((next) => { setView(next); setGone(""); }).catch((cause) => setGone((cause as Error).message));
  useEffect(() => {
    document.title = "Party — SynAmp";
    load();
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!q) { setFound(null); return; }
    partyCall<{ tracks: Found[] }>(code, `/search?q=${encodeURIComponent(q)}`).then((result) => setFound(result.tracks)).catch((cause) => setMessage((cause as Error).message));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask(track: Found) {
    setBusy(true); setMessage("");
    try { localStorage.setItem("synamp-party-name", name.trim()); } catch { /* fine */ }
    try {
      const next = await partyCall<PartyView>(code, "/request", { method: "POST", body: JSON.stringify({ track_id: track.id, name }) });
      setView(next);
      setMessage(next.auto_add ? `“${track.title}” is in the queue.` : `Asked for “${track.title}”. The host decides what plays.`);
      setQuery("");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }
  async function vote(id: string) {
    try { setView(await partyCall<PartyView>(code, "/vote", { method: "POST", body: JSON.stringify({ request_id: id }) })); }
    catch (cause) { setMessage((cause as Error).message); }
  }

  return (
    <div className="guest">
      <header className="guest__bar"><span className="brand" role="img" aria-label="SynAmp"><img className="brand-mark" src={mark} alt="" width={30} height={30} /><img src={wordmark} alt="" width={74} height={20} /></span><span className="badge badge--live"><span className="status-dot status-dot--live" aria-hidden="true" />Party {spaced(code)}</span></header>
      <main className="guest__main" id="main">
        <h1 className="guest__title">Ask for a song</h1>
        {gone ? <div className="callout callout--warn" role="alert"><span className="callout__icon"><Icon name="warn" size={22} /></span><div><h2 className="callout__title">Can’t find this party</h2><p>{gone}. Check the code with the host.</p></div></div> : <>
          <section className="section-card guest__now" aria-label="Now playing">
            <p className="eyebrow">{view?.now?.playing ? "Playing now" : "Up now"}</p>
            {view?.now ? <><p className="guest__song">{view.now.title}</p><p className="muted">{[view.now.artist, view.now.requested_by && `asked for by ${view.now.requested_by}`].filter(Boolean).join(" · ")}</p></>
              : <p className="muted">Nothing’s playing yet.</p>}
            {view && view.next.length > 0 && <>
              <h2 className="guest__h">Next</h2>
              <ol className="guest__next">{view.next.map((item, index) => <li key={index}>{item.title}{item.artist && <span className="muted"> · {item.artist}</span>}</li>)}</ol>
            </>}
          </section>

          <section className="section-card guest__ask" aria-labelledby="guest-ask">
            <h2 id="guest-ask" className="guest__h">Find a song</h2>
            <div className="search">
              <Icon name="search" />
              <input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Song or artist" aria-label="Search for a song or artist" autoComplete="off" enterKeyHint="search" />
            </div>
            <label className="guest__name">Your name <span className="muted">(optional, so the host knows who asked)</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={30} autoComplete="given-name" /></label>
            {found && (found.length === 0 ? <p className="muted">Nothing matches “{q}”.</p> : (
              <ul className="guest__found">
                {found.map((track) => (
                  <li key={track.id}>
                    <span className="request__text"><span className="request__title">{track.title}</span><small>{[track.artist, track.album].filter(Boolean).join(" · ")}</small></span>
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => ask(track)}>Ask<span className="visually-hidden"> for {track.title}</span></button>
                  </li>
                ))}
              </ul>
            ))}
            <p className="guest__message" role="status">{message}</p>
          </section>

          <section className="section-card" aria-labelledby="guest-requests">
            <h2 id="guest-requests" className="guest__h">Asked for</h2>
            {!view?.requests.length ? <p className="muted">{view?.auto_add ? "Requests go straight into the queue tonight." : "No requests waiting. Be the first!"}</p> : (
              <ol className="requests">
                {view.requests.map((item) => (
                  <li key={item.id} className="request">
                    <button type="button" className="request__vote" aria-pressed={!!item.voted} onClick={() => vote(item.id)}>
                      <Icon name="heart" size={16} /><span>{item.votes}</span><span className="visually-hidden"> {item.votes === 1 ? "vote" : "votes"} — vote for {item.title}</span>
                    </button>
                    <span className="request__text"><span className="request__title">{item.title}</span>
                      <small>{[item.artist, item.mine ? "yours" : item.name ? `asked for by ${item.name}` : ""].filter(Boolean).join(" · ")}</small></span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>}
      </main>
    </div>
  );
}
