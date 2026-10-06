import { useEffect, useId, useState } from "react";
import "./styles/settings.css";
import { AboutInstall } from "./Updates";

/*
 * Settings: the things you used to change in deploy/.env, now saved from here.
 * The server file still gives the starting values. Saved values win, take effect
 * straight away (no restart), and clearing a field goes back to the server file.
 * Secrets are never sent back to the browser: only "saved" or not.
 */

type Origin = "app" | "server" | "unset";
type Values = {
  musicbrainz_contact: string;
  lastfm_api_key: string; // "…last4" or ""
  lastfm_api_secret: string; // "set" or ""
  public_url: string;
  upload_max_mb: number;
  origins: Record<"musicbrainz_contact" | "lastfm_api_key" | "lastfm_api_secret" | "public_url" | "upload_max_mb", Origin>;
};
type View = { settings: Values; lastfm_configured: boolean; changed?: string[] };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const ORIGIN_TEXT: Record<Origin, string> = {
  app: "Saved here.",
  server: "From the server file (deploy/.env).",
  unset: "Not set.",
};

export default function Settings({ request, startOpen = false }: { request: Request; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [view, setView] = useState<View | null>(null);
  const [contact, setContact] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [uploadMb, setUploadMb] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  function show(next: View) {
    setView(next);
    setContact(next.settings.musicbrainz_contact);
    setPublicUrl(next.settings.public_url);
    setUploadMb(String(next.settings.upload_max_mb));
    setApiKey("");
    setSecret("");
  }
  useEffect(() => {
    if (!open) return;
    request<View>("/settings").then(show).catch((cause) => setProblem((cause as Error).message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(changes: Record<string, string>, done: string) {
    if (!Object.keys(changes).length) { setMessage("Nothing changed."); return; }
    setBusy(true); setMessage(""); setProblem("");
    try {
      show(await request<View>("/settings", { method: "POST", body: JSON.stringify(changes) }));
      setMessage(done);
    } catch (cause) { setProblem((cause as Error).message); } finally { setBusy(false); }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!view) return;
    const s = view.settings;
    // Send only what changed, so an untouched value from the server file stays "from the server file".
    const changes: Record<string, string> = {};
    if (contact.trim() !== s.musicbrainz_contact) changes.musicbrainz_contact = contact;
    if (publicUrl.trim() !== s.public_url) changes.public_url = publicUrl;
    if (uploadMb.trim() !== String(s.upload_max_mb)) changes.upload_max_mb = uploadMb;
    if (apiKey.trim()) changes.lastfm_api_key = apiKey;
    if (secret.trim()) changes.lastfm_api_secret = secret;
    save(changes, "Saved. It’s in use now.");
  }

  const s = view?.settings;
  const hint = (field: keyof Values["origins"], extra?: string) =>
    s ? `${ORIGIN_TEXT[s.origins[field]]}${extra ? ` ${extra}` : ""}` : "";

  return (
    <section className="panel settings" aria-labelledby={`${id}-title`}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <span id={`${id}-title`}>Settings</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="settings__body" id={`${id}-body`}>
        {!s ? <p className="muted">{problem || "Loading…"}</p> : (
          <form onSubmit={submit} noValidate>
            <p className="muted settings__intro">Changes take effect as soon as you save. Clearing a field goes back to the server file’s value.</p>

            <fieldset className="settings__group">
              <legend>MusicBrainz</legend>
              <label htmlFor={`${id}-contact`}>Contact for MusicBrainz</label>
              <input id={`${id}-contact`} type="text" inputMode="email" autoComplete="email" value={contact}
                onChange={(event) => setContact(event.target.value)} aria-describedby={`${id}-contact-hint`} />
              <p className="settings__hint" id={`${id}-contact-hint`}>
                {hint("musicbrainz_contact", "An email or web address. MusicBrainz asks for one so they can reach you if something goes wrong; it’s sent only to musicbrainz.org. Needed for missing tracks and discography gaps.")}
              </p>
            </fieldset>

            <fieldset className="settings__group">
              <legend>Last.fm</legend>
              <p className="settings__hint">
                Needed only for scrobbling. Create an API account at{" "}
                <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">last.fm/api/account/create<span className="visually-hidden"> (opens in a new tab)</span></a>,
                then paste the two values here. {view.lastfm_configured ? "Scrobbling can be switched on under Listening history." : ""}
              </p>
              <label htmlFor={`${id}-key`}>API key</label>
              <input id={`${id}-key`} type="password" autoComplete="off" spellCheck={false} value={apiKey}
                placeholder={s.lastfm_api_key ? `Saved (ends ${s.lastfm_api_key.slice(1)}) — type to replace` : "32 letters and numbers"}
                onChange={(event) => setApiKey(event.target.value)} aria-describedby={`${id}-key-hint`} />
              <p className="settings__hint" id={`${id}-key-hint`}>
                {hint("lastfm_api_key", s.lastfm_api_key ? `Ends in ${s.lastfm_api_key.slice(1)}. Leave empty to keep it.` : "")}
              </p>
              <label htmlFor={`${id}-secret`}>Shared secret</label>
              <input id={`${id}-secret`} type="password" autoComplete="off" spellCheck={false} value={secret}
                placeholder={s.lastfm_api_secret ? "Saved — type to replace" : "32 letters and numbers"}
                onChange={(event) => setSecret(event.target.value)} aria-describedby={`${id}-secret-hint`} />
              <p className="settings__hint" id={`${id}-secret-hint`}>
                {hint("lastfm_api_secret", s.lastfm_api_secret ? "Leave empty to keep it." : "")}
              </p>
              {(s.origins.lastfm_api_key === "app" || s.origins.lastfm_api_secret === "app") &&
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
                  onClick={() => save({ lastfm_api_key: "", lastfm_api_secret: "" }, "Removed the Last.fm key and secret saved here.")}>
                  Remove the saved key and secret
                </button>}
            </fieldset>

            <fieldset className="settings__group">
              <legend>This server</legend>
              <label htmlFor={`${id}-url`}>SynAmp’s address</label>
              <input id={`${id}-url`} type="url" inputMode="url" spellCheck={false} value={publicUrl} placeholder={window.location.origin}
                onChange={(event) => setPublicUrl(event.target.value)} aria-describedby={`${id}-url-hint`} />
              <p className="settings__hint" id={`${id}-url-hint`}>
                {hint("public_url", "Where Last.fm sends you back after signing in. Leave empty to use the address in your browser.")}
              </p>
              <label htmlFor={`${id}-upload`}>Largest file you can add (MB)</label>
              <input id={`${id}-upload`} type="number" inputMode="numeric" min={1} max={20480} step={1} value={uploadMb}
                onChange={(event) => setUploadMb(event.target.value)} aria-describedby={`${id}-upload-hint`} />
              <p className="settings__hint" id={`${id}-upload-hint`}>
                {hint("upload_max_mb", "For files added with Add music. 1 to 20480.")}
              </p>
            </fieldset>

            <AboutInstall request={request} />

            <div className="settings__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
            </div>
            <p className={problem ? "alert settings__problem" : "settings__problem"} role="alert">{problem}</p>
            <p className="muted" role="status">{message}</p>
            <p className="settings__hint">Folders, passwords, the access token and the user the containers run as stay in the server file: they’re about the install itself.</p>
          </form>
        )}
      </div>}
    </section>
  );
}
