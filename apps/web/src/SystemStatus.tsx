import { useEffect, useId, useRef, useState } from "react";
import { headline, lines, type SystemStatus, type Tone } from "./system-status";

/*
 * "What is SynAmp doing right now?", one tap away on every screen, phone
 * included: what's playing, whether the music is connected, how far listening
 * has got, and whether Listen anywhere is on. The same answer the Mac menu
 * shows. Words carry everything; the dot is decoration.
 */

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const DOT: Record<Tone, string> = { ok: "status-dot--live", busy: "status-dot--next", warn: "status-dot--soon", plain: "" };

/** Asks every few seconds while the page is in front; a SynAmp too old to answer shows nothing. */
export function useSystemStatus(request: Request, everyMs = 15_000) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const requestRef = useRef(request);
  requestRef.current = request;
  useEffect(() => {
    let stopped = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      requestRef.current<SystemStatus>("/system/status")
        .then((answer) => { if (!stopped) setStatus(answer); })
        .catch(() => { if (!stopped) setStatus(null); });
    };
    load();
    const timer = setInterval(load, everyMs);
    document.addEventListener("visibilitychange", load);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [everyMs]);
  return status;
}

export function SystemStatusButton({ request }: { request: Request }) {
  const status = useSystemStatus(request);
  const box = useRef<HTMLDetailsElement>(null);
  const panelId = useId();

  // Like a menu: Escape, or a click anywhere else, closes it.
  useEffect(() => {
    const close = (event: Event) => {
      const details = box.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.open = false;
        details.querySelector("summary")?.focus();
      } else if (!details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, []);

  if (!status) return null;
  const head = headline(status);
  return (
    <details className="sys-status" ref={box}>
      <summary className="badge sys-status__button" aria-describedby={panelId}>
        <span className={`status-dot ${DOT[head.tone]}`} aria-hidden="true" />
        <span className="sys-status__words"><span className="visually-hidden">SynAmp right now: </span>{head.text}</span>
      </summary>
      <div className="sys-status__panel" id={panelId} role="group" aria-label="SynAmp right now">
        <ul className="sys-status__list">
          {lines(status).map((line) => (
            <li key={line.key}>
              <span className={`status-dot ${DOT[line.tone]}`} aria-hidden="true" />
              <span>{line.text}{line.href && <>{" "}<a href={line.href} onClick={() => { if (box.current) box.current.open = false; }}>{line.link}</a></>}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
