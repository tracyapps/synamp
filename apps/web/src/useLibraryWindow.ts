import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent } from "react";
import { Layout, plan } from "./library-window";

/*
 * Draws only the part of a long list that's on (or near) the screen, using the
 * page's own scrollbar (whichever element scrolls: the list just needs to be in it). Rows are measured once drawn, so text that wraps or an
 * album opened to show its tracks just makes that row taller.
 *
 * Put `containerRef` on the list element, `data-index` on every drawn row
 * (and on nothing else inside it; `data-waiting` too on "Loading…" stand-ins), and `onFocus`/`onBlur` on the list: the row
 * with keyboard focus stays drawn even when it scrolls far away.
 */

const OVERSCAN_PX = 900;

/** The element that scrolls the list: the app's main area, or the page. */
function scrollerOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
/** The part of the list on screen, in px from the list's top. */
function onScreen(element: HTMLElement) {
  const scroller = scrollerOf(element);
  const page = scroller === document.scrollingElement;
  const top = (page ? 0 : scroller.getBoundingClientRect().top) - element.getBoundingClientRect().top;
  return { scroller, top, bottom: top + (page ? window.innerHeight : scroller.clientHeight) };
}

export function useLibraryWindow({ total, perLine = 1, estimate, gap = 0, reset }: {
  total: number; perLine?: number; estimate: number; gap?: number; reset: unknown;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const lines = Math.ceil(total / Math.max(1, perLine));
  // A new list (other filters, sort, view or width): start measuring afresh.
  const layout = useMemo(() => new Layout(lines, estimate), [lines, estimate, perLine, reset]); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState({ first: 0, last: Math.min(lines - 1, 30) });
  const [, redraw] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);

  /** When rows above the screen turn out taller or shorter than guessed: keep what you're reading where it is. */
  const anchor = useRef<{ line: number; offset: number } | null>(null);
  const update = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const { top, bottom } = onScreen(element);
    const next = layout.range(top, bottom, OVERSCAN_PX);
    setRange((current) => (current.first === next.first && current.last === next.last ? current : next));
  }, [layout]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    update();
    // Whatever scrolls (the window, or the app's main area): scroll events don't bubble, but they can be caught on the way down.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => { document.removeEventListener("scroll", onScroll, { capture: true }); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [update]);

  // Measure what's drawn (and again whenever a row changes size).
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    observer.current = new ResizeObserver((entries) => {
      const tallest = new Map<number, number>();
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (!element.isConnected) continue;
        const index = Number(element.dataset.index);
        // "Loading…" stand-ins aren't real rows: measuring them would throw the guess for every other row.
        if (!Number.isFinite(index) || element.dataset.waiting !== undefined) continue;
        const line = Math.floor(index / Math.max(1, perLine));
        const height = element.getBoundingClientRect().height + gap;
        tallest.set(line, Math.max(tallest.get(line) ?? 0, height));
      }
      const element = containerRef.current;
      if (element && !anchor.current) {
        const { top } = onScreen(element);
        const line = layout.lineAt(Math.max(0, top));
        if (top > 0) anchor.current = { line, offset: top - layout.top(line) };
      }
      let changed = false;
      for (const [line, height] of tallest) changed = layout.measure(line, height) || changed;
      if (changed) { redraw((n) => n + 1); update(); } else anchor.current = null;
    });
    return () => observer.current?.disconnect();
  }, [layout, perLine, gap, update]);
  useLayoutEffect(() => {
    const watch = observer.current, element = containerRef.current;
    if (!watch || !element) return;
    const held = anchor.current;
    anchor.current = null;
    if (held) {
      const { scroller, top } = onScreen(element);
      const drift = layout.top(held.line) + held.offset - top;
      if (Math.abs(drift) >= 1) scroller.scrollTop += drift;
    }
    watch.disconnect();
    element.querySelectorAll<HTMLElement>("[data-index]").forEach((row) => watch.observe(row));
  });

  const indexOf = (target: EventTarget | null) => {
    const row = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-index]");
    return row ? Number(row.dataset.index) : null;
  };
  const onFocus = (event: FocusEvent) => setFocused(indexOf(event.target));
  const onBlur = (event: FocusEvent) => {
    // Focus left the list altogether: nothing to keep drawn.
    if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setFocused(null);
  };

  const pieces = plan(layout, total, Math.max(1, perLine), range, focused);
  return {
    containerRef, pieces, onFocus, onBlur,
    /** How tall a "Loading…" stand-in should be (the row's expected height), so nothing jumps when it arrives. */
    expected: (index: number) => Math.max(0, layout.top(Math.floor(index / Math.max(1, perLine)) + 1) - layout.top(Math.floor(index / Math.max(1, perLine))) - gap),
    /** The items drawn (for fetching their pages). */
    first: range.first * perLine, last: Math.min(total - 1, (range.last + 1) * perLine - 1),
  };
}
