import { useId, useRef, useState } from "react";

/*
 * Add music: drag files or whole album folders here, or choose them. They are
 * copied (your originals stay where they are) into incoming/ on the server,
 * and show up as "New music" proposals to review. The same happens for
 * anything you copy into the incoming/ folder on the NAS yourself.
 */

export type IncomingStatus = { enabled: false } | { enabled: true; files: number; arriving: number; ignored: number; set_aside: number; truncated: boolean };
export type Upload = (path: string, body: Blob, headers?: Record<string, string>) => Promise<unknown>;

const AUDIO = /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff?|wma|alac|m4b)$/i;
const COMPANION = /\.(jpe?g|png|gif|webp|pdf|cue|log|txt|nfo|m3u8?)$/i;
const CONCURRENCY = 2;
const n = (value: number) => value.toLocaleString();

type Picked = { file: File; path: string };

/** Lowercase letters and digits only, as the server expects; no secure-context APIs needed. */
const uploadId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const cleanPath = (path: string) => path.replace(/^\/+/, "").split("/").filter((part) => part && part !== "." && part !== ".." && !part.startsWith(".")).join("/");

async function checksum(file: File): Promise<string | undefined> {
  // Only on https/localhost pages, and not for huge files (it reads the whole file into memory).
  if (!globalThis.crypto?.subtle || file.size > 512 * 1024 * 1024) return undefined;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Files from a drop, walking into dropped folders and keeping their relative paths. */
async function fromDrop(items: DataTransferItemList): Promise<Picked[]> {
  const out: Picked[] = [];
  const entries = [...items].map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, path: cleanPath(entry.fullPath) || file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

export default function AddMusic({ upload, incoming, maxMb, onUploaded, onRescan }: {
  upload: Upload; incoming: IncomingStatus; maxMb: number; onUploaded: (count: number) => void; onRescan: () => void;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  async function send(picked: Picked[]) {
    const wanted = picked.filter((p) => AUDIO.test(p.path) || COMPANION.test(p.path));
    const skipped = picked.length - wanted.length;
    const tooBig = wanted.filter((p) => p.file.size > maxMb * 1024 * 1024);
    const queue = wanted.filter((p) => !tooBig.includes(p));
    const errors: string[] = [
      ...(skipped ? [`${n(skipped)} ${skipped === 1 ? "file was" : "files were"} skipped (only music, artwork, cue sheets and logs are added)`] : []),
      ...tooBig.map((p) => `${p.path}: over ${n(maxMb)} MB`),
    ];
    if (!queue.length) { setProblems(errors); setMessage("Nothing to add."); return; }
    setBusy(true);
    setProblems([]);
    setMessage("");
    setProgress({ done: 0, total: queue.length });
    const batch = uploadId();
    let next = 0, done = 0, added = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next++]!;
        try {
          const sum = await checksum(item.file);
          await upload(`/import/upload?upload=${batch}&path=${encodeURIComponent(item.path)}`, item.file, sum ? { "x-content-sha256": sum } : {});
          added++;
        } catch (cause) {
          errors.push(`${item.path}: ${(cause as Error).message}`);
        }
        setProgress({ done: ++done, total: queue.length });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setBusy(false);
    setProblems(errors);
    setMessage(added ? `Added ${n(added)} ${added === 1 ? "file" : "files"}. They’re listed under “New music” below for you to review.` : "Nothing was added.");
    if (added) onUploaded(added);
  }

  if (!incoming.enabled) {
    return (
      <div className="addmusic addmusic--off">
        <h3>Add music</h3>
        <p className="muted">Adding music is off. Set <code>INCOMING_PATH</code> on the brain to your <code>incoming/</code> folder (see the deploy README) to drop new music here or into that folder.</p>
      </div>
    );
  }

  const pickedFromInput = (list: FileList | null): Picked[] =>
    [...(list ?? [])].map((file) => ({ file, path: cleanPath(file.webkitRelativePath || file.name) || file.name }));

  return (
    <div className="addmusic" aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`}>Add music</h3>
      <div
        className={`addmusic__drop ${over ? "is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (busy) return;
          fromDrop(e.dataTransfer.items).then(send).catch((cause) => setMessage((cause as Error).message));
        }}
      >
        <p>Drag album folders or music files here — they’re copied, your originals stay put.</p>
        <div className="addmusic__buttons">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => filesInput.current?.click()}>Choose files…</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => folderInput.current?.click()}>Choose a folder…</button>
        </div>
        <input ref={filesInput} type="file" multiple hidden accept="audio/*,.flac,.m4a,.cue,.log,image/*" onChange={(e) => { send(pickedFromInput(e.target.files)); e.target.value = ""; }} />
        {/* @ts-expect-error webkitdirectory is a real (non-standard) attribute every current browser supports */}
        <input ref={folderInput} type="file" hidden webkitdirectory="" onChange={(e) => { send(pickedFromInput(e.target.files)); e.target.value = ""; }} />
      </div>
      {busy && <div className="addmusic__progress">
        <label htmlFor={`${ids}-p`}>Copying {n(progress.done)} of {n(progress.total)}</label>
        <progress id={`${ids}-p`} value={progress.done} max={progress.total} />
      </div>}
      <p className="muted addmusic__incoming">
        Also watching <code>incoming/</code> on the NAS: {n(incoming.files)} {incoming.files === 1 ? "file" : "files"} waiting to be filed
        {incoming.arriving > 0 && <>, {n(incoming.arriving)} still being copied in</>}
        {incoming.set_aside > 0 && <>, {n(incoming.set_aside)} set aside as identical copies in <code>incoming/_duplicates</code></>}
        {incoming.ignored > 0 && <>, {n(incoming.ignored)} other files left alone</>}.
        {" "}<button type="button" className="linkish" onClick={onRescan}>Check again</button>
      </p>
      <p className="listening__message" role="status">{message}</p>
      {problems.length > 0 && <ul className="addmusic__problems">{problems.slice(0, 20).map((p) => <li key={p}>{p}</li>)}{problems.length > 20 && <li>…and {n(problems.length - 20)} more</li>}</ul>}
    </div>
  );
}
