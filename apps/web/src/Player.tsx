import { useEffect, useId, useRef, useState } from "react";
import "./styles/player.css";
import { newId } from "./ids";

/*
 * The player is a thin client. It reports what physically happened — started,
 * ended, skipped, seeked, failed — and the brain decides what that means
 * (an early skip, a full play, nothing at all). The queue lives on the server.
 */

export type QueueEntry = {
  entry_id: string; track_id: string; title: string; artist?: string;
  source?: { playlist_id: string; plan_hash?: string; rank: number };
  playable: boolean; stream_url?: string;
};
export type SessionView = { id: string; queue: QueueEntry[]; index: number; state: "idle" | "playing" | "paused" };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Player({ request, session, onSession, playlistName, onChanged }: {
  request: Request;
  session: SessionView | null;
  onSession: (session: SessionView) => void;
  playlistName: (id: string) => string | undefined;
  /** Called after feedback that can change a playlist's contents (remove/restore). */
  onChanged: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const played = useRef(0);           // seconds actually listened to (seeks excluded)
  const last = useRef(0);             // last playhead position, to tell listening from seeking
  const started = useRef<string>(""); // entry we've already reported "start" for
  const heartbeat = useRef(0);
  const wantPlay = useRef(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [status, setStatus] = useState("");
  const [undo, setUndo] = useState<null | { track_id: string; playlist_id: string }>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [askWhy, setAskWhy] = useState(false);
  const queueId = useId();
  const current = session ? session.queue[session.index] : undefined;

  /** Send a report; one retry on a network failure, with the same id so the brain dedupes it. */
  async function report(body: Record<string, unknown>) {
    const send = () => request<{ session: SessionView }>("/session/report", { method: "POST", body: JSON.stringify(body) });
    try { onSession((await send()).session); }
    catch (cause) {
      if ((cause as Error).message.includes("no longer current")) return;
      try { onSession((await send()).session); } catch (again) { setStatus((again as Error).message); }
    }
  }
  const playedMs = () => Math.round(played.current * 1000);
  const durationMs = () => (audio.current && Number.isFinite(audio.current.duration) ? Math.round(audio.current.duration * 1000) : undefined);

  // Load the current entry whenever it changes.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    played.current = 0; last.current = 0; heartbeat.current = 0;
    setPosition(0); setDuration(0); setAskWhy(false);
    if (!current?.playable || !current.stream_url) { el.removeAttribute("src"); el.load(); return; }
    el.src = current.stream_url;
    if (wantPlay.current) el.play().catch(() => setStatus("Press play to start — the browser blocked autoplay."));
  }, [current?.entry_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !session.queue.length) return null;

  const entryBody = (type: string, extra: Record<string, unknown> = {}) =>
    ({ event_id: newId(), report: { type, entry_id: current?.entry_id, ...extra } });

  const onPlaying = () => {
    setPaused(false);
    if (current && started.current !== current.entry_id) {
      started.current = current.entry_id;
      report(entryBody("start", { duration_ms: durationMs() }));
    } else report(entryBody("resume"));
  };
  const onTime = () => {
    const el = audio.current!;
    const delta = el.currentTime - last.current;
    if (delta > 0 && delta < 1.5) played.current += delta; // normal playback, not a jump
    last.current = el.currentTime;
    setPosition(el.currentTime);
    if (played.current - heartbeat.current >= 10) {
      heartbeat.current = played.current;
      report(entryBody("progress", { played_ms: playedMs() }));
    }
  };
  const onSeeked = () => {
    const el = audio.current!;
    report(entryBody("seek", { from_ms: Math.round(last.current * 1000), to_ms: Math.round(el.currentTime * 1000) }));
    last.current = el.currentTime;
  };

  const toggle = () => {
    const el = audio.current!;
    if (!current?.playable) return;
    if (el.paused) { wantPlay.current = true; el.play().catch((cause) => setStatus(String(cause))); }
    else { el.pause(); report(entryBody("pause")); }
  };
  const next = () => { wantPlay.current = !audio.current?.paused || wantPlay.current; report(entryBody("skip", { played_ms: playedMs(), duration_ms: durationMs() })); };
  const previous = () => {
    if (played.current > 3 && audio.current) { audio.current.currentTime = 0; last.current = 0; }
    report({ event_id: newId(), report: { type: "previous", entry_id: current?.entry_id, played_ms: playedMs() } });
  };
  const jump = (index: number) => {
    wantPlay.current = true;
    report({ event_id: newId(), report: { type: "jump", index, entry_id: current?.entry_id, played_ms: playedMs() } });
  };

  async function feedback(signal: "love" | "thumb_down" | "remove" | "restore", extra: Record<string, unknown> = {}, target = current) {
    if (!target) return;
    const playlist_id = target.source?.playlist_id;
    try {
      await request("/feedback", { method: "POST", body: JSON.stringify({
        event_id: newId(), signal, track_id: target.track_id, entry_id: target.entry_id,
        ...(signal === "remove" || signal === "restore" || (signal === "thumb_down" && playlist_id) ? { scope: "playlist", playlist_id } : {}),
        ...extra,
      }) });
      const where = playlist_id ? playlistName(playlist_id) ?? "this playlist" : "your library";
      if (signal === "love") setStatus(`Loved “${target.title}”.`);
      if (signal === "thumb_down") setStatus(`Noted: less of “${target.title}” in ${where}.`);
      if (signal === "remove" && playlist_id) { setStatus(`Removed “${target.title}” from ${where}.`); setUndo({ track_id: target.track_id, playlist_id }); }
      if (signal === "restore") { setStatus(`Restored “${target.title}”.`); setUndo(null); }
      if (signal === "remove" || signal === "restore") onChanged();
      setAskWhy(false);
    } catch (cause) { setStatus((cause as Error).message); }
  }
  const restore = async () => {
    if (!undo) return;
    await request("/feedback", { method: "POST", body: JSON.stringify({ event_id: newId(), signal: "restore", track_id: undo.track_id, scope: "playlist", playlist_id: undo.playlist_id }) })
      .then(() => { setStatus("Restored."); setUndo(null); onChanged(); })
      .catch((cause) => setStatus((cause as Error).message));
  };

  const finished = session.index >= session.queue.length;
  const from = current?.source ? playlistName(current.source.playlist_id) : undefined;
  return (
    <section className="player" aria-label="Player">
      <audio ref={audio} preload="metadata" onPlaying={onPlaying} onPause={() => setPaused(true)} onTimeUpdate={onTime} onSeeked={onSeeked}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => { wantPlay.current = true; report(entryBody("ended", { played_ms: playedMs(), duration_ms: durationMs() })); }}
        onError={() => { if (current?.playable) report(entryBody("error", { message: audio.current?.error?.message || "playback failed" })); }} />
      <div className="player__now">
        {finished ? <p className="player__title">End of queue</p> : <>
          <p className="player__title">{current?.title}<span>{current?.artist}</span></p>
          <p className="player__meta">{session.index + 1} of {session.queue.length}{from ? ` · from ${from}` : ""}</p>
          {current && !current.playable && <p className="player__note">No audio file for this track. Entries from the synthetic sample have no file; analyzer exports do.</p>}
        </>}
      </div>
      <div className="player__transport">
        <button type="button" onClick={previous} aria-label="Previous track" disabled={finished && session.index === 0}>⏮</button>
        <button type="button" className="player__play" onClick={toggle} aria-label={paused ? "Play" : "Pause"} disabled={!current?.playable}>{paused ? "▶" : "⏸"}</button>
        <button type="button" onClick={next} aria-label="Skip to next track" disabled={finished}>⏭</button>
        <label className="player__seek">
          <span className="visually-hidden">Seek</span>
          <span aria-hidden="true">{clock(position)}</span>
          <input type="range" min={0} max={duration || 0} step={1} value={Math.min(position, duration || 0)} disabled={!duration}
            aria-valuetext={`${clock(position)} of ${clock(duration)}`}
            onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value); }} />
          <span aria-hidden="true">{clock(duration)}</span>
        </label>
      </div>
      {current && !finished && (
        <div className="player__feedback" role="group" aria-label="Tell SynAmp what you think of this track">
          <button type="button" onClick={() => feedback("love")}>♥ Love</button>
          <button type="button" aria-expanded={askWhy} onClick={() => setAskWhy(!askWhy)}>Not for this</button>
          {current.source && <button type="button" onClick={() => feedback("remove")}>Remove from {from ?? "playlist"}</button>}
          {askWhy && (
            <div className="player__why" role="group" aria-label="Why? (optional)">
              <button type="button" onClick={() => feedback("thumb_down", { reason: "wrong_energy" })}>Wrong energy</button>
              <button type="button" onClick={() => feedback("thumb_down", { reason: "wrong_vibe" })}>Wrong vibe</button>
              <button type="button" onClick={() => feedback("thumb_down")}>Just not this</button>
              <span className="muted">Skipping on its own only counts for right now.</span>
            </div>
          )}
        </div>
      )}
      <p className="player__status" role="status">{status}{undo && <> <button type="button" className="linklike" onClick={restore}>Undo</button></>}</p>
      <button type="button" className="quiet player__queue-toggle" aria-expanded={showQueue} aria-controls={queueId} onClick={() => setShowQueue(!showQueue)}>
        {showQueue ? "Hide queue" : "Up next"}
      </button>
      <ol id={queueId} hidden={!showQueue} className="player__queue">
        {session.queue.map((entry, index) => (
          <li key={entry.entry_id} aria-current={index === session.index ? "true" : undefined}>
            <button type="button" onClick={() => jump(index)}>{entry.title}<small>{entry.artist ?? ""}{entry.playable ? "" : " · no file"}</small></button>
          </li>
        ))}
      </ol>
    </section>
  );
}
