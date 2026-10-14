import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./styles/feedback.css";
import { composeReport, deviceLines, fileNameFor, KINDS, mailtoFor, subjectFor } from "./feedback-report";
import type { Kind, Section } from "./feedback-report";
import { Callout, SectionCard } from "./ui/kit";
import Icon from "./ui/Icon";

/*
 * Send feedback: a note in the tester's own words, plus the details they choose
 * to attach. Nothing leaves the browser by itself: the tester reads every word,
 * then emails it from their own mail app, copies it, or saves it as a file.
 *
 * Works when the SynAmp server is down too (that's when people most need it):
 * the install details just say they couldn't be read.
 */

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type ServerReport = { support_email: string; generated_at: number; names: boolean; install: Section[]; problems: Section };

const DRAFT_KEY = "synamp-feedback-draft";
/** The feedback address, remembered so "Email it" still works when the server is down. */
const EMAIL_KEY = "synamp-feedback-email";
const rememberedEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ""; } catch { return ""; } };
type Draft = { kind: Kind; note: string; doing: string; expected: string };
const EMPTY: Draft = { kind: "problem", note: "", doing: "", expected: "" };

function loadDraft(): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
    if (saved && KINDS.some((k) => k.id === saved.kind)) return { ...EMPTY, ...saved };
  } catch { /* private window or nothing saved */ }
  return EMPTY;
}

function device(screenName?: string) {
  const nav = navigator as Navigator & { connection?: { type?: string; effectiveType?: string; saveData?: boolean } };
  const media = (query: string) => (typeof matchMedia === "function" ? matchMedia(query).matches : undefined);
  return deviceLines({
    userAgent: nav.userAgent, language: nav.language,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height, pixelRatio: Math.round(window.devicePixelRatio * 100) / 100 },
    online: nav.onLine,
    connection: nav.connection ? { type: nav.connection.type, effectiveType: nav.connection.effectiveType, saveData: nav.connection.saveData } : undefined,
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    colourScheme: media("(prefers-color-scheme: light)") ? "light" : "dark",
    screenName,
  });
}

/** Copy text. The NAS is usually plain http, where the Clipboard API is missing, so fall back to the old way. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const area = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  area.style.position = "fixed"; area.style.opacity = "0"; area.style.top = "0";
  const focused = document.activeElement as HTMLElement | null;
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  focused?.focus();
  return ok;
}

export default function Feedback({ request, cameFrom }: { request: Request; cameFrom?: string }) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [withInstall, setWithInstall] = useState(true);
  const [withProblems, setWithProblems] = useState(true);
  const [withDevice, setWithDevice] = useState(true);
  const [names, setNames] = useState(false);
  const [server, setServer] = useState<ServerReport | null>(null);
  const [serverProblem, setServerProblem] = useState("");
  const [loading, setLoading] = useState(true);
  const [said, setSaid] = useState<{ at: "email" | "copy" | "save"; text: string; n: number } | null>(null);
  const saidCount = useRef(0);
  const id = useId();
  const deviceInfo = useMemo(() => device(cameFrom), [cameFrom]);
  const generatedAt = server?.generated_at ?? Date.now();

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* this visit only */ }
  }, [draft]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    request<ServerReport>(`/support/report${names ? "?names=1" : ""}`)
      .then((data) => {
        if (!current) return;
        setServer(data); setServerProblem("");
        try { if (data.support_email) localStorage.setItem(EMAIL_KEY, data.support_email); else localStorage.removeItem(EMAIL_KEY); } catch { /* this visit only */ }
      })
      .catch((cause: Error) => { if (current) { setServer(null); setServerProblem(cause.message); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [request, names]);

  const unread: Section = { title: "This install", lines: [`The SynAmp server couldn’t be asked (${serverProblem || "no answer"}).`] };
  const report = composeReport({
    ...draft, generatedAt, names,
    install: withInstall ? (server ? server.install : [unread]) : undefined,
    problems: withProblems && server ? server.problems : undefined,
    device: withDevice ? deviceInfo : undefined,
  });
  const email = server ? server.support_email : rememberedEmail();
  const subject = subjectFor(draft.kind, draft.note);
  const mail = email ? mailtoFor(email, subject, report, draft.note) : null;
  const kind = KINDS.find((k) => k.id === draft.kind)!;
  const isProblem = draft.kind === "problem";

  const say = (at: "email" | "copy" | "save", text: string) => { saidCount.current += 1; setSaid({ at, text, n: saidCount.current }); };
  const set = (part: Partial<Draft>) => setDraft((old) => ({ ...old, ...part }));

  async function copy() {
    say("copy", (await copyText(report)) ? "Copied. Paste it into an email or a message." : "Couldn’t copy here. Open “Read exactly what you’re sending”, select the text and copy it, or save it as a file.");
  }
  function save() {
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: fileNameFor(generatedAt) });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("save", `Saved as ${fileNameFor(generatedAt)} in your downloads.`);
  }
  async function emailIt(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!mail?.shortened) { say("email", "Your mail app should open with the report in it. Nothing is sent until you press Send there."); return; }
    // The report is too long for an email link: copy it first, then open the mail app.
    event.preventDefault();
    const href = event.currentTarget.href;
    const copied = await copyText(report);
    say("email", copied
      ? "The report is long, so it’s on your clipboard: paste it into the email that opens. Nothing is sent until you press Send there."
      : "The report is long and couldn’t be copied here. Save it as a file and attach it to the email that opens.");
    window.location.href = href;
  }
  function startOver() {
    setDraft(EMPTY);
    setSaid(null);
    document.getElementById(`${id}-note`)?.focus();
  }

  const note = (at: "email" | "copy" | "save") => (
    <p className="feedback__said" role="status">{said?.at === at ? <span key={said.n}><Icon name="check" size={16} /> {said.text}</span> : null}</p>
  );

  return (
    <div className="feedback">
      <SectionCard title="Your note" labelledBy={`${id}-note-title`}>
        <form className="feedback__form" onSubmit={(event) => event.preventDefault()}>
          <Callout title="Nothing is sent by itself">
            <p>SynAmp doesn’t send your note anywhere. Write it, read exactly what it says, then email it from your own mail app, copy it, or save it as a file.</p>
          </Callout>
          <fieldset className="feedback__kinds">
            <legend>What’s it about?</legend>
            {KINDS.map((k) => (
              <label key={k.id} className="check feedback__kind">
                <input type="radio" name={`${id}-kind`} value={k.id} checked={draft.kind === k.id} onChange={() => set({ kind: k.id })} aria-describedby={`${id}-kind-${k.id}`} />
                <span><span className="feedback__kind-label">{k.label}</span><span className="feedback__kind-hint" id={`${id}-kind-${k.id}`}>{k.hint}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor={`${id}-note`}>In your own words</label>
            <textarea id={`${id}-note`} className="textarea" value={draft.note} onChange={(e) => set({ note: e.target.value })} aria-describedby={`${id}-note-hint`} rows={5} />
            <p className="hint" id={`${id}-note-hint`}>{isProblem ? "What happened? Short is fine." : kind.hint} Your note stays here if you look at another screen, until you start a new one.</p>
          </div>

          {isProblem && <>
            <div className="field">
              <label htmlFor={`${id}-doing`}>What were you doing? (optional)</label>
              <textarea id={`${id}-doing`} className="textarea feedback__small" value={draft.doing} onChange={(e) => set({ doing: e.target.value })} rows={2} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-expected`}>What did you expect instead? (optional)</label>
              <textarea id={`${id}-expected`} className="textarea feedback__small" value={draft.expected} onChange={(e) => set({ expected: e.target.value })} rows={2} />
            </div>
          </>}

          <fieldset className="feedback__details">
            <legend>Add details that help fix things</legend>
            <label className="check">
              <input type="checkbox" checked={withInstall} onChange={(e) => setWithInstall(e.target.checked)} aria-describedby={`${id}-install-hint`} />
              <span>About this install<span className="feedback__kind-hint" id={`${id}-install-hint`}>Version, free space, how many songs, how far the listening has got, which optional features are on. Numbers and yes/no only.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={withProblems} onChange={(e) => setWithProblems(e.target.checked)} aria-describedby={`${id}-problems-hint`} />
              <span>Recent problems SynAmp noticed<span className="feedback__kind-hint" id={`${id}-problems-hint`}>The server’s own error messages since it last started, with keys, passwords and email addresses taken out.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={withDevice} onChange={(e) => setWithDevice(e.target.checked)} aria-describedby={`${id}-device-hint`} />
              <span>About this device<span className="feedback__kind-hint" id={`${id}-device-hint`}>Which browser, window size, and settings like reduced motion.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} aria-describedby={`${id}-names-hint`} />
              <span>Include song and folder names<span className="feedback__kind-hint" id={`${id}-names-hint`}>Off unless you want it. Helps when one song or album is the problem. Your Mac’s name is included too.</span></span>
            </label>
            {loading && <p className="hint" role="status">Reading the details…</p>}
            {!loading && serverProblem && withInstall && <p className="hint">The SynAmp server didn’t answer, so install details can’t be added. Your note still works.</p>}
          </fieldset>

          <details className="feedback__preview">
            <summary>Read exactly what you’re sending</summary>
            <pre className="feedback__text" tabIndex={0} aria-label="The report, exactly as it will be sent">{report}</pre>
          </details>

          <div className="feedback__send">
            <h3 className="feedback__send-title">Send it</h3>
            {email ? (
              <div className="feedback__action">
                <a className="btn btn--primary" href={mail!.href} onClick={emailIt}><Icon name="open" />Email it to {email}</a>
                {note("email")}
              </div>
            ) : !loading && (
              <p className="hint">This SynAmp doesn’t have a feedback address set up. Copy the report or save it as a file, and send it to whoever asked you to try SynAmp.</p>
            )}
            <div className="feedback__action">
              <button type="button" className="btn btn--ghost" onClick={copy}>Copy the report</button>
              {note("copy")}
            </div>
            <div className="feedback__action">
              <button type="button" className="btn btn--ghost" onClick={save}>Save as a file</button>
              {note("save")}
            </div>
            <button type="button" className="btn btn--quiet feedback__again" onClick={startOver}>Start a new note</button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
