import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { validatePlan } from "./query/plan.ts";
import type { QueryPlan } from "./query/plan.ts";

export type TrackRef = { id: string; title: string; artist?: string };
type BaseNode = { id: string; name: string; parentId: string | null };
export type PlaylistNode =
  | (BaseNode & { type: "folder" })
  | (BaseNode & { type: "playlist"; tracks: TrackRef[] })
  | (BaseNode & { type: "rollup"; sourceId: string; mode: "merge" | "shuffle" | "interleave" })
  /** A saved query: the plan is stored, never the track list, so membership stays live. */
  | (BaseNode & { type: "smart"; plan: QueryPlan; planHash: string; prompt?: string });
export type CreateNode =
  | { type: "folder" | "playlist"; name: string; parentId?: string | null }
  | { type: "rollup"; name: string; parentId?: string | null; sourceId: string; mode: "merge" | "shuffle" | "interleave" }
  | { type: "smart"; name: string; parentId?: string | null; plan: unknown; prompt?: string };

/** Resolves a smart playlist's plan to its current strict-tier tracks. */
export type SmartResolver = (plan: QueryPlan, planHash: string, playlistId: string) => TrackRef[];

export class PlaylistError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export class PlaylistStore {
  private nodes: PlaylistNode[];
  private path: string;
  private resolveSmart?: SmartResolver;

  constructor(path: string, options: { resolveSmart?: SmartResolver } = {}) {
    this.path = path;
    this.resolveSmart = options.resolveSmart;
    try {
      this.nodes = JSON.parse(readFileSync(path, "utf8")) as PlaylistNode[];
      if (!Array.isArray(this.nodes)) throw new Error("Invalid playlist data");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.nodes = [];
    }
  }

  list(): PlaylistNode[] { return structuredClone(this.nodes); }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(this.nodes, null, 2) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  private get(id: string): PlaylistNode {
    const node = this.nodes.find((item) => item.id === id);
    if (!node) throw new PlaylistError("Playlist node not found", 404);
    return node;
  }

  create(input: CreateNode): PlaylistNode {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 120) throw new PlaylistError("Name must be 1–120 characters");
    const parentId = input.parentId ?? null;
    if (parentId !== null && typeof parentId !== "string") throw new PlaylistError("Invalid parent ID");
    if (parentId && this.get(parentId).type !== "folder") {
      throw new PlaylistError("Parent must be a folder");
    }
    let node: PlaylistNode;
    const base = { id: randomUUID(), name, parentId };
    if (input.type === "folder") node = { ...base, type: "folder" };
    else if (input.type === "playlist") node = { ...base, type: "playlist", tracks: [] };
    else if (input.type === "rollup") {
      if (typeof input.sourceId !== "string") throw new PlaylistError("Invalid source ID");
      if (!(["merge", "shuffle", "interleave"] as string[]).includes(input.mode)) {
        throw new PlaylistError("Invalid roll-up mode");
      }
      this.get(input.sourceId);
      node = { ...base, type: "rollup", sourceId: input.sourceId, mode: input.mode };
      // A roll-up placed in its own source subtree would recurse forever.
      this.nodes.push(node);
      try { this.resolve(node.id); } catch (error) { this.nodes.pop(); throw error; }
      this.nodes.pop();
    } else if (input.type === "smart") {
      const checked = validatePlan(input.plan);
      if (!checked.ok) {
        const first = checked.errors[0];
        throw new PlaylistError(first ? `Invalid plan at ${first.path}: ${first.message}` : "Invalid plan");
      }
      const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 500) : "";
      node = { ...base, type: "smart", plan: checked.plan, planHash: checked.hash, ...(prompt ? { prompt } : {}) };
    } else throw new PlaylistError("Invalid node type");
    this.nodes.push(node);
    this.save();
    return structuredClone(node);
  }

  addTrack(id: string, input: TrackRef): PlaylistNode {
    const node = this.get(id);
    if (node.type !== "playlist") throw new PlaylistError("Tracks can only be added to playlists");
    const trackId = typeof input.id === "string" ? input.id.trim() : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!trackId || !title || trackId.length > 256 || title.length > 256) {
      throw new PlaylistError("Track ID and title are required (max 256 characters)");
    }
    if (input.artist !== undefined && typeof input.artist !== "string") {
      throw new PlaylistError("Invalid artist");
    }
    const artist = input.artist?.trim();
    node.tracks.push({ id: trackId, title, ...(artist ? { artist: artist.slice(0, 256) } : {}) });
    this.save();
    return structuredClone(node);
  }

  removeTrack(id: string, index: number): PlaylistNode {
    const node = this.get(id);
    if (node.type !== "playlist") throw new PlaylistError("Tracks can only be removed from playlists");
    if (!Number.isInteger(index) || index < 0 || index >= node.tracks.length) {
      throw new PlaylistError("Track index not found", 404);
    }
    node.tracks.splice(index, 1);
    this.save();
    return structuredClone(node);
  }

  delete(id: string): void {
    const node = this.get(id);
    if (this.nodes.some((item) => item.parentId === id)) {
      throw new PlaylistError("Empty this folder before deleting it");
    }
    if (this.nodes.some((item) => item.type === "rollup" && item.sourceId === id)) {
      throw new PlaylistError("Another roll-up uses this node");
    }
    this.nodes = this.nodes.filter((item) => item.id !== node.id);
    this.save();
  }

  resolve(id: string, random: () => number = Math.random): TrackRef[] {
    const visit = (nodeId: string, ancestors: Set<string>): TrackRef[] => {
      if (ancestors.has(nodeId)) throw new PlaylistError("Playlist cycle detected");
      const node = this.get(nodeId);
      const next = new Set(ancestors).add(nodeId);
      if (node.type === "playlist") return [...node.tracks];
      if (node.type === "smart") {
        if (!this.resolveSmart) throw new PlaylistError("Smart playlists need a library source", 503);
        return this.resolveSmart(node.plan, node.planHash, node.id);
      }
      const source = node.type === "rollup" ? this.get(node.sourceId) : node;
      const children = source.type === "folder"
        ? this.nodes.filter((item) => item.parentId === source.id)
        : [source];
      // A folder evaluates each child independently so interleave can alternate
      // between its playlists instead of flattening the folder first.
      const groups = children.map((child) => visit(child.id, next));
      if (node.type === "rollup" && node.mode === "interleave") {
        const tracks: TrackRef[] = [];
        const count = Math.max(0, ...groups.map((group) => group.length));
        for (let index = 0; index < count; index++) {
          for (const group of groups) {
            const track = group[index];
            if (track) tracks.push(track);
          }
        }
        return tracks;
      }
      const tracks = groups.flat();
      if (node.type === "rollup" && node.mode === "shuffle") {
        for (let index = tracks.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [tracks[index], tracks[other]] = [tracks[other]!, tracks[index]!];
        }
      }
      return tracks;
    };
    return visit(id, new Set());
  }
}
