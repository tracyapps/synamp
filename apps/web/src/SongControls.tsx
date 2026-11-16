import { useEffect, useRef, useState } from "react";
import Icon from "./ui/Icon";
import SplitButton from "./ui/SplitButton";
import type { MenuItem } from "./ui/ContextMenu";
import { command, undoOffered, UNDO_OFFER_MS, type PlayerView } from "./player-commands";

/*
 * What you can tell SynAmp about the song that's playing. Used under the
 * player bar and over the visuals.
 *
 * Three buttons, each doing its usual thing in one press, with the less
 * common choices behind the arrow beside it:
 *   Skip    → skip and say why (not for this playlist, wrong energy, wrong vibe)
 *   Love    → more like this next
 *   Remove  → remove and say why; put the last removed song back
 *
 * Nothing here moves when something else appears: the buttons keep their
 * words and their places, and messages (with "Undo" after a removal) have a
 * place of their own after the buttons.
 */

/** "Skip, and say why": only a playlist can learn from the reason. */
export function skipReasons(view: PlayerView): MenuItem[] {
  if (!view.playlist || !view.available) return [];
  return [
    { label: "Skip: not for this playlist", onSelect: () => command("not-for-this") },
    { label: "Skip: wrong energy", onSelect: () => command("wrong-energy") },
    { label: "Skip: wrong vibe", onSelect: () => command("wrong-vibe") },
  ];
}

function loveChoices(view: PlayerView): MenuItem[] {
  if (!view.available) return [];
  if (view.playlist) return [{ label: "More like this next", onSelect: () => command("more-like-this") }];
  return view.live ? [] : [{ label: "Make a smart playlist from this", onSelect: () => command("smart-from-this") }];
}

function removeChoices(view: PlayerView): MenuItem[] {
  return [
    ...(view.available ? [
      { label: "Remove: wrong energy", onSelect: () => command("remove-wrong-energy") },
      { label: "Remove: wrong vibe", onSelect: () => command("remove-wrong-vibe") },
    ] : []),
    ...(view.undo ? [{ label: `Put back “${view.undo.title}”`, onSelect: () => command("undo-remove") }] : []),
  ];
}

/**
 * "Undo" beside the message, for a short while after a removal. It waits
 * while the pointer or the keyboard is on it, and when it goes the same
 * choice is still in the Remove button's menu, so nothing is lost to a timer.
 */
function useUndoOffer(undo: PlayerView["undo"]) {
  const [shown, setShown] = useState(() => undoOffered(undo, Date.now()));
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const at = undo?.at;
  const wait = (ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (!held.current) setShown(false); }, ms);
  };
  useEffect(() => {
    const offered = undoOffered(at === undefined ? undefined : { at }, Date.now());
    setShown(offered);
    if (offered && at !== undefined) wait(Math.max(0, at + UNDO_OFFER_MS - Date.now()));
    return () => clearTimeout(timer.current);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  const hold = () => { held.current = true; clearTimeout(timer.current); };
  const release = () => { held.current = false; wait(5000); };
  return { shown: shown && !!undo, hold, release };
}

export default function SongControls({ view, transport = false }: { view: PlayerView; transport?: boolean }) {
  const offer = useUndoOffer(view.undo);
  const idle = view.busy || !view.available;
  return <div className="song-controls" aria-label="Song controls">
    <div className="song-controls__buttons" role="group" aria-label="Tell SynAmp what you think of this song" aria-busy={view.busy}>
      {transport && <>
        <button type="button" className="btn btn--primary" disabled={!view.available} onClick={() => command("toggle")}><Icon name={view.paused ? "play" : "pause"} />{view.paused ? "Play" : "Pause"}</button>
        <SplitButton label="Skip, and say why" items={skipReasons(view)} disabled={idle}>
          <button type="button" className="btn" disabled={idle} onClick={() => command("next")}><Icon name="next" />Skip</button>
        </SplitButton>
      </>}
      <SplitButton label="More like this, and more" items={loveChoices(view)} disabled={idle}>
        <button type="button" className={`chip song-controls__love ${view.loved ? "is-loved" : ""}`} disabled={idle || view.loved} aria-pressed={view.loved} title="Love · Option/Alt + Shift + L" onClick={() => command("love")}><Icon name="heart" size={17} />{view.loved ? "Loved" : "Love"}</button>
      </SplitButton>
      {view.playlist && <SplitButton label="Remove, and say why" items={removeChoices(view)} disabled={view.busy}>
        <button type="button" className="chip song-controls__remove" disabled={idle} title={`Remove from ${view.playlist}, then skip · Option/Alt + Shift + R`} onClick={() => command("remove")}>
          <span className="song-controls__label">Remove<span className="song-controls__from"> from <span className="song-controls__playlist">{view.playlist}</span></span></span></button>
      </SplitButton>}
    </div>
    <div className={`song-controls__note ${view.busy ? "is-pending" : ""}`}>
      <p className="song-controls__status" role="status">{view.status}</p>
      {offer.shown && <button type="button" className="btn btn--sm song-controls__undo" disabled={view.busy}
        onMouseEnter={offer.hold} onMouseLeave={offer.release} onFocus={offer.hold} onBlur={offer.release}
        onClick={() => command("undo-remove")}>Undo<span className="visually-hidden"> removing “{view.undo?.title}”</span></button>}
    </div>
  </div>;
}
