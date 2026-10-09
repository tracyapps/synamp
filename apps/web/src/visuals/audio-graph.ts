/*
 * One AudioContext for the whole app (the player's engine and the visuals
 * share it: Web Audio nodes only connect within one context), and the
 * "what's playing now" register the visualizer reads from.
 *
 * Routing an <audio> element through Web Audio is one-way: once tapped, its
 * sound goes through this context for good. So nothing is tapped until you
 * open the visuals (a click, which also lets the context start), and each
 * element is tapped at most once.
 */

let context: AudioContext | null = null;
const taps = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
/** What's making sound: the radio's <audio> element, or the player's engine output (already Web Audio). */
export type AudioSource = HTMLAudioElement | AudioNode;
let active: AudioSource | null = null;
const listeners = new Set<(source: AudioSource | null) => void>();

/** The player and the radio call this when they start making sound. */
export function setActiveAudio(source: AudioSource | null) {
  active = source;
  for (const listener of listeners) listener(source);
}

export function onActiveAudio(listener: (source: AudioSource | null) => void): () => void {
  listeners.add(listener);
  listener(active);
  return () => { listeners.delete(listener); };
}

export function audioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** The element's sound as a Web Audio node (still playing through the speakers). A node is already one. */
export function tap(source: AudioSource): AudioNode {
  if (!(source instanceof HTMLMediaElement)) return source;
  const el = source as HTMLAudioElement;
  const existing = taps.get(el);
  if (existing) return existing;
  const ctx = audioContext();
  const node = ctx.createMediaElementSource(el);
  node.connect(ctx.destination);
  taps.set(el, node);
  return node;
}
