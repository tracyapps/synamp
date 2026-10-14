/*
 * "Send feedback": turning a tester's note and the details they chose into one
 * plain-text report, and an email link that fits in a mail app.
 *
 * Pure functions (no React), so tools/feedback-report.test.mts can check them.
 */

export type Kind = "problem" | "confusing" | "idea" | "works";
export type Section = { title: string; lines: string[] };

export const KINDS: Array<{ id: Kind; label: string; hint: string; subject: string }> = [
  { id: "problem", label: "Something went wrong", hint: "An error, missing music, no sound, or something that stopped.", subject: "Something went wrong" },
  { id: "confusing", label: "Something was confusing", hint: "Words, buttons or steps that didn’t make sense.", subject: "Something was confusing" },
  { id: "idea", label: "An idea or a wish", hint: "Something you’d like SynAmp to do.", subject: "An idea" },
  { id: "works", label: "It’s working", hint: "A playlist that landed, or a quick hello.", subject: "It’s working" },
];

export type ReportInput = {
  kind: Kind;
  note: string;
  /** For problems: what they were doing, and what they expected instead. Optional. */
  doing?: string;
  expected?: string;
  generatedAt: number;
  /** Each part is present only when the tester ticked it. */
  install?: Section[];
  problems?: Section;
  device?: string[];
  /** Whether song and folder names were allowed in (said in the report, so the reader knows). */
  names?: boolean;
};

const rule = "—".repeat(24);
const block = (title: string, lines: string[]) => [title, ...lines.map((line) => (line ? line : ""))];

/** The whole report as plain text, the tester's own words first. */
export function composeReport(input: ReportInput): string {
  const kind = KINDS.find((k) => k.id === input.kind) ?? KINDS[0]!;
  const words = input.note.trim();
  const out: string[] = [`SynAmp feedback: ${kind.subject}`, ""];
  out.push(words || "(No note written.)");
  if (input.doing?.trim()) out.push("", "What I was doing:", input.doing.trim());
  if (input.expected?.trim()) out.push("", "What I expected instead:", input.expected.trim());
  const details = [...(input.install ?? []), ...(input.problems ? [input.problems] : []), ...(input.device?.length ? [{ title: "This device", lines: input.device }] : [])];
  if (details.length) {
    out.push("", rule, `Details I chose to include (made ${new Date(input.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC; ${input.names ? "song and folder names included" : "song and folder names left out"}):`);
    for (const section of details) out.push("", ...block(section.title, section.lines));
  } else {
    out.push("", rule, "No details included.");
  }
  return out.join("\n") + "\n";
}

/** The subject line: kind, plus the start of the note so the reader can tell reports apart. */
export function subjectFor(kind: Kind, note: string): string {
  const first = note.trim().split(/\n/)[0]?.replace(/\s+/g, " ") ?? "";
  const base = `SynAmp: ${(KINDS.find((k) => k.id === kind) ?? KINDS[0]!).subject}`;
  if (!first) return base;
  return `${base} — ${first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first}`;
}

/**
 * A mailto: link. Many mail apps cut long links off (around 2,000 characters),
 * so when the report is longer, the email carries the note and asks for the full
 * report to be pasted from the clipboard (the app copies it first).
 */
export function mailtoFor(email: string, subject: string, report: string, note: string, limit = 1900): { href: string; shortened: boolean } {
  const href = (body: string) => `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const full = href(report);
  if (full.length <= limit) return { href: full, shortened: false };
  const short = [note.trim() || "(No note written.)", "", "The full report is on my clipboard — pasted below:", "", ""].join("\n");
  let link = href(short);
  if (link.length > limit) {
    // An unusually long note: keep as much of it as fits.
    let keep = note.trim();
    while (keep && href(`${keep}…\n\nThe full report is on my clipboard — pasted below:\n\n`).length > limit) keep = keep.slice(0, Math.floor(keep.length * 0.9));
    link = href(`${keep}…\n\nThe full report is on my clipboard — pasted below:\n\n`);
  }
  return { href: link, shortened: true };
}

/** A file name for "Save as a file": the date, so several reports don't overwrite each other. */
export function fileNameFor(generatedAt: number): string {
  return `synamp-feedback-${new Date(generatedAt).toISOString().slice(0, 16).replace(/[T:]/g, "-")}.txt`;
}

export type DeviceInfo = {
  userAgent: string;
  language?: string;
  viewport: { width: number; height: number };
  screen?: { width: number; height: number; pixelRatio: number };
  online?: boolean;
  connection?: { type?: string; effectiveType?: string; saveData?: boolean };
  reducedMotion?: boolean;
  colourScheme?: "dark" | "light";
  screenName?: string;
};

/** What the browser can say about itself, as lines. Nothing about the music or the page's contents. */
export function deviceLines(info: DeviceInfo): string[] {
  const lines = [`Browser: ${info.userAgent || "unknown"}`];
  lines.push(`Window: ${info.viewport.width} × ${info.viewport.height}${info.screen ? ` on a ${info.screen.width} × ${info.screen.height} screen (×${info.screen.pixelRatio})` : ""}`);
  if (info.language) lines.push(`Language: ${info.language}`);
  if (info.connection && (info.connection.type || info.connection.effectiveType || info.connection.saveData)) {
    lines.push(`Connection: ${[info.connection.type, info.connection.effectiveType, info.connection.saveData ? "data saver on" : ""].filter(Boolean).join(", ")}`);
  }
  if (info.online === false) lines.push("Online: no");
  if (info.reducedMotion !== undefined || info.colourScheme) {
    lines.push(`Preferences: ${[info.colourScheme ? `${info.colourScheme} mode` : "", info.reducedMotion ? "reduce motion" : ""].filter(Boolean).join(", ") || "none set"}`);
  }
  if (info.screenName) lines.push(`Came from: the ${info.screenName} screen`);
  return lines;
}
