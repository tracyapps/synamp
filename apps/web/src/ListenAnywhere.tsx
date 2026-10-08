import { useEffect, useId, useState } from "react";
import "./styles/listen-anywhere.css";

/*
 * "Listen anywhere": Phase 1 as a checklist — your music on your phone, at home
 * and away, through any Subsonic app. Most steps happen outside SynAmp, so you
 * tick them; two are checked for real (see apps/brain/src/setup.ts).
 */

type ManualStep = "navidrome_account" | "tailscale_nas" | "tailscale_phone" | "app_installed" | "away_test";
type Setup = {
  done: Partial<Record<ManualStep, number>>;
  tailscale_name?: string;
  checks: {
    navidrome: { ok: boolean; problem?: string };
    other_apps: Array<{ name: string; plays: number; last_at: number }>;
  };
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function NewTab({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span className="visually-hidden"> (opens in a new tab)</span></a>;
}

function Address({ label, value, onCopied }: { label: string; value: string; onCopied: (text: string) => void }) {
  return (
    <div className="anywhere__address">
      <span className="anywhere__address-label">{label}</span>
      <code>{value}</code>
      <button type="button" className="btn btn--ghost btn--sm" aria-label={`Copy ${label.toLowerCase()} address`}
        onClick={() => navigator.clipboard?.writeText(value).then(() => onCopied(`Copied ${value}`), () => onCopied("Couldn’t copy — select the address and copy it instead."))}>Copy</button>
    </div>
  );
}

export default function ListenAnywhere({ request, startOpen = false }: { request: Request; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const id = useId();

  const show = (next: Setup) => { setSetup(next); setName(next.tailscale_name ?? ""); };
  const load = () => request<Setup>("/setup").then((next) => { setSetup(next); setName((current) => current || next.tailscale_name || ""); })
    .catch((cause) => setProblem((cause as Error).message));
  // Load once for the progress in the heading; while open, re-check every 30 s (apps connecting, Navidrome starting).
  useEffect(() => {
    load();
    if (!open) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(body: Record<string, unknown>, done?: string) {
    setProblem(""); setMessage("");
    try {
      show(await request<Setup>("/setup", { method: "POST", body: JSON.stringify(body) }));
      if (done) setMessage(done);
    } catch (cause) { setProblem((cause as Error).message); }
  }

  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : "";
  const here = window.location.origin;
  const away = setup?.tailscale_name ? `${window.location.protocol}//${setup.tailscale_name}${port}` : "";

  const auto = {
    navidrome_running: !!setup?.checks.navidrome.ok,
    apps_heard: !!setup?.checks.other_apps.length,
  };
  const ticked = (step: ManualStep) => !!setup?.done[step];
  const total = 7;
  const count = setup ? [auto.navidrome_running, auto.apps_heard].filter(Boolean).length
    + (["navidrome_account", "tailscale_nas", "tailscale_phone", "app_installed", "away_test"] as const).filter(ticked).length : 0;

  // Plain functions, not components: a component defined in here would be re-created on
  // every render, and the checkbox you just pressed would lose keyboard focus.
  const tick = (step: ManualStep) => (
    <label className="organise__check anywhere__tick">
      <input type="checkbox" checked={ticked(step)} onChange={(e) => save({ step, done: e.target.checked })} />
      <span>I’ve done this</span>
    </label>
  );
  const state = (done: boolean) => (
    <span className={`anywhere__state ${done ? "is-done" : ""}`}><span aria-hidden="true">{done ? "✓" : "○"}</span> {done ? "Done" : "Not yet"}</span>
  );

  return (
    <section className="panel anywhere" aria-labelledby={`${id}-title`}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <span id={`${id}-title`}>Listen anywhere{setup ? ` — ${count} of ${total} steps done` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="anywhere__body" id={`${id}-body`}>
        <p className="anywhere__intro">Your music on your phone and laptop, at home and away, in a proper music app with lock-screen controls. This is the step that lets you cancel a streaming subscription. Nothing here changes your music files.</p>
        {!setup ? <p className="muted">{problem || "Loading…"}</p> : <>
          {count === total && <p className="anywhere__all-done" role="status">All done — your library goes where you go.</p>}
          <ol className="anywhere__steps">
            <li>
              <div className="anywhere__step-head"><h3>Navidrome is running</h3>{state(auto.navidrome_running)}</div>
              <p>Navidrome is the part of SynAmp that music apps talk to. {auto.navidrome_running ? "It’s answering." : <>
                {setup.checks.navidrome.problem}. In DSM: <strong>Container Manager → Container → synamp-core-1 → Start</strong>.</>}</p>
              <p className="muted">Checked automatically.</p>
            </li>
            <li>
              <div className="anywhere__step-head"><h3>Create your Navidrome account</h3>{state(ticked("navidrome_account"))}</div>
              <p>Open <NewTab href={`${window.location.protocol}//${host}:4533/`}>Navidrome</NewTab> and create the first account (it becomes the admin). Your music apps sign in with this user name and password. The first time, Navidrome reads the whole library — a few minutes.</p>
              {tick("navidrome_account")}
            </li>
            <li>
              <div className="anywhere__step-head"><h3>Put Tailscale on the NAS</h3>{state(ticked("tailscale_nas"))}</div>
              <p>Tailscale is a private network between your own devices, so your phone can reach the NAS from anywhere without opening it to the internet. In DSM: <strong>Package Center</strong> → search “Tailscale” → <strong>Install</strong> → open it and sign in (a free account). <NewTab href="https://tailscale.com/kb/1131/synology">Tailscale’s Synology guide</NewTab> has pictures.</p>
              <form className="anywhere__name" onSubmit={(e) => { e.preventDefault(); save({ tailscale_name: name }, name ? "Saved the NAS’s Tailscale name." : "Cleared."); }}>
                <label htmlFor={`${id}-ts`}>The NAS’s name on Tailscale</label>
                <div className="anywhere__name-row">
                  <input id={`${id}-ts`} type="text" spellCheck={false} autoCapitalize="none" value={name} placeholder="e.g. syd or syd.tail1234.ts.net"
                    onChange={(e) => setName(e.target.value)} aria-describedby={`${id}-ts-hint`} />
                  <button type="submit" className="btn btn--ghost btn--sm">Save</button>
                </div>
                <p className="muted" id={`${id}-ts-hint`}>It’s listed in the Tailscale app on any of your devices, and at <NewTab href="https://login.tailscale.com/admin/machines">login.tailscale.com/admin/machines</NewTab>. SynAmp uses it to show the address for when you’re away.</p>
              </form>
              {tick("tailscale_nas")}
            </li>
            <li>
              <div className="anywhere__step-head"><h3>Put Tailscale on your phone</h3>{state(ticked("tailscale_phone"))}</div>
              <p>Install Tailscale from the App Store or Google Play, sign in with the same account, and leave it switched on. Do the same on a laptop you take out of the house.</p>
              {tick("tailscale_phone")}
            </li>
            <li>
              <div className="anywhere__step-head"><h3>Install a music app and add SynAmp</h3>{state(ticked("app_installed"))}</div>
              <p>Any Subsonic-compatible app works. <NewTab href="https://www.navidrome.org/apps/">Navidrome’s list of apps</NewTab> covers iPhone, Android, Mac and Windows, free and paid. When the app asks for a server, use:</p>
              <Address label="At home" value={here} onCopied={setMessage} />
              {away ? <Address label="Anywhere (Tailscale)" value={away} onCopied={setMessage} />
                : <p className="muted">Save the NAS’s Tailscale name above to see the address for when you’re away.</p>}
              <p>Sign in with your Navidrome user name and password. Use these addresses — not Navidrome’s own <code>:4533</code> — or your plays won’t reach SynAmp.</p>
              <div className="anywhere__tip">
                <h4>Save mobile data</h4>
                <p>Most apps let you pick a smaller stream for mobile data and keep full quality on Wi-Fi. Look in the app’s settings for <strong>Streaming</strong>, <strong>Transcoding</strong> or <strong>Max bitrate</strong>, and choose <strong>128</strong> or <strong>160 kbps</strong> for mobile data and <strong>Original</strong> (or “Unlimited”) for Wi-Fi. Your NAS makes the smaller copy as you listen.</p>
                <p className="muted">If an app has no such setting, Navidrome can cap it instead: in <NewTab href={`${window.location.protocol}//${host}:4533/app/#/player`}>Navidrome → Players</NewTab>, open the app and set <strong>Max bit rate</strong>. That cap applies on Wi-Fi too.</p>
              </div>
              {tick("app_installed")}
            </li>
            <li>
              <div className="anywhere__step-head"><h3>SynAmp hears your apps</h3>{state(auto.apps_heard)}</div>
              {auto.apps_heard ? <>
                <p>Plays are coming in from:</p>
                <ul className="anywhere__apps">{setup.checks.other_apps.map((app) => (
                  <li key={app.name}><strong>{app.name}</strong> — {app.plays} {app.plays === 1 ? "play" : "plays"}, last {when(app.last_at)}</li>
                ))}</ul>
              </> : <p>Play a song in the app for a little while. It shows up here within a minute (this page checks every 30 seconds). Nothing yet? The app is probably connected to <code>:4533</code> instead of the addresses above.</p>}
              <p className="muted">Checked automatically.</p>
            </li>
            <li>
              <div className="anywhere__step-head"><h3>Play something away from home</h3>{state(ticked("away_test"))}</div>
              <p>On your phone, turn Wi-Fi off (keep Tailscale on) and play a song. If it plays, you’re done. If it doesn’t: check Tailscale is on, and that the app uses the “Anywhere” address.</p>
              {tick("away_test")}
            </li>
          </ol>
          <p className={problem ? "alert" : ""} role="alert">{problem}</p>
          <p className="muted" role="status">{message}</p>
        </>}
      </div>}
    </section>
  );
}
