import { useEffect, useState } from "react";

type Health = { status: string; service: string; uptimeMs: number };
type Session = { nowPlaying: unknown; queue: unknown[]; participants: unknown[] };

type Probe =
  | { state: "loading" }
  | { state: "ok"; health: Health; session: Session }
  | { state: "error"; message: string };

/**
 * Phase 0 shell. Not the library UI — it only proves the web app can reach the
 * brain, so the wiring is real before the interesting parts get built on top.
 */
export default function App() {
  const [probe, setProbe] = useState<Probe>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [health, session] = await Promise.all([
          fetch("/health").then((r) => {
            if (!r.ok) throw new Error(`/health → ${r.status}`);
            return r.json() as Promise<Health>;
          }),
          fetch("/api/v1/session").then((r) => {
            if (!r.ok) throw new Error(`/api/v1/session → ${r.status}`);
            return r.json() as Promise<Session>;
          }),
        ]);
        if (alive) setProbe({ state: "ok", health, session });
      } catch (err) {
        if (alive) {
          setProbe({ state: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="shell">
      <header className="shell__head">
        <span className="wordmark">SynAmp</span>
        <span className="tagline">self-hosted music system</span>
      </header>

      <main className="shell__body">
        <h1>The library goes here.</h1>
        <p className="lede">
          This is the Phase 0 shell. It only verifies that the web app can reach the
          brain. The library, playlist tree, queue and party views arrive in later
          phases.
        </p>

        <section className="status" aria-live="polite">
          {probe.state === "loading" && <p className="status__line">Contacting brain…</p>}

          {probe.state === "error" && (
            <>
              <p className="status__line status__line--bad">Brain unreachable</p>
              <p className="status__detail">{probe.message}</p>
            </>
          )}

          {probe.state === "ok" && (
            <>
              <p className="status__line status__line--good">
                Brain connected · uptime {Math.round(probe.health.uptimeMs / 1000)}s
              </p>
              <p className="status__detail">
                queue {probe.session.queue.length} · participants{" "}
                {probe.session.participants.length} · nowPlaying{" "}
                {probe.session.nowPlaying ? "yes" : "—"}
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
