import { useEffect, useId, useState } from "react";
import type { Request } from "./api";
import { type AwayReason, type Quality, useAwayReason, usePrefs, wantsLighter, writePrefs } from "./playback-prefs";
import { SectionCard } from "./ui/kit";
import SaveNote, { useSaveNote } from "./ui/SaveNote";

const REASONS: Record<AwayReason, string> = {
  "mobile-data": "this device is on mobile data",
  "data-saver": "Data Saver is on in this browser",
  tailscale: "you opened SynAmp through Tailscale, so you’re probably away from home",
};

const CHOICES: Array<{ value: Quality; label: string; hint: string }> = [
  { value: "auto", label: "Automatic", hint: "Full quality at home. Lighter on mobile data, with Data Saver on, or when you open SynAmp through Tailscale." },
  { value: "full", label: "Always full quality", hint: "The original files, wherever you are." },
  { value: "lighter", label: "Always lighter", hint: "About 1 MB a minute, wherever you are." },
];

/** Crossfade, album play and stream size, for SynAmp's own player on this device. */
export default function PlaybackSettings({ request }: { request?: Request }) {
  const prefs = usePrefs();
  const ids = useId();
  const reason = useAwayReason();
  const { note, mark } = useSaveNote();
  /** Saved in this browser straight away; say so beside the setting. */
  const save = (change: Parameters<typeof writePrefs>[0], at: string, what: string) => {
    if (writePrefs(change)) mark(at, "saved", `${what} On this device.`);
    else mark(at, "failed", `${what} applies for this visit only; this browser won’t keep settings (a private window?)`);
  };
  // Can the brain make lighter streams? (It needs ffmpeg, which the NAS install has.)
  const [lighter, setLighter] = useState<boolean | null>(null);
  useEffect(() => {
    if (!request) return;
    request<{ lighter: boolean }>("/listening/streams").then((answer) => setLighter(answer.lighter), () => setLighter(null));
  }, [request]);
  const lighterNow = wantsLighter(prefs, reason);
  const now = lighter === false ? "Right now: full quality — this SynAmp server can’t make lighter streams yet (it needs the latest Build)."
    : prefs.quality === "auto" ? (reason ? `Right now: lighter, because ${REASONS[reason]}.` : "Right now: full quality — this looks like your home network.")
    : lighterNow ? "Right now: lighter." : "Right now: full quality.";
  return (
    <SectionCard title="Playback on this device" labelledBy={`${ids}-title`}
      meta={<>For SynAmp’s player in this browser. Phone apps have their own settings — see <a href="#/anywhere">Listen anywhere</a>.</>}>
      <div className="playback">
        <label className="playback__fade">Crossfade between songs
          <select className="select" value={prefs.crossfade} onChange={(event) => { const seconds = Number(event.target.value); save({ crossfade: seconds }, "fade", seconds ? `Crossfade ${seconds} seconds.` : "Crossfade off."); }} aria-describedby={`${ids}-fade`}>
            <option value={0}>Off — the next song starts straight away</option>
            {[2, 4, 6, 8, 12].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
        </label>
        <SaveNote note={note} at="fade" />
        <p id={`${ids}-fade`} className="muted playback__hint">Either way, SynAmp lines up the next song while this one plays, so there’s no wait while it loads.</p>
        <button type="button" role="switch" aria-checked={prefs.albumsStraight} className={`switch ${prefs.albumsStraight ? "is-on" : ""}`}
          disabled={!prefs.crossfade} onClick={() => save({ albumsStraight: !prefs.albumsStraight }, "album", prefs.albumsStraight ? "Albums crossfade like everything else." : "Albums play straight through.")} aria-describedby={`${ids}-album`}>
          <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
          Play albums straight through
        </button>
        <SaveNote note={note} at="album" />
        <p id={`${ids}-album`} className="muted playback__hint">Songs from the same album join with no gap at all, to the exact sample, so live albums and DJ mixes flow the way they were made. (With crossfade off, albums always play this way.)</p>
        <button type="button" role="switch" aria-checked={prefs.skipBlend} className={`switch ${prefs.skipBlend ? "is-on" : ""}`}
          onClick={() => save({ skipBlend: !prefs.skipBlend }, "skip", prefs.skipBlend ? "Skipping cuts to the next song." : "Skipping blends into the next song.")} aria-describedby={`${ids}-skip`}>
          <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
          Blend when I skip
        </button>
        <SaveNote note={note} at="skip" />
        <p id={`${ids}-skip`} className="muted playback__hint">Pressing Next mid-song fades this song out as the next one fades in (a couple of seconds; longer in a DJ set), instead of a hard cut.</p>
        <fieldset className="playback__quality" aria-describedby={`${ids}-now`}>
          <legend>Stream quality</legend>
          {CHOICES.map((choice) => (
            <label key={choice.value} className="playback__choice">
              <input type="radio" name={`${ids}-quality`} value={choice.value} checked={prefs.quality === choice.value}
                onChange={() => save({ quality: choice.value }, "quality", `${choice.label}.`)} aria-describedby={`${ids}-q-${choice.value}`} />
              <span><span className="playback__choice-label">{choice.label}</span>
                <span id={`${ids}-q-${choice.value}`} className="muted playback__choice-hint">{choice.hint}</span></span>
            </label>
          ))}
          <SaveNote note={note} at="quality" />
          <p id={`${ids}-now`} className="playback__now" role="status">{now}</p>
          <p className="muted playback__hint">Lighter streams are 128 kbps MP3, made by your NAS as you listen — fine on headphones, and far less data than lossless files. A change applies from the next song. Songs that are already small play as they are.</p>
        </fieldset>
      </div>
    </SectionCard>
  );
}
