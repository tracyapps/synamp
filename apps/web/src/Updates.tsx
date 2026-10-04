import { useCallback, useEffect, useId, useRef, useState } from "react";

/*
 * Updating SynAmp: which version is running, and a notice when a newer copy is
 * on the NAS waiting for Build in Container Manager (the brain compares the two;
 * see apps/brain/src/version.ts).
 */

export type VersionView = {
  running: { fingerprint: string; short: string; built_at: number } | null;
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
      ) : <>
        <p>Version <code>{version.running.short}</code>, built {when(version.running.built_at)}.</p>
        <p className="settings__hint">
          {version.copy === "same" ? "Up to date with the copy on the NAS."
            : version.copy === "waiting" ? "A newer copy is on the NAS, waiting to be built — see the notice at the top of the page."
            : "Can’t see the copy on the NAS to compare (the brain has no read-only view of apps/)."}
        </p>
      </>}
      <p className="settings__hint">To update: copy the new version to the NAS (<code>synamp-sync</code> on the Mac), then:</p>
      <BuildSteps />
      <div><button type="button" className="quiet" disabled={checking} onClick={checkNow}>{checking ? "Checking…" : "Check for an update"}</button>
        <span className="settings__hint" role="status"> {said}</span></div>
    </fieldset>
  );
}
