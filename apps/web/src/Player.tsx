import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import "./styles/player.css";
import SongControls from "./SongControls";
import { PLAYER_COMMAND, PLAYLIST_ONLY, shortcut, type PlayerCommand, type PlayerView } from "./player-commands";
import { askForSmartPlaylist } from "./Describe";
import { newId } from "./ids";
import Icon from "./ui/Icon";
import { audioContext, setActiveAudio } from "./visuals/audio-graph";
import { streamUrl, usePrefs, wantsLighter, writePrefs } from "./playback-prefs";
import { CLIP_EVENT, stopClip, type ClipState } from "./preview-clip";
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
  playable: boolean; stream_url?: string; loved?: boolean;
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
export type SessionView = { id: string; queue: QueueEntry[]; index: number; state: "idle" | "playing" | "paused"; mix?: "dj"; playback?: "standard" | "continuous"; continuation?: { message?: string } };
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export type PlayerHandle = { preparePlayback: () => void };

export default function Player({ request, session, onSession, playlistName, onChanged, away = false, onVisuals, onView, ref, playEntry }: {
  ref?: Ref<PlayerHandle>;
  /** An explicit Play action, applied only once its requested queue entry arrives. */
  playEntry?: string;
  request: Request;
  onView?: (view: PlayerView | null) => void;
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
  const resumeAfterClip = useRef(false);
  const failures = useRef(0);   // songs in a row that wouldn't play
  const failed = useRef(new Map<string, string>()); // songs that failed before the brain had moved on to them
  const prefs = usePrefs();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fading, setFading] = useState(false);
  const [status, setStatus] = useState("");
  const [undo, setUndo] = useState<null | { track_id: string; playlist_id: string }>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [lovedTracks, setLovedTracks] = useState<Set<string>>(new Set());
  const actionLock = useRef(false);
  const actions = useRef<Partial<Record<PlayerCommand, () => void>>>({});
  const queueId = useId();
  const current = session ? session.queue[session.index] : undefined;
  const upNext = session ? session.queue[session.index + 1] : undefined;
  const latest = useRef({ current, session });
  latest.current = { current, session };
  // What the Play/Pause button says, for handlers that are set up once.
  const pausedShown = useRef(paused);
  pausedShown.current = paused;
  // Pause means pause: sound is coming out, or a song is loading after Play (the button says Pause).
  // Not when the browser blocked autoplay: the button says Play then, and Play should play.
  const audible = (sound: PlaybackEngine) => sound.isPlaying() || (sound.isActive() && !pausedShown.current);

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

  /**
   * A song wouldn't play (a damaged file, a dropped connection, stuck partway).
   * Say which one and why, and tell the brain, which logs it and moves to the
   * next song. Several in a row usually means the library itself can't be
   * reached, so stop instead of running through the whole queue.
   */
  function songFailed(id: string, reason: string) {
    const entry = latest.current.session?.queue.find((e) => e.entry_id === id);
    const name = entry ? `“${entry.title}”` : "This song";
    failures.current += 1;
    setLoading(false);
    if (failures.current >= 3) {
      engine.current?.pause();
      setStatus(`${name} wouldn’t play: ${reason}. That’s ${failures.current} songs in a row, so SynAmp has stopped. Check that your music library is reachable, then press Play to try the next song.`);
    } else {
      setStatus(`${name} wouldn’t play: ${reason}. Skipped to the next song.`);
    }
    reportFor(id, "error", { message: reason });
  }

  /** The engine is made on the first press of Play (browsers only allow sound after a click or tap). */
  function ensureEngine(): PlaybackEngine {
    if (engine.current) return engine.current;
    // Safari (iPhone, iPad, Mac): keep playing with the screen locked or the ring switch on silent.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) try { session.type = "playback"; } catch { /* older Safari */ }
    const made = new PlaybackEngine({
      started: (id, length) => {
        failures.current = 0;
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
        if (message.startsWith("Press play")) {
          if (id === latest.current.current?.entry_id) { setLoading(false); setStatus(message); setPaused(true); }
          return;
        }
        // The engine can be a moment ahead of the brain (a crossfade into a song that won't load):
        // hold on to it until the brain says that song is current.
        if (id !== latest.current.current?.entry_id) {
          if (failed.current.size > 20) failed.current.clear();
          failed.current.set(id, message);
          return;
        }
        songFailed(id, message);
      },
      paused: (now) => setPaused(now),
      loading: (now) => setLoading(now),
      transitioning: setFading,
    }, audioContext());
    made.setVolume(prefs.volume);
    engine.current = made;
    // Development only: lets the browser tests listen to what the engine plays.
    if (import.meta.env.DEV) (window as unknown as { __synampEngine?: PlaybackEngine }).__synampEngine = made;
    return made;
  }

  // Unlock audio during the Library/playlist click, before waiting for the server.
  // Starting is separate: the old queue must not play while the new one loads.
  useImperativeHandle(ref, () => ({ preparePlayback: () => {
    resumeAfterClip.current = false;
    stopClip();
    ensureEngine();
    audioContext();
  } }));

  // What the engine should play: the current song, the next, and how one goes into the other.
  const lighter = wantsLighter(prefs);
  const item = (entry: QueueEntry | undefined): Item | null => (entry?.playable && entry.stream_url
    ? { id: entry.entry_id, url: entry.live ? entry.stream_url : streamUrl(entry.stream_url, prefs), title: entry.title, ...(entry.live ? { live: true } : {}), ...(entry.gapless ? { gapless: entry.gapless } : {}) }
    : null);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const plan = transitionFor(current, upNext, prefs, session?.mix, lighter, memory);
  // A song that failed while the engine was ahead of the brain: now that it's current, skip it.
  // (Before the plan effect below, so the engine hasn't been handed a fresh copy of it yet.)
  useEffect(() => {
    const id = current?.entry_id;
    const reason = id ? failed.current.get(id) : undefined;
    if (!id || reason === undefined) return;
    failed.current.delete(id);
    if (engine.current?.currentId() === id && engine.current.isActive()) songFailed(id, reason);
  }, [current?.entry_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const planKey = JSON.stringify([current?.entry_id, current?.playable, upNext?.entry_id, upNext?.playable, plan, lighter]);
  useEffect(() => {
    engine.current?.setPlan(item(current), item(upNext), plan.transition, plan.decode);
    if (current?.entry_id !== engine.current?.currentId()) { setPosition(0); }
  }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const playedRequest = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!playEntry || playEntry !== current?.entry_id || playedRequest.current === playEntry) return;
    playedRequest.current = playEntry;
    if (!current.playable) { setStatus("This song's file is unavailable. Reveal it in Finder to check its location."); return; }
    setStatus("");
    ensureEngine().play();
  }, [playEntry, current?.entry_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engine.current?.setVolume(prefs.volume); }, [prefs.volume]);
  useEffect(() => {
    if (away && engine.current?.isPlaying()) { engine.current.pause(); reportFor(current?.entry_id, "pause"); }
  }, [away]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);

  // Lock screen, headphone buttons and media keys (Media Session API).
  const controls = useRef<{ toggle?: () => void; next?: () => void; previous?: () => void; seek?: (seconds: number) => void }>({});
  // A preview clip (Describe) pauses what's playing; it carries on when the clip ends.
  // Hooks stay above the early return below (no queue): React needs the same hooks on every render.
  useEffect(() => {
    const on = (event: Event) => {
      const playing = (event as CustomEvent<ClipState>).detail.trackId !== null;
      if (playing && engine.current && audible(engine.current)) { resumeAfterClip.current = true; controls.current.toggle?.(); }
      else if (!playing && resumeAfterClip.current) { resumeAfterClip.current = false; controls.current.toggle?.(); }
    };
    window.addEventListener(CLIP_EVENT, on);
    return () => window.removeEventListener(CLIP_EVENT, on);
  }, []);
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

  const from = current?.source ? playlistName(current.source.playlist_id) ?? "playlist" : undefined;
  const view: PlayerView | null = session?.queue.length && !away ? {
    title: current?.title ?? (session?.continuation ? "No matching songs left" : "End of queue"), artist: current?.artist, available: !!current, canUndo: !!undo, loved: !!current?.loved || (!!current && lovedTracks.has(current.track_id)),
    paused, busy, transitioning: fading, action, status: fading ? `Crossfading… ${status}` : status, playlist: from, ...(current?.live ? { live: true } : {}),
  } : null;
  const viewKey = JSON.stringify(view);
  useEffect(() => {
    onView?.(view);
    const native = window as Window & { webkit?: { messageHandlers?: { synampPlayer?: { postMessage: (value: unknown) => void } } } };
    native.webkit?.messageHandlers?.synampPlayer?.postMessage(JSON.parse(JSON.stringify(view ? { ...view, empty: !view.available } : { empty: true, title: "Nothing playing" })));
  }, [viewKey, onView]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Playlist feedback (not for this, more like this, remove…) means nothing for a song started from the Library.
    const allowed = (action: PlayerCommand) => !PLAYLIST_ONLY.has(action) || !!latest.current.current?.source || action === "undo-remove";
    const run = (event: Event) => { const action = (event as CustomEvent<PlayerCommand>).detail; if (away || !allowed(action)) return; actions.current[action]?.(); };
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = !!target?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']");
      const action = shortcut(event, editing);
      if (!action || away || !latest.current.current || !allowed(action)) return;
      event.preventDefault(); actions.current[action]?.();
    };
    window.addEventListener(PLAYER_COMMAND, run);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener(PLAYER_COMMAND, run); window.removeEventListener("keydown", key); };
  }, [away]);
  actions.current = { visuals: onVisuals };

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
    if (audible(sound)) { sound.pause(); report(entryBody("pause")); return; }
    // Pressing play yourself ends any preview clip, and the player doesn't wait for it.
    resumeAfterClip.current = false;
    stopClip();
    setStatus("");
    failures.current = 0;
    if (!sound.currentId()) sound.setPlan(item(current), item(upNext), plan.transition, plan.decode);
    sound.play();
    if (started.current === current.entry_id) report(entryBody("resume"));
  };
  async function advance(target = current) {
    if (!target || latest.current.current?.entry_id !== target.entry_id) return;
    const body = { event_id: newId(), report: { type: "skip", entry_id: target.entry_id, played_ms: ms(played.current), duration_ms: duration ? ms(duration) : undefined } };
    const send = () => request<{ session: SessionView }>("/session/report", { method: "POST", body: JSON.stringify(body) });
    let result;
    try { result = await send(); } catch (error) {
      if ((error as Error).message.includes("no longer current")) return;
      result = await send(); // same event id: retry cannot skip twice
    }
    if (latest.current.current?.entry_id !== target.entry_id) return;
    const following = result.session.queue[result.session.index];
    if (engine.current?.isPlaying()) {
      const updatedPlan = transitionFor(target, following, prefs, result.session.mix, lighter, memory);
      engine.current.setPlan(item(target), item(following), updatedPlan.transition, updatedPlan.decode);
      engine.current.skip(following?.playable ? skipBlendSeconds(prefs, result.session.mix) : 0);
    }
    onSession(result.session);
    return following;
  }
  const next = async () => {
    if (actionLock.current || !current) return;
    actionLock.current = true; setBusy(true); setAction("next"); setStatus(`Skipping “${current.title}”…`);
    try { const following = await advance(); setStatus(`Skipped “${current.title}”.${following ? ` Playing next: ${following.title}.` : session.continuation ? " No other songs currently match this mix." : " End of queue."}`); }
    catch (error) { setStatus(`Couldn’t skip: ${(error as Error).message}`); }
    finally { actionLock.current = false; setBusy(false); }
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

  async function feedback(signal: "love" | "thumb_down" | "remove", reason?: "wrong_energy" | "wrong_vibe") {
    const target = current;
    if (!target || actionLock.current || (signal === "love" && view?.loved)) return;
    actionLock.current = true; setBusy(true); setAction(signal);
    setStatus(signal === "love" ? `Loving “${target.title}”…` : signal === "remove" ? `Removing “${target.title}”… next song.` : `Not for this: “${target.title}”… skipping.`);
    const playlist_id = target.source?.playlist_id;
    let saved = false;
    try {
      const body = JSON.stringify({ event_id: newId(), signal, track_id: target.track_id, entry_id: target.entry_id,
        ...(reason ? { reason } : {}),
        ...(signal === "remove" || (signal === "thumb_down" && playlist_id) ? { scope: "playlist", playlist_id } : {}),
      });
      const send = () => request<{ session?: SessionView }>("/feedback", { method: "POST", body });
      let result;
      try { result = await send(); } catch { result = await send(); }
      if (result.session) { latest.current = { current: result.session.queue[result.session.index], session: result.session }; onSession(result.session); }
      saved = true;
      const where = playlist_id ? playlistName(playlist_id) ?? "this playlist" : "your library";
      if (signal === "love") { setLovedTracks(before => new Set([...before, target.track_id])); setStatus(`Loved “${target.title}”. ${session?.continuation ? "Guiding upcoming songs." : "More of this in future mixes."}`); }
      else {
        if (signal === "remove" && playlist_id) { setUndo({ track_id: target.track_id, playlist_id }); onChanged(); }
        await advance(target);
        setStatus(signal === "remove" ? `Removed “${target.title}” from ${where}. Next song.` : `Noted: less of “${target.title}” in ${where}. Next song.`);
      }
    } catch (cause) { setStatus(`${saved ? "Saved your feedback, but couldn’t skip. Press Skip to try again." : "Couldn’t save your feedback."} ${(cause as Error).message}`); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function moreLikeThis() {
    if (!current || actionLock.current) return;
    actionLock.current = true; setBusy(true); setAction("more-like-this"); setStatus(`Finding a song like “${current.title}” to play next…`);
    const body = JSON.stringify({ event_id: newId(), entry_id: current.entry_id });
    try {
      const send = () => request<{ session: SessionView; track: { title: string }; reason: string }>("/session/more-like-this", { method: "POST", body });
      let result;
      try { result = await send(); } catch { result = await send(); }
      onSession(result.session); setStatus(`Up next: “${result.track.title}” · ${result.reason}.`);
    } catch (cause) { setStatus(`Couldn’t find your next song: ${(cause as Error).message}`); }
    finally { actionLock.current = false; setBusy(false); }
  }

  const restore = async () => {
    if (!undo || actionLock.current) return;
    actionLock.current = true; setBusy(true);
    await request<{ session?: SessionView }>("/feedback", { method: "POST", body: JSON.stringify({ event_id: newId(), signal: "restore", track_id: undo.track_id, scope: "playlist", playlist_id: undo.playlist_id }) })
      .then(result => { if (result.session) onSession(result.session); setStatus("Restored."); setUndo(null); onChanged(); })
      .catch((cause) => setStatus((cause as Error).message))
      .finally(() => { actionLock.current = false; setBusy(false); });
  };

  actions.current = { toggle, next, previous, love: () => feedback("love"), "not-for-this": () => feedback("thumb_down"), remove: () => { if (current?.source) void feedback("remove"); }, "more-like-this": moreLikeThis, visuals: onVisuals, "undo-remove": restore,
    "smart-from-this": () => { if (current && !current.live) askForSmartPlaylist({ id: current.track_id, title: current.title, ...(current.artist ? { artist: current.artist } : {}) }); }, "wrong-energy": () => feedback("thumb_down", "wrong_energy"), "wrong-vibe": () => feedback("thumb_down", "wrong_vibe") };

  const finished = session.index >= session.queue.length;
  return (
    <section className="player" aria-label="Player" hidden={away}>
      <div className="player__now">
        <span className="player__cover" aria-hidden="true" />
        <div className="player__text">
          {finished ? <p className="player__title">{session.continuation ? "No matching songs left" : "End of queue"}</p> : <>
            <p className="player__title">{current?.title}</p>
            <p className="player__meta">{current?.artist ? `${current.artist} · ` : ""}{session.continuation ? "Smart mix · keeps going" : `${session.index + 1} of ${session.queue.length}`}{from ? ` · from ${from}` : ""}{current?.requested_by ? ` · asked for by ${current.requested_by}` : ""}
              {session.mix === "dj" && <> · <span className="player__dj">DJ set{current?.bpm ? ` · ${Math.round(current.bpm)} BPM` : ""}{current?.camelot ? ` · ${current.camelot}` : ""}</span></>}
              {loading && <> · <span aria-live="polite">loading…</span></>}</p>
          </>}
          {session.continuation?.message && <p className="player__meta" role="status">{session.continuation.message}</p>}
        </div>
      </div>
      <div className="player__transport">
        <button type="button" className="player__btn" onClick={previous} aria-label="Previous track" disabled={finished && session.index === 0}><Icon name="previous" /></button>
        <button type="button" className="player__btn player__play" onClick={toggle} aria-label={paused ? "Play" : "Pause"} disabled={!current?.playable}><Icon name={paused ? "play" : "pause"} size={20} /></button>
        <button type="button" className="player__btn" onClick={next} aria-label={busy && action === "next" ? "Skipping…" : "Skip to next track"} title="Skip · Option/Alt + Shift + →" disabled={finished || busy}><Icon name="next" /></button>
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
      {view && <div className="player__feedback">
        <SongControls view={view} />
        <details className="player__shortcuts"><summary>Keyboard shortcuts</summary><p>Option/Alt + Shift: → skip · ← previous · Space play/pause · L love · V visuals. Playing from a playlist: N not for this · R remove · M more like this. Available while SynAmp is focused. Use the Mac companion for global shortcuts.</p></details>
      </div>}
      {!view && status && <p className="song-controls__status" role="status">{status}</p>}
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
