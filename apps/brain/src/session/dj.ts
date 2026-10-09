/**
 * DJ mode: put songs in an order where each one flows into the next.
 *
 * Neighbours should have close tempos (a half or double tempo counts as
 * close: 70 and 140 BPM share a beat) and compatible keys on the Camelot
 * wheel (the same key, its relative major/minor, or one step round the
 * wheel), without a big jump in loudness. The order is built greedily from
 * the first song (the one you picked, or the first of the album/playlist),
 * then tidied with a few rounds of 2-opt so no stretch of the set is badly
 * matched when a better swap exists.
 *
 * Songs SynAmp hasn't measured (no steady beat, no clear key yet) still go
 * in, just with less to go on; they're never dropped. Each song gets a short
 * reason ("same key, +2 BPM") so the queue can show why it's there.
 */

export type DjTrack = { id: string; bpm?: number; camelot?: string; lufs?: number;
  /** How sure the key is (0.72–1; below 0.8 it's trusted less). */
  keyStrength?: number };
export type DjStep = { id: string; note?: string };

/** How far apart two tempos are, in percent, counting half/double time as the same beat. */
export function tempoGap(a: number, b: number): number {
  const ratios = [b / a, (b * 2) / a, b / (a * 2)];
  const octaves = Math.min(...ratios.map((r) => Math.abs(Math.log2(r))));
  return (2 ** octaves - 1) * 100;
}

/** 0 same key · 1 relative or one step on the wheel · 2 two steps · 3+ further. */
export function keyDistance(a: string, b: string): number {
  const parse = (code: string) => { const m = code.match(/^(\d{1,2})([AB])$/); return m ? { n: Number(m[1]), l: m[2]! } : null; };
  const x = parse(a), y = parse(b);
  if (!x || !y) return 3;
  const round = Math.min(Math.abs(x.n - y.n), 12 - Math.abs(x.n - y.n));
  if (x.l === y.l) return round;
  return round === 0 ? 1 : round + 1;
}

const UNKNOWN = 0.9;
/** How badly `b` follows `a`: lower is smoother. */
export function transitionCost(a: DjTrack, b: DjTrack): number {
  const tempo = a.bpm && b.bpm ? Math.min(2, tempoGap(a.bpm, b.bpm) / 6) : UNKNOWN; // 6 % apart costs 1
  const sure = (t: DjTrack) => (t.keyStrength === undefined || t.keyStrength >= 0.8 ? 1 : 0.6);
  const key = a.camelot && b.camelot ? [0, 0.25, 0.8, 1.6, 2, 2, 2][keyDistance(a.camelot, b.camelot)]! * Math.min(sure(a), sure(b)) + (1 - Math.min(sure(a), sure(b))) * UNKNOWN : UNKNOWN;
  const loud = a.lufs !== undefined && b.lufs !== undefined ? Math.min(1, Math.abs(a.lufs - b.lufs) / 8) * 0.3 : 0;
  return tempo + key + loud;
}

export function djOrder(tracks: DjTrack[], options: { start?: number; passes?: number } = {}): DjStep[] {
  if (tracks.length <= 1) return tracks.map((t) => ({ id: t.id }));
  const left = tracks.map((_, i) => i);
  const first = Math.min(Math.max(0, options.start ?? 0), tracks.length - 1);
  const order = [first];
  left.splice(first, 1);
  while (left.length) {
    const from = tracks[order.at(-1)!]!;
    let best = 0, bestCost = Infinity;
    for (let i = 0; i < left.length; i++) {
      const cost = transitionCost(from, tracks[left[i]!]!);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    order.push(left.splice(best, 1)[0]!);
  }
  // 2-opt: reverse a stretch when that makes its two ends join better (the first song stays first).
  const cost = (i: number, j: number) => transitionCost(tracks[order[i]!]!, tracks[order[j]!]!);
  const passes = order.length > 400 ? 0 : options.passes ?? 3;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const before = cost(i - 1, i) + (j + 1 < order.length ? cost(j, j + 1) : 0);
        const after = cost(i - 1, j) + (j + 1 < order.length ? cost(i, j + 1) : 0);
        if (after < before - 1e-9) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order.map((index, position) => {
    const track = tracks[index]!;
    if (position === 0) return { id: track.id };
    const why = note(tracks[order[position - 1]!]!, track);
    return { id: track.id, ...(why ? { note: why } : {}) };
  });
}

/** "same key · +2 BPM", for the queue. */
export function note(a: DjTrack, b: DjTrack): string | undefined {
  const parts: string[] = [];
  if (a.camelot && b.camelot) {
    const d = keyDistance(a.camelot, b.camelot);
    parts.push(d === 0 ? "same key" : d === 1 ? "neighbouring key" : `${b.camelot}`);
  }
  if (a.bpm && b.bpm) {
    const direct = Math.round(b.bpm - a.bpm);
    const half = Math.abs(Math.log2(b.bpm / a.bpm)) > 0.6;
    parts.push(half ? "half/double time" : direct === 0 ? "same tempo" : `${direct > 0 ? "+" : "−"}${Math.abs(direct)} BPM`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}
