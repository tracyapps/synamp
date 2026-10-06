import { useEffect, useId, useState } from "react";
import type { Request } from "./api";
import Icon from "./ui/Icon";

/*
 * "On your phone": SynAmp's playlists, sent to Navidrome so Symfonium, play:Sub,
 * Feishin and the rest show them. The brain does the work
 * (apps/brain/src/subsonic/playlist-sync.ts); this is the switch and the status.
 */

type View = {
  signed_in: boolean; user?: string; auto: boolean; running: boolean; playlists: number;
  last?: { at: number; sent: number; removed: number; missing: number; error?: string };
  details: Array<{ name: string; songs: number; missing: number; sent_at: number }>;
};

const ago = (ms: number) => {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString();
};

export default function PhonePlaylists({ request }: { request: Request }) {
  const [view, setView] = useState<View | null>(null);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ids = useId();

  const load = () => request<View>("/phone-playlists").then(setView).catch((cause) => setMessage((cause as Error).message));
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path: string, body: unknown, done: (next: View) => string) {
    setBusy(true); setMessage("");
    try {
      const next = await request<View>(path, { method: "POST", body: JSON.stringify(body) });
      setView(next);
      setMessage(done(next));
    } catch (cause) { setMessage((cause as Error).message); load(); } finally { setBusy(false); }
  }
  const sentSummary = (next: View) => `${next.playlists} ${next.playlists === 1 ? "playlist is" : "playlists are"} on your phone apps now.`;

  return (
    <section className="section-card phone" aria-labelledby={`${ids}-title`}>
      <div className="section-card__head">
        <div><h2 id={`${ids}-title`} className="section-card__title">On your phone</h2>
          <p className="section-card__meta">Your playlists in Symfonium, play:Sub, Feishin and other Subsonic apps</p></div>
        {view?.signed_in && <span className={`badge ${view.last?.error ? "badge--muted" : "badge--live"}`}>
          <span className={`status-dot ${view.last?.error ? "" : "status-dot--live"}`} aria-hidden="true" />{view.last?.error ? "Needs a look" : view.auto ? "Kept up to date" : "Sent by hand"}</span>}
      </div>
      <div className="section-card__body">
        {!view ? <p className="muted">Loading…</p> : !view.signed_in ? (
          <form className="phone__form" onSubmit={(event) => {
            event.preventDefault();
            act("/phone-playlists/sign-in", { user, password }, (next) => { setPassword(""); return `Signed in. ${sentSummary(next)}`; });
          }}>
            <p className="phone__intro">Phone apps get their playlists from Navidrome, and Navidrome keeps a separate set for each account. Sign in with the
              {" "}<strong>Navidrome account your phone uses</strong> and SynAmp will put every playlist there — folders become part of the name, like “Evenings › Slow burn”.</p>
            {view.last?.error && <p className="alert" role="alert">{view.last.error}. Sign in again to carry on.</p>}
            <div className="phone__fields">
              <label>Navidrome user name<input value={user} onChange={(event) => setUser(event.target.value)} autoComplete="username" required /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
              <button className="btn btn--primary" disabled={busy}><Icon name="phone" />{busy ? "Sending…" : "Sign in and send"}</button>
            </div>
            <p className="muted phone__note">SynAmp checks the password with Navidrome and keeps only a scrambled token, never the password itself.</p>
          </form>
        ) : <>
          <p className="phone__status">
            <strong>{view.playlists} {view.playlists === 1 ? "playlist" : "playlists"}</strong> on Navidrome for <strong>{view.user}</strong>
            {view.last && !view.last.error ? <>, sent {ago(view.last.at)}.</> : "."}
            {view.last && view.last.missing > 0 && <> {view.last.missing} {view.last.missing === 1 ? "song isn’t" : "songs aren’t"} in Navidrome yet, so {view.last.missing === 1 ? "it’s" : "they’re"} left out until Navidrome’s next scan.</>}
          </p>
          {view.last?.error && <p className="alert" role="alert">The last send didn’t finish: {view.last.error}</p>}
          <p className="muted phone__note">SynAmp’s copy wins: change these playlists here, not in the phone app — edits there are replaced on the next send. Playlists you made in the phone app are left alone.</p>
          <button type="button" role="switch" aria-checked={view.auto} className={`switch ${view.auto ? "is-on" : ""}`} disabled={busy}
            onClick={() => act("/phone-playlists/settings", { auto: !view.auto }, (next) => next.auto ? "Will keep them up to date." : "Will only send when you press Send now.")}>
            <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
            Keep them up to date automatically
          </button>
          <p className="muted phone__note">After every change, and every half hour for smart playlists.</p>
          <div className="cluster" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--ghost" disabled={busy || view.running} onClick={() => act("/phone-playlists/send", {}, sentSummary)}>{busy ? "Sending…" : "Send now"}</button>
            <button type="button" className="btn btn--quiet btn--sm" disabled={busy}
              onClick={() => { if (confirm("Stop sending playlists? The ones already on your phone stay there until you delete them.")) act("/phone-playlists/sign-out", {}, () => "Signed out. Nothing more will be sent."); }}>Sign out</button>
          </div>
          {view.details.length > 0 && <details className="phone__details">
            <summary>What’s on your phone ({view.details.length})</summary>
            <ul>{view.details.map((item) => <li key={item.name}><span>{item.name}</span><span className="mono muted">{item.songs} {item.songs === 1 ? "song" : "songs"}{item.missing ? ` · ${item.missing} not in Navidrome yet` : ""}</span></li>)}</ul>
          </details>}
        </>}
        <p className="phone__message" role="status">{message}</p>
      </div>
    </section>
  );
}
