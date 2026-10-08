import { useEffect, useId, useRef, useState } from "react";
import type { Request } from "../api";
import { onActiveAudio, audioContext, tap } from "./audio-graph";
import { change, lookLabel, type Looks, matches, NO_LOOKS, type Pool, poolOf, step } from "./looks";
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
 *
 * Looks: heart the ones you love (the heart sits next to the name while it
 * plays), hide the ones you never want again, jump to any look from the list,
 * and let "Change by itself" pick from all looks or just your favourites.
 * The brain keeps them, so every screen knows the same favourites.
 */

type Butterchurn = typeof import("butterchurn").default;
type Visualizer = import("butterchurn").Visualizer;

const GENTLE_KEY = "synamp-visuals-gentle";
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

type ListFilter = "all" | "favourites" | "hidden";

export default function Visuals({ open, onClose, request }: { open: boolean; onClose: () => void; request?: Request }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [started, setStarted] = useState(false);
  const [gentle, setGentle] = useState(() => read(GENTLE_KEY) !== "off" || reduced);
  const [auto, setAuto] = useState(true);
  /** Every look, shuffled once per start. */
  const [order, setOrder] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [looks, setLooks] = useState<Looks>(NO_LOOKS);
  const looksRef = useRef(looks);
  looksRef.current = looks;
  const [listOpen, setListOpen] = useState(false);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [query, setQuery] = useState("");
  const [said, setSaid] = useState("");
  const listButton = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
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

  // Your favourite and hidden looks, from the brain.
  useEffect(() => {
    if (!open || !request) return;
    request<Looks>("/visuals/looks").then(setLooks, () => undefined);
  }, [open, request]);

  /** Change a look (or the pool) on screen at once, then tell the brain; undo if it says no. */
  async function save(next: Looks, body: Record<string, unknown>, done: string) {
    const before = looksRef.current;
    setLooks(next);
    setSaid(done);
    if (!request) return;
    try { setLooks(await request<Looks>("/visuals/looks", { method: "POST", body: JSON.stringify(body) })); }
    catch (error) { setLooks(before); setSaid(""); setProblem(`Couldn’t save that (${(error as Error).message}).`); }
  }
  const isFavourite = (name: string) => looks.favourites.includes(name);
  const isHidden = (name: string) => looks.hidden.includes(name);
  const favourite = (name: string, on: boolean) =>
    save(change(looks, name, { favourite: on }), { name, favourite: on }, on ? `Added ${lookLabel(name)} to your favourites.` : `Took ${lookLabel(name)} out of your favourites.`);
  const hide = (name: string, on: boolean) => {
    const next = change(looks, name, { hidden: on });
    save(next, { name, hidden: on }, on ? `Hid ${lookLabel(name)}. It won’t come up again unless you pick it.` : `${lookLabel(name)} is back.`);
    // Hiding the look on screen moves straight on.
    if (on && name === current) setCurrent(step(order, next, name, 1));
  };
  const choosePool = (pool: Pool) => save({ ...looks, pool }, { pool }, pool === "favourites" ? "Picking from your favourites." : "Picking from all looks.");
  const go = (direction: 1 | -1) => setCurrent((name) => step(order, looksRef.current, name, direction));
  const pick = (name: string) => { setCurrent(name); setSaid(`Showing ${lookLabel(name)}.`); };

  const openList = (show: boolean) => setListOpen(show);
  // Opening the list puts you in its search box; closing it brings you back to "All looks".
  const listWasOpen = useRef(false);
  useEffect(() => {
    if (listOpen) search.current?.focus();
    else if (listWasOpen.current) listButton.current?.focus();
    listWasOpen.current = listOpen;
  }, [listOpen]);

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
      const first = poolOf(list, looksRef.current).pool[0] ?? list[0]!;
      setOrder(list);
      setCurrent(first);
      viz.loadPreset(presets[first], 0);
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

  // A new look, by hand or by itself.
  const shown = useRef("");
  useEffect(() => {
    const running = engine.current;
    if (!started || !running || !current || shown.current === current) return;
    if (shown.current) running.viz.loadPreset(running.presets[current], gentle ? 5 : 2.7);
    shown.current = current;
  }, [current, started]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!started || !auto || !open) return;
    const timer = setInterval(() => go(1), gentle ? 45_000 : 20_000);
    return () => clearInterval(timer);
  }, [started, auto, gentle, open, order]); // eslint-disable-line react-hooks/exhaustive-deps

  const { fallback } = poolOf(order, looks);
  const loved = isFavourite(current);
  const listed = order.filter((name) => (filter === "hidden" ? isHidden(name) : filter === "favourites" ? isFavourite(name) : !isHidden(name)))
    .filter((name) => matches(name, query))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const counts = { all: order.length - looks.hidden.filter((name) => order.includes(name)).length, favourites: looks.favourites.filter((name) => order.includes(name)).length, hidden: looks.hidden.filter((name) => order.includes(name)).length };
  return (
    <dialog ref={dialog} className={`visuals ${gentle ? "is-gentle" : ""} ${listOpen ? "has-list" : ""}`} aria-labelledby={`${ids}-title`} onClose={onClose}
      onCancel={(event) => { if (listOpen) { event.preventDefault(); openList(false); } }}>
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
        <>
        {listOpen && (
          <section className="visuals__looks" aria-labelledby={`${ids}-looks`} id={`${ids}-list`}>
            <div className="visuals__looks-head">
              <h3 id={`${ids}-looks`}>Looks</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => openList(false)}><Icon name="close" size={16} />Done</button>
            </div>
            <label className="visuals__search"><span>Find a look</span>
              <input ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. geiss, spiral, fire" aria-describedby={`${ids}-found`} /></label>
            <fieldset className="visuals__filter">
              <legend className="visually-hidden">Show</legend>
              {([["all", "All"], ["favourites", "Favourites"], ["hidden", "Hidden"]] as const).map(([value, label]) => (
                <label key={value}><input type="radio" name={`${ids}-filter`} checked={filter === value} onChange={() => setFilter(value)} />
                  <span>{label} <span className="visuals__count">{counts[value]}</span></span></label>
              ))}
            </fieldset>
            <p id={`${ids}-found`} className="visuals__found" role="status">{listed.length === 0
              ? (filter === "favourites" && !query ? "No favourites yet. Press the heart next to a look’s name to keep it here."
                : filter === "hidden" && !query ? "Nothing hidden." : "No looks match that.")
              : `${listed.length} ${listed.length === 1 ? "look" : "looks"}`}</p>
            <ul className="visuals__list">
              {listed.map((name) => {
                const label = lookLabel(name);
                const on = isFavourite(name);
                const hidden = isHidden(name);
                return (
                  <li key={name} className={name === current ? "is-current" : ""}>
                    <button type="button" className="visuals__pick" aria-current={name === current ? "true" : undefined} onClick={() => pick(name)}>
                      {label}{name === current && <span className="visually-hidden"> (showing now)</span>}</button>
                    <button type="button" className={`visuals__heart ${on ? "is-on" : ""}`} aria-pressed={on} aria-label={`Favourite: ${label}`} title="Favourite" onClick={() => favourite(name, !on)}>
                      <Icon name="heart" size={18} /></button>
                    <button type="button" className="btn btn--ghost btn--sm" aria-label={`${hidden ? "Show" : "Hide"} ${label}`} onClick={() => hide(name, !hidden)}>{hidden ? "Show" : "Hide"}</button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="visuals__bar">
          <h2 id={`${ids}-title`} className="visually-hidden">Visuals</h2>
          <div className="visuals__now">
            {hasAudio && current && (
              <button type="button" className={`visuals__heart ${loved ? "is-on" : ""}`} aria-pressed={loved} aria-label="Favourite this look" title="Favourite" onClick={() => favourite(current, !loved)}>
                <Icon name="heart" size={20} /></button>
            )}
            <p className="visuals__name" aria-live="off">{hasAudio ? lookLabel(current) : "Play something and the visuals will follow it."}</p>
            {hasAudio && current && <button type="button" className="btn btn--ghost btn--sm" onClick={() => hide(current, true)}>Hide this look</button>}
          </div>
          <div className="cluster">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(-1)}><Icon name="previous" size={16} />Previous look</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(1)}>Next look<Icon name="next" size={16} /></button>
            <button ref={listButton} type="button" className="btn btn--ghost btn--sm" aria-expanded={listOpen} aria-controls={listOpen ? `${ids}-list` : undefined} onClick={() => openList(!listOpen)}>
              <Icon name="library" size={16} />All looks</button>
            <button type="button" role="switch" aria-checked={auto} className={`switch ${auto ? "is-on" : ""}`} onClick={() => setAuto(!auto)}>
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Change by itself</button>
            <fieldset className="visuals__pool">
              <legend>Pick from</legend>
              {([["all", "All looks"], ["favourites", "My favourites"]] as const).map(([value, label]) => (
                <label key={value}><input type="radio" name={`${ids}-pool`} checked={looks.pool === value} onChange={() => choosePool(value)} /><span>{label}</span></label>
              ))}
            </fieldset>
            <button type="button" role="switch" aria-checked={gentle} className={`switch ${gentle ? "is-on" : ""}`} onClick={() => { setGentle(!gentle); write(GENTLE_KEY, gentle ? "off" : "on"); }}>
              <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>Gentler</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={onClose}><Icon name="close" size={16} />Close</button>
          </div>
          <p className="visuals__said" role="status">{fallback === "no-favourites" ? "No favourites to pick from yet, so all looks are in. " : fallback === "all-hidden" ? "Every look is hidden, so all of them are in. " : ""}{said}</p>
          {problem && <p className="alert" role="alert">{problem}</p>}
        </div>
        </>
      )}
    </dialog>
  );
}
