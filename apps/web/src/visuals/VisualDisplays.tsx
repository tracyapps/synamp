import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import SongControls from "../SongControls";
import { command, shortcut, type PlayerView } from "../player-commands";

type Display = { label?: string; availLeft: number; availTop: number; availWidth: number; availHeight: number };
type DisplayWindow = { win: Window; id: number; mount: HTMLElement };
export async function fullscreen(doc: Document) {
  if (doc.fullscreenElement) await doc.exitFullscreen();
  else if (doc.documentElement.requestFullscreen) await doc.documentElement.requestFullscreen();
  else throw new Error("Use your browser’s fullscreen command on this screen.");
}
function DisplayVideo({ stream }: { stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current!;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    return () => { el.srcObject = null; };
  }, [stream]);
  return <video ref={video} muted autoPlay playsInline className="visuals__canvas" aria-hidden="true" />;
}
export default function VisualDisplays({ canvas, player, radioName, gentle }: {
  canvas: RefObject<HTMLCanvasElement | null>; player?: PlayerView | null; radioName?: string; gentle: boolean;
}) {
  const [windows, setWindows] = useState<DisplayWindow[]>([]);
  const liveWindows = useRef(windows); liveWindows.current = windows;
  const [screens, setScreens] = useState<Display[]>([]);
  const [problem, setProblem] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const capture = useRef<MediaStream | null>(null);
  const counter = useRef(0);
  useEffect(() => {
    const timer = window.setInterval(() => setWindows(before => before.some(item => item.win.closed) ? before.filter(item => !item.win.closed) : before), 1000);
    return () => { clearInterval(timer); liveWindows.current.forEach(item => item.win.close()); capture.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    if (!windows.length && capture.current) { capture.current.getTracks().forEach(track => track.stop()); capture.current = null; setStream(null); }
  }, [windows.length]);
  async function chooseScreens() {
    try {
      const host = window as Window & { getScreenDetails?: () => Promise<{ screens: Display[] }> };
      if (!host.getScreenDetails) throw new Error("Screen selection isn’t available here. Open a display window and move it to the screen you want.");
      setScreens((await host.getScreenDetails()).screens); setProblem("");
    } catch (error) { setProblem((error as Error).message); }
  }
  function open(display?: Display) {
    setProblem("");
    if (!canvas.current?.captureStream) { setProblem("This browser can’t send visuals to another window. Fullscreen is still available here."); return; }
    const id = ++counter.current;
    const size = display ? `left=${display.availLeft},top=${display.availTop},width=${display.availWidth},height=${display.availHeight}` : "width=1000,height=700";
    const win = window.open("about:blank", `synamp-visuals-${id}`, `popup,${size}`);
    if (!win) { setProblem("Allow pop-up windows for SynAmp, then open this display again."); return; }
    try {
      win.document.title = "SynAmp · Visuals";
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => win.document.head.append(style.cloneNode(true)));
      win.document.documentElement.style.overflow = "hidden";
      win.document.body.style.margin = "0";
      capture.current ??= canvas.current.captureStream(30);
      setStream(capture.current);
      setWindows(before => [...before, { win, id, mount: win.document.body }]);
    } catch (error) { win.close(); setProblem(`Couldn’t open this display: ${(error as Error).message}`); }
  }
  return <>
    <div className="visuals__displays cluster">
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => void fullscreen(document).catch(error => setProblem(error.message))}>Fullscreen on this screen</button>
      <details className="visuals__options"><summary>Other screens{windows.length ? ` (${windows.length})` : ""}</summary><div className="cluster">
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => open()}>New display window</button>
      <button type="button" className="btn btn--quiet btn--sm" onClick={chooseScreens}>Choose screens</button>
      {screens.map((screen, i) => <button key={i} type="button" className="btn btn--quiet btn--sm" onClick={() => open(screen)}>Open on {screen.label || `screen ${i + 1}`}</button>)}
      {!!windows.length && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { windows.forEach(item => item.win.close()); setWindows([]); }}>Close display windows ({windows.length})</button>}
      <span className="muted">Open one window per screen. Music keeps playing here.</span>
      </div></details>
    </div>
    {problem && <p role="alert" className="alert">{problem}</p>}
    {stream && windows.filter(item => !item.win.closed).map(({ win, id, mount }) => createPortal(
      <div className={`visuals visuals-display ${gentle ? "is-gentle" : ""}`} onKeyDown={event => { const action = shortcut(event, false); if (action) { event.preventDefault(); command(action); } }}>
        <DisplayVideo stream={stream} />
        <div className="visuals__bar">
          <div className="visuals__song"><span className="eyebrow">Now playing</span><strong>{player?.title ?? radioName ?? "Nothing playing"}</strong>{player?.artist && <span>{player.artist}</span>}</div>
          {player && <SongControls view={player} transport />}
          <button type="button" className="btn btn--quiet" onClick={() => void fullscreen(win.document).catch(error => setProblem(error.message))}>Fullscreen on this screen</button>
          <button type="button" className="btn btn--ghost" onClick={() => { win.close(); setWindows(before => before.filter(item => item.id !== id)); }}>Close this display</button>
        </div>
      </div>, mount, String(id)))}
  </>;
}
