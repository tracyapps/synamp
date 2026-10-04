import { useEffect, useId, useState } from "react";
import "./styles/listening.css";

/* "Listening history & Last.fm": what other apps have reported, and the opt-in scrobbler. */

type Status = {
  other_apps: { plays: number; unmatched: number; by_client: Record<string, number>; last_at: number | null };
  lastfm: {
    configured: boolean; connected: boolean; user?: string; enabled: boolean; needs_reconnect: boolean;
    pending: number; sent: number; held: Array<{ reason: string; count: number }>;
    refused: Array<{ event_id: string; code: number; message: string }>;
    last_error?: string; last_sent_at?: number; retry_at?: number;
  };
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const when = (ms?: number | null) => (ms ? new Date(ms).toLocaleString() : "never");

export default function Listening({ request }: { request: Request }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  const load = () => request<Status>("/listening").then(setStatus).catch((cause) => setMessage((cause as Error).message));
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, 30_000); // picks up a finished Last.fm sign-in in the other tab
    return () => clearInterval(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path: string, body: unknown = {}, done?: string) {
    setBusy(true); setMessage("");
    try {
      const result = await request<{ url?: string }>(path, { method: "POST", body: JSON.stringify(body) });
      if (result.url) {
        window.open(result.url, "_blank", "noopener");
        setMessage("Finish signing in on Last.fm in the new tab, then come back here.");
      } else if (done) setMessage(done);
      await load();
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  const lf = status?.lastfm;
  const clients = Object.entries(status?.other_apps.by_client ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <section className="panel listening" aria-labelledby={titleId}>
      <button type="button" className="listening__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span id={titleId}>Listening history &amp; Last.fm</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="listening__body">
        <div>
          <h3>Plays from your other apps</h3>
          {!status ? <p className="muted">Loading…</p> : status.other_apps.plays === 0 ? (
            <p className="muted">None yet. Point phone and desktop apps (Symfonium, play:Sub, Feishin…) at the SynAmp address — <code>{window.location.origin}</code> — not Navidrome’s own port, and their plays will appear here.</p>
          ) : <>
            <p><strong>{status.other_apps.plays}</strong> {status.other_apps.plays === 1 ? "play" : "plays"} captured · last {when(status.other_apps.last_at)}</p>
            <ul className="listening__clients">{clients.map(([name, count]) => <li key={name}>{name}<span>{count}</span></li>)}</ul>
            {status.other_apps.unmatched > 0 && <p className="muted">{status.other_apps.unmatched} could not be matched to analysed tracks. Check that Navidrome reports real file paths (see deploy notes).</p>}
          </>}
          <p className="muted">Other apps report plays but not skips, so they count as a small “you like this”, never as a dislike.</p>
        </div>
        <div>
          <h3>Last.fm scrobbling</h3>
          {!lf ? null : !lf.configured ? (
            <p className="muted">Off. To offer it, add a Last.fm API key and shared secret under <strong>Settings</strong> (below), then come back here.</p>
          ) : !lf.connected ? <>
            <p className="muted">Send what you play — here and in your other apps — to your Last.fm profile.</p>
            <button type="button" className="primary" disabled={busy} onClick={() => act("/lastfm/connect")}>Connect Last.fm</button>
          </> : <>
            <p>Connected as <strong>{lf.user}</strong></p>
            <button type="button" role="switch" aria-checked={lf.enabled} className={`switch ${lf.enabled ? "is-on" : ""}`} disabled={busy}
              onClick={() => act("/lastfm/settings", { enabled: !lf.enabled }, lf.enabled ? "Scrobbling paused." : "Scrobbling is on.")}>
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Scrobble my plays
            </button>
            {lf.needs_reconnect && <p className="notice notice--warn" role="note">Last.fm stopped accepting this connection. <button type="button" className="linklike" onClick={() => act("/lastfm/connect")}>Reconnect</button></p>}
            <dl className="listening__stats">
              <div><dt>Sent</dt><dd>{lf.sent}</dd></div>
              <div><dt>Waiting</dt><dd>{lf.pending}{lf.retry_at ? ` (retrying ${when(lf.retry_at)})` : ""}</dd></div>
              <div><dt>Last sent</dt><dd>{when(lf.last_sent_at)}</dd></div>
            </dl>
            {lf.held.map((item) => <p key={item.reason} className="muted">Not sent ({item.count}): {item.reason}.</p>)}
            {lf.refused.length > 0 && <details><summary>Refused by Last.fm ({lf.refused.length})</summary>
              <ul>{lf.refused.map((item) => <li key={item.event_id}>{item.message}</li>)}</ul></details>}
            {lf.last_error && <p className="muted">Last problem: {lf.last_error}</p>}
            <div className="listening__actions">
              <button type="button" className="quiet" disabled={busy || !lf.enabled} onClick={() => act("/lastfm/flush", {}, "Sent what was waiting.")}>Send now</button>
              <button type="button" className="quiet" disabled={busy} onClick={() => act("/lastfm/disconnect", {}, "Disconnected from Last.fm.")}>Disconnect</button>
            </div>
            <p className="muted">If you also linked Last.fm inside Navidrome, unlink it there — otherwise plays from your other apps are scrobbled twice.</p>
          </>}
        </div>
        <p className="listening__message" role="status">{message}</p>
      </div>}
    </section>
  );
}
