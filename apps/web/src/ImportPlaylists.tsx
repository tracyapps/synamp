import { useId, useRef, useState } from "react";
import type { Request } from "./api";
import Icon from "./ui/Icon";

/*
 * "Bring your playlists across": an .m3u/.m3u8 playlist, or the whole iTunes /
 * Music library export (every playlist and folder at once). The brain reads the
 * file and finds each song in the library (apps/brain/src/library/playlist-import.ts);
 * you see what was found before anything is made.
 */

type Found = {
  key: string; name: string; total: number; found: number; missing: string[]; missing_count: number;
  parent?: string; folder?: boolean; smart?: boolean;
};
type Preview = { import_id: string; source: string; playlists: Found[] };
export type RawUpload = (path: string, body: Blob, headers?: Record<string, string>, method?: string) => Promise<unknown>;

const n = (value: number) => value.toLocaleString();

export default function ImportPlaylists({ request, upload, onImported }: { request: Request; upload: RawUpload; onImported: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const ids = useId();

  async function read(picked: File | undefined) {
    if (!picked) return;
    setError(""); setMessage(""); setPreview(null);
    setBusy(`Reading ${picked.name}…`);
    try {
      const result = await upload(`/playlists/import?filename=${encodeURIComponent(picked.name)}`, picked, { "content-type": "text/plain; charset=utf-8" }, "POST") as Preview;
      setPreview(result);
      // Everything with at least one song found starts ticked; folders come along with them.
      setChosen(new Set(result.playlists.filter((item) => item.folder || item.found > 0).map((item) => item.key)));
      const itunes = result.playlists.length > 1 || /\.xml$/i.test(picked.name);
      setFolder(itunes ? "From iTunes" : "Imported");
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); if (file.current) file.current.value = ""; }
  }

  async function create() {
    if (!preview) return;
    setBusy("Making playlists…"); setError("");
    try {
      const result = await request<{ created: number; songs: number }>("/playlists/import/create", {
        method: "POST", body: JSON.stringify({ import_id: preview.import_id, keys: [...chosen], folder_name: folder }),
      });
      setMessage(`Made ${result.created} ${result.created === 1 ? "playlist" : "playlists"} with ${n(result.songs)} songs${folder.trim() ? ` in the “${folder.trim()}” folder` : ""}.`);
      setPreview(null);
      onImported();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }

  const toggle = (key: string) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const lists = preview?.playlists ?? [];
  const chosenLists = lists.filter((item) => !item.folder && chosen.has(item.key));
  const depth = (item: Found) => { let d = 0; let parent = item.parent; while (parent && d < 6) { d++; parent = lists.find((x) => x.key === parent)?.parent; } return d; };

  return (
    <section className="section-card import" aria-labelledby={`${ids}-title`}>
      <div className="section-card__head">
        <div><h2 id={`${ids}-title`} className="section-card__title">Bring your playlists across</h2>
          <p className="section-card__meta">From iTunes, Music, Winamp, foobar2000, VLC and most other players</p></div>
      </div>
      <div className="section-card__body">
        {!preview && <>
          <p className="import__intro">Choose a playlist file and SynAmp finds each song in your library — even if it has moved, been renamed or ripped again since.</p>
          <ul className="import__how">
            <li><strong>iTunes or Music</strong>: File → Library → <em>Export Library…</em> — brings every playlist and folder at once.</li>
            <li><strong>One playlist</strong> from any player: save or export it as <code>.m3u</code> or <code>.m3u8</code>.</li>
          </ul>
          <div className="cluster" style={{ marginTop: 14 }}>
            <input ref={file} type="file" hidden accept=".m3u,.m3u8,.xml,.txt,audio/x-mpegurl,application/xml,text/xml"
              onChange={(event) => read(event.target.files?.[0])} />
            <button type="button" className="btn btn--ghost" disabled={!!busy} onClick={() => file.current?.click()}><Icon name="upload" />Choose a playlist file…</button>
            {busy && <span className="muted" role="status">{busy}</span>}
          </div>
        </>}
        {error && <p className="alert" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        {preview && <>
          <p className="import__intro">From <strong>{preview.source}</strong>: {lists.filter((item) => !item.folder).length} {lists.filter((item) => !item.folder).length === 1 ? "playlist" : "playlists"}. Untick any you don’t want.</p>
          <fieldset className="import__list">
            <legend className="visually-hidden">Playlists to bring across</legend>
            {lists.map((item) => (
              <div key={item.key} className="import__item" style={{ paddingLeft: depth(item) * 22 }}>
                <label className="import__check">
                  <input type="checkbox" checked={chosen.has(item.key)} onChange={() => toggle(item.key)} />
                  <span><span className="import__name">{item.folder && <Icon name="folder" size={16} />}{item.name}</span>
                    {!item.folder && <small className={item.found === item.total ? "" : "import__partial"}>
                      {item.total === 0 ? "empty" : item.found === item.total ? `all ${n(item.total)} songs found` : `${n(item.found)} of ${n(item.total)} songs found`}
                      {item.smart ? " · a smart playlist in iTunes, brought across as it is today" : ""}</small>}</span>
                </label>
                {item.missing_count > 0 && <details className="import__missing">
                  <summary>Not found ({n(item.missing_count)})</summary>
                  <ul>{item.missing.map((line, index) => <li key={index}>{line}</li>)}</ul>
                  {item.missing_count > item.missing.length && <p className="muted">…and {n(item.missing_count - item.missing.length)} more.</p>}
                </details>}
              </div>
            ))}
          </fieldset>
          <div className="import__go">
            <label>Put them in a folder called<input value={folder} onChange={(event) => setFolder(event.target.value)} maxLength={120} placeholder="Leave empty for the top level" /></label>
            <button type="button" className="btn btn--primary" disabled={!!busy || chosenLists.length === 0} onClick={create}>
              {busy || `Bring across ${chosenLists.length} ${chosenLists.length === 1 ? "playlist" : "playlists"}`}</button>
            <button type="button" className="btn btn--quiet" onClick={() => setPreview(null)}>Cancel</button>
          </div>
          <p className="muted import__note">Songs that weren’t found are left out. If you rip or add them later, add them to the playlist from the Library screen.</p>
        </>}
        <p className="import__message" role="status">{message}</p>
      </div>
    </section>
  );
}
