import { randomBytes } from "node:crypto";
import { BrowseError } from "./browse.ts";
import { selectExplorerSongs } from "./explore.ts";
import type { ExploreOptions } from "./explore.ts";
import type { Library } from "../query/evaluate.ts";
import type { PlaylistNode, PlaylistStore, TrackRef } from "../playlists.ts";

export const EXPLORER_SELECTION_MAX_TRACKS = 100_000;
const TTL = 10 * 60_000;
const MAX_PREVIEWS = 32;
type Preview = {
  created_at: number; expires_at: number; library_version: string; tracks: TrackRef[];
  result?: { name: string; playlist: PlaylistNode };
};

/** Short-lived server-owned selection receipts. A create request cannot supply
 * its own track IDs, and never reruns a filter after the owner reviewed a count. */
export class ExplorerSelections {
  private previews = new Map<string, Preview>();
  private now: () => number;
  constructor(options: { now?: () => number } = {}) { this.now = options.now ?? Date.now; }

  private prune(now: number) {
    for (const [id, preview] of this.previews) if (now >= preview.expires_at) this.previews.delete(id);
  }

  preview(library: Library, options: ExploreOptions = {}, favourites?: ReadonlySet<string>) {
    const seen = new Set<string>();
    const rows = selectExplorerSongs(library, options, favourites).filter(row => {
      if (seen.has(row.key)) return false;
      seen.add(row.key); return true;
    });
    if (rows.length > EXPLORER_SELECTION_MAX_TRACKS) throw new BrowseError("That’s more than 100,000 songs — too many for one playlist. Narrow the filters a little.", 413);
    const now = this.now(); this.prune(now);
    while (this.previews.size >= MAX_PREVIEWS) this.previews.delete(this.previews.keys().next().value!);
    const selection_id = randomBytes(24).toString("base64url");
    const preview: Preview = { created_at: now, expires_at: now + TTL, library_version: library.version,
      tracks: rows.map(row => ({ id: row.key, title: row.title, ...(row.artist !== undefined ? { artist: row.artist } : {}) })) };
    this.previews.set(selection_id, preview);
    return { selection_id, track_count: rows.length, created_at: preview.created_at, expires_at: preview.expires_at, library_version: preview.library_version,
      sample: rows.slice(0, 8).map(row => ({ id: row.key, title: row.title, ...(row.artist !== undefined ? { artist: row.artist } : {}), ...(row.album !== undefined ? { album: row.album } : {}) })),
      max_tracks: EXPLORER_SELECTION_MAX_TRACKS };
  }

  create(library: Library, playlists: PlaylistStore, selectionId: unknown, nameInput: unknown): { playlist: PlaylistNode; track_count: number; duplicate: boolean } {
    const now = this.now(); this.prune(now);
    const preview = typeof selectionId === "string" ? this.previews.get(selectionId) : undefined;
    if (!preview) throw new BrowseError("This count is too old (over 10 minutes, or SynAmp restarted). Press “Count again”, then make the playlist.", 410);
    const name = typeof nameInput === "string" ? nameInput.trim() : "";
    if (!name || name.length > 120) throw new BrowseError("Name must be 1–120 characters");
    if (preview.result) {
      if (name !== preview.result.name) throw new BrowseError("These songs are already in a playlist you just made under another name.", 409);
      return { playlist: structuredClone(preview.result.playlist), track_count: preview.tracks.length, duplicate: true };
    }
    if (!preview.tracks.length) throw new BrowseError("No songs match these filters, so there’s nothing to put in a playlist.");
    const present = new Set(library.tracks.map(track => track.id));
    const missing = preview.tracks.filter(track => !present.has(track.id));
    if (missing.length) throw new BrowseError(`${missing.length} of these songs moved or left the library since the count. Nothing was saved — press “Count again”.`, 409);
    // This synchronous boundary validates every ID and persists one complete
    // playlist before remembering success. Failed storage remains retryable.
    const playlist = playlists.createSnapshot(name, preview.tracks);
    preview.result = { name, playlist };
    return { playlist: structuredClone(playlist), track_count: preview.tracks.length, duplicate: false };
  }
}
