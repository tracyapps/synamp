import { useId } from "react";
import { usePrefs, writePrefs } from "./playback-prefs";
import { SectionCard } from "./ui/kit";

/** Crossfade and album play, for SynAmp's own player on this device. */
export default function PlaybackSettings() {
  const prefs = usePrefs();
  const ids = useId();
  return (
    <SectionCard title="Playback on this device" labelledBy={`${ids}-title`}
      meta="For SynAmp’s player in this browser. Phone apps have their own settings.">
      <div className="playback">
        <label className="playback__fade">Crossfade between songs
          <select className="select" value={prefs.crossfade} onChange={(event) => writePrefs({ crossfade: Number(event.target.value) })} aria-describedby={`${ids}-fade`}>
            <option value={0}>Off — the next song starts straight away</option>
            {[2, 4, 6, 8, 12].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
        </label>
        <p id={`${ids}-fade`} className="muted playback__hint">Either way, SynAmp lines up the next song while this one plays, so there’s no wait while it loads.</p>
        <button type="button" role="switch" aria-checked={prefs.albumsStraight} className={`switch ${prefs.albumsStraight ? "is-on" : ""}`}
          disabled={!prefs.crossfade} onClick={() => writePrefs({ albumsStraight: !prefs.albumsStraight })} aria-describedby={`${ids}-album`}>
          <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
          Play albums straight through
        </button>
        <p id={`${ids}-album`} className="muted playback__hint">No crossfade between two songs from the same album, so live albums and DJ mixes flow the way they were made.</p>
      </div>
    </SectionCard>
  );
}
