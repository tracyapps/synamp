import Icon from "./ui/Icon";
import { command, type PlayerView } from "./player-commands";

export default function SongControls({ view, transport = false }: { view: PlayerView; transport?: boolean }) {
  return <div className="song-controls" aria-label="Song controls">
    <div className="song-controls__buttons" role="group" aria-label="Tell SynAmp what you think of this track" aria-busy={view.busy}>
      {transport && <>
        <button type="button" className="btn btn--primary" disabled={!view.available} onClick={() => command("toggle")}><Icon name={view.paused ? "play" : "pause"} />{view.paused ? "Play" : "Pause"}</button>
        <button type="button" className="btn" disabled={view.busy || !view.available} onClick={() => command("next")}><Icon name="next" />{(view.busy || view.transitioning) && view.action === "next" ? "Skipping…" : "Skip"}</button>
      </>}
      <button type="button" className={`chip song-controls__love ${view.loved ? "is-loved" : ""}`} disabled={view.busy || view.loved || !view.available} aria-pressed={view.loved} title="Love · Option/Alt + Shift + L" onClick={() => command("love")}><Icon name="heart" size={17} />{view.action === "love" && view.busy ? "Loving…" : view.loved ? "Loved" : "Love"}</button>
      <button type="button" className="chip" disabled={view.busy || !view.available} title="Queue a similar song next · Option/Alt + Shift + M" onClick={() => command("more-like-this")}><Icon name="smart" size={17} />{view.action === "more-like-this" && view.busy ? "Finding your next song…" : "More like this"}</button>
      <button type="button" className="chip" disabled={view.busy || !view.available} title="Not for this, then skip · Option/Alt + Shift + N" onClick={() => command("not-for-this")}>{view.action === "thumb_down" && view.busy ? "Skipping…" : "Not for this"}</button>
      {view.playlist && <button type="button" className="chip" disabled={view.busy || !view.available} title="Remove, then skip · Option/Alt + Shift + R" onClick={() => command("remove")}>{view.action === "remove" && view.busy ? "Removing… next song" : `Remove from ${view.playlist}`}</button>}
      {view.canUndo && <button type="button" className="linklike" disabled={view.busy} onClick={() => command("undo-remove")}>Undo removal</button>}
      {view.available && <details className="song-controls__reason"><summary>Reason…</summary><div className="cluster">
        <button type="button" className="chip" disabled={view.busy} onClick={() => command("wrong-energy")}>Wrong energy → skip</button>
        <button type="button" className="chip" disabled={view.busy} onClick={() => command("wrong-vibe")}>Wrong vibe → skip</button>
      </div></details>}
    </div>
    <p className={`song-controls__status ${view.busy ? "is-pending" : ""}`} role="status">{view.status}</p>
  </div>;
}
