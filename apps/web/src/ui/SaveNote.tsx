import { useCallback, useRef, useState } from "react";
import Icon from "./Icon";

/*
 * "Saved" right beside the thing you just changed (or, with `lead`, any short
 * result of a button: "Opened in Finder").
 *
 * Settings that save by themselves (no Save button) say so where you're
 * looking, not at the bottom of a long card that may be off screen. One note
 * per section; only the section you last touched shows it. The live regions
 * are always in the page, so screen readers announce each change.
 */

/** `lead` replaces the first words ("Saved" / "Saving…" / "Not saved"), for notes that aren't about saving. */
export type SaveState = { at: string; state: "saving" | "saved" | "failed"; text?: string; lead?: string; n: number } | null;

export function useSaveNote() {
  const [note, setNote] = useState<SaveState>(null);
  const count = useRef(0);
  const mark = useCallback((at: string, state: "saving" | "saved" | "failed", text?: string, lead?: string) => {
    count.current += 1;
    setNote({ at, state, n: count.current, ...(text ? { text } : {}), ...(lead ? { lead } : {}) });
  }, []);
  return { note, mark };
}

export default function SaveNote({ note, at, id }: { note: SaveState; at: string; id?: string }) {
  const mine = note?.at === at ? note : null;
  return (
    <span className="save-note" id={id}>
      <span role="status">
        {mine && mine.state !== "failed" && (
          <span key={mine.n} className={`save-note__text is-${mine.state}`}>
            {mine.state === "saved" && <Icon name="check" size={14} />}
            {mine.state === "saving" ? mine.lead ?? "Saving…" : <>{mine.lead ?? "Saved"}{mine.text ? <span className="save-note__what"> — {mine.text}</span> : null}</>}
          </span>
        )}
      </span>
      <span role="alert">
        {mine?.state === "failed" && <span key={mine.n} className="save-note__text is-failed">{mine.lead ?? "Not saved"}{mine.text ? `: ${mine.text}` : "."}</span>}
      </span>
    </span>
  );
}
