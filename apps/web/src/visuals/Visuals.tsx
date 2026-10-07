import { useEffect, useId, useRef, useState } from "react";
import { onActiveAudio, audioContext, tap } from "./audio-graph";
import Icon from "../ui/Icon";
import "../styles/visuals.css";

/*
 * Milkdrop visuals (butterchurn, a WebGL port of Winamp's MilkDrop), full
 * screen, dancing to whatever is playing — your music or the radio.
 *
 * Safety first: MilkDrop presets move fast and some flash. The visuals never
 * start by themselves; every time they open, the first screen says so plainly and offers a gentler
 * mode (dimmer, slower changes), which is on by default and always on when
 * the device asks for less motion until you turn it off yourself.
 */

type Butterchurn = typeof import("butterchurn").default;
type Visualizer = import("butterchurn").Visualizer;

const GENTLE_KEY = "synamp-visuals-gentle";
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

export default function Visuals({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [started, setStarted] = useState(false);
  const [gentle, setGentle] = useState(() => read(GENTLE_KEY) !== "off" || reduced);
  const [auto, setAuto] = useState(true);
  const [names, setNames] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [problem, setProblem] = useState("");
  const engine = useRef<{ viz: Visualizer; presets: Record<string, unknown>; node: AudioNode | null } | null>(null);
  const ids = useId();

  // The dialog follows `open`; closing it (Esc too) tells the parent.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (!open) return;
    const surfaces = [document.documentElement, document.body];
    const overflow = surfaces.map((surface) => ({ value: surface.style.getPropertyValue("overflow"), priority: surface.style.getPropertyPriority("overflow") }));
    surfaces.forEach((surface) => surface.style.setProperty("overflow", "hidden"));
    return () => surfaces.forEach((surface, index) => {
      const previous = overflow[index]!;
      if (previous.value) surface.style.setProperty("overflow", previous.value, previous.priority);
      else surface.style.removeProperty("overflow");
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setProblem("");
    write(GENTLE_KEY, gentle ? "on" : "off");
    try {
      const [{ default: butterchurn }, { default: presetPack }] = await Promise.all([import("butterchurn"), import("butterchurn-presets")]) as [{ default: Butterchurn }, { default: { getPresets(): Record<string, unknown> } }];
      const el = canvas.current!;
      const ctx = audioContext();
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.max(1, Math.round(rect.width * ratio));
      el.height = Math.max(1, Math.round(rect.height * ratio));
      // Butterchurn's screen viewport uses width/height directly; pixelRatio
      // only scales its internal textures. Both must match the canvas pixels.
      const viz = butterchurn.createVisualizer(ctx, el, { width: el.width, height: el.height, pixelRatio: 1 });
      const presets = presetPack.getPresets();
      const list = Object.keys(presets).sort(() => Math.random() - 0.5);
      engine.current = { viz, presets, node: null };
      setNames(list);
      setIndex(0);
      viz.loadPreset(presets[list[0]!], 0);
      setStarted(true);
    } catch (error) {
      setProblem(`The visuals couldn’t start on this device (${(error as Error).message}).`);
    }
  }

  // Follow whatever is playing.
  useEffect(() => {
    if (!started) return;
    return onActiveAudio((el) => {
      const current = engine.current;
      if (!current) return;
      if (current.node) { try { current.viz.disconnectAudio(current.node); } catch { /* already gone */ } current.node = null; }
      setHasAudio(!!el);
      if (!el) return;
      try { current.node = tap(el); current.viz.connectAudio(current.node); } catch (error) { setProblem((error as Error).message); }
    });
  }, [started]);

  // Draw while open; keep the canvas the size of the screen.
  useEffect(() => {
    if (!started || !open) return;
    let frame = 0;
    const el = canvas.current!;
    let ratio = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = el.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (el.width === width && el.height === height) return;
      el.width = width;
      el.height = height;
      engine.current?.viz.setRendererSize(width, height);
    };
    const draw = () => {
      // Moving between displays can change pixel density without changing CSS size.
      if (ratio !== Math.min(window.devicePixelRatio || 1, 2)) resize();
      engine.current?.viz.render();
      frame = requestAnimationFrame(draw);
    };
    resize();
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [started, open]);

  // Next look, by hand or by itself.
  useEffect(() => {
    const current = engine.current;
    if (!started || !current || !names.length) return;
    current.viz.loadPreset(current.presets[names[index % names.length]!], gentle ? 5 : 2.7);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!started || !auto || !open) return;
    const timer = setInterval(() => setIndex((value) => value + 1), gentle ? 45_000 : 20_000);
    return () => clearInterval(timer);
  }, [started, auto, gentle, open]);

  const name = names.length ? names[index % names.length]! : "";
  return (
    <dialog ref={dialog} className={`visuals ${gentle ? "is-gentle" : ""}`} aria-labelledby={`${ids}-title`} onClose={onClose}>
      <canvas ref={canvas} className="visuals__canvas" aria-hidden="true" />
      {!started ? (
        <div className="visuals__intro">
          <p className="eyebrow"><span className="amp amp--short" aria-hidden="true" />MilkDrop, back again</p>
          <h2 id={`${ids}-title`}>Visuals</h2>
          <div className="callout callout--warn" role="note">
            <span className="callout__icon"><Icon name="warn" size={22} /></span>
            <div>
              <h3 className="callout__title">These move fast, and some flash</h3>
              <p>If flashing light or fast motion affects you, it’s safest to skip them.{reduced && " Your device is set to reduce motion, so Gentler is on."}</p>
            </div>
          </div>
          <label className="visuals__check"><input type="checkbox" checked={gentle} onChange={(event) => setGentle(event.target.checked)} />
            <span>Gentler: dimmer, softer, and changes slowly<small>Recommended. You can change it while they play.</small></span></label>
          {problem && <p className="alert" role="alert">{problem}</p>}
          <div className="cluster" style={{ marginTop: 18 }}>
            <button type="button" className="btn btn--primary" onClick={start}>Show the visuals</button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Not now</button>
          </div>
        </div>
      ) : (
        <div className="visuals__bar">
          <h2 id={`${ids}-title`} className="visually-hidden">Visuals</h2>
          <p className="visuals__name" aria-live="off">{hasAudio ? name.replace(/\s+-\s+/, " — ") : "Play something and the visuals will follow it."}</p>
          <div className="cluster">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIndex((value) => (value + names.length - 1) % names.length)}><Icon name="previous" size={16} />Previous look</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIndex((value) => value + 1)}>Next look<Icon name="next" size={16} /></button>
            <button type="button" role="switch" aria-checked={auto} className={`switch ${auto ? "is-on" : ""}`} onClick={() => setAuto(!auto)}>
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Change by itself</button>
            <button type="button" role="switch" aria-checked={gentle} className={`switch ${gentle ? "is-on" : ""}`} onClick={() => { setGentle(!gentle); write(GENTLE_KEY, gentle ? "off" : "on"); }}>
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Gentler</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={onClose}><Icon name="close" size={16} />Close</button>
          </div>
          {problem && <p className="alert" role="alert">{problem}</p>}
        </div>
      )}
    </dialog>
  );
}
