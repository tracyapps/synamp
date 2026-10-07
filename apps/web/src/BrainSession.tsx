import { useEffect, useId, useState } from "react";
import "./styles/brain.css";
import type { SessionView } from "./Player";

/*
 * "This session" — the epoch-scoped learning readout (B2/B5, decision 4).
 *
 * What the brain learned from THIS listening session only (never other days), the
 * adjustments it is applying to the current queue, cross-epoch suggestions awaiting
 * an explicit Accept/Dismiss (the only channel that outlives a session), honesty
 * notes about the data, and a confirm-gated "forget this session" control.
 * The player bar is deliberately untouched; this panel is the readout.
 */

type Adjustment = { track_id: string; playlist_id?: string; value: number; parts: Array<{ label: string; value: number }> };
type ProposalKind = "track_repeat_skip" | "artist_repeat_skip" | "not_now_pattern" | "external_play_positive" | "repeat_positive";
type Proposal = {
  id: string; kind: ProposalKind; subject: string; subject_type: "track" | "artist";
  thesis: string; evidence: { epochs: number; dates: number; dayparts: string[] }; suggested_action: string;
};
type EpochInfo = {
  id: string; t_start: number; t_end: number; event_count: number; session_ids: string[]; daypart: string; date: string;
};
type Readout = {
  policy_version: string;
  listening_policy: "epoch-v1" | "legacy-v1";
  events: number;
  epoch: EpochInfo | null;
  hides: string[];
  proposals: Proposal[];
  reliability_notes: string[];
  queue_adjustments: Adjustment[];
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

/**
 * What Accept will do, stated BEFORE the click (C2 F5) — the same wording as
 * proposals.ts suggested_action, and it must match what the brain writes on accept:
 * a global thumbs-down/up for track subjects; a recorded decision only for artists.
 */
function acceptConsequence(proposal: Proposal): string {
  if (proposal.kind === "track_repeat_skip" || proposal.kind === "not_now_pattern") return "Adds a global thumbs-down — future lists weigh it lower; this does not exclude it.";
  if (proposal.kind === "repeat_positive" || (proposal.kind === "external_play_positive" && proposal.subject_type === "track")) return "Adds a global thumbs-up — future lists weigh it in.";
  if (proposal.kind === "external_play_positive") return "Records your decision — no automatic change; follow the artist from the Library.";
  return "Records your decision — no automatic change; edit the playlist to exclude the artist."; // artist_repeat_skip
}

/** The matching confirmation after the click, so the panel never overclaims. */
function acceptDone(proposal: Proposal): string {
  if (proposal.kind === "track_repeat_skip" || proposal.kind === "not_now_pattern") return "Recorded a global thumbs-down — future lists weigh it lower; it can still appear.";
  if (proposal.kind === "repeat_positive" || (proposal.kind === "external_play_positive" && proposal.subject_type === "track")) return "Recorded a global thumbs-up — future lists weigh it in.";
  if (proposal.kind === "external_play_positive") return "Recorded — no automatic change; follow the artist from the Library if you want that.";
  return "Recorded — no automatic change; edit the playlist to exclude the artist if you want that."; // artist_repeat_skip
}

export default function BrainSession({ request, session, playlistName, startOpen = false }: { request: Request; session: SessionView | null; playlistName?: (id: string) => string | undefined; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const titleId = useId();

  const load = () => request<Readout>("/brain/session").then(setReadout).catch((cause) => setMessage((cause as Error).message));
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, 30_000); // skips and repeats change the readout while you listen
    return () => clearInterval(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path: string, body: unknown, done: string) {
    setBusy(true); setMessage("");
    try {
      setReadout(await request<Readout>(path, { method: "POST", body: JSON.stringify(body) }));
      setMessage(done);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  const title = (trackId: string) => session?.queue.find((entry) => entry.track_id === trackId)?.title ?? trackId;
  const adjustments = (readout?.queue_adjustments ?? []).filter((item) => item.parts.length > 0 || item.value !== 0);
  const legacy = readout?.listening_policy === "legacy-v1";

  return (
    <section className="panel brain" aria-labelledby={titleId}>
      <h2 className="panel__toggle-heading"><button type="button" className="listening__toggle" aria-expanded={open} aria-controls={`${titleId}-body`} onClick={() => setOpen(!open)}>
        <span id={titleId}>This session</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button></h2>
      {open && <div className="brain__body" id={`${titleId}-body`}>
        <div>
          <h3>What’s learned right now</h3>
          {!readout ? <p className="muted">Loading…</p> : legacy ? (
            <p className="muted">Session learning is off — the earlier feedback policy is active. Change it under Settings → Learning.</p>
          ) : readout.epoch ? (
            <p className="brain__epoch">
              This session: <strong>{readout.epoch.daypart}</strong>, started {clock(readout.epoch.t_start)} · {readout.epoch.event_count} {readout.epoch.event_count === 1 ? "signal" : "signals"} · last {clock(readout.epoch.t_end)}
            </p>
          ) : (
            <p className="brain__epoch muted">No active session — learning is paused until you listen again.</p>
          )}
          {readout && !legacy && <>
            {adjustments.length === 0 ? (
              <p className="muted">No adjustments for this queue yet. Session signals appear as you listen; deliberate loves and thumbs can carry over.</p>
            ) : (
              <ul className="brain__adjustments">{adjustments.map((item) => (
                <li key={JSON.stringify([item.track_id, item.playlist_id])}>
                  <div className="brain__adjustment-head">
                    <span>{title(item.track_id)}{item.playlist_id && <small className="muted"> · {playlistName?.(item.playlist_id) ?? "unavailable playlist"}</small>}</span>
                    <span className={`brain__value ${item.value >= 0 ? "brain__value--up" : "brain__value--down"}`}>{signed(item.value)}</span>
                  </div>
                  <ul className="brain__parts">{item.parts.map((part) => (
                    <li key={part.label}><span>{part.label}</span><span>{signed(part.value)}</span></li>
                  ))}</ul>
                </li>
              ))}</ul>
            )}
            <p className="muted">{readout.hides.length === 0
              ? "Nothing hidden — a track hides itself for this session after two early skips, or on “not now”."
              : `Hidden until this session ends: ${readout.hides.map(title).join(", ")}.`}</p>
          </>}
        </div>
        <div>
          <h3>Suggestions from past sessions{readout ? ` (${readout.proposals.length})` : ""}</h3>
          <p className="muted">Patterns must repeat across several sessions on different days before they appear. Nothing here applies until you accept it.</p>
          {readout && readout.proposals.length > 0 && (
            <ul className="brain__proposals">{readout.proposals.map((proposal) => (
              <li key={proposal.id}>
                <p className="brain__proposal-text">{proposal.thesis}</p>
                <p className="brain__proposal-meta">{proposal.evidence.epochs} sessions · {proposal.evidence.dates} days{proposal.evidence.dayparts.length ? ` · ${proposal.evidence.dayparts.join(", ")}` : ""}</p>
                <p className="brain__proposal-note">Accept: {acceptConsequence(proposal)}</p>
                <div className="brain__proposal-actions">
                  <button type="button" className="btn btn--primary btn--sm" disabled={busy}
                    onClick={() => act("/brain/proposals", { id: proposal.id, action: "accept" }, acceptDone(proposal))}>Accept</button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
                    onClick={() => act("/brain/proposals", { id: proposal.id, action: "dismiss" }, "Dismissed — this one won’t be suggested again.")}>Dismiss</button>
                </div>
              </li>
            ))}</ul>
          )}
          {readout && readout.proposals.length === 0 && <p className="muted">Nothing new right now.</p>}
          {readout && readout.reliability_notes.length > 0 && <>
            <h3>Honesty notes</h3>
            <ul className="brain__notes">{readout.reliability_notes.map((note) => <li key={note}>{note}</li>)}</ul>
          </>}
        </div>
        {readout && <div className="brain__policy">
          <span>Learning policy: <code>{readout.listening_policy}</code> <span className="muted">({readout.policy_version})</span></span>
          {legacy ? (
            <span className="muted">Choose “Learn within this session” under Settings → Learning to re-enable it.</span>
          ) : confirmForget ? (
            <span className="brain__confirm">
              <span>Clear what this session taught the brain? Loves, thumbs and removals stay.</span>
              <button type="button" className="btn btn--danger btn--sm" disabled={busy}
                onClick={() => { setConfirmForget(false); act("/brain/forget", { scope: "epoch" }, "Forgotten — only what happens from now on counts for this session."); }}>Yes, forget this session</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmForget(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirmForget(true)}>Forget this session</button>
          )}
        </div>}
        <p className="brain__message" role="status">{message}</p>
      </div>}
    </section>
  );
}
