import { useEffect, useId, useRef, useState } from "react";
import "./styles/player.css";
import { newId } from "./ids";
import Icon from "./ui/Icon";
import { setActiveAudio } from "./visuals/audio-graph";
import { streamUrl, usePrefs, writePrefs } from "./playback-prefs";

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
};
export type SessionView = { id: string; queue: QueueEntry[]; index: number; state: "idle" | "playing" | "paused" };
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
   * Two decks, like a DJ: the live one plays the current song while the other
   * lines up the next, so the next song starts at once (no gap while it loads)
   * or fades in over the end of this one (crossfade). The brain still decides
   * what each report means; the decks only change when sound starts.
   */
  const deckA = useRef<HTMLAudioElement>(null);
  const deckB = useRef<HTMLAudioElement>(null);
  const decks = [deckA, deckB];
  const live = useRef(0);
  const deckEntry = useRef<[string | null, string | null]>([null, null]);
  const el = () => decks[live.current]!.current;
  const spare = () => decks[1 - live.current]!.current;
  const fade = useRef<{ frame: number; from: HTMLAudioElement; to: HTMLAudioElement } | null>(null);
  const endedFor = useRef("");        // entry whose "ended" we've already reported (a crossfade reports early)
  const played = useRef(0);           // seconds actually listened to (seeks excluded)
  const last = useRef(0);             // last playhead position, to tell listening from seeking
  const started = useRef<string>(""); // entry we've already reported "start" for
  const heartbeat = useRef(0);
  const wantPlay = useRef(false);
  const prefs = usePrefs();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [status, setStatus] = useState("");
  const [undo, setUndo] = useState<null | { track_id: string; playlist_id: string }>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [askWhy, setAskWhy] = useState(false);
  const queueId = useId();
  const current = session ? session.queue[session.index] : undefined;
  const upNext = session ? session.queue[session.index + 1] : undefined;

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
  const playedMs = () => Math.round(played.current * 1000);
  const durationMs = () => { const a = el(); return a && Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : undefined; };
  const clear = (deck: HTMLAudioElement | null, index: number) => {
    if (!deck) return;
    deck.pause(); deck.removeAttribute("src"); deck.load();
    deckEntry.current[index] = null;
  };
  const stopFade = (finish = true) => {
    const running = fade.current;
    if (!running) return;
    cancelAnimationFrame(running.frame);
    fade.current = null;
    if (finish) { running.from.pause(); running.to.volume = prefs.volume; }
  };

  // Volume follows the setting (a fade in progress sets its own levels).
  useEffect(() => { if (!fade.current) { for (const deck of decks) if (deck.current) deck.current.volume = prefs.volume; } }, [prefs.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  // The current entry changed: either the spare deck already has it (it's
  // fading in, or lined up), or load it on the live deck.
  useEffect(() => {
    played.current = 0; last.current = 0; heartbeat.current = 0;
    setPosition(0); setAskWhy(false);
    const spareIndex = 1 - live.current;
    if (current && deckEntry.current[spareIndex] === current.entry_id && spare()?.getAttribute("src")) {
      live.current = spareIndex;
      const deck = el()!;
      setDuration(Number.isFinite(deck.duration) ? deck.duration : 0);
      if (!fade.current) clear(spare(), 1 - live.current);
      if (!deck.paused) {
        setPaused(false);
        setActiveAudio(deck);
        if (started.current !== current.entry_id) { started.current = current.entry_id; reportFor(current.entry_id, "start", { duration_ms: durationMs() }); }
      } else if (wantPlay.current) deck.play().catch(() => setStatus("Press play to start — the browser blocked autoplay."));
      return;
    }
    stopFade();
    clear(spare(), spareIndex);
    const deck = el();
    if (!deck) return;
    setDuration(0);
    if (!current?.playable || !current.stream_url) { clear(deck, live.current); return; }
    deck.src = current.live ? current.stream_url : streamUrl(current.stream_url, prefs);
    deck.volume = prefs.volume;
    deckEntry.current[live.current] = current.entry_id;
    if (wantPlay.current) deck.play().catch(() => setStatus("Press play to start — the browser blocked autoplay."));
  }, [current?.entry_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (away && el() && !el()!.paused) { stopFade(); el()!.pause(); reportFor(current?.entry_id, "pause"); }
  }, [away]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopFade(false), []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <audio ref={deckA} /><audio ref={deckB} />
      <div className="player__now">
        <span className="player__cover" aria-hidden="true" />
        <div className="player__text"><p className="player__title">Nothing playing</p><p className="player__meta">Press Play on an album or a playlist.</p></div>
      </div>
    </section>
  );

  const entryBody = (type: string, extra: Record<string, unknown> = {}) =>
    ({ event_id: newId(), report: { type, entry_id: current?.entry_id, ...extra } });
  const isLive = (event: { currentTarget: HTMLAudioElement }) => event.currentTarget === el();
  /** Crossfade into the next song, unless it's the next track of the same album (albums play straight through). */
  const fadeSeconds = () => {
    if (!prefs.crossfade || !upNext) return 0;
    if (prefs.albumsStraight && current?.album_key && current.album_key === upNext.album_key) return 0;
    return prefs.crossfade;
  };

  const onPlaying = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    const index = event.currentTarget === deckA.current ? 0 : 1;
    if (deckEntry.current[index] !== current?.entry_id) return; // the next song, fading in: reported once it's current
    setPaused(false);
    setActiveAudio(event.currentTarget);
    if (current && started.current !== current.entry_id) {
      started.current = current.entry_id;
      report(entryBody("start", { duration_ms: durationMs() }));
    } else report(entryBody("resume"));
  };
  const onTime = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!isLive(event)) return;
    const deck = event.currentTarget;
    const delta = deck.currentTime - last.current;
    if (delta > 0 && delta < 1.5) played.current += delta; // normal playback, not a jump
    last.current = deck.currentTime;
    setPosition(deck.currentTime);
    if (played.current - heartbeat.current >= 10) {
      heartbeat.current = played.current;
      report(entryBody("progress", { played_ms: playedMs() }));
    }
    if (!Number.isFinite(deck.duration) || deck.paused || fade.current) return;
    const left = deck.duration - deck.currentTime;
    const spareIndex = 1 - live.current;
    const other = spare();
    // Line up the next song 20 seconds early so it can start at once.
    if (upNext?.playable && upNext.stream_url && !upNext.live && other && left < Math.max(20, fadeSeconds() + 8) && deckEntry.current[spareIndex] !== upNext.entry_id) {
      other.preload = "auto";
      other.src = streamUrl(upNext.stream_url, prefs);
      other.volume = prefs.volume;
      deckEntry.current[spareIndex] = upNext.entry_id;
      other.load();
    }
    const seconds = fadeSeconds();
    if (seconds > 0 && other && deckEntry.current[spareIndex] === upNext?.entry_id && left <= seconds && current) {
      // Equal-power crossfade: the sum sounds steady, not dipping in the middle.
      const begin = performance.now();
      const span = Math.max(0.5, Math.min(seconds, left)) * 1000;
      other.volume = 0;
      other.currentTime = 0;
      other.play().catch(() => undefined);
      const step = () => {
        const t = Math.min(1, (performance.now() - begin) / span);
        deck.volume = prefs.volume * Math.cos((t * Math.PI) / 2);
        other.volume = prefs.volume * Math.sin((t * Math.PI) / 2);
        if (t < 1) fade.current!.frame = requestAnimationFrame(step);
        else { deck.pause(); fade.current = null; }
      };
      fade.current = { frame: requestAnimationFrame(step), from: deck, to: other };
      // The song played to its end as far as listening goes: report it now so the brain moves on.
      endedFor.current = current.entry_id;
      wantPlay.current = true;
      report(entryBody("ended", { played_ms: playedMs(), duration_ms: durationMs() }));
    }
  };
  const onEnded = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    const index = event.currentTarget === deckA.current ? 0 : 1;
    const entryId = deckEntry.current[index];
    if (!entryId || entryId === endedFor.current) return; // already reported when the crossfade began
    endedFor.current = entryId;
    wantPlay.current = true;
    // No crossfade: start the lined-up next song straight away, before the brain answers.
    const other = spare();
    if (upNext && other && deckEntry.current[1 - live.current] === upNext.entry_id) {
      other.volume = prefs.volume;
      other.play().catch(() => undefined);
    }
    reportFor(entryId, "ended", { played_ms: playedMs(), duration_ms: durationMs() });
  };
  const onSeeked = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!isLive(event)) return;
    const deck = event.currentTarget;
    report(entryBody("seek", { from_ms: Math.round(last.current * 1000), to_ms: Math.round(deck.currentTime * 1000) }));
    last.current = deck.currentTime;
  };

  const toggle = () => {
    const deck = el()!;
    if (!current?.playable) return;
    if (deck.paused) { wantPlay.current = true; deck.play().catch((cause) => setStatus(String(cause))); }
    else { stopFade(); deck.pause(); wantPlay.current = false; report(entryBody("pause")); }
  };
  const next = () => {
    const deck = el();
    wantPlay.current = !deck?.paused || wantPlay.current;
    stopFade();
    const body = entryBody("skip", { played_ms: playedMs(), duration_ms: durationMs() });
    // With crossfade on, a skip dips out over half a second instead of cutting.
    if (!prefs.crossfade || !deck || deck.paused) { report(body); return; }
    const begin = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - begin) / 500);
      deck.volume = prefs.volume * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else { deck.pause(); deck.volume = prefs.volume; report(body); }
    };
    requestAnimationFrame(step);
  };
  const previous = () => {
    stopFade();
    const deck = el();
    if (played.current > 3 && deck) { deck.currentTime = 0; last.current = 0; }
    report({ event_id: newId(), report: { type: "previous", entry_id: current?.entry_id, played_ms: playedMs() } });
  };
  const jump = (index: number) => {
    wantPlay.current = true;
    stopFade();
    report({ event_id: newId(), report: { type: "jump", index, entry_id: current?.entry_id, played_ms: playedMs() } });
  };
  controls.current = { toggle, next, previous, seek: (seconds) => { const deck = el(); if (deck) { stopFade(); deck.currentTime = seconds; } } };

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
      {[deckA, deckB].map((deck, index) => (
        <audio key={index} ref={deck} preload="metadata" onPlaying={onPlaying} onTimeUpdate={onTime} onSeeked={onSeeked} onEnded={onEnded}
          onPause={(event) => { if (isLive(event) && !fade.current) setPaused(true); }}
          onLoadedMetadata={(event) => { if (isLive(event)) setDuration(event.currentTarget.duration); }}
          onError={(event) => { if (isLive(event) && current?.playable) report(entryBody("error", { message: event.currentTarget.error?.message || "playback failed" })); }} />
      ))}
      <div className="player__now">
        <span className="player__cover" aria-hidden="true" />
        <div className="player__text">
          {finished ? <p className="player__title">End of queue</p> : <>
            <p className="player__title">{current?.title}</p>
            <p className="player__meta">{current?.artist ? `${current.artist} · ` : ""}{session.index + 1} of {session.queue.length}{from ? ` · from ${from}` : ""}{current?.requested_by ? ` · asked for by ${current.requested_by}` : ""}</p>
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
            onChange={(event) => { const deck = el(); if (deck) { stopFade(); deck.currentTime = Number(event.target.value); } }} />
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
            <button type="button" onClick={() => jump(index)}><span className="player__queue-n" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span>{entry.title}<small>{entry.artist ?? ""}{entry.playable ? "" : " · no file yet"}</small></span></button>
          </li>
        ))}
      </ol>
    </section>
  );
}
