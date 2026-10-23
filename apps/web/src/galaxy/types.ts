/*
 * Shared shapes for the Galaxy explorer: the brain's whole-library map, the
 * runtime nodes the canvas engine animates, and the user's view choices.
 */
import type { TrackSummary } from "../LibraryParts";

export type GalaxySignals = { bpm?: number; valence?: number; arousal?: number };
export type GalaxyMapNode = {
  key: string; name: string; tracks: number; albums: number;
  genres: string[]; decade?: number; year_first?: number; year_last?: number; letter: string;
  signals?: GalaxySignals; guest?: boolean; appearances?: number;
};
export type GalaxyMapEdge = { a: string; b: string; tracks: number };
export type GalaxyMap = { version: string; total_tracks: number; artists: GalaxyMapNode[]; edges: GalaxyMapEdge[] };

export type GalaxyView = "cluster" | "bubbles" | "tiles" | "web";
export type GalaxyGrouping = "genre" | "decade" | "letter";
export type GalaxyColorBy = "group" | "decade" | "mood" | "energy";
export type ThemeId = "nebula" | "aurora" | "spectrum" | "embers" | "ink";

export const VIEW_LABELS: Record<GalaxyView, string> = { cluster: "Galaxy", bubbles: "Bubbles", tiles: "Tiles", web: "Web" };
export const GROUPING_LABELS: Record<GalaxyGrouping, string> = { genre: "Genre", decade: "Decade", letter: "A–Z" };
export const COLORBY_LABELS: Record<GalaxyColorBy, string> = { group: "Group", decade: "Era", mood: "Mood", energy: "Energy" };

/** A node as the engine animates it: layout state added to the brain's facts. */
export type EngineNode = GalaxyMapNode & {
  x: number; y: number; r: number;
  fx: number | null; fy: number | null;      // d3-force pins (also the "left here" marker)
  vx: number; vy: number;
  sx: number; sy: number; sr: number;        // tween start
  tx: number; ty: number; tr: number;        // tween target
  x0: number; y0: number; x1: number; y1: number;      // tile rect (tiles view)
  tx0: number; ty0: number; tx1: number; ty1: number;  // tile rect target
  pinned: boolean;                           // keeps a hand-placed node out of re-formations
  group: string; color: string; degree: number; dim: boolean;
};

export type EngineGroup = {
  id: string; label: string; tracks: number; count: number; color: string; nodes: EngineNode[];
  x: number; y: number; r: number;            // cluster/bubbles centre + radius
  x0: number; y0: number; x1: number; y1: number; // tiles rect
  sx: number; sy: number; sr: number; tx: number; ty: number; tr: number;
  sx0: number; sy0: number; sx1: number; sy1: number; tx0: number; ty0: number; tx1: number; ty1: number;
};

export type EngineEdge = { a: EngineNode; b: EngineNode; tracks: number };

export type GalaxyAlbum = { key: string; title: string; artist: string; year?: number; tracks: number; total_tracks: number; matching_tracks: TrackSummary[] };
export type GalaxyArtistDetails = { artist: { key: string; name: string; tracks: number; albums: number; parsed_credit: boolean; raw_credits: string[] }; albums: GalaxyAlbum[]; loose_tracks: TrackSummary[]; truncated: boolean };
