/*
 * Smooth scrolling through a very long library: only the rows near the screen
 * are drawn, and only the pages of rows near the screen are fetched. The page
 * keeps its own scrollbar (the whole list is as tall as it would be), so
 * dragging the scrollbar to the middle of 100,000 songs fetches just that part.
 *
 * Pure (no React, no DOM), so it's tested on its own: tools/library-window.test.mts.
 *
 *  - Layout: how tall each line is (measured once drawn; a running average
 *    before that), where each line starts, and which lines a scroll position shows.
 *    A "line" is one row in the table and list, and one row of cards in the grid.
 *  - plan(): what to draw, as rows and the gaps between them. The row that has
 *    keyboard focus is always drawn, so focus is never lost while scrolling.
 *  - pagesFor(): which pages of results to ask the brain for.
 */

export const PAGE_SIZE = 100;

export class Layout {
  readonly lines: number;
  private heights: Float64Array;
  private measured: Uint8Array;
  private starts: Float64Array | null = null;
  private sum = 0;
  private count = 0;
  private estimate: number;

  constructor(lines: number, estimate: number) {
    this.estimate = estimate;
    this.lines = Math.max(0, lines);
    this.heights = new Float64Array(this.lines).fill(estimate);
    this.measured = new Uint8Array(this.lines);
  }

  /** A drawn line's real height. True when it changed anything. */
  measure(line: number, height: number): boolean {
    if (line < 0 || line >= this.lines || !(height > 0)) return false;
    if (this.measured[line] && Math.abs(this.heights[line]! - height) < 0.5) return false;
    if (this.measured[line]) this.sum -= this.heights[line]!;
    else { this.measured[line] = 1; this.count++; }
    this.sum += height;
    this.heights[line] = height;
    // Lines not drawn yet follow the average of those that have been.
    const average = this.sum / this.count;
    if (Math.abs(average - this.estimate) >= 0.5) {
      this.estimate = average;
      for (let i = 0; i < this.lines; i++) if (!this.measured[i]) this.heights[i] = average;
    }
    this.starts = null;
    return true;
  }

  private build(): Float64Array {
    if (this.starts) return this.starts;
    const starts = new Float64Array(this.lines + 1);
    for (let i = 0; i < this.lines; i++) starts[i + 1] = starts[i]! + this.heights[i]!;
    this.starts = starts;
    return starts;
  }

  /** Where a line starts, from the top of the list. */
  top(line: number): number { return this.build()[Math.max(0, Math.min(line, this.lines))]!; }
  get height(): number { return this.top(this.lines); }

  /** The line at a distance from the top of the list (clamped to the list). */
  lineAt(offset: number): number {
    if (!this.lines) return 0;
    const starts = this.build();
    let low = 0, high = this.lines - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! <= offset) low = mid; else high = mid - 1;
    }
    return low;
  }

  /** The lines between two distances from the top of the list, plus some either side. */
  range(from: number, to: number, overscan: number): { first: number; last: number } {
    if (!this.lines) return { first: 0, last: -1 };
    return { first: this.lineAt(Math.max(0, from - overscan)), last: this.lineAt(Math.max(0, to + overscan)) };
  }
}

export type Piece = { kind: "row"; index: number } | { kind: "gap"; from: number; to: number; height: number };

/**
 * What to draw: items first…last (by line, `perLine` items to a line), plus the
 * item that has focus, with gaps standing in for everything else.
 */
export function plan(layout: Layout, total: number, perLine: number, range: { first: number; last: number }, pinned?: number | null): Piece[] {
  if (total <= 0 || range.last < range.first) return total > 0 ? [{ kind: "gap", from: 0, to: layout.lines, height: layout.height }] : [];
  const lines = new Set<number>();
  for (let line = range.first; line <= range.last; line++) lines.add(line);
  if (pinned !== undefined && pinned !== null && pinned >= 0 && pinned < total) lines.add(Math.floor(pinned / perLine));
  const sorted = [...lines].filter((line) => line < layout.lines).sort((a, b) => a - b);
  const pieces: Piece[] = [];
  let next = 0;
  for (const line of sorted) {
    if (line > next) pieces.push({ kind: "gap", from: next, to: line, height: layout.top(line) - layout.top(next) });
    for (let index = line * perLine; index < Math.min(total, (line + 1) * perLine); index++) pieces.push({ kind: "row", index });
    next = line + 1;
  }
  if (next < layout.lines) pieces.push({ kind: "gap", from: next, to: layout.lines, height: layout.height - layout.top(next) });
  return pieces;
}

/** The pages of results that cover items first…last. */
export function pagesFor(first: number, last: number, total: number, size = PAGE_SIZE): number[] {
  if (total <= 0 || last < first) return [];
  const from = Math.max(0, Math.floor(first / size));
  const to = Math.min(Math.ceil(total / size) - 1, Math.floor(Math.min(last, total - 1) / size));
  const pages: number[] = [];
  for (let page = from; page <= to; page++) pages.push(page);
  return pages;
}

/** Cards per row in the grid view (CSS: repeat(auto-fill, minmax(min, 1fr)) with a gap). */
export function cardsPerRow(width: number, min: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}
