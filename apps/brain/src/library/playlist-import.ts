/**
 * Bringing your existing playlists across.
 *
 * Reads the two formats nearly every player can write:
 *   - M3U / M3U8 (Winamp, foobar2000, VLC, Swinsian, Music's "Export Playlist…")
 *   - the iTunes / Music library XML ("Export Library…"), which holds every
 *     playlist at once, folders included
 * and finds each song in the SynAmp library.
 *
 * Old playlists point at files that have since moved, been renamed, or been
 * ripped again in another format, so a path is only the first clue. In order:
 *   1. the end of the path (artist/album/file, ignoring the extension)
 *   2. artist + title (accents, punctuation and "(Remastered)" ignored),
 *      with album and length to choose between copies
 *   3. title + album
 * A song found none of these ways is listed, never guessed.
 */

import { posix } from "node:path";
import { normalTitle } from "./albums.ts";
import { fold } from "./browse.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

export class ImportError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** One line of an old playlist: whatever clues the file gave. */
export type Entry = { path?: string; title?: string; artist?: string; album?: string; duration_s?: number };
export type ParsedPlaylist = {
  key: string; name: string; entries: Entry[];
  /** The folder it sat in (iTunes), as a key into the same list. */
  parent?: string;
  folder?: boolean;
  /** It was a smart playlist in iTunes: brought across as a fixed list. */
  smart?: boolean;
};

// --- M3U -------------------------------------------------------------------------

/** A path or file:// URL from any OS, as forward-slash segments. */
export function cleanPath(raw: string): string {
  let text = raw.trim();
  if (/^file:\/\//i.test(text)) {
    text = text.replace(/^file:\/\/(localhost)?/i, "");
    try { text = decodeURIComponent(text); } catch { /* keep as is */ }
  }
  return text.replace(/\\/g, "/").replace(/^\/?[A-Za-z]:\//, "/").replace(/\/+/g, "/");
}

export function parseM3u(text: string, name: string): ParsedPlaylist {
  const entries: Entry[] = [];
  let pending: Entry = {};
  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      // #EXTINF:257,Fleetwood Mac - Dreams   (the comma after the length, then "Artist - Title")
      const match = line.slice(8).match(/^(-?\d+(?:\.\d+)?)[^,]*,(.*)$/);
      if (match) {
        const seconds = Number(match[1]);
        const label = match[2]!.trim();
        const split = label.indexOf(" - ");
        pending = {
          ...(seconds > 0 ? { duration_s: seconds } : {}),
          ...(split > 0 ? { artist: label.slice(0, split).trim(), title: label.slice(split + 3).trim() } : label ? { title: label } : {}),
        };
      }
      continue;
    }
    if (line.startsWith("#EXTALB:")) { pending.album = line.slice(8).trim(); continue; }
    if (line.startsWith("#EXTART:")) { pending.artist ??= line.slice(8).trim(); continue; }
    if (line.startsWith("#")) continue;
    if (/^https?:\/\//i.test(line)) { pending = {}; continue; } // a stream, not a file
    entries.push({ ...pending, path: cleanPath(line) });
    pending = {};
  }
  return { key: "m3u", name, entries };
}

// --- iTunes / Music library XML (a property list) ---------------------------------

type Plist = string | number | boolean | Plist[] | { [key: string]: Plist };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescape(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) =>
    code[0] === "#" ? String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : ENTITIES[code.toLowerCase()]!);
}

/** A small, forgiving plist reader: enough for the library XML, no dependencies. */
export function parsePlist(xml: string): Plist {
  const tag = /<(\/?)(dict|array|key|string|integer|real|date|data|true|false)(\s*\/)?>/g;
  const stack: Array<{ value: Plist[] | Record<string, Plist>; key?: string }> = [];
  let root: Plist | undefined;
  let key: string | undefined;
  const put = (value: Plist) => {
    const top = stack[stack.length - 1];
    if (!top) { root = value; return; }
    if (Array.isArray(top.value)) top.value.push(value);
    else if (key !== undefined) { top.value[key] = value; key = undefined; }
  };
  let match: RegExpExecArray | null;
  while ((match = tag.exec(xml))) {
    const [, closing, name, selfClosing] = match;
    if (name === "true" || name === "false") { put(name === "true"); continue; }
    if (name === "dict" || name === "array") {
      if (selfClosing) { put(name === "dict" ? {} : []); continue; }
      if (closing) {
        const done = stack.pop();
        if (!done) throw new ImportError("This XML file is damaged");
        key = done.key;
        put(done.value);
      } else {
        stack.push({ value: name === "dict" ? {} : [], key });
        key = undefined;
      }
      continue;
    }
    if (closing) continue;
    if (selfClosing) { if (name === "key") key = ""; else put(""); continue; }
    const end = xml.indexOf(`</${name}>`, tag.lastIndex);
    if (end < 0) throw new ImportError("This XML file is damaged");
    const text = unescape(xml.slice(tag.lastIndex, end));
    tag.lastIndex = end + name!.length + 3;
    if (name === "key") key = text;
    else if (name === "integer" || name === "real") put(Number(text));
    else put(text);
  }
  if (root === undefined) throw new ImportError("This doesn't look like an iTunes or Music library file");
  return root;
}

/** iTunes's own lists ("Music", "Downloaded", "Library", …), not ones you made. */
const BUILT_IN = ["Master", "Distinguished Kind", "Music", "Movies", "TV Shows", "Podcasts", "Audiobooks", "Books", "Purchased Music", "iTunesU"];

export function parseItunesXml(xml: string): ParsedPlaylist[] {
  const root = parsePlist(xml) as Record<string, Plist>;
  const tracks = root.Tracks as Record<string, Record<string, Plist>> | undefined;
  const lists = root.Playlists as Array<Record<string, Plist>> | undefined;
  if (!tracks || !Array.isArray(lists)) throw new ImportError("This doesn't look like an iTunes or Music library file (no Tracks or Playlists)");
  const entryFor = (id: string): Entry | undefined => {
    const t = tracks[id];
    if (!t) return undefined;
    const str = (value: Plist | undefined) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
    const ms = typeof t["Total Time"] === "number" ? t["Total Time"] : undefined;
    const entry: Entry = {};
    const location = str(t.Location);
    if (location) entry.path = cleanPath(location);
    const title = str(t.Name), artist = str(t.Artist) ?? str(t["Album Artist"]), album = str(t.Album);
    if (title) entry.title = title;
    if (artist) entry.artist = artist;
    if (album) entry.album = album;
    if (ms) entry.duration_s = ms / 1000;
    return entry;
  };
  const result: ParsedPlaylist[] = [];
  for (const list of lists) {
    if (BUILT_IN.some((field) => list[field] !== undefined && list[field] !== false) || list.Visible === false) continue;
    const key = String(list["Playlist Persistent ID"] ?? list["Playlist ID"] ?? result.length);
    const items = Array.isArray(list["Playlist Items"]) ? list["Playlist Items"] as Array<Record<string, Plist>> : [];
    const entries = items.map((item) => entryFor(String(item["Track ID"]))).filter((entry): entry is Entry => !!entry);
    result.push({
      key, name: String(list.Name ?? "Untitled playlist").slice(0, 120), entries,
      ...(list["Parent Persistent ID"] ? { parent: String(list["Parent Persistent ID"]) } : {}),
      ...(list.Folder === true ? { folder: true } : {}),
      ...(list["Smart Info"] !== undefined || list["Smart Criteria"] !== undefined ? { smart: true } : {}),
    });
  }
  return result;
}

/** Works out the format from the file name and contents. */
export function parsePlaylistFile(text: string, filename: string): ParsedPlaylist[] {
  const base = posix.basename(cleanPath(filename || "Imported playlist"));
  const trimmed = text.replace(/^﻿/, "").trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<plist") || /\.xml$/i.test(base)) return parseItunesXml(text);
  if (/\.(m3u8?|txt)$/i.test(base) || trimmed.startsWith("#EXTM3U") || trimmed.length) {
    const playlist = parseM3u(text, base.replace(/\.(m3u8?|txt)$/i, "") || "Imported playlist");
    if (!playlist.entries.length) throw new ImportError("No songs found in that file. SynAmp reads .m3u and .m3u8 playlists and the iTunes / Music library .xml.");
    return [playlist];
  }
  throw new ImportError("That file is empty");
}

// --- finding the songs --------------------------------------------------------------

const stripExt = (segment: string) => segment.replace(/\.[a-z0-9]{2,5}$/i, "");
const pathKey = (segments: string[]) => segments.map((segment) => fold(stripExt(segment))).join("/");
const songKey = (artist: string, title: string) => `${fold(artist)}|${normalTitle(title)}`;
/** "01 Song", "1-03 - Song", "03. Song" → "Song". */
const titleFromFile = (file: string) => stripExt(file).replace(/^\d{1,2}[-.]?\d{0,3}\s*[-.]?\s*/, "").trim();

export class Matcher {
  private bySuffix3 = new Map<string, string[]>();
  private bySuffix2 = new Map<string, string[]>();
  private bySong = new Map<string, LibraryTrack[]>();
  private byTitle = new Map<string, LibraryTrack[]>();

  constructor(library: Library) {
    const add = <T>(map: Map<string, T[]>, key: string, value: T) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };
    for (const track of library.tracks) {
      if (track.path) {
        const parts = track.path.split("/");
        if (parts.length >= 3) add(this.bySuffix3, pathKey(parts.slice(-3)), track.id);
        if (parts.length >= 2) add(this.bySuffix2, pathKey(parts.slice(-2)), track.id);
      }
      const artists = new Set([track.artist, track.album_artist].filter((name): name is string => !!name));
      for (const artist of artists) add(this.bySong, songKey(artist, track.title), track);
      add(this.byTitle, normalTitle(track.title), track);
    }
  }

  /** The best of several copies: same album first, then closest length. */
  private pick(candidates: LibraryTrack[], entry: Entry): LibraryTrack | undefined {
    if (candidates.length <= 1) return candidates[0];
    const album = entry.album ? normalTitle(entry.album) : "";
    const score = (track: LibraryTrack) =>
      (album && track.album && normalTitle(track.album) === album ? 0 : 1000) +
      (entry.duration_s && track.duration_s ? Math.abs(entry.duration_s - track.duration_s) : 500);
    return [...candidates].sort((a, b) => score(a) - score(b))[0];
  }

  /** The SynAmp track for one old entry, and how it was found. */
  find(entry: Entry): { id: string; how: "path" | "song" | "title" } | undefined {
    if (entry.path) {
      const parts = entry.path.split("/").filter(Boolean);
      const three = parts.length >= 3 ? this.bySuffix3.get(pathKey(parts.slice(-3))) : undefined;
      if (three?.length === 1) return { id: three[0]!, how: "path" };
      const two = parts.length >= 2 ? this.bySuffix2.get(pathKey(parts.slice(-2))) : undefined;
      if (two?.length === 1) return { id: two[0]!, how: "path" };
    }
    // No usable tags? Guess them from the path: Artist/Album/01 Title.ext
    const parts = entry.path?.split("/").filter(Boolean) ?? [];
    const title = entry.title ?? (parts.length ? titleFromFile(parts[parts.length - 1]!) : undefined);
    const artist = entry.artist ?? (parts.length >= 3 ? parts[parts.length - 3] : undefined);
    const album = entry.album ?? (parts.length >= 2 ? parts[parts.length - 2]!.replace(/\s*[([]\d{4}[)\]]\s*$/, "") : undefined);
    if (!title) return undefined;
    const clues = { ...entry, title, ...(album ? { album } : {}) };
    if (artist) {
      const found = this.pick(this.bySong.get(songKey(artist, title)) ?? [], clues);
      if (found) return { id: found.id, how: "song" };
    }
    if (album) {
      const sameAlbum = (this.byTitle.get(normalTitle(title)) ?? []).filter((track) => track.album && normalTitle(track.album) === normalTitle(album));
      const found = this.pick(sameAlbum, clues);
      if (found) return { id: found.id, how: "title" };
    }
    return undefined;
  }
}

export type MatchedPlaylist = {
  key: string; name: string; parent?: string; folder?: boolean; smart?: boolean;
  total: number; tracks: Array<{ id: string; title: string; artist?: string }>;
  /** Entries not found, as "Artist – Title" (or the file name), in playlist order. */
  missing: string[];
};

export function matchPlaylists(parsed: ParsedPlaylist[], library: Library): MatchedPlaylist[] {
  const matcher = new Matcher(library);
  const byId = new Map(library.tracks.map((track) => [track.id, track]));
  return parsed.map((playlist) => {
    const tracks: MatchedPlaylist["tracks"] = [];
    const missing: string[] = [];
    for (const entry of playlist.entries) {
      const found = matcher.find(entry);
      const track = found ? byId.get(found.id) : undefined;
      if (track) tracks.push({ id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}) });
      else missing.push(entry.title ? [entry.artist, entry.title].filter(Boolean).join(" – ") : posix.basename(entry.path ?? "unknown"));
    }
    return {
      key: playlist.key, name: playlist.name, total: playlist.entries.length, tracks, missing,
      ...(playlist.parent ? { parent: playlist.parent } : {}),
      ...(playlist.folder ? { folder: true } : {}),
      ...(playlist.smart ? { smart: true } : {}),
    };
  });
}
