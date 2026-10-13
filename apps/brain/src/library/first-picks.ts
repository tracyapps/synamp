/**
 * "Listen to these first": songs you pick in the Library jump to the front of
 * the analyzer's line, so a first playlist can come from part of your library
 * without waiting days for all of it to be listened to.
 *
 * The brain keeps the picks as library-relative paths (the analyzer on the Mac
 * knows where the library is). Progress is read from the library list the
 * analyzer sends: a pick counts as listened to once the steps that playlists
 * lean on are done for it.
 */

import type { Library, LibraryTrack } from "../query/evaluate.ts";

/** How many songs can be picked at once: plenty for a first playlist, small enough to finish in an evening. */
export const MAX_FIRST_PICKS = 2000;

/**
 * The steps a pick needs before it counts as listened to: tempo, energy and
 * loudness always; singing and instruments too once this library has any (the
 * listening model is optional on the Mac, and without it nothing ever has it).
 */
export function neededStages(library: Library): string[] {
  return hasVoice(library) ? ["dsp_core", "voice"] : ["dsp_core"];
}

const voiceSeen = new WeakMap<LibraryTrack[], boolean>();
function hasVoice(library: Library): boolean {
  let seen = voiceSeen.get(library.tracks);
  if (seen === undefined) {
    seen = library.tracks.some((track) => stagesOf(track).includes("voice"));
    voiceSeen.set(library.tracks, seen);
  }
  return seen;
}

const byPathCache = new WeakMap<LibraryTrack[], Map<string, LibraryTrack>>();
function byPath(library: Library): Map<string, LibraryTrack> {
  let map = byPathCache.get(library.tracks);
  if (!map) {
    map = new Map(library.tracks.filter((track) => track.path).map((track) => [track.path!, track]));
    byPathCache.set(library.tracks, map);
  }
  return map;
}

function stagesOf(track: LibraryTrack): string[] {
  const stages = (track as { stages_done?: unknown }).stages_done;
  return Array.isArray(stages) ? stages.filter((stage): stage is string => typeof stage === "string") : [];
}

/** The file paths of these songs, in order, once each; songs without a known file are left out. */
export function pathsForIds(library: Library, ids: readonly string[]): string[] {
  const byId = new Map(library.tracks.map((track) => [track.id, track]));
  const paths = new Set<string>();
  for (const id of ids) {
    const path = byId.get(id)?.path;
    if (path) paths.add(path);
  }
  return [...paths];
}

export type FirstProgress = {
  /** Songs picked. */
  count: number;
  /** Picked songs ready for playlists. */
  listened: number;
  /** Picked songs the library list doesn't show any more (moved or removed since). */
  gone: number;
  /** Track ids of the picks that are ready, for "play them" (at most 200). */
  ready_ids: string[];
};

export function firstProgress(library: Library, paths: readonly string[]): FirstProgress {
  const map = byPath(library);
  const needed = neededStages(library);
  let listened = 0;
  let gone = 0;
  const ready: string[] = [];
  for (const path of paths) {
    const track = map.get(path);
    if (!track) { gone++; continue; }
    const done = stagesOf(track);
    if (needed.every((stage) => done.includes(stage))) {
      listened++;
      if (ready.length < 200) ready.push(track.id);
    }
  }
  return { count: paths.length, listened, gone, ready_ids: ready };
}
