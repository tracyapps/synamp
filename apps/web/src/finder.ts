/*
 * "Open in Finder": which folder a proposal is about, as it is now. The brain
 * asks the Mac that analyses the music to open it (POST /analyzer/reveal);
 * Finder opens it there, inside the music share that Mac already has mounted.
 * Pure, so it's tested on its own (tools/finder.test.mts).
 */

import type { Request } from "./api";

export type Finder = { host: string };
export type Folder = { area: "library" | "incoming"; path: string };
type Movable = { kind: "artist" | "album" | "import" | "tags"; preview: Array<{ from: string }>; moves: Array<{ from: string }>; edits?: Array<{ path: string }> };

const clean = (path: string) => path.split("/").filter((part) => part && part !== "." && part !== "..").join("/");
const parent = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** The album's folder, the artist's folder for a merge, or where new music waits in incoming/. */
export function folderOf(decision: Movable): Folder | null {
  if (decision.kind === "import") {
    const from = decision.preview[0]?.from ?? "incoming";
    return { area: "incoming", path: clean(from.replace(/^incoming\/?/, "")) };
  }
  const file = decision.moves[0]?.from ?? decision.edits?.[0]?.path;
  const first = clean(decision.preview[0]?.from ?? (file ? parent(file) : ""));
  if (!first) return null;
  return { area: "library", path: decision.kind === "artist" ? first.split("/")[0]! : first };
}

/** Second copies are set aside here. */
export const DUPLICATES_FOLDER: Folder = { area: "incoming", path: "_duplicates" };

/** "tappsBook-Pro.local" → "tappsBook-Pro". */
export const macName = (finder: Finder) => finder.host.replace(/\.local$/, "");

/** Resolve the current path on the server rather than trusting an old row's path. */
export async function revealSong(request: Request, id: string, say: (message: string) => void) {
  say("Asking the analyzer Mac to reveal this file…");
  try {
    const result = await request<{ host?: string }>("/analyzer/reveal", { method: "POST", body: JSON.stringify({ track_id: id }) });
    say(`Finder request sent to ${result.host ? macName({ host: result.host }) : "the analyzer Mac"}. It should select the file in a few seconds.`);
  } catch (cause) {
    say(`Couldn’t reveal this file: ${(cause as Error).message}`);
  }
}
