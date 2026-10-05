/**
 * Names that survive both macOS and the NAS (LIBRARY-CARE "Principles").
 *
 * Pure functions: safe file and folder names, the standard track and album
 * naming, artist-name comparison keys, and a strict check for library-relative
 * paths (the librarian refuses anything that could point outside the library).
 */

const UTF8 = new TextEncoder();
const bytes = (text: string) => UTF8.encode(text).length;

/** Files the Mac and Windows leave behind; never worth keeping a folder for. */
export const JUNK_FILE = /^(?:\.DS_Store|Thumbs\.db|desktop\.ini|\._.+)$/i;

/** Leading track number in a filename: "03 - x", "03. x", "1-03 x", "03_x". */
export const LEADING_NUMBER = /^\s*(?:\d{1,2}[-.])?\d{1,3}(?:\s*[-._)]\s*|\s+)(?=\S)/;

function capBytes(text: string, max: number): string {
  if (bytes(text) <= max) return text;
  let out = "";
  for (const ch of text) {
    if (bytes(out + ch) > max) break;
    out += ch;
  }
  return out;
}

/**
 * One path component, safe on macOS, Windows/SMB and Linux:
 * no `: / \ ? * " < > |`, no control characters, no leading dots, no trailing
 * dots or spaces, and at most `max` bytes (filesystems allow 255).
 */
export function safeName(text: string, max = 180): string {
  const cleaned = text.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s*:\s*/g, " - ")
    .replace(/[/\\|]/g, "-")
    .replace(/[?*<>]/g, "")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const capped = capBytes(cleaned, max).replace(/[. ]+$/, "").trim();
  return capped || "_";
}

/** Two spellings of one artist compare equal: case, accents, "&"/"and", "The", punctuation. */
export function artistKey(name: string): string {
  const key = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[&+]/g, " and ")
    .replace(/^the\s+/, "")
    .replace(/,\s*the$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return key || name.trim().toLowerCase();
}

/** "DiFranco, Ani" → "Ani DiFranco" (only the simple "Surname, Name" shape). */
export function unswapName(name: string): string | undefined {
  const match = name.match(/^([^,]+),\s*([^,\s]+)$/);
  if (!match || /^the$/i.test(match[2]!)) return undefined;
  return `${match[2]} ${match[1]!.trim()}`;
}

const YEAR_IN_NAME = /[([]\s*\d{4}\s*[)\]]/;

/** Album folder: `Album (Year)`. A name that already carries a year is left alone. */
export function albumFolderName(current: string, year: number | undefined, addYear: boolean): string {
  const base = safeName(current);
  if (!addYear || !year || YEAR_IN_NAME.test(base)) return base;
  return safeName(`${base} (${year})`);
}

/** Track file: `01 - Title.ext`, or `1-01 - Title.ext` on multi-disc albums. */
export function trackFileName(options: {
  title: string; ext: string; track?: number; disc?: number; multiDisc: boolean; width: number; stem: string;
}): string {
  const ext = options.ext.toLowerCase();
  const room = 200 - bytes(ext);
  if (options.track === undefined) return safeName(options.stem, room) + ext;
  const number = String(options.track).padStart(options.width, "0");
  const prefix = options.multiDisc ? `${options.disc ?? 1}-${number}` : number;
  return safeName(`${prefix} - ${options.title}`, room) + ext;
}

/** Same name on a case-insensitive disk (macOS, SMB): compare with this. */
export const pathKey = (path: string) => path.normalize("NFC").toLowerCase();

/** A library-relative path that cannot escape the library: no "..", no absolute, no empty parts. */
export function isSafeRelative(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 4096 || path.includes("\0") || path.includes("\\")) return false;
  if (path.startsWith("/")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
