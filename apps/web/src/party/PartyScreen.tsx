import { useEffect, useState } from "react";
import logo from "../assets/synamp-logo.svg";
import { joinUrl, partyCall, qrSvg, spaced } from "./shared";
import type { PartyView } from "./shared";
import "../styles/party.css";

/*
 * The big screen: a TV or an old iPad shows what's playing, what's next, the
 * top requests, and how to join. Read-only — it can't change anything.
 */
export default function PartyScreen({ code }: { code: string }) {
  const [view, setView] = useState<PartyView | null>(null);
  const [gone, setGone] = useState("");
  const [qr, setQr] = useState("");
  const url = joinUrl("", code);

  useEffect(() => {
    document.title = "Now playing — SynAmp";
    const load = () => partyCall<PartyView>(code).then((next) => { setView(next); setGone(""); }).catch((cause) => setGone((cause as Error).message));
    load();
    const timer = setInterval(load, 4_000);
    qrSvg(url).then(setQr).catch(() => undefined);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="tv">
      <span className="amp amp--live tv__amp" aria-hidden="true" />
      <header className="tv__bar"><img src={logo} alt="SynAmp" width={160} height={39} /></header>
      {gone ? <h1 className="tv__song">This party has ended.</h1> : (
        <div className="tv__grid">
          <section className="tv__now" aria-live="polite">
            <p className="eyebrow">{view?.now?.playing ? "Now playing" : "Up now"}</p>
            <h1 className="tv__song">{view?.now?.title ?? "Waiting for the first song"}</h1>
            {view?.now && <p className="tv__artist">{view.now.artist}{view.now.requested_by && <span className="tv__by"> · asked for by {view.now.requested_by}</span>}</p>}
            {view && view.next.length > 0 && <>
              <h2 className="tv__h">Next</h2>
              <ol className="tv__list">{view.next.slice(0, 4).map((item, index) => <li key={index}>{item.title}{item.artist && <span> · {item.artist}</span>}{item.requested_by && <span className="tv__by"> · for {item.requested_by}</span>}</li>)}</ol>
            </>}
          </section>
          <aside className="tv__side">
            <div className="tv__qr" role="img" aria-label={`QR code to join: ${url}`} dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="tv__join">Scan to ask for a song<br /><span className="tv__code">{spaced(code)}</span></p>
            {view && view.requests.length > 0 && <>
              <h2 className="tv__h">Most wanted</h2>
              <ol className="tv__list tv__list--small">{view.requests.slice(0, 5).map((item) => <li key={item.id}>{item.title}<span> · {item.votes} {item.votes === 1 ? "vote" : "votes"}</span></li>)}</ol>
            </>}
          </aside>
        </div>
      )}
    </main>
  );
}
