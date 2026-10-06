import { useEffect, useId, useState } from "react";
import type { Request } from "../api";
import type { SessionView } from "../Player";
import Icon from "../ui/Icon";
import { EmptyState, ScreenHead, SectionCard } from "../ui/kit";
import { joinUrl, qrSvg, spaced } from "./shared";
import "../styles/party.css";

/*
 * The host's side of a party: start it, show the QR code, and answer requests.
 * Guests use /party/CODE (PartyGuest.tsx); a TV can show /party/CODE/screen.
 */

type HostView = {
  party: { code: string; started_at: number; auto_add: boolean } | null;
  requests: Array<{ id: string; track_id: string; title: string; artist?: string; name?: string; votes: number; at: number }>;
  address: string;
};

export default function PartyHost({ request, headingId, onSession }: { request: Request; headingId: string; onSession: (session: SessionView) => void }) {
  const [view, setView] = useState<HostView | null>(null);
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useId();

  const load = () => request<HostView>("/party-host").then(setView).catch((cause) => setMessage((cause as Error).message));
  useEffect(() => { load(); const timer = setInterval(load, 5_000); return () => clearInterval(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const url = view?.party ? joinUrl(view.address, view.party.code) : "";
  useEffect(() => { if (url) qrSvg(url).then(setQr).catch(() => setQr("")); else setQr(""); }, [url]);

  async function act(path: string, body: unknown, said = "") {
    setBusy(true); setMessage("");
    try {
      const next = await request<HostView & { session?: SessionView }>(`/party-host${path}`, { method: "POST", body: JSON.stringify(body) });
      setView(next);
      if (next.session) onSession(next.session);
      if (said) setMessage(said);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  const party = view?.party;
  return (
    <div className="screen">
      <ScreenHead id={headingId} eyebrow="Listen" title="Party">
        <p>Friends scan a code and ask for songs from their phones — no app, no account. Requests wait for you to say yes, so you stay in charge of the music.</p>
      </ScreenHead>
      {!view ? <p className="muted">Loading…</p> : !party ? (
        <SectionCard title="Start a party" labelledBy={`${ids}-start`}>
          <EmptyState icon="phone" title="No party on">Starting one makes a code that’s good until you end the party. Guests see what’s playing, what’s next and the songs they search for — nothing else in your library.</EmptyState>
          <div className="cluster party__start">
            <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={() => act("/start", { auto_add: false }, "The party’s on. Show guests the code.")}>Start a party</button>
          </div>
          {!view.address && <p className="muted party__hint">The QR code will use this browser’s address. If guests’ phones reach SynAmp at a different address, set “SynAmp’s address” in Settings first.</p>}
        </SectionCard>
      ) : <>
        <section className="section-card party__join" aria-labelledby={`${ids}-join`}>
          <div className="party__qr" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="party__join-text">
            <p className="eyebrow">The party’s on</p>
            <h2 id={`${ids}-join`} className="party__code"><span className="visually-hidden">Party code </span>{spaced(party.code)}</h2>
            <p>Guests scan the code, or open <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")}<span className="visually-hidden"> (opens in a new tab)</span></a> — on the same Wi-Fi as SynAmp, or on your Tailscale.</p>
            <div className="cluster">
              <a className="btn btn--ghost" href={`${url}/screen`} target="_blank" rel="noopener noreferrer"><Icon name="radio" />Big screen for the TV<span className="visually-hidden"> (opens in a new tab)</span></a>
              <button type="button" className="btn btn--quiet btn--sm" disabled={busy}
                onClick={() => { if (confirm("End the party? The code stops working and waiting requests are cleared.")) act("/end", {}, "The party’s over. The code no longer works."); }}>End the party</button>
            </div>
            <button type="button" role="switch" aria-checked={party.auto_add} className={`switch ${party.auto_add ? "is-on" : ""}`} disabled={busy}
              onClick={() => act("/settings", { auto_add: !party.auto_add }, party.auto_add ? "Requests will wait for you again." : "Requests go straight into the queue now, first come first served.")}>
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Add requests by themselves
            </button>
          </div>
        </section>
        <SectionCard title="Requests" meta={view.requests.length ? `${view.requests.length} waiting · most votes first` : "none waiting"} labelledBy={`${ids}-requests`}>
          {view.requests.length === 0 ? <p className="muted">{party.auto_add ? "Requests are going straight into the queue." : "When guests ask for songs, they show up here."}</p> : (
            <ol className="requests">
              {view.requests.map((item) => (
                <li key={item.id} className="request">
                  <span className="request__votes mono" aria-label={`${item.votes} ${item.votes === 1 ? "vote" : "votes"}`}>{item.votes}</span>
                  <span className="request__text"><span className="request__title">{item.title}</span>
                    <small>{[item.artist, item.name ? `asked for by ${item.name}` : "asked for by a guest"].filter(Boolean).join(" · ")}</small></span>
                  <span className="cluster">
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act("/play-next", { id: item.id }, `“${item.title}” plays next.`)}>Play next<span className="visually-hidden">: {item.title}</span></button>
                    <button type="button" className="btn btn--quiet btn--sm" disabled={busy} onClick={() => act("/dismiss", { id: item.id })}>Dismiss<span className="visually-hidden">: {item.title}</span></button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </>}
      <p className="party__message" role="status">{message}</p>
    </div>
  );
}
