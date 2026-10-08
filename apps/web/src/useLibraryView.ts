import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import { defaultLibraryView, libraryHash, parseLibraryView, stateFromHash } from "./library-view-state";
import type { LibraryViewState } from "./library-view-state";

export const LAST_VIEW_KEY = "synamp-library-state-v1";
export default function useLibraryView(presentation: { view?: string; sort?: string; direction?: string }) {
  const [initial] = useState(() => {
    try {
      const linked = stateFromHash(window.location.hash);
      const raw = linked ? null : localStorage.getItem(LAST_VIEW_KEY);
      return { state: linked ?? (raw !== null ? parseLibraryView(JSON.parse(raw)) : defaultLibraryView(presentation)), error: "" };
    } catch (cause) { return { state: defaultLibraryView(presentation), error: `The Library view could not be restored. ${(cause as Error).message}` }; }
  });
  const [state, setState] = useState(initial.state);
  const [restoreError, setRestoreError] = useState(initial.error);
  const current = useRef(state);
  current.current = state;
  const seenHash = useRef(window.location.hash);
  const update = useCallback(<K extends keyof LibraryViewState>(key: K, value: SetStateAction<LibraryViewState[K]>) => {
    setState(previous => ({ ...previous, [key]: typeof value === "function" ? (value as (old: LibraryViewState[K]) => LibraryViewState[K])(previous[key]) : value }));
  }, []);
  const apply = useCallback((next: LibraryViewState) => {
    const checked = parseLibraryView(next);
    if (!restoreError) {
      try { history.replaceState(null, "", libraryHash(current.current)); } catch { /* Invalid draft years stay editable. */ }
    }
    const hash = libraryHash(checked);
    history.pushState(null, "", hash);
    seenHash.current = hash;
    setRestoreError(""); setState(checked);
  }, [restoreError]);
  useEffect(() => {
    const restore = () => {
      const hash = window.location.hash;
      if (hash === seenHash.current || !/^#\/?library(?:\?|$)/.test(hash)) return;
      seenHash.current = hash;
      // A plain #/library (the menu, or Back to before any filter) keeps the filters you have.
      try { const linked = stateFromHash(hash); if (linked) setState(linked); setRestoreError(""); }
      catch (cause) { setRestoreError(`The Library view could not be restored. ${(cause as Error).message}`); }
    };
    window.addEventListener("hashchange", restore); window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("hashchange", restore); window.removeEventListener("popstate", restore); };
  }, [presentation]);
  useEffect(() => {
    if (restoreError) return;
    let hash: string;
    try { hash = libraryHash(state); } catch { return; }
    const timer = window.setTimeout(() => {
      if (window.location.hash && !["#", "#/"].includes(window.location.hash) && !/^#\/?library(?:\?|$)/.test(window.location.hash)) return;
      history.replaceState(null, "", hash); seenHash.current = hash;
      try { localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(state)); } catch { /* Links still work without browser storage. */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state, restoreError]);
  let validationError = "";
  try { parseLibraryView(state); } catch (cause) { validationError = (cause as Error).message; }
  return { state, update, apply, restoreError, validationError };
}
