import { useCallback, useEffect, useId, useRef, useState } from "react";

/*
 * Updating SynAmp: which version is running, and a notice when a newer copy is
 * on the NAS waiting for Build in Container Manager (the brain compares the two;
 * see apps/brain/src/version.ts).
 */

export type VersionView = {
  /** `version`: the release number, only on installs from a GitHub release. */
  running: { fingerprint: string; short: string; built_at: number; version?: string } | null;
  copy: "same" | "waiting" | "unknown";
  copied_at?: number;
  checked_at: number;
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
/** DSM's own web page: same machine, its standard port. */
const dsmUrl = () => `${window.location.protocol}//${window.location.hostname}:${window.location.protocol === "https:" ? 5001 : 5000}/`;

/** Every useVersion on the page shows the same answer: whichever one asks, all of them hear it. */
const VERSION_EVENT = "synamp:version";

/** Polls every few minutes, and when you come back to the tab. `check()` asks the brain to look again now. */
export function useVersion(request: Request, everyMs = 5 * 60_000) {
  const [version, setVersion] = useState<VersionView | null>(null);
  // The latest request function, without re-running the effect on every render.
  const requestRef = useRef(request);
  requestRef.current = request;
  const load = useCallback((fresh = false) =>
    requestRef.current<{ version: VersionView }>(`/system${fresh ? "?fresh=1" : ""}`)
      .then((r) => { window.dispatchEvent(new CustomEvent(VERSION_EVENT, { detail: r.version })); })
      .catch(() => undefined),
  []);
  useEffect(() => {
    const onVersion = (event: Event) => setVersion((event as CustomEvent<VersionView>).detail);
    window.addEventListener(VERSION_EVENT, onVersion);
    load();
    const timer = setInterval(() => load(), everyMs);
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener(VERSION_EVENT, onVersion);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load, everyMs]);
  return { version, check: () => load(true) };
}

const RELEASES = "https://github.com/tracyapps/synamp/releases";

// --- "A new SynAmp is available" (apps/brain/src/updates.ts) ---------------------

export type Release = { version: string; name: string; notes: string; url: string; published_at: string; prerelease: boolean };
export type UpdatesView = {
  enabled: boolean;
  beta: boolean;
  current: string | null;
  available: Release | null;
  newer: Release | null;
  skipped: string | null;
  remind_after: number | null;
  checked_at: number | null;
  error: string | null;
  show_notice: boolean;
};
const UPDATES_EVENT = "synamp:updates";
const day = (iso: string | number) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

/** The brain does the checking; this reads its answer (cheap, local) and shares it with the page. */
export function useUpdates(request: Request, everyMs = 10 * 60_000) {
  const [updates, setUpdates] = useState<UpdatesView | null>(null);
  const requestRef = useRef(request);
  requestRef.current = request;
  const share = (view: UpdatesView) => window.dispatchEvent(new CustomEvent(UPDATES_EVENT, { detail: view }));
  const load = useCallback(() =>
    requestRef.current<{ updates: UpdatesView }>("/system/updates").then((r) => share(r.updates)).catch(() => undefined), []);
  useEffect(() => {
    const onUpdates = (event: Event) => setUpdates((event as CustomEvent<UpdatesView>).detail);
    window.addEventListener(UPDATES_EVENT, onUpdates);
    load();
    const timer = setInterval(load, everyMs);
    return () => { clearInterval(timer); window.removeEventListener(UPDATES_EVENT, onUpdates); };
  }, [load, everyMs]);
  /** check | skip | remind | notice-seen. Resolves to the new view; throws with the brain's words. */
  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const r = await requestRef.current<{ updates: UpdatesView }>("/system/updates", { method: "POST", body: JSON.stringify({ action, ...extra }) });
    share(r.updates);
    return r.updates;
  }, []);
  return { updates, reload: load, act };
}

/**
 * Release notes as plain, safe text: headings, bullet lists and paragraphs.
 * Markdown links keep their words; no HTML from the release is ever inserted.
 */
export function ReleaseNotes({ text }: { text: string }) {
  const plain = (line: string) => line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, "$1").trim();
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>);
    items = [];
  };
  for (const raw of text.split(/\r?\n/).slice(0, 80)) {
    const line = raw.trim();
    if (!line || /^```/.test(line)) { flush(); continue; }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) { items.push(plain(bullet[1]!)); continue; }
    flush();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    blocks.push(heading ? <p key={blocks.length} className="update__notes-heading"><strong>{plain(heading[1]!)}</strong></p> : <p key={blocks.length}>{plain(line)}</p>);
  }
  flush();
  return <div className="update__notes">{blocks.length ? blocks : <p>No notes for this release.</p>}</div>;
}

const CHECK_NOTE = "SynAmp checks GitHub’s public list of releases twice a day, so it can tell you when a new version is out. It sends nothing about you or your music.";

/** Top of the Library screen: a newer release, and once, what the check does. */
export function UpdateAvailable({ request }: { request: Request }) {
  const { updates, act } = useUpdates(request);
  const titleId = useId();
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  if (!updates) return null;
  const release = updates.available;
  const run = async (action: string, extra: Record<string, unknown>, after: string) => {
    setBusy(true); setSaid("");
    try {
      if (updates.show_notice) await act("notice-seen");
      await act(action, extra);
      setSaid(after);
    } catch (error) { setSaid(error instanceof Error ? error.message : "That didn’t work. Try again."); }
    finally { setBusy(false); }
  };
  if (!release) {
    if (!updates.show_notice) return said ? <p className="settings__hint" role="status">{said}</p> : null;
    return (
      <section className="update update--quiet" aria-labelledby={titleId}>
        <h2 id={titleId}>SynAmp tells you about new versions</h2>
        <p>{CHECK_NOTE} You can turn this off in <a href="#/settings">Settings → About this install</a>.</p>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run("notice-seen", {}, "")}>Got it</button>
      </section>
    );
  }
  return (
    <section className="update" aria-labelledby={titleId}>
      <h2 id={titleId}>SynAmp {release.version} is available{release.prerelease ? " (beta)" : ""}</h2>
      <p>You have {updates.current}.{release.published_at ? ` Released ${day(release.published_at)}.` : ""}</p>
      <details className="update__whats-new">
        <summary>What’s new in {release.version}</summary>
        <ReleaseNotes text={release.notes} />
        <p><a href={release.url} target="_blank" rel="noopener noreferrer">Full notes on GitHub<span className="visually-hidden"> (opens in a new tab)</span></a></p>
      </details>
      <p>To install it, back up your SynAmp data folder, then:</p>
      <ReleaseSteps />
      {updates.show_notice && <p className="muted">{CHECK_NOTE} You can turn this off in <a href="#/settings">Settings → About this install</a>.</p>}
      <div className="update__actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run("remind", {}, "We’ll remind you in 3 days.")}>Remind me in 3 days</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run("skip", { version: release.version }, `Skipped ${release.version}. We’ll tell you about the next one.`)}>Skip this version</button>
      </div>
      <p className="settings__hint" role="status">{said}</p>
    </section>
  );
}

/** About this install: the update check's state, Check now, and its two switches. */
function UpdateSettings({ request }: { request: Request }) {
  const { updates, act } = useUpdates(request);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const checkboxId = useId(), betaId = useId();
  if (!updates || !updates.current) return null;
  const save = async (change: Record<string, boolean>, after: string) => {
    setBusy(true); setSaid("");
    try {
      await request("/settings", { method: "POST", body: JSON.stringify(change) });
      // Look straight away with the new switches (no request at all when checks are now off).
      const view = await act("check");
      setSaid(view.error ?? after);
    } catch (error) { setSaid(error instanceof Error ? error.message : "Couldn’t save that. Try again."); }
    finally { setBusy(false); }
  };
  const checkNow = async () => {
    setBusy(true); setSaid("");
    try {
      const view = await act("check");
      setSaid(view.error ?? (view.newer ? `SynAmp ${view.newer.version} is available.` : "You’re up to date."));
    } catch (error) { setSaid(error instanceof Error ? error.message : "Couldn’t check. Try again."); }
    finally { setBusy(false); }
  };
  const status = !updates.enabled ? "Update checks are off."
    : updates.newer ? (updates.skipped === updates.newer.version ? `SynAmp ${updates.newer.version} is out; you chose to skip it.` : `SynAmp ${updates.newer.version} is available.`)
    : updates.error ?? (updates.checked_at ? `You’re up to date. Last checked ${when(updates.checked_at)}.` : "Not checked yet.");
  return (
    <div className="update-settings">
      <p>{status}</p>
      {updates.newer && <details className="update__whats-new">
        <summary>What’s new in {updates.newer.version}</summary>
        <ReleaseNotes text={updates.newer.notes} />
      </details>}
      <label className="playback__choice" htmlFor={checkboxId}>
        <input id={checkboxId} type="checkbox" checked={updates.enabled} disabled={busy}
          onChange={(event) => save({ update_checks: event.target.checked }, event.target.checked ? "Update checks are on." : "Update checks are off. SynAmp won’t contact GitHub.")} />
        <span><span className="playback__choice-label">Check for new versions (twice a day)</span>
          <span className="playback__choice-hint settings__hint">{CHECK_NOTE}</span></span>
      </label>
      <label className="playback__choice" htmlFor={betaId}>
        <input id={betaId} type="checkbox" checked={updates.beta} disabled={busy || !updates.enabled}
          onChange={(event) => save({ update_beta: event.target.checked }, event.target.checked ? "Beta versions will be offered too." : "Only finished versions will be offered.")} />
        <span><span className="playback__choice-label">Include beta versions</span>
          <span className="playback__choice-hint settings__hint">Early versions for trying things out. They may have rough edges.</span></span>
      </label>
      {updates.enabled && <div><button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={checkNow}>{busy ? "Checking…" : "Check now"}</button></div>}
      <p className="settings__hint" role="status">{said}</p>
    </div>
  );
}

/** Installed from a release: updating (or going back) means choosing a release, not copying code. */
function ReleaseSteps() {
  return (
    <ol className="update__steps">
      <li><a href={RELEASES} target="_blank" rel="noopener noreferrer">Open SynAmp’s releases<span className="visually-hidden"> (opens in a new tab)</span></a> and download the one you want (the newest, or an earlier one to go back).</li>
      <li>Unzip it over your SynAmp folder on the NAS. Your settings file (<code>.env</code>) and your data are kept.</li>
      <li>In <a href={dsmUrl()} target="_blank" rel="noopener noreferrer">DSM<span className="visually-hidden"> (opens in a new tab)</span></a>: <strong>Container Manager</strong> → <strong>Project</strong> → <strong>synamp</strong> → <strong>Action</strong> → <strong>Build</strong>.</li>
    </ol>
  );
}

function BuildSteps() {
  return (
    <ol className="update__steps">
      <li><a href={dsmUrl()} target="_blank" rel="noopener noreferrer">Open DSM<span className="visually-hidden"> (opens in a new tab)</span></a>, then <strong>Container Manager</strong> → <strong>Project</strong>.</li>
      <li>Select <strong>synamp</strong>, then <strong>Action</strong> → <strong>Build</strong>.</li>
    </ol>
  );
}

/** Shown at the top of the page while an update is waiting. */
export function UpdateNotice({ request }: { request: Request }) {
  const { version, check } = useVersion(request);
  const titleId = useId();
  if (version?.copy !== "waiting") return null;
  return (
    <section className="update" aria-labelledby={titleId}>
      <h2 id={titleId}>An update is ready to install</h2>
      <p>A newer SynAmp was copied to the NAS{version.copied_at ? ` (${when(version.copied_at)})` : ""}. To start using it:</p>
      <BuildSteps />
      <p className="muted">It takes a few minutes, and SynAmp is unavailable while it restarts. Let a batch in Organise finish first; analysis on the Mac carries on by itself.
        {" "}<button type="button" className="linklike" onClick={check}>Check again</button></p>
    </section>
  );
}

/** "About this install", inside Settings. */
export function AboutInstall({ request }: { request: Request }) {
  const { version, check } = useVersion(request);
  const [checking, setChecking] = useState(false);
  const [said, setSaid] = useState("");
  async function checkNow() {
    setChecking(true); setSaid("");
    await check();
    setChecking(false);
    setSaid("Checked just now.");
  }
  return (
    <fieldset className="settings__group">
      <legend>About this install</legend>
      {!version ? <p className="settings__hint">Loading…</p> : !version.running ? (
        <p className="settings__hint">This copy wasn’t built by Container Manager (development), so there’s no version to show.</p>
      ) : version.running.version ? <>
        <p>Version <strong>{version.running.version}</strong>, built {when(version.running.built_at)}.</p>
        <UpdateSettings request={request} />
        <p className="settings__hint">Back up first (your SynAmp data folder), so going back to this version also brings back today’s data. To update, or to go back to an earlier version:</p>
        <ReleaseSteps />
      </> : <>
        <p>Version <code>{version.running.short}</code>, built {when(version.running.built_at)}.</p>
        <p className="settings__hint">
          {version.copy === "same" ? "Up to date with the copy on the NAS."
            : version.copy === "waiting" ? "A newer copy is on the NAS, waiting to be built — see the notice on the Library screen."
            : "Can’t see the copy on the NAS to compare (the brain has no read-only view of apps/)."}
        </p>
      </>}
      {!version?.running?.version && <>
        <p className="settings__hint">To update: copy the new version to the NAS (<code>synamp-sync</code> on the Mac), then:</p>
        <BuildSteps />
        <div><button type="button" className="btn btn--ghost btn--sm" disabled={checking} onClick={checkNow}>{checking ? "Checking…" : "Check for an update"}</button>
          <span className="settings__hint" role="status"> {said}</span></div>
      </>}
    </fieldset>
  );
}

/** The running version, always in the top bar; turns into "Update ready" when one is waiting. */
export function VersionBadge({ request }: { request: Request }) {
  const { version } = useVersion(request);
  const { updates } = useUpdates(request);
  if (!version) return null;
  if (updates?.available) {
    return <a className="badge badge--soon version-badge" href="#/settings"><span className="status-dot status-dot--soon" aria-hidden="true" />{updates.available.version} available</a>;
  }
  if (version.copy === "waiting") {
    return <a className="badge badge--soon version-badge" href="#/settings"><span className="status-dot status-dot--soon" aria-hidden="true" />Update ready</a>;
  }
  if (!version.running) return <span className="badge badge--muted" title="Not built by Container Manager">Development copy</span>;
  return <span className="badge badge--muted" title={`Built ${when(version.running.built_at)}`}>Version {version.running.version ?? version.running.short}</span>;
}
