import { useRef, useState } from "react";
import { libraryHash, parseSavedViews, serializeSavedViews } from "./library-view-state";
import type { LibraryViewState, SavedLibraryView } from "./library-view-state";
import { newId } from "./ids";

const KEY = "synamp-library-saved-views-v1";
export default function SavedLibraryViews({ state, disabled, apply }: { state: LibraryViewState; disabled: boolean; apply: (state: LibraryViewState) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [views, setViews] = useState<SavedLibraryView[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [message, setMessage] = useState("");
  const url = new URL(window.location.pathname, window.location.origin);
  try { url.hash = libraryHash(state); } catch { /* Save and share are disabled for invalid drafts. */ }
  const link = url.href;
  function open() {
    setMessage(""); setError(""); setDamaged(false);
    try { setViews(parseSavedViews(localStorage.getItem(KEY))); }
    catch (cause) { setViews([]); setDamaged(true); setError(`${(cause as Error).message} The stored data has been preserved.`); }
    dialog.current?.showModal();
  }
  function write(next: SavedLibraryView[]) {
    setMessage("");
    try { localStorage.setItem(KEY, serializeSavedViews(next)); setViews(next); setError(""); return true; }
    catch (cause) { setError(`Could not save views: ${(cause as Error).message}`); return false; }
  }
  function backup() {
    try {
      const raw = localStorage.getItem(KEY) ?? serializeSavedViews([]);
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const anchor = Object.assign(document.createElement("a"), { href: url, download: "synamp-library-views.json" });
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <><button className="btn btn--ghost btn--sm" aria-haspopup="dialog" disabled={disabled} onClick={open}>Views</button>
    <dialog ref={dialog} className="browse__column-dialog library-view-dialog" aria-labelledby="saved-views-title">
      <div className="browse__column-head"><h3 id="saved-views-title">Saved Library views</h3><button className="btn btn--quiet btn--sm" aria-label="Close saved views" onClick={() => dialog.current?.close()}>Close</button></div>
      <p className="muted">Views remember filters, grouping, sorting and layout in this browser. Column settings stay separate.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {damaged ? <div className="cluster"><button className="btn btn--ghost" onClick={backup}>Download stored data</button><button className="btn btn--quiet" onClick={() => { if (write([])) setDamaged(false); }}>Reset saved views</button></div>
        : <><form className="cluster" onSubmit={event => { event.preventDefault(); if (write([...views, { id: newId(), name: name.trim(), created_at: Date.now(), state }])) { setName(""); setMessage("View saved."); } }}>
          <label>View name <input className="input" value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="e.g. 1990s hip-hop" /></label><button className="btn btn--primary" disabled={disabled || !name.trim() || views.length >= 50}>Save current view</button></form>
          <ul className="library-saved-views">{views.map(view => <li key={view.id}><span>{view.name}</span><button className="btn btn--ghost btn--sm" onClick={() => { apply(view.state); dialog.current?.close(); }}>Open</button><button className="btn btn--quiet btn--sm" aria-label={`Delete view ${view.name}`} onClick={() => write(views.filter(item => item.id !== view.id))}>Delete</button></li>)}</ul>
          {!views.length && <p className="muted">No saved views yet.</p>}<button className="btn btn--quiet btn--sm" onClick={backup}>Download saved views</button></>}
      <label className="library-view-link">Link to current view <input className="input" readOnly value={link} onFocus={event => event.currentTarget.select()} /></label>
      <div className="cluster"><button className="btn btn--ghost btn--sm" disabled={disabled} onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("View link copied."); } catch { setMessage("Select the link above and copy it. Clipboard access is unavailable in this browser."); } }}>Copy link</button><span className="muted">Use on this SynAmp server. Includes filters, never your access token.</span></div>
      <p role="status">{message}</p>
    </dialog></>;
}
