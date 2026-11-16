import { useCallback, useRef, useState, type ReactNode } from "react";
import ContextMenu, { type MenuAt, type MenuItem } from "./ContextMenu";
import Icon from "./Icon";

/*
 * A split button: the main button does the usual thing in one press, and the
 * small arrow beside it opens a short menu of other ways to do it ("Skip"
 * and, behind the arrow, "Skip: wrong energy").
 *
 * The main button is whatever the caller passes in. The arrow is a button of
 * its own with its own name, so a keyboard or screen reader meets two
 * controls: the action, then "More ways to …". With nothing for the menu,
 * there is no arrow.
 */
export default function SplitButton({ children, items, label, disabled = false, className = "" }: {
  children: ReactNode;
  items: MenuItem[];
  /** What the arrow is for, e.g. "More ways to skip". Also names the menu. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const arrow = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<MenuAt | null>(null);
  const close = useCallback(() => setAt(null), []);
  const toggle = () => {
    const button = arrow.current;
    if (!button) return;
    const anchor = button.getBoundingClientRect();
    setAt(at ? null : { x: anchor.left, y: anchor.top, anchor, items, label, returnTo: button });
  };
  return (
    <span className={`split ${className}`}>
      {children}
      {items.length > 0 && <button ref={arrow} type="button" className="split__more" aria-haspopup="menu" aria-expanded={!!at} aria-label={label} title={label} disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => { if (!at && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); toggle(); } }}>
        <Icon name="chevron" size={14} className="split__arrow" />
      </button>}
      {at && <ContextMenu at={{ ...at, items }} onClose={close} />}
    </span>
  );
}
