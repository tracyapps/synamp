import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

/*
 * A small right-click menu (also opened with the keyboard's Menu key or
 * Shift+F10, which browsers deliver as the same "contextmenu" event).
 *
 * A real ARIA menu: arrow keys, Home/End and first letters move between items,
 * Enter/Space choose, Escape or Tab closes, and focus goes back to where it was.
 * It sits in the top layer as a "manual" popover when the browser can (so
 * nothing can cover it), and closes on a click outside, scrolling, Escape or
 * Tab. Not "auto": letting go of the right mouse button after opening it counts
 * as a click outside, which would close it at once.
 */

export type MenuItem = { label: string; onSelect: () => void; disabled?: boolean };
export type MenuAt = { x: number; y: number; items: MenuItem[]; label: string; returnTo: HTMLElement | null };

const popoverSupported = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

export default function ContextMenu({ at, onClose }: { at: MenuAt; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const items = () => [...(box.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? [])];

  function close(restore = true) {
    onClose();
    if (restore) at.returnTo?.focus();
  }

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (popoverSupported) { try { element.showPopover(); } catch { /* already open */ } }
    // Keep it inside the window.
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - height - 8))}px`;
    items()[0]?.focus({ preventScroll: true });
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node)) onClose(); };
    // Scrolling the page closes it, as native menus do — but not the nudge from focusing it as it opens.
    const opened = performance.now();
    const scrolled = (event: Event) => { if (performance.now() - opened > 300 && !element.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", scrolled, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", scrolled, { capture: true });
    };
  }, [onClose]);

  function onKeyDown(event: React.KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus({ preventScroll: true }); };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(list.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") { event.preventDefault(); close(); }
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const after = [...list.slice(index + 1), ...list.slice(0, index + 1)];
      const match = after.find((item) => item.textContent?.trim().toLowerCase().startsWith(letter));
      if (match) { event.preventDefault(); match.focus(); }
    }
  }

  return (
    <div ref={box} className="context-menu" role="menu" aria-label={at.label} popover={popoverSupported ? "manual" : undefined} onKeyDown={onKeyDown}>
      {at.items.map((item) => (
        <button key={item.label} type="button" role="menuitem" tabIndex={-1} className="context-menu__item" disabled={item.disabled}
          onClick={() => { close(false); item.onSelect(); }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** One menu for a whole screen: `open` from any row's onContextMenu, render `menu` once. */
export function useContextMenu() {
  const [at, setAt] = useState<MenuAt | null>(null);
  const close = useCallback(() => setAt(null), []);
  const open = useCallback((event: ReactMouseEvent, label: string, items: MenuItem[]) => {
    event.preventDefault();
    const returnTo = (event.target as HTMLElement).closest<HTMLElement>("button, a, [tabindex]") ?? (document.activeElement as HTMLElement | null);
    // From the keyboard (Menu key, Shift+F10) there's no pointer position: open by the focused control.
    let { clientX: x, clientY: y } = event;
    if (!x && !y && returnTo) { const box = returnTo.getBoundingClientRect(); x = box.left + 12; y = box.bottom; }
    setAt({ x, y, items, label, returnTo });
  }, []);
  return { open, menu: at ? <ContextMenu at={at} onClose={close} /> : null };
}
