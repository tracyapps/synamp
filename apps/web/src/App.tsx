import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Player from "./Player";
import type { SessionView } from "./Player";
import Playlists from "./Playlists";
import Library from "./Library";
import Radio, { RadioBar } from "./Radio";
import PartyHost from "./party/PartyHost";
import type { Station } from "./Radio";
import type { PlaylistNode } from "./Playlists";
import Listening from "./Listening";
import LibraryHealth from "./LibraryHealth";
import MissingTracks from "./MissingTracks";
import OrganiseLibrary from "./OrganiseLibrary";
import DiscographyGaps from "./DiscographyGaps";
import Settings from "./Settings";
import { UpdateNotice, VersionBadge } from "./Updates";
import SpotCheck from "./SpotCheck";
import ListenAnywhere from "./ListenAnywhere";
import PlaybackSettings from "./PlaybackSettings";
import { newId } from "./ids";
import { AccessError, makeApi } from "./api";
import Icon from "./ui/Icon";
import type { IconName } from "./ui/Icon";
import { ScreenHead } from "./ui/kit";
import mark from "./assets/synamp-mark.svg";
import wordmark from "./assets/synamp-wordmark.svg";
import { visualsSupported } from "./visuals/support";

// The visuals (and MilkDrop's presets) load only when first opened.
const Visuals = lazy(() => import("./visuals/Visuals"));

/*
 * The app shell: top bar, side navigation, one screen at a time, and the player
 * bar underneath everything. Screens are addressed by the URL hash (#/library),
 * so the browser's Back button and bookmarks work.
 */

type ScreenId = "library" | "playlists" | "radio" | "party" | "care" | "brain" | "anywhere" | "settings";
const NAV: Array<{ group: string; items: Array<{ id: ScreenId; label: string; icon: IconName }> }> = [
  { group: "Listen", items: [
    { id: "library", label: "Library", icon: "library" },
    { id: "playlists", label: "Playlists", icon: "playlists" },
    { id: "radio", label: "Radio", icon: "radio" },
    { id: "party", label: "Party", icon: "phone" },
  ] },
  { group: "Understand", items: [
    { id: "brain", label: "The Brain", icon: "brain" },
    { id: "care", label: "Library care", icon: "care" },
  ] },
  { group: "System", items: [
    { id: "anywhere", label: "Listen anywhere", icon: "anywhere" },
    { id: "settings", label: "Settings", icon: "settings" },
  ] },
];
const SCREENS = NAV.flatMap((group) => group.items);
const TITLES = Object.fromEntries(SCREENS.map((item) => [item.id, item.label])) as Record<ScreenId, string>;

function screenFromHash(): ScreenId {
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return SCREENS.some((item) => item.id === id) ? (id as ScreenId) : "library";
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("synamp-playlist-token") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [needsToken, setNeedsToken] = useState(false);
  const [screen, setScreen] = useState<ScreenId>(screenFromHash);
  const [nodes, setNodes] = useState<PlaylistNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [visuals, setVisuals] = useState(false);
  const canShowVisuals = useMemo(visualsSupported, []);
  const openVisuals = canShowVisuals ? () => setVisuals(true) : undefined;
  const headingId = "screen-title";
  const shownScreen = useRef<ScreenId>(screen);
  const { call, download, upload } = useMemo(() => makeApi(token), [token]);

  // Follow the hash; move focus to the new screen's heading so keyboard and
  // screen-reader users land at the top of what changed.
  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = `${TITLES[screen]} — SynAmp`;
    // Only when the screen actually changes (not on first load, and not on React's dev-mode double run).
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    window.scrollTo(0, 0);
    document.getElementById(headingId)?.focus();
  }, [screen]);

  const refreshNodes = useCallback(async () => {
    const result = await call<{ nodes: PlaylistNode[] }>("/playlists");
    setNodes(result.nodes);
    return result.nodes;
  }, [call]);

  useEffect(() => {
    setError("");
    refreshNodes()
      .then(() => setNeedsToken(false))
      .catch((cause) => { if (cause instanceof AccessError) setNeedsToken(true); else setError(cause.message); })
      .finally(() => setLoading(false));
    call<{ session: SessionView }>("/session").then((data) => setSession(data.session)).catch(() => undefined);
  }, [call, refreshNodes]);

  /** Queue something (a playlist, an album, some tracks) and show it in the player. */
  const play = useCallback(async (body: Record<string, unknown>) => {
    const result = await call<{ session: SessionView }>("/session/queue", { method: "POST", body: JSON.stringify({ event_id: newId(), ...body }) });
    setStation(null);
    setSession(result.session);
  }, [call]);

  const tokenForm = needsToken && (
    <form className="token-form section-card" style={{ padding: 18 }} onSubmit={(event) => {
      event.preventDefault();
      sessionStorage.setItem("synamp-playlist-token", draftToken);
      setToken(draftToken);
    }}>
      <label>Access token<input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} autoComplete="current-password" /></label>
      <button className="btn btn--primary">Connect</button>
    </form>
  );

  let body: React.ReactNode;
  switch (screen) {
    case "library":
      body = <div className="screen">
        <ScreenHead id={headingId} eyebrow="Listen" title="Library"><p>Everything you own, by album. Search, play, or add songs to a playlist.</p></ScreenHead>
        <UpdateNotice request={call} />
        <LibraryHealth request={call} />
        <Library request={call} play={play} playlists={nodes} />
      </div>;
      break;
    case "playlists":
      body = <Playlists request={call} upload={upload} nodes={nodes} loading={loading} refreshNodes={refreshNodes} play={play} headingId={headingId} />;
      break;
    case "radio":
      body = <Radio request={call} headingId={headingId} current={station} onPlay={setStation} playlists={nodes} />;
      break;
    case "party":
      body = <PartyHost request={call} headingId={headingId} onSession={setSession} />;
      break;
    case "care":
      body = <div className="screen">
        <ScreenHead id={headingId} eyebrow="Understand" title="Library care"><p>Tidy names and folders, add new music, find missing tracks and albums you don’t have yet. Nothing changes until you approve it, and everything can be undone.</p></ScreenHead>
        <OrganiseLibrary request={call} upload={upload} startOpen />
        <MissingTracks request={call} download={download} />
        <DiscographyGaps request={call} />
      </div>;
      break;
    case "brain":
      body = <div className="screen">
        <ScreenHead id={headingId} eyebrow="Understand" title="The Brain"><p>What SynAmp has learned from listening to your music and to you — and a way to double-check it.</p></ScreenHead>
        <SpotCheck request={call} startOpen />
        <Listening request={call} />
      </div>;
      break;
    case "anywhere":
      body = <div className="screen">
        <ScreenHead id={headingId} eyebrow="System" title="Listen anywhere"><p>Play your library on your phone, in the car, or at work — privately, with no subscription.</p></ScreenHead>
        <ListenAnywhere request={call} startOpen />
      </div>;
      break;
    case "settings":
      body = <div className="screen">
        <ScreenHead id={headingId} eyebrow="System" title="Settings"><p>Everything you can change without touching a config file.</p></ScreenHead>
        <PlaybackSettings />
        <Settings request={call} startOpen />
      </div>;
      break;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="app__bar">
        <a className="app__brand" href="#/library" aria-label="SynAmp, go to Library"><img className="brand-mark app__mark" src={mark} alt="" width={34} height={34} /><img className="app__wordmark" src={wordmark} alt="" width={81} height={22} /></a>
        <div className="app__bar-right"><VersionBadge request={call} /></div>
      </header>
      <div className="app__layout">
        <nav className="app__side" aria-label="SynAmp">
          {NAV.map((group) => <div key={group.group} className="app__group" role="group" aria-labelledby={`nav-${group.group}`}>
            <p className="grp" id={`nav-${group.group}`}>{group.group}</p>
            {group.items.map((item) => (
              <a key={item.id} className="app__nav-link" href={`#/${item.id}`} aria-current={screen === item.id ? "page" : undefined}>
                <Icon name={item.icon} />{item.label}
              </a>
            ))}
          </div>)}
        </nav>
        <main id="main" className="app__main" tabIndex={-1}>
          {tokenForm}
          {error && <p className="alert" role="alert">{error}</p>}
          {body}
        </main>
      </div>
      {station && <RadioBar station={station} onStop={() => setStation(null)} onVisuals={openVisuals} />}
      {visuals && <Suspense fallback={null}><Visuals open={visuals} onClose={() => setVisuals(false)} /></Suspense>}
      <Player request={call} session={session} onSession={setSession} away={!!station} onVisuals={openVisuals}
        playlistName={(id) => nodes.find((node) => node.id === id)?.name}
        onChanged={() => { refreshNodes().catch(() => undefined); }} />
    </div>
  );
}
