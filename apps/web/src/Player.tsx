import { useEffect, useId, useRef, useState } from "react";
import "./styles/player.css";
import { newId } from "./ids";
import Icon from "./ui/Icon";
import { audioContext, setActiveAudio } from "./visuals/audio-graph";
import { streamUrl, usePrefs, wantsLighter, writePrefs } from "./playback-prefs";
import { PlaybackEngine } from "./audio/engine";
import type { Gapless, Item } from "./audio/engine";
import { skipBlendSeconds, transitionFor } from "./audio/transition";

/*
 * The player is a thin client. It reports what physically happened — started,
 * ended, skipped, seeked, failed — and the brain decides what that means
 * (an early skip, a full play, nothing at all). The queue lives on the server.
 */

export type QueueEntry = {
  entry_id: string; track_id: string; title: string; artist?: string;
  source?: { playlist_id: string; plan_hash?: string; rank: number };
  playable: boolean; stream_url?: string;
  /** The album folder, so albums can play straight through. */
  album_key?: string;
  /** A party guest asked for it. */
  requested_by?: string;
  /** A radio station saved in a playlist: plays until you skip. */
  live?: boolean;
  /** Near the playhead: encoder silence to trim (gapless), tempo and key (DJ blends). */
  gapless?: Gapless; bpm?: number; camelot?: string; key?: string;
  /** DJ mode: why this song follows the one before. */
  dj_note?: string;
};
export type SessionView = { id: string; queue: QueueEntry[]; index: number; state: "idle" | "playing" | "paused"; mix?: "dj" };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Player({ request, session, onSession, playlistName, onChanged, away = false, onVisuals }: {
  request: Request;
  /** Opens the MilkDrop visuals; absent when this browser can't show them. */
  onVisuals?: () => void;
  /** Something else (the radio) has the player bar: pause, and stay out of sight. */
  away?: boolean;
  session: SessionView | null;
  onSession: (session: SessionView) => void;
  playlistName: (id: string) => string | undefined;
  /** Called after feedback that can change a playlist's contents (remove/restore). */
  onChanged: () => void;
}) {
  /*
   * The sound itself is the engine's job (audio/engine.ts): gapless albums,
   * crossfades, blends on skip, all timed by the audio clock. This component
   * tells it what's current and next (from the brain's queue) and reports
   * what it hears back to the brain, which decides what each report means.
   */
  const engine = useRef<PlaybackEngine | null>(null);
  const started = useRef<string>("");   // entries we've reported "start" for
  const heartbeat = useRef(0);
  const played = useRef(0);
  const prefs = usePrefs();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [undo, setUndo] = useState<null | { track_id: string; playlist_id: string }>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [askWhy, setAskWhy] = useState(false);
  const queueId = useId();
  const current = session ? session.queue[session.index] : undefined;
  const upNext = session ? session.queue[session.index + 1] : undefined;
  const latest = useRef({ current, session });
  latest.current = { current, session };

  /** Send a report; one retry on a network failure, with the same id so the brain dedupes it. */
  async function report(body: Record<string, unknown>) {
    const send = () => request<{ session: SessionView }>("/session/report", { method: "POST", body: JSON.stringify(body) });
    try { onSession((await send()).session); }
    catch (cause) {
      if ((cause as Error).message.includes("no longer current")) return;
      try { onSession((await send()).session); } catch (again) { setStatus((again as Error).message); }
    }
  }
  const reportFor = (entryId: string | undefined, type: string, extra: Record<string, unknown> = {}) =>
    report({ event_id: newId(), report: { type, entry_id: entryId, ...extra } });
  const ms = (seconds: number) => Math.round(seconds * 1000);

  /** The engine is made on the first press of Play (browsers only allow sound after a click or tap). */
  function ensureEngine(): PlaybackEngine {
    if (engine.current) return engine.current;
    // Safari (iPhone, iPad, Mac): keep playing with the screen locked or the ring switch on silent.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) try { session.type = "playback"; } catch { /* older Safari */ }
    const made = new PlaybackEngine({
      started: (id, length) => {
        setDuration(length); setLoading(false); setPaused(false);
        played.current = 0; heartbeat.current = 0;
        setActiveAudio(made.output());
        if (started.current !== id) { started.current = id; reportFor(id, "start", { duration_ms: length ? ms(length) : undefined }); }
      },
      ended: (id, listened, length) => reportFor(id, "ended", { played_ms: ms(listened), duration_ms: length ? ms(length) : undefined }),
      time: (id, at, length) => {
        if (id !== latest.current.current?.entry_id) return;
        setPosition(at); setDuration(length);
        played.current = Math.max(played.current, 0) + 0.25;
        if (played.current - heartbeat.current >= 10) { heartbeat.current = played.current; reportFor(id, "progress", { played_ms: ms(played.current) }); }
      },
      error: (id, message) => {
        setLoading(false);
        if (message.startsWith("Press play")) { setStatus(message); setPaused(true); return; }
        if (id === latest.current.current?.entry_id) reportFor(id, "error", { message });
      },
      paused: (now) => setPaused(now),
      loading: (now) => setLoading(now),
    }, audioContext());
    made.setVolume(prefs.volume);
    engine.current = made;
    // Development only: lets the browser tests listen to what the engine plays.
    if (import.meta.env.DEV) (window as unknown as { __synampEngine?: PlaybackEngine }).__synampEngine = made;
    return made;
  }

  // What the engine should play: the current song, the next, and how one goes into the other.
  const lighter = wantsLighter(prefs);
  const item = (entry: QueueEntry | undefined): Item | null => (entry?.playable && entry.stream_url
    ? { id: entry.entry_id, url: entry.live ? entry.stream_url : streamUrl(entry.stream_url, prefs), title: entry.title, ...(entry.live ? { live: true } : {}), ...(entry.gapless ? { gapless: entry.gapless } : {}) }
    : null);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const plan = transitionFor(current, upNext, prefs, session?.mix, lighter, memory);
  const planKey = JSON.stringify([current?.entry_id, current?.playable, upNext?.entry_id, upNext?.playable, plan, lighter]);
  useEffect(() => {
    engine.current?.setPlan(item(current), item(upNext), plan.transition, plan.decode);
    if (current?.entry_id !== engine.current?.currentId()) { setPosition(0); setAskWhy(false); }
  }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engine.current?.setVolume(prefs.volume); }, [prefs.volume]);
  useEffect(() => {
    if (away && engine.current?.isPlaying()) { engine.current.pause(); reportFor(current?.entry_id, "pause"); }
  }, [away]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);

  // Lock screen, headphone buttons and media keys (Media Session API).
  const controls = useRef<{ toggle?: () => void; next?: () => void; previous?: () => void; seek?: (seconds: number) => void }>({});
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const media = navigator.mediaSession;
    if (!current || away) { media.metadata = null; return; }
    media.metadata = new MediaMetadata({ title: current.title, artist: current.artist ?? "", album: "SynAmp" });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => controls.current.toggle?.()], ["pause", () => controls.current.toggle?.()],
      ["nexttrack", () => controls.current.next?.()], ["previoustrack", () => controls.current.previous?.()],
      ["seekto", (details) => { if (details.seekTime !== undefined) controls.current.seek?.(details.seekTime); }],
    ];
    for (const [action, handler] of handlers) { try { media.setActionHandler(action, handler); } catch { /* not supported here */ } }
    return () => { for (const [action] of handlers) { try { media.setActionHandler(action, null); } catch { /* ignore */ } } };
  }, [current?.entry_id, away]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = away ? "none" : paused ? "paused" : "playing"; }, [paused, away]);

  if (!session || !session.queue.length) return (
    <section className="player player--idle" aria-label="Player" hidden={away}>
      <div className="player__now">
        <span className="player__cover" aria-hidden="true" />
        <div className="player__text"><p className="player__title">Nothing playing</p><p className="player__meta">Press Play on an album or a playlist.</p></div>
      </div>
    </section>
  );

  const entryBody = (type: string, extra: Record<string, unknown> = {}) =>
    ({ event_id: newId(), report: { type, entry_id: current?.entry_id, ...extra } });

  const toggle = () => {
    if (!current?.playable) return;
    const sound = ensureEngine();
    if (sound.isPlaying()) { sound.pause(); report(entryBody("pause")); return; }
    setStatus("");
    if (!sound.currentId()) sound.setPlan(item(current), item(upNext), plan.transition, plan.decode);
    sound.play();
    if (started.current === current.entry_id) report(entryBody("resume"));
  };
  const next = () => {
    const sound = engine.current;
    const listened = ms(played.current), length = duration ? ms(duration) : undefined;
    // Skipping mid-song blends into the next song (or fades out quickly) instead of cutting.
    if (sound?.isPlaying()) sound.skip(upNext?.playable ? skipBlendSeconds(prefs, session.mix) : 0);
    report(entryBody("skip", { played_ms: listened, duration_ms: length }));
  };
  const previous = () => {
    const sound = engine.current;
    if (played.current > 3 && sound) { sound.seek(0); played.current = 0; }
    report({ event_id: newId(), report: { type: "previous", entry_id: current?.entry_id, played_ms: ms(played.current) } });
  };
  const jump = (index: number) => {
    ensureEngine().play();
    report({ event_id: newId(), report: { type: "jump", index, entry_id: current?.entry_id, played_ms: ms(played.current) } });
  };
  const seekTo = (seconds: number) => {
    const sound = engine.current;
    if (!sound) return;
    report(entryBody("seek", { from_ms: ms(position), to_ms: ms(seconds) }));
    sound.seek(seconds);
    setPosition(seconds);
  };
  controls.current = { toggle, next, previous, seek: seekTo };

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
    <section className="player" aria-label="Player" hidden={away}>
      <div className="player__now">
        <span className="player__cover" aria-hidden="true" />
        <div className="player__text">
          {finished ? <p className="player__title">End of queue</p> : <>
            <p className="player__title">{current?.title}</p>
            <p className="player__meta">{current?.artist ? `${current.artist} · ` : ""}{session.index + 1} of {session.queue.length}{from ? ` · from ${from}` : ""}{current?.requested_by ? ` · asked for by ${current.requested_by}` : ""}
              {session.mix === "dj" && <> · <span className="player__dj">DJ set{current?.bpm ? ` · ${Math.round(current.bpm)} BPM` : ""}{current?.camelot ? ` · ${current.camelot}` : ""}</span></>}
              {loading && <> · <span aria-live="polite">loading…</span></>}</p>
          </>}
        </div>
      </div>
      <div className="player__transport">
        <button type="button" className="player__btn" onClick={previous} aria-label="Previous track" disabled={finished && session.index === 0}><Icon name="previous" /></button>
        <button type="button" className="player__btn player__play" onClick={toggle} aria-label={paused ? "Play" : "Pause"} disabled={!current?.playable}><Icon name={paused ? "play" : "pause"} size={20} /></button>
        <button type="button" className="player__btn" onClick={next} aria-label="Skip to next track" disabled={finished}><Icon name="next" /></button>
      </div>
      <div className="player__right">
        {current?.live ? <span className="badge badge--live player__live"><span className="status-dot status-dot--live" aria-hidden="true" />Live radio</span> : (
        <label className="player__seek">
          <span className="visually-hidden">Seek</span>
          <span aria-hidden="true">{clock(position)}</span>
          <input type="range" min={0} max={duration || 0} step={1} value={Math.min(position, duration || 0)} disabled={!duration}
            aria-valuetext={`${clock(position)} of ${clock(duration)}`}
            onChange={(event) => seekTo(Number(event.target.value))} />
          <span aria-hidden="true">{clock(duration)}</span>
        </label>)}
        <label className="player__volume"><span className="visually-hidden">Volume</span>
          <input type="range" className="range" min={0} max={1} step={0.05} value={prefs.volume} style={{ ["--range-p" as string]: `${Math.round(prefs.volume * 100)}%` }}
            aria-valuetext={`${Math.round(prefs.volume * 100)}%`} onChange={(event) => writePrefs({ volume: Number(event.target.value) })} /></label>
        {onVisuals && <button type="button" className="btn btn--quiet btn--sm" onClick={onVisuals}><Icon name="smart" />Visuals</button>}
        <button type="button" className="btn btn--ghost btn--sm player__queue-toggle" aria-expanded={showQueue} aria-controls={queueId} onClick={() => setShowQueue(!showQueue)}>
          <Icon name="queue" />{showQueue ? "Hide queue" : "Up next"}
        </button>
      </div>
      {current && !current.playable && !finished && <p className="player__note">No audio file for this track yet. It plays once the analyzer has listed it.</p>}
      {current && !finished && (
        <div className="player__feedback" role="group" aria-label="Tell SynAmp what you think of this track">
          <button type="button" className="chip" onClick={() => feedback("love")}><Icon name="heart" size={15} />Love</button>
          <button type="button" className="chip" aria-expanded={askWhy} onClick={() => setAskWhy(!askWhy)}>Not for this</button>
          {current.source && <button type="button" className="chip" onClick={() => feedback("remove")}>Remove from {from ?? "playlist"}</button>}
          {askWhy && (
            <div className="player__why" role="group" aria-label="Why? (optional)">
              <button type="button" className="chip" onClick={() => feedback("thumb_down", { reason: "wrong_energy" })}>Wrong energy</button>
              <button type="button" className="chip" onClick={() => feedback("thumb_down", { reason: "wrong_vibe" })}>Wrong vibe</button>
              <button type="button" className="chip" onClick={() => feedback("thumb_down")}>Just not this</button>
              <span className="muted">Skipping on its own only counts for right now.</span>
            </div>
          )}
          <p className="player__status" role="status">{status}{undo && <> <button type="button" className="linklike" onClick={restore}>Undo</button></>}</p>
        </div>
      )}
      <ol id={queueId} hidden={!showQueue} className="player__queue" aria-label="Queue">
        {session.queue.map((entry, index) => (
          <li key={entry.entry_id} aria-current={index === session.index ? "true" : undefined}>
            <button type="button" onClick={() => jump(index)}><span className="player__queue-n" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span>{entry.title}<small>{entry.artist ?? ""}{entry.playable ? "" : " · no file yet"}{entry.dj_note ? ` · ${entry.dj_note}` : ""}</small></span></button>
          </li>
        ))}
      </ol>
    </section>
  );
}
