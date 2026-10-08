/*
 * SynAmp's playback engine: every song goes through Web Audio, so volume,
 * fades and the moment the next song starts are all timed by the sound card's
 * clock, not by the page (which browsers slow down in background tabs).
 *
 * Two ways to play a song ("voices"):
 *   - ElementVoice: an <audio> element, streamed. Starts quickly, uses little
 *     memory. Used for single songs, crossfades, radio and lighter streams.
 *   - BufferVoice: the whole song decoded into memory. Used for albums played
 *     straight through: the next song is scheduled to start on the exact
 *     sample the last one ends ("gapless"), and the silence encoders add at
 *     each end (MP3 LAME / M4A iTunSMPB, from the brain) is trimmed, if the
 *     browser hasn't trimmed it already.
 *
 * Transitions between the current song and the next:
 *   - gapless: back to back, to the sample (both decoded), or as close as an
 *     <audio> element allows.
 *   - crossfade: the next song fades in over the end of this one (equal power,
 *     so the sum doesn't dip in the middle). DJ mode uses longer ones.
 *   - cut: the next song starts when this one ends.
 * A skip mid-song blends into the next song too ("skip blend").
 *
 * The engine only plays sound. The player (Player.tsx) tells it what's
 * current and what's next (from the brain's queue), and reports what it hears
 * back to the brain.
 */

export type Gapless = { delay: number; padding: number; samples: number; rate: number };
export type Item = { id: string; url: string; live?: boolean; gapless?: Gapless; title?: string };
export type Transition = { kind: "gapless" | "crossfade" | "cut"; seconds: number };
export type EngineEvents = {
  /** Sound for this song started (the first time). */
  started: (id: string, duration: number) => void;
  /** This song finished, or began fading out into the next. */
  ended: (id: string, played: number, duration: number) => void;
  /** About four times a second while playing. */
  time: (id: string, position: number, duration: number) => void;
  error: (id: string, message: string) => void;
  paused: (paused: boolean) => void;
  /** Waiting for a song to load (decoding an album track can take a second). */
  loading: (loading: boolean) => void;
};

/** Decoded songs longer than this are streamed instead (memory). */
const MAX_DECODE_SECONDS = 20 * 60;
const SWITCH_FADE = 0.12;

type Voice = {
  item: Item;
  kind: "element" | "buffer";
  gain: GainNode;
  ready: Promise<void>;
  duration(): number;
  position(): number;
  playing(): boolean;
  /** Start (or restart) at `offset` seconds, at context time `when` (now if earlier). */
  start(when: number, offset: number): void;
  pause(): void;
  /** When the sound will end, in context time (decoded songs only, while playing). */
  endsAt(): number | null;
  dispose(): void;
  onended?: () => void;
  onerror?: (message: string) => void;
  onplaying?: () => void;
};

/** How much encoder silence to cut from a decoded buffer: browsers differ in whether they already did. */
export function trimFor(bufferSeconds: number, gapless: Gapless | undefined): { start: number; length: number } {
  if (!gapless) return { start: 0, length: bufferSeconds };
  const real = gapless.samples / gapless.rate;
  const full = (gapless.samples + gapless.delay + gapless.padding) / gapless.rate;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.03;
  if (near(bufferSeconds, real)) return { start: 0, length: bufferSeconds };        // already trimmed
  if (near(bufferSeconds, full)) return { start: gapless.delay / gapless.rate, length: real };
  if (bufferSeconds > real) return { start: Math.min(gapless.delay / gapless.rate, bufferSeconds - real), length: real };
  return { start: 0, length: bufferSeconds };
}

/** Equal-power fade curves (the sum of the two stays at the same loudness). */
function curve(up: boolean, steps = 64): Float32Array {
  const out = new Float32Array(steps);
  for (let i = 0; i < steps; i++) { const t = i / (steps - 1); out[i] = up ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2); }
  return out;
}

export class PlaybackEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private events: EngineEvents;
  private elements: Array<{ el: HTMLAudioElement; gain: GainNode; busy: boolean }> = [];
  private current: Voice | null = null;
  private next: Voice | null = null;
  private plan: { current: Item | null; next: Item | null; transition: Transition; decode: boolean } =
    { current: null, next: null, transition: { kind: "cut", seconds: 0 }, decode: false };
  private scheduled = false;     // the next song is already set to start (gapless, decoded)
  private scheduling: Voice | null = null; // waiting for the next song to finish decoding, to schedule it
  private fading = false;        // a crossfade or skip blend is under way
  private wantPlay = false;
  private startedFor = "";
  private endedFor = "";
  private played = 0;
  private lastPosition = 0;
  private timer: number;

  constructor(events: EngineEvents, ctx: AudioContext) {
    this.events = events;
    this.ctx = ctx;
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    for (let i = 0; i < 3; i++) {
      const el = new Audio();
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      const gain = this.ctx.createGain();
      this.ctx.createMediaElementSource(el).connect(gain);
      gain.connect(this.master);
      this.elements.push({ el, gain, busy: false });
    }
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  /** The sound going to the speakers (for the visuals). */
  output(): AudioNode { return this.master; }
  setVolume(volume: number): void { this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.02); }
  isPlaying(): boolean { return !!this.current?.playing(); }
  position(): number { return this.current?.position() ?? 0; }
  duration(): number { return this.current?.duration() ?? 0; }
  currentId(): string | undefined { return this.current?.item.id; }

  /**
   * What's current and what's next, from the queue. `decode`: play this run
   * from decoded audio (albums straight through, full-quality streams).
   */
  setPlan(current: Item | null, next: Item | null, transition: Transition, decode: boolean): void {
    this.plan = { current, next, transition, decode };
    if (!current) { this.stopAll(); return; }
    if (this.current?.item.id === current.id) {
      // Same song: only what comes next may have changed.
      if (this.next && this.next.item.id !== next?.id) { this.unschedule(); this.next.dispose(); this.next = null; }
      if (decode && this.current.kind === "buffer") this.prepareNext();
      return;
    }
    // The brain moved on to the song that's already playing next (after a gapless join or a fade): nothing to do.
    if (this.next && this.next.item.id === current.id && this.next.playing()) { this.promote(); return; }
    // Anything else (a jump, Previous, a new queue): switch, with a short fade so it doesn't click.
    this.switchTo(current);
  }

  play(): void {
    this.wantPlay = true;
    void this.ctx.resume();
    const voice = this.current;
    if (!voice && this.plan.current) this.switchTo(this.plan.current);
    else if (voice && !voice.playing()) {
      this.events.loading(true);
      voice.ready.then(() => { if (this.current === voice && this.wantPlay && !voice.playing()) voice.start(this.ctx.currentTime, voice.position()); }, () => undefined);
    }
    this.events.paused(false);
  }

  pause(): void {
    this.wantPlay = false;
    this.finishFade();
    this.unschedule();
    this.current?.pause();
    this.events.paused(true);
  }

  seek(seconds: number): void {
    if (!this.current) return;
    this.finishFade();
    this.unschedule();
    const playing = this.current.playing();
    this.lastPosition = seconds;
    if (playing) this.current.start(this.ctx.currentTime, seconds);
    else { this.current.pause(); (this.current as Voice & { seekPaused?: (s: number) => void }).seekPaused?.(seconds); }
  }

  /**
   * Skip mid-song: blend into the next song over `seconds` (0: fade out
   * quickly instead). The player reports the skip; the brain moves the queue on.
   */
  skip(seconds: number): void {
    const voice = this.current;
    if (!voice || !voice.playing()) return;
    this.finishFade();
    this.unschedule();
    const next = this.plan.next;
    if (!seconds || !next) { this.endedFor = voice.item.id; this.fadeOut(voice, 0.4); this.current = null; return; }
    // Something already lined up for this next song? Use it; otherwise stream it now (fast to start).
    let incoming = this.next && this.next.item.id === next.id ? this.next : null;
    if (!incoming) { this.next?.dispose(); incoming = this.makeVoice(next, false); }
    this.next = incoming;
    // A skip is reported by the player as a skip, not as the song ending.
    this.endedFor = voice.item.id;
    this.crossfade(voice, incoming, seconds);
  }

  stopAll(): void {
    this.finishFade();
    this.unschedule();
    this.current?.dispose();
    this.next?.dispose();
    this.current = this.next = null;
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.stopAll();
    this.master.disconnect();
  }

  // --- inside ---------------------------------------------------------------------

  private makeVoice(item: Item, decode: boolean): Voice {
    const voice = decode && !item.live ? new BufferVoice(this.ctx, this.master, item) : this.elementVoice(item);
    voice.onerror = (message) => {
      if (voice.kind === "buffer" && voice === this.current && !voice.playing()) {
        // Couldn't decode it (memory, a format the browser won't decode whole): stream it instead.
        const fallback = this.elementVoice(item);
        this.current = fallback;
        this.wire(fallback);
        if (this.wantPlay) fallback.start(this.ctx.currentTime, 0);
        return;
      }
      this.events.error(item.id, message);
    };
    this.wire(voice);
    return voice;
  }

  private elementVoice(item: Item): Voice {
    const slot = this.elements.find((e) => !e.busy) ?? this.elements[0]!;
    slot.busy = true;
    return new ElementVoice(this.ctx, slot, item);
  }

  private wire(voice: Voice): void {
    voice.onended = () => {
      if (voice !== this.current) return;
      // A song with nothing scheduled after it (cut, or a streamed join): start the next one now.
      const next = this.next;
      this.reportEnded(voice);
      if (next && this.plan.next?.id === next.item.id && !next.playing()) {
        next.gain.gain.value = 1;
        next.start(this.ctx.currentTime, 0);
        this.current = next; this.next = null;
        this.beginSong(next);
      } else if (!next?.playing()) {
        this.current = null;
      }
    };
    voice.onplaying = () => { if (voice === this.current) this.beginSong(voice); };
  }

  private beginSong(voice: Voice): void {
    if (this.startedFor === voice.item.id) return;
    this.startedFor = voice.item.id;
    this.played = 0; this.lastPosition = voice.position();
    this.events.started(voice.item.id, voice.duration());
    this.events.loading(false);
  }

  private reportEnded(voice: Voice): void {
    if (this.endedFor === voice.item.id) return;
    this.endedFor = voice.item.id;
    this.events.ended(voice.item.id, this.played, voice.duration());
  }

  private switchTo(item: Item): void {
    this.finishFade();
    this.unschedule();
    const old = this.current;
    if (old) this.fadeOut(old, SWITCH_FADE);
    this.next?.dispose();
    this.next = null;
    const voice = this.makeVoice(item, this.plan.decode);
    this.current = voice;
    this.endedFor = "";
    if (this.wantPlay) {
      this.events.loading(true);
      voice.ready.then(() => { if (this.current === voice && this.wantPlay) voice.start(this.ctx.currentTime, 0); }, () => undefined);
    }
  }

  /** The next song is now the current one (it's already playing). */
  private promote(): void {
    const next = this.next!;
    this.current = next;
    this.next = null;
    this.scheduled = false;
    this.beginSong(next);
  }

  private prepareNext(): void {
    const item = this.plan.next;
    if (!item || item.live || this.next?.item.id === item.id) return;
    this.next?.dispose();
    const decode = this.plan.decode && this.plan.transition.kind === "gapless";
    this.next = this.makeVoice(item, decode);
  }

  private unschedule(): void {
    if (this.scheduled && this.next) { this.next.pause(); this.next.gain.gain.cancelScheduledValues(0); this.next.gain.gain.value = 1; }
    this.scheduled = false;
    this.scheduling = null;
  }

  private fadeOut(voice: Voice, seconds: number): void {
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
    window.setTimeout(() => voice.dispose(), seconds * 1000 + 100);
  }

  private crossfade(from: Voice, to: Voice, seconds: number): void {
    this.fading = true;
    const now = this.ctx.currentTime + 0.05;
    const span = Math.max(0.5, seconds);
    to.gain.gain.cancelScheduledValues(0);
    to.gain.gain.setValueAtTime(0, this.ctx.currentTime); // silent from this moment, even if it starts a little early
    to.gain.gain.setValueAtTime(0, now);
    to.gain.gain.setValueCurveAtTime(curve(true), now, span);
    from.gain.gain.cancelScheduledValues(0);
    from.gain.gain.setValueAtTime(from.gain.gain.value || 1, now);
    from.gain.gain.setValueCurveAtTime(curve(false), now, span);
    to.ready.then(() => { if (this.next === to || this.current === to) to.start(now, 0); }, () => undefined);
    this.reportEnded(from);
    this.current = to; this.next = null;
    window.setTimeout(() => { from.dispose(); this.fading = false; }, (span + 0.2) * 1000);
  }

  private finishFade(): void { /* fades run on the audio clock; nothing to cancel by hand */ }

  private tick(): void {
    const voice = this.current;
    if (!voice || !voice.playing()) return;
    const position = voice.position(), duration = voice.duration();
    const delta = position - this.lastPosition;
    if (delta > 0 && delta < 1.5) this.played += delta;
    this.lastPosition = position;
    this.events.time(voice.item.id, position, duration);
    if (!Number.isFinite(duration) || duration <= 0 || this.fading || voice.item.live) return;
    const left = duration - position;
    const { kind, seconds } = this.plan.transition;
    // Line the next song up: decoded runs straight away, streamed ones half a minute ahead.
    if (this.plan.next && !this.next && (this.plan.decode || left < Math.max(25, seconds + 10))) this.prepareNext();
    const next = this.next;
    if (!next || next.item.id !== this.plan.next?.id) return;
    if (kind === "gapless" && voice.kind === "buffer" && next.kind === "buffer" && !this.scheduled && this.scheduling !== next) {
      this.scheduling = next;
      next.ready.then(() => {
        if (this.scheduling === next) this.scheduling = null;
        const end = voice.endsAt();
        if (this.current !== voice || this.next !== next || this.scheduled || end === null || !voice.playing()) return;
        // To the sample: the next song starts exactly when this one's last sample has played.
        next.gain.gain.value = 1;
        next.start(end, 0);
        this.scheduled = true;
        window.setTimeout(() => {
          if (this.current !== voice) return;
          this.reportEnded(voice);
          this.promote();
          voice.dispose();
        }, Math.max(0, (end - this.ctx.currentTime) * 1000) + 30);
      }, () => { if (this.scheduling === next) this.scheduling = null; });
      return;
    }
    // Never more than a third of the song (a 12-second DJ blend on a 30-second interlude would swallow it).
    const span = Math.min(seconds, duration / 3);
    if (kind === "crossfade" && span > 0 && left <= span && left > 0.3) this.crossfade(voice, next, Math.min(span, left));
  }
}

// --- the two voices --------------------------------------------------------------------

class ElementVoice implements Voice {
  readonly kind = "element" as const;
  readonly item: Item;
  readonly gain: GainNode;
  readonly ready: Promise<void>;
  onended?: () => void;
  onerror?: (message: string) => void;
  onplaying?: () => void;
  private ctx: AudioContext;
  private slot: { el: HTMLAudioElement; gain: GainNode; busy: boolean };
  private disposed = false;
  private timer = 0;

  constructor(ctx: AudioContext, slot: { el: HTMLAudioElement; gain: GainNode; busy: boolean }, item: Item) {
    this.ctx = ctx; this.slot = slot; this.item = item; this.gain = slot.gain;
    const el = slot.el;
    this.gain.gain.cancelScheduledValues(0);
    this.gain.gain.value = 1;
    el.onended = () => { if (!this.disposed) this.onended?.(); };
    el.onerror = () => { if (!this.disposed) this.onerror?.(el.error?.message || "playback failed"); };
    el.onplaying = () => { if (!this.disposed) this.onplaying?.(); };
    el.src = item.url;
    el.load();
    this.ready = new Promise((resolve, reject) => {
      if (el.readyState >= 2) { resolve(); return; }
      el.addEventListener("canplay", () => resolve(), { once: true });
      el.addEventListener("error", () => reject(new Error("couldn't load")), { once: true });
    });
    this.ready.catch(() => undefined);
  }
  duration(): number { const d = this.slot.el.duration; return Number.isFinite(d) ? d : 0; }
  position(): number { return this.slot.el.currentTime; }
  playing(): boolean { return !this.slot.el.paused && !this.slot.el.ended; }
  endsAt(): number | null { return null; }
  start(when: number, offset: number): void {
    const go = () => {
      if (this.disposed) return;
      const el = this.slot.el;
      if (Math.abs(el.currentTime - offset) > 0.05) el.currentTime = offset;
      el.play().catch((cause) => this.onerror?.((cause as Error).name === "NotAllowedError" ? "Press play to start — the browser blocked autoplay." : String(cause)));
    };
    window.clearTimeout(this.timer);
    const wait = (when - this.ctx.currentTime) * 1000;
    if (wait > 15) this.timer = window.setTimeout(go, wait); else go();
  }
  seekPaused(seconds: number): void { this.slot.el.currentTime = seconds; }
  pause(): void { window.clearTimeout(this.timer); this.slot.el.pause(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.timer);
    const el = this.slot.el;
    el.pause(); el.onended = el.onerror = el.onplaying = null;
    el.removeAttribute("src"); el.load();
    this.slot.busy = false;
  }
}

class BufferVoice implements Voice {
  readonly kind = "buffer" as const;
  readonly item: Item;
  readonly gain: GainNode;
  readonly ready: Promise<void>;
  onended?: () => void;
  onerror?: (message: string) => void;
  onplaying?: () => void;
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private trim = { start: 0, length: 0 };
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;      // context time the source started (or will)
  private startOffset = 0;    // song position it started from
  private pausedAt = 0;
  private disposed = false;
  private abort = new AbortController();

  constructor(ctx: AudioContext, destination: AudioNode, item: Item) {
    this.ctx = ctx; this.item = item;
    this.gain = ctx.createGain();
    this.gain.connect(destination);
    this.ready = (async () => {
      const response = await fetch(item.url, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (this.disposed) throw new Error("gone");
      const buffer = await ctx.decodeAudioData(bytes);
      if (buffer.duration > MAX_DECODE_SECONDS) throw new Error("too long to decode whole");
      this.buffer = buffer;
      this.trim = trimFor(buffer.duration, item.gapless);
    })();
    this.ready.catch((cause) => { if (!this.disposed) this.onerror?.((cause as Error).message); });
  }
  duration(): number { return this.buffer ? this.trim.length : 0; }
  position(): number {
    if (!this.source) return this.pausedAt;
    return Math.min(this.trim.length, Math.max(this.startOffset, this.startOffset + this.ctx.currentTime - this.startedAt));
  }
  playing(): boolean { return !!this.source && this.ctx.currentTime < (this.endsAt() ?? 0) + 0.05; }
  endsAt(): number | null { return this.source ? this.startedAt + (this.trim.length - this.startOffset) : null; }
  start(when: number, offset: number): void {
    if (!this.buffer || this.disposed) return;
    this.stopSource();
    const at = Math.max(when, this.ctx.currentTime);
    const from = Math.max(0, Math.min(offset, this.trim.length));
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    source.onended = () => { if (this.source === source && !this.disposed) { this.source = null; this.pausedAt = this.trim.length; this.onended?.(); } };
    source.start(at, this.trim.start + from, this.trim.length - from);
    this.source = source; this.startedAt = at; this.startOffset = from;
    window.setTimeout(() => { if (this.source === source) this.onplaying?.(); }, Math.max(0, (at - this.ctx.currentTime) * 1000));
  }
  seekPaused(seconds: number): void { this.pausedAt = seconds; }
  pause(): void { if (this.source) { this.pausedAt = this.position(); this.stopSource(); } }
  private stopSource(): void {
    const source = this.source;
    if (!source) return;
    this.source = null;
    source.onended = null;
    try { source.stop(); } catch { /* not started yet */ }
    source.disconnect();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.stopSource();
    this.gain.disconnect();
    this.buffer = null;
  }
}
