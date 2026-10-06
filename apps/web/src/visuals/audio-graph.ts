/*
 * One AudioContext for the whole app, and the "which <audio> is playing now"
 * register the visualizer reads from.
 *
 * Routing an <audio> element through Web Audio is one-way: once tapped, its
 * sound goes through this context for good. So nothing is tapped until you
 * open the visuals (a click, which also lets the context start), and each
 * element is tapped at most once.
 */

let context: AudioContext | null = null;
const taps = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
let active: HTMLAudioElement | null = null;
const listeners = new Set<(el: HTMLAudioElement | null) => void>();

/** The player and the radio call this when they start making sound. */
export function setActiveAudio(el: HTMLAudioElement | null) {
  active = el;
  for (const listener of listeners) listener(el);
}

export function onActiveAudio(listener: (el: HTMLAudioElement | null) => void): () => void {
  listeners.add(listener);
  listener(active);
  return () => { listeners.delete(listener); };
}

export function audioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** The element's sound as a Web Audio node (still playing through the speakers). */
export function tap(el: HTMLAudioElement): AudioNode {
  const existing = taps.get(el);
  if (existing) return existing;
  const ctx = audioContext();
  const source = ctx.createMediaElementSource(el);
  source.connect(ctx.destination);
  taps.set(el, source);
  return source;
}
