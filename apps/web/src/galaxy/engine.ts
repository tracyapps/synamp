/*
 * The Galaxy canvas engine. It owns everything that moves: the d3 force
 * simulations (cluster, web), the layout tweens (bubbles, tiles), the camera,
 * pointer gestures, and the paint loop. React tells it what to show through
 * the setters and learns user actions back through the callbacks.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { Force, Simulation, SimulationLinkDatum } from "d3-force";
import { quadtree } from "d3-quadtree";
import type { Quadtree } from "d3-quadtree";
import { clusterCenters, groupOf, groupSort, packPositions, tilePositions, WORLD } from "./layouts";
import { PALETTES, rampColor, shade, withAlpha, blend } from "./palettes";
import type { Palette } from "./palettes";
import type { EngineGroup, EngineNode, GalaxyColorBy, GalaxyGrouping, GalaxyMap, GalaxyView, ThemeId } from "./types";

type Node = EngineNode & { br: number; culled: boolean };
type Edge = { a: Node; b: Node; tracks: number; color: string };
type Link = SimulationLinkDatum<Node> & { tracks: number };
export type EngineCallbacks = {
  select: (key: string | null) => void;
  status: (text: string) => void;
};
type Camera = { x: number; y: number; k: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const trim = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const FONT = '"Space Grotesk", system-ui, sans-serif';

/** Same folding the brain's search uses, so "Björk" and "bjork" agree. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const WEB_NODE_CAP = 1600;

export class GalaxyEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;
  private observer: ResizeObserver;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  private nodes: Node[] = [];
  private byKey = new Map<string, Node>();
  private edges: Edge[] = [];
  private groups: EngineGroup[] = [];
  private groupById = new Map<string, EngineGroup>();
  private sim: Simulation<Node, undefined> | null = null;
  private simLinks: Link[] = [];

  private view: GalaxyView = "cluster";
  private grouping: GalaxyGrouping = "genre";
  private theme: ThemeId = "nebula";
  private colorBy: GalaxyColorBy = "group";
  private palette: Palette = PALETTES.nebula;
  private decades: [number, number] = [1970, 2020];

  private camera: Camera = { x: 0, y: 0, k: 1 };
  private cameraTween: { from: Camera; to: Camera; start: number; duration: number } | null = null;
  private layoutTween: { start: number; duration: number } | null = null;
  private hoverKey: string | null = null;
  private selectedKey: string | null = null;
  private searchWords: string[] = [];

  private hits: Quadtree<Node> | null = null;
  private hitsDirty = true;
  private frame = 0;
  /** Label rectangles already painted this frame, so crowded areas drop labels instead of stacking them. */
  private labels: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private size = { width: 0, height: 0 };
  private stars: { x: number; y: number; r: number; a: number }[] = [];
  private nebula: HTMLCanvasElement | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { node: Node | null; moved: boolean; camera: Camera; lastScreen: { x: number; y: number }; pinch: { mid: { x: number; y: number }; distance: number } | null } | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot start the Galaxy canvas.");
    this.ctx = context;
    this.callbacks = callbacks;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("dblclick", this.onDoubleClick);
    this.resize();
  }

  destroy() {
    this.sim?.stop();
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
  }

  // --- Data and settings --------------------------------------------------

  setData(map: GalaxyMap) {
    const maxTracks = Math.max(1, ...map.artists.map(node => node.tracks));
    const maxAppear = Math.max(1, ...map.artists.map(node => node.appearances ?? 0));
    this.nodes = map.artists.map(node => {
      const br = node.guest ? 3.5 + 10 * Math.sqrt((node.appearances ?? 1) / maxAppear) : 4 + 40 * Math.sqrt(node.tracks / maxTracks);
      return { ...node, x: 0, y: 0, r: br, br, culled: false, fx: null, fy: null, vx: 0, vy: 0,
        sx: 0, sy: 0, sr: br, tx: 0, ty: 0, tr: br, x0: 0, y0: 0, x1: 0, y1: 0, tx0: 0, ty0: 0, tx1: 0, ty1: 0,
        pinned: false, group: "", color: "#8b93aa", degree: 0, dim: false };
    });
    this.byKey = new Map(this.nodes.map(node => [node.key, node]));
    const degree = new Map<string, number>();
    this.edges = [];
    for (const edge of map.edges) {
      const a = this.byKey.get(edge.a); const b = this.byKey.get(edge.b);
      if (!a || !b) continue;
      this.edges.push({ a, b, tracks: edge.tracks, color: "#8b93aa" });
      degree.set(a.key, (degree.get(a.key) ?? 0) + edge.tracks);
      degree.set(b.key, (degree.get(b.key) ?? 0) + edge.tracks);
    }
    for (const node of this.nodes) node.degree = degree.get(node.key) ?? 0;
    const eras = this.nodes.map(node => node.decade).filter((value): value is number => value !== undefined);
    this.decades = eras.length ? [Math.min(...eras), Math.max(...eras)] : [1950, 2020];
    this.makeStars();
    this.makeNebula();
    this.relayout(false);
    this.fit(false);
    this.applySearch();
  }

  setView(view: GalaxyView) {
    if (view === this.view || !this.nodes.length) return;
    this.view = view;
    this.relayout(true);
  }

  setGrouping(grouping: GalaxyGrouping) {
    if (grouping === this.grouping || !this.nodes.length) return;
    this.grouping = grouping;
    this.relayout(true);
  }

  setTheme(theme: ThemeId) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.palette = PALETTES[theme];
    this.makeNebula();
    this.recolour();
    this.requestRender();
  }

  setColorBy(colorBy: GalaxyColorBy) {
    if (colorBy === this.colorBy) return;
    this.colorBy = colorBy;
    this.recolour();
    this.requestRender();
  }

  setSelected(key: string | null) {
    this.selectedKey = key;
    this.requestRender();
  }

  setSearch(query: string) {
    this.searchWords = normalizeSearch(query).split(" ").filter(Boolean);
    this.applySearch();
    this.requestRender();
  }

  /** Jump camera + selection onto one artist (search Enter, random, card links). */
  focus(key: string) {
    const node = this.byKey.get(key);
    if (!node) return;
    this.selectedKey = key;
    if (node.guest && this.view !== "web") this.setView("web");
    if (this.isActive(node)) this.flyToNode(node);
    this.callbacks.select(key);
  }

  randomActive(): Node | null {
    const pool = this.activeNodes();
    return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null;
  }

  /** Let go of every hand-placed artist and settle into the current formation. */
  reflow() {
    for (const node of this.nodes) { node.pinned = false; node.fx = null; node.fy = null; }
    if (this.sim) { this.sim.alpha(0.8).restart(); this.requestRender(); }
    else this.relayout(true);
    this.callbacks.status("Re-formed the view. Dragged artists returned to their groups.");
  }

  getStats() {
    const active = this.activeNodes();
    const connected = this.nodes.filter(node => node.degree > 0).length;
    return { artists: this.nodes.length, visible: active.length, groups: this.groups.length, edges: this.edges.length, connected };
  }

  // --- Layout -------------------------------------------------------------

  private isActive(node: Node): boolean {
    if (this.view === "web") return node.degree > 0 && !node.culled;
    return !node.guest;
  }

  private activeNodes(): Node[] {
    if (this.view !== "web") return this.nodes.filter(node => !node.guest);
    const connected = this.nodes.filter(node => node.degree > 0);
    if (connected.length <= WEB_NODE_CAP) { for (const node of this.nodes) node.culled = false; return connected; }
    const keep = new Set([...connected].sort((a, b) => b.degree - a.degree || b.tracks - a.tracks).slice(0, WEB_NODE_CAP));
    for (const node of this.nodes) node.culled = !keep.has(node);
    return connected.filter(node => keep.has(node));
  }

  private rebuildGroups(active: Node[]) {
    const previous = this.groupById;
    const buckets = new Map<string, Node[]>();
    for (const node of active) {
      node.group = groupOf(node, this.grouping);
      const bucket = buckets.get(node.group) ?? [];
      bucket.push(node); buckets.set(node.group, bucket);
    }
    this.groups = [...buckets.entries()].map(([id, members]) => {
      const old = previous.get(id);
      const cx = old?.x ?? WORLD.width / 2; const cy = old?.y ?? WORLD.height / 2; const cr = old?.r ?? 180;
      const x0 = old?.x0 ?? cx - cr; const y0 = old?.y0 ?? cy - cr; const x1 = old?.x1 ?? cx + cr; const y1 = old?.y1 ?? cy + cr;
      return { id, label: id, tracks: members.reduce((sum, node) => sum + node.tracks, 0), count: members.length, color: "#ffffff", nodes: members,
        x: cx, y: cy, r: cr, x0, y0, x1, y1, sx: cx, sy: cy, sr: cr, tx: cx, ty: cy, tr: cr,
        sx0: x0, sy0: y0, sx1: x1, sy1: y1, tx0: x0, ty0: y0, tx1: x1, ty1: y1 };
    }).sort(groupSort(this.grouping));
    this.groupById = new Map(this.groups.map(group => [group.id, group]));
  }

  /** Recompute groups and target positions, then animate into the new formation. */
  private relayout(animate: boolean) {
    if (!this.nodes.length) return;
    const active = this.activeNodes();
    this.rebuildGroups(active);
    this.sim?.stop();
    this.sim = null;

    if (this.view === "cluster") {
      clusterCenters(this.groups, this.grouping);
      active.forEach((node, index) => {
        const group = this.groupById.get(node.group)!;
        const spin = ((index * 2654435761) % 997) / 997;
        const reach = group.tr * (0.2 + ((index * 40503) % 997) / 997 * 0.62);
        node.tx = group.tx + Math.cos(spin * Math.PI * 2) * reach;
        node.ty = group.ty + Math.sin(spin * Math.PI * 2) * reach;
        node.tr = node.br;
        if (!Number.isFinite(node.x) || (node.x === 0 && node.y === 0)) { node.x = node.tx; node.y = node.ty; }
      });
      const settle = this.reduced && active.length <= 2500 ? 60 : 0;
      this.sim = forceSimulation(active)
        .force("x", forceX<Node>(node => this.groupById.get(node.group)?.tx ?? 0).strength(node => node.pinned ? 0 : 0.12))
        .force("y", forceY<Node>(node => this.groupById.get(node.group)?.ty ?? 0).strength(node => node.pinned ? 0 : 0.12))
        .force("collide", forceCollide<Node>(node => node.tr + 2.5).iterations(active.length > 2500 ? 1 : 2))
        // Many-body is the expensive force; big galaxies cluster fine on pull + collide alone.
        .force("charge", active.length <= 2500 ? forceManyBody<Node>().strength(node => -(4 + node.br * 0.4)) : null)
        .alphaDecay(this.reduced ? 0.09 : 0.024)
        .velocityDecay(0.32)
        .alpha(0.9)
        .on("tick", () => { this.hitsDirty = true; this.requestRender(); });
      for (const node of active) if (node.pinned) { node.fx ??= node.x; node.fy ??= node.y; }
      // The formation animates in from the scatter; reduced motion jumps straight to settled.
      if (settle) { this.sim.stop(); this.sim.tick(settle); this.sim.restart(); }
    } else if (this.view === "web") {
      this.simLinks = this.edges.filter(edge => !edge.a.culled && !edge.b.culled && edge.a.degree > 0 && edge.b.degree > 0)
        .map(edge => ({ source: edge.a, target: edge.b, tracks: edge.tracks }));
      active.forEach((node, index) => {
        node.tr = node.br;
        if (!Number.isFinite(node.x) || (node.x === 0 && node.y === 0)) {
          const reach = 26 * Math.sqrt(index + 1);
          node.x = WORLD.width / 2 + Math.cos(index * 2.399963) * reach;
          node.y = WORLD.height / 2 + Math.sin(index * 2.399963) * reach;
        }
      });
      this.sim = forceSimulation(active)
        .force("link", forceLink<Node, Link>(this.simLinks).id(node => node.key)
          .distance(link => 74 + 52 / (1 + link.tracks))
          .strength(link => Math.min(0.8, 0.18 + link.tracks * 0.14)) as Force<Node, undefined>)
        .force("collide", forceCollide<Node>(node => node.tr + 2).iterations(1))
        .force("charge", forceManyBody<Node>().strength(-80))
        .force("x", forceX<Node>(WORLD.width / 2).strength(0.012))
        .force("y", forceY<Node>(WORLD.height / 2).strength(0.012))
        .alphaDecay(this.reduced ? 0.09 : 0.026)
        .alpha(0.9)
        .on("tick", () => { this.hitsDirty = true; this.requestRender(); });
      if (this.reduced) { this.sim.stop(); this.sim.tick(80); this.sim.restart(); }
    } else {
      if (this.view === "bubbles") packPositions(this.groups);
      else tilePositions(this.groups);
      if (animate) {
        for (const node of active) { node.sx = node.x; node.sy = node.y; node.sr = node.r; }
        for (const group of this.groups) {
          group.sx = group.x; group.sy = group.y; group.sr = group.r;
          group.sx0 = group.x0; group.sy0 = group.y0; group.sx1 = group.x1; group.sy1 = group.y1;
        }
        this.layoutTween = { start: performance.now(), duration: this.reduced ? 1 : 760 };
        this.callbacks.status(`Re-formed into ${this.groups.length} groups.`);
      } else {
        for (const node of active) {
          node.x = node.tx; node.y = node.ty; node.r = node.tr;
          node.x0 = node.tx0; node.y0 = node.ty0; node.x1 = node.tx1; node.y1 = node.ty1;
        }
        for (const group of this.groups) {
          group.x = group.tx; group.y = group.ty; group.r = group.tr;
          group.x0 = group.tx0; group.y0 = group.ty0; group.x1 = group.tx1; group.y1 = group.ty1;
        }
        this.layoutTween = null;
      }
    }
    this.recolour();
    this.hitsDirty = true;
    this.requestRender();
  }

  private recolour() {
    this.groups.forEach((group, index) => {
      group.color = this.palette.groups[index % this.palette.groups.length]!;
    });
    const span = this.decades[1] - this.decades[0] || 1;
    for (const node of this.nodes) {
      if (this.colorBy === "group") node.color = this.groupById.get(node.group)?.color ?? "#8b93aa";
      else if (this.colorBy === "decade") node.color = node.decade === undefined ? "#6b7186" : rampColor(this.palette.ramp, (node.decade - this.decades[0]) / span);
      else if (this.colorBy === "mood") node.color = node.signals?.valence === undefined ? "#6b7186" : rampColor(this.palette.mood, node.signals.valence);
      else node.color = node.signals?.arousal === undefined ? "#6b7186" : rampColor(this.palette.energy, node.signals.arousal);
    }
    for (const edge of this.edges) edge.color = blend(edge.a.color, edge.b.color);
  }

  private applySearch() {
    for (const node of this.nodes) {
      const haystack = normalizeSearch([node.name, ...node.genres].join(" "));
      node.dim = this.searchWords.length > 0 && !this.searchWords.every(word => haystack.includes(word));
    }
  }

  // --- Camera -------------------------------------------------------------

  private resize() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const width = this.canvas.clientWidth || 900; const height = this.canvas.clientHeight || 600;
    this.size = { width, height };
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.requestRender();
  }

  private fit(animate = true) {
    const active = this.activeNodes();
    if (!active.length) return;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    const tiles = this.view === "tiles";
    for (const node of active) {
      const x = tiles ? node.x0 : node.x - node.r; const y = tiles ? node.y0 : node.y - node.r;
      const w = tiles ? node.x1 - node.x0 : node.r * 2; const h = tiles ? node.y1 - node.y0 : node.r * 2;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    if (!Number.isFinite(minX)) return;
    const pad = 64;
    const k = clamp(Math.min((this.size.width - pad * 2) / Math.max(1, maxX - minX), (this.size.height - pad * 2) / Math.max(1, maxY - minY)) * 0.96, 0.1, 2.4);
    this.flyTo({ k, x: (this.size.width - (maxX - minX) * k) / 2 - minX * k, y: (this.size.height - (maxY - minY) * k) / 2 - minY * k }, animate, 650);
  }

  private flyToNode(node: Node) {
    const k = clamp(150 / Math.max(6, node.r), 0.8, 7);
    this.flyTo({ k, x: this.size.width / 2 - node.x * k, y: this.size.height / 2 - node.y * k });
  }

  private flyToGroup(group: EngineGroup) {
    const tiles = this.view === "tiles";
    const box = tiles
      ? { x0: group.x0, y0: group.y0, x1: group.x1, y1: group.y1 }
      : { x0: group.x - group.r, y0: group.y - group.r, x1: group.x + group.r, y1: group.y + group.r };
    const pad = 44;
    const k = clamp(Math.min((this.size.width - pad * 2) / Math.max(1, box.x1 - box.x0), (this.size.height - pad * 2) / Math.max(1, box.y1 - box.y0)) * 0.94, 0.12, 6);
    this.flyTo({ k, x: (this.size.width - (box.x1 - box.x0) * k) / 2 - box.x0 * k, y: (this.size.height - (box.y1 - box.y0) * k) / 2 - box.y0 * k });
  }

  private flyTo(target: Camera, animate = true, duration = 700) {
    if (!animate || this.reduced) { this.camera = target; this.cameraTween = null; this.requestRender(); return; }
    this.cameraTween = { from: { ...this.camera }, to: target, start: performance.now(), duration };
    this.requestRender();
  }

  zoomBy(factor: number) {
    const anchor = { x: this.size.width / 2, y: this.size.height / 2 };
    const k = clamp(this.camera.k * factor, 0.1, 12);
    this.flyTo({ k, x: anchor.x - (anchor.x - this.camera.x) * k / this.camera.k, y: anchor.y - (anchor.y - this.camera.y) * k / this.camera.k }, true, 260);
  }

  panBy(dx: number, dy: number) {
    this.cameraTween = null;
    this.camera = { ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy };
    this.requestRender();
  }

  fitView() { this.fit(true); }

  private toWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - this.camera.x) / this.camera.k, y: (clientY - rect.top - this.camera.y) / this.camera.k };
  }

  /** Pointer position in canvas CSS pixels — the space gestures work in. */
  private pointerScreen(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // --- Pointer gestures ---------------------------------------------------

  // Two-finger scroll pans; pinch (ctrl+wheel) or ⌘/Ctrl+scroll zooms at the cursor.
  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1;
    if (event.ctrlKey || event.metaKey) {
      const dy = event.deltaY * unit;
      if (!dy || !Number.isFinite(dy)) return;
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = Math.exp(clamp(-dy * 0.008, -1, 1));
      const k = clamp(this.camera.k * factor, 0.1, 12);
      this.cameraTween = null;
      this.camera = { k, x: anchor.x - (anchor.x - this.camera.x) * k / this.camera.k, y: anchor.y - (anchor.y - this.camera.y) * k / this.camera.k };
    } else {
      this.cameraTween = null;
      this.camera = { ...this.camera, x: this.camera.x - event.deltaX * unit, y: this.camera.y - event.deltaY * unit };
    }
    this.requestRender();
  };

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.canvas.setPointerCapture(event.pointerId);
    const screen = this.pointerScreen(event);
    this.pointers.set(event.pointerId, screen);
    if (this.pointers.size >= 2) {
      // Pinch anchors are captured in screen space: distances stay meaningful
      // while the camera scale changes underneath.
      const [a, b] = [...this.pointers.values()];
      this.gesture = { node: null, moved: true, camera: { ...this.camera }, lastScreen: screen,
        pinch: { mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, distance: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)) } };
      return;
    }
    const world = this.toWorld(event.clientX, event.clientY);
    this.gesture = { node: this.pick(world.x, world.y), moved: false, camera: { ...this.camera }, lastScreen: screen, pinch: null };
  };

  private onPointerMove = (event: PointerEvent) => {
    const screen = this.pointerScreen(event);
    if (!this.pointers.has(event.pointerId)) {
      const world = this.toWorld(event.clientX, event.clientY);
      const hit = this.pick(world.x, world.y);
      const key = hit?.key ?? null;
      if (key !== this.hoverKey) { this.hoverKey = key; this.canvas.style.cursor = hit ? "pointer" : "grab"; this.requestRender(); }
      return;
    }
    this.pointers.set(event.pointerId, screen);
    const gesture = this.gesture;
    if (!gesture) return;

    if (gesture.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const distance = Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y));
      const base = gesture.pinch;
      const k = clamp(gesture.camera.k * distance / base.distance, 0.1, 12);
      this.cameraTween = null;
      // The world point under the starting midpoint stays under the moving midpoint.
      this.camera = {
        k,
        x: mid.x - (base.mid.x - gesture.camera.x) * k / gesture.camera.k,
        y: mid.y - (base.mid.y - gesture.camera.y) * k / gesture.camera.k,
      };
      this.requestRender(); return;
    }

    if (!gesture.node) {
      const dx = screen.x - gesture.lastScreen.x; const dy = screen.y - gesture.lastScreen.y;
      gesture.lastScreen = screen;
      if (dx || dy) gesture.moved = true;
      if (gesture.moved) {
        this.cameraTween = null;
        this.camera = { k: this.camera.k, x: this.camera.x + dx, y: this.camera.y + dy };
        this.requestRender();
      }
      return;
    }

    gesture.moved = true;
    const node = gesture.node;
    node.pinned = true;
    const world = this.toWorld(event.clientX, event.clientY);
    if (this.sim) {
      node.fx = world.x; node.fy = world.y;
      if (this.sim.alpha() < 0.3) this.sim.alpha(0.3).restart();
    } else {
      const dx = world.x - node.x; const dy = world.y - node.y;
      node.x = world.x; node.y = world.y;
      node.x0 += dx; node.x1 += dx; node.y0 += dy; node.y1 += dy;
    }
    this.hitsDirty = true;
    this.requestRender();
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    const gesture = this.gesture;
    const wasPinch = !!gesture?.pinch;
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (gesture && !wasPinch && !gesture.moved) {
      const world = this.toWorld(event.clientX, event.clientY);
      const hit = gesture.node ?? this.pick(world.x, world.y);
      if (hit) { this.selectedKey = hit.key; this.callbacks.select(hit.key); this.requestRender(); }
      else {
        const group = (this.view === "bubbles" || this.view === "tiles") ? this.pickGroup(world.x, world.y) : null;
        if (group) { this.flyToGroup(group); this.callbacks.status(`Zoomed into ${group.label}.`); }
      }
    }
    if (this.pointers.size === 0) this.gesture = null;
    else if (this.pointers.size === 1) {
      // One finger left after a pinch: keep panning from where that finger is.
      const [only] = [...this.pointers.values()];
      this.gesture = { node: null, moved: true, camera: { ...this.camera }, lastScreen: { x: only!.x, y: only!.y }, pinch: null };
    }
    this.hitsDirty = true;
    this.requestRender();
  };

  private onDoubleClick = (event: MouseEvent) => {
    const world = this.toWorld(event.clientX, event.clientY);
    const hit = this.pick(world.x, world.y);
    if (hit) { this.selectedKey = hit.key; this.flyToNode(hit); this.callbacks.select(hit.key); }
    else this.fit(true);
  };

  private ensureHits(): Quadtree<Node> {
    if (!this.hits || this.hitsDirty) {
      this.hits = quadtree<Node>().x(node => node.x).y(node => node.y)
        .addAll(this.activeNodes().filter(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
      this.hitsDirty = false;
    }
    return this.hits;
  }

  /** Every node whose centre lies within `radius` of the point (quadtree visit). */
  private collect(x: number, y: number, radius: number): Node[] {
    const found: Node[] = [];
    this.ensureHits().visit((node, x0, y0, x1, y1) => {
      if (!node.length) {
        const point = (node as { data?: Node }).data;
        if (point && Math.hypot(point.x - x, point.y - y) <= radius) found.push(point);
        return false;
      }
      return x0 > x + radius || x1 < x - radius || y0 > y + radius || y1 < y - radius;
    });
    return found;
  }

  private pick(x: number, y: number): Node | null {
    const slack = 8 / this.camera.k;
    let best: Node | null = null; let bestDistance = Infinity;
    for (const node of this.collect(x, y, 70 / this.camera.k + 60)) {
      const distance = Math.hypot(node.x - x, node.y - y);
      const hitRadius = this.view === "tiles" ? Math.max(node.r, 5) : Math.max(node.r, 6 / this.camera.k);
      if (distance <= hitRadius + slack && distance < bestDistance) { best = node; bestDistance = distance; }
    }
    return best;
  }

  private pickGroup(x: number, y: number): EngineGroup | null {
    for (const group of this.groups) {
      if (this.view === "tiles") { if (x >= group.x0 && x <= group.x1 && y >= group.y0 && y <= group.y1) return group; }
      else if (Math.hypot(group.x - x, group.y - y) <= group.r) return group;
    }
    return null;
  }

  // --- Painting -----------------------------------------------------------

  private makeStars() {
    let seed = 20261022;
    const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    this.stars = Array.from({ length: 1100 }, () => ({
      x: -900 + random() * (WORLD.width + 1800), y: -900 + random() * (WORLD.height + 1800),
      r: 0.4 + random() * 1.3, a: 0.14 + random() * 0.7,
    }));
  }

  private makeNebula() {
    let seed = 777;
    const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const scale = 0.5;
    const off = document.createElement("canvas");
    off.width = WORLD.width * scale; off.height = WORLD.height * scale;
    const context = off.getContext("2d");
    if (!context) { this.nebula = null; return; }
    for (const colour of this.palette.nebula) for (let draw = 0; draw < 2; draw++) {
      const x = random() * off.width; const y = random() * off.height; const radius = (260 + random() * 480) * scale;
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, withAlpha(colour, 0.15)); glow.addColorStop(1, withAlpha(colour, 0));
      context.fillStyle = glow; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    this.nebula = off;
  }

  private requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(performance.now()); });
  }

  private paint(now: number) {
    if (this.cameraTween) {
      const progress = clamp((now - this.cameraTween.start) / this.cameraTween.duration, 0, 1);
      const eased = easeInOut(progress);
      this.camera = {
        k: this.cameraTween.from.k + (this.cameraTween.to.k - this.cameraTween.from.k) * eased,
        x: this.cameraTween.from.x + (this.cameraTween.to.x - this.cameraTween.from.x) * eased,
        y: this.cameraTween.from.y + (this.cameraTween.to.y - this.cameraTween.from.y) * eased,
      };
      if (progress >= 1) this.cameraTween = null;
    }
    if (this.layoutTween) {
      const progress = clamp((now - this.layoutTween.start) / this.layoutTween.duration, 0, 1);
      const eased = easeOutCubic(progress);
      for (const node of this.activeNodes()) {
        if (node.pinned) continue;
        node.x = node.sx + (node.tx - node.sx) * eased;
        node.y = node.sy + (node.ty - node.sy) * eased;
        node.r = node.sr + (node.tr - node.sr) * eased;
        if (this.view === "tiles") {
          node.x0 = node.tx0 - (node.tx - node.x); node.x1 = node.tx1 - (node.tx - node.x);
          node.y0 = node.ty0 - (node.ty - node.y); node.y1 = node.ty1 - (node.ty - node.y);
        }
      }
      for (const group of this.groups) {
        group.x = group.sx + (group.tx - group.sx) * eased; group.y = group.sy + (group.ty - group.sy) * eased;
        group.r = group.sr + (group.tr - group.sr) * eased;
        group.x0 = group.sx0 + (group.tx0 - group.sx0) * eased; group.y0 = group.sy0 + (group.ty0 - group.sy0) * eased;
        group.x1 = group.sx1 + (group.tx1 - group.sx1) * eased; group.y1 = group.sy1 + (group.ty1 - group.sy1) * eased;
      }
      if (progress >= 1) this.layoutTween = null;
      this.hitsDirty = true;
    }
    if (this.cameraTween || this.layoutTween || this.sim) this.requestRender();

    const ctx = this.ctx; const camera = this.camera;
    const active = this.activeNodes();
    ctx.fillStyle = this.palette.space;
    ctx.fillRect(0, 0, this.size.width, this.size.height);
    ctx.save();
    ctx.translate(camera.x, camera.y); ctx.scale(camera.k, camera.k);
    if (this.nebula) ctx.drawImage(this.nebula, 0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = this.palette.star;
    for (const star of this.stars) {
      const sx = star.x * camera.k + camera.x; const sy = star.y * camera.k + camera.y;
      if (sx < -6 || sx > this.size.width + 6 || sy < -6 || sy > this.size.height + 6) continue;
      ctx.globalAlpha = star.a;
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r / Math.max(0.4, camera.k * 0.7), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.view === "bubbles") this.drawBubbles(ctx, camera);
    else if (this.view === "tiles") this.drawTiles(ctx, camera);
    else if (this.view === "web") this.drawWeb(ctx, camera);
    else this.drawCluster(ctx, camera);

    let chosen: Node | null = null;
    this.labels = [];
    for (const node of active) {
      if (node.key === this.selectedKey) { chosen = node; continue; }
      this.drawNode(ctx, camera, node);
    }
    if (chosen) this.drawNode(ctx, camera, chosen);
    ctx.restore();

    if (this.view === "web" && !active.length) {
      ctx.fillStyle = withAlpha(this.palette.ink, 0.8);
      ctx.font = `400 17px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("No featured-credit links in this library yet.", this.size.width / 2, this.size.height / 2 - 12);
      ctx.font = `400 13px ${FONT}`; ctx.fillStyle = withAlpha(this.palette.ink, 0.5);
      ctx.fillText("The Web view appears when song credits contain “feat.”, “ft.” or “featuring”.", this.size.width / 2, this.size.height / 2 + 14);
    }
  }

  /** Reserve screen room for a label; false means something already painted there. */
  private claimLabel(text: string, x: number, y: number, size: number, maxWidth: number): boolean {
    const width = Math.min(maxWidth, text.length * size * 0.62) + 8;
    const rect = { x0: x - width / 2, y0: y - size, x1: x + width / 2, y1: y + size * 0.32 };
    for (const taken of this.labels) {
      if (rect.x0 < taken.x1 && rect.x1 > taken.x0 && rect.y0 < taken.y1 && rect.y1 > taken.y0) return false;
    }
    this.labels.push(rect);
    return true;
  }

  private drawGroupLabel(ctx: CanvasRenderingContext2D, camera: Camera, group: EngineGroup, x: number, y: number, sizeWorld: number) {
    if (sizeWorld * camera.k < 12) return;
    if (!this.claimLabel(group.label, x, y, sizeWorld, WORLD.width * 2)) return;
    ctx.font = `500 ${sizeWorld}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = withAlpha(this.palette.ink, 0.92);
    ctx.fillText(trim(group.label, 30), x, y);
    if (sizeWorld * camera.k > 24 && this.claimLabel(`${group.count} artists`, x, y + sizeWorld * 1.05, sizeWorld * 0.7, WORLD.width * 2)) {
      ctx.font = `400 ${sizeWorld * 0.7}px ${FONT}`;
      ctx.fillStyle = withAlpha(this.palette.ink, 0.55);
      ctx.fillText(`${group.count.toLocaleString()} artists · ${group.tracks.toLocaleString()} songs`, x, y + sizeWorld * 1.05);
    }
  }

  private drawCluster(ctx: CanvasRenderingContext2D, camera: Camera) {
    // Rings hug the members as they actually settled, not the layout estimate.
    const reach = new Map<string, number>();
    for (const node of this.activeNodes()) {
      const group = this.groupById.get(node.group);
      if (!group) continue;
      const distance = Math.hypot(node.x - group.x, node.y - group.y) + node.r;
      reach.set(group.id, Math.max(reach.get(group.id) ?? 0, distance));
    }
    for (const group of this.groups) {
      const radius = (reach.get(group.id) ?? group.r) * 1.06 + 6;
      const tint = this.colorBy === "group" ? group.color : this.palette.ink;
      const glow = ctx.createRadialGradient(group.x, group.y, radius * 0.1, group.x, group.y, radius * 1.16);
      glow.addColorStop(0, withAlpha(tint, 0.09)); glow.addColorStop(0.75, withAlpha(tint, 0.04)); glow.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(group.x, group.y, radius * 1.16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(tint, this.colorBy === "group" ? 0.24 : 0.1);
      ctx.lineWidth = 1.2 / camera.k;
      ctx.setLineDash([5 / camera.k, 6 / camera.k]);
      ctx.beginPath(); ctx.arc(group.x, group.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      this.drawGroupLabel(ctx, camera, group, group.x, group.y - radius - 10 / camera.k, clamp(17 / camera.k, 15, 60));
    }
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, camera: Camera) {
    const flat = this.colorBy === "group" ? null : this.palette.ink;
    for (const group of this.groups) {
      ctx.fillStyle = withAlpha(flat ?? group.color, flat ? 0.045 : 0.075);
      ctx.beginPath(); ctx.arc(group.x, group.y, group.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(flat ?? group.color, flat ? 0.16 : 0.32);
      ctx.lineWidth = 1.4 / camera.k;
      ctx.stroke();
      this.drawGroupLabel(ctx, camera, group, group.x, group.y - group.r * 0.66, clamp(group.r * 0.13, 12 / camera.k, 64));
    }
  }

  private drawTiles(ctx: CanvasRenderingContext2D, camera: Camera) {
    const flat = this.colorBy === "group" ? null : this.palette.ink;
    for (const group of this.groups) {
      const width = group.x1 - group.x0; const height = group.y1 - group.y0;
      if (width < 1 || height < 1) continue;
      ctx.fillStyle = withAlpha(flat ?? group.color, flat ? 0.06 : 0.1);
      this.roundRect(ctx, group.x0, group.y0, width, height, 12); ctx.fill();
      ctx.strokeStyle = withAlpha(flat ?? group.color, flat ? 0.2 : 0.34);
      ctx.lineWidth = 1.4 / camera.k;
      this.roundRect(ctx, group.x0, group.y0, width, height, 12); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(group.x0, group.y0, width, height); ctx.clip();
      this.drawGroupLabel(ctx, camera, group, group.x0 + width / 2, group.y0 + 34, clamp(24, 13 / camera.k, 42));
      ctx.restore();
    }
  }

  private drawWeb(ctx: CanvasRenderingContext2D, camera: Camera) {
    ctx.lineCap = "round";
    for (const edge of this.edges) {
      if (edge.a.culled || edge.b.culled || edge.a.degree === 0 || edge.b.degree === 0) continue;
      if (edge.a.dim || edge.b.dim) continue;
      const strength = Math.min(1, 0.3 + edge.tracks * 0.25);
      ctx.strokeStyle = withAlpha(edge.color, 0.42 * strength);
      ctx.lineWidth = (0.9 + edge.tracks * 0.35) / Math.max(0.55, camera.k * 0.8);
      ctx.beginPath(); ctx.moveTo(edge.a.x, edge.a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke();
    }
  }

  private drawNode(ctx: CanvasRenderingContext2D, camera: Camera, node: Node) {
    const selected = node.key === this.selectedKey;
    const hovered = node.key === this.hoverKey;
    const tiles = this.view === "tiles";

    if (node.dim && !selected) {
      ctx.fillStyle = withAlpha(this.palette.ink, 0.09);
      if (tiles) this.roundRect(ctx, node.x0, node.y0, Math.max(0.5, node.x1 - node.x0), Math.max(0.5, node.y1 - node.y0), 5);
      else { ctx.beginPath(); ctx.arc(node.x, node.y, Math.max(node.r, 2), 0, Math.PI * 2); }
      ctx.fill();
      return;
    }

    if (tiles) {
      const width = node.x1 - node.x0; const height = node.y1 - node.y0;
      if (width * camera.k < 1.6 || height * camera.k < 1.6) return;
      ctx.fillStyle = withAlpha(node.color, 0.82);
      this.roundRect(ctx, node.x0, node.y0, width, height, 5); ctx.fill();
      if (selected || hovered) {
        ctx.strokeStyle = selected ? this.palette.accent : withAlpha(this.palette.ink, 0.7);
        ctx.lineWidth = (selected ? 2.6 : 1.6) / camera.k;
        this.roundRect(ctx, node.x0, node.y0, width, height, 5); ctx.stroke();
      }
      if (Math.min(width, height) * camera.k > 34) {
        const size = clamp(12 / camera.k, 11, Math.min(width, height) * 0.36);
        ctx.font = `500 ${size}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = node.color === "#6b7186" ? withAlpha(this.palette.ink, 0.9) : "#111524";
        ctx.fillText(trim(node.name, Math.max(5, Math.floor(width / (size * 0.62)))), node.x0 + width / 2, node.y0 + height / 2);
      }
      return;
    }

    if (node.r * camera.k < 0.8) return;
    if (selected) {
      const halo = ctx.createRadialGradient(node.x, node.y, node.r, node.x, node.y, node.r * 1.9);
      halo.addColorStop(0, withAlpha(this.palette.accent, 0.3)); halo.addColorStop(1, withAlpha(this.palette.accent, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r * 1.9, 0, Math.PI * 2); ctx.fill();
    }
    const body = ctx.createRadialGradient(node.x - node.r * 0.28, node.y - node.r * 0.32, node.r * 0.08, node.x, node.y, node.r);
    body.addColorStop(0, shade(node.color, 0.38)); body.addColorStop(0.62, node.color); body.addColorStop(1, shade(node.color, -0.42));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2); ctx.fill();
    if (node.guest) ctx.setLineDash([3.2 / camera.k, 3.2 / camera.k]);
    ctx.strokeStyle = selected ? this.palette.accent : hovered ? "rgba(255,255,255,0.85)" : withAlpha(shade(node.color, 0.5), 0.55);
    ctx.lineWidth = (selected ? 3 : hovered ? 2 : 1.1) / Math.max(0.55, camera.k * 0.9);
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r + (selected ? 2.5 : 0.6) / camera.k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (node.pinned) {
      ctx.fillStyle = withAlpha(this.palette.accent, 0.9);
      ctx.beginPath(); ctx.arc(node.x + node.r * 0.72, node.y - node.r * 0.72, Math.max(1.6, 2.8 / camera.k), 0, Math.PI * 2); ctx.fill();
    }
    const px = node.r * camera.k * 2;
    if (px >= 26 || selected || hovered) {
      const size = clamp(12 / camera.k, 9, 22);
      const name = trim(node.name, 24);
      const room = node.r * 2.6 + 60 / camera.k;
      const spot = { x: node.x, y: node.y + node.r + size * 1.05 };
      if (selected || hovered || this.claimLabel(name, spot.x, spot.y, size, room)) {
        ctx.font = `500 ${size}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = selected ? this.palette.ink : withAlpha(this.palette.ink, 0.92);
        ctx.fillText(name, spot.x, spot.y, room);
        const note = node.guest ? `featured ×${node.appearances ?? 1}` : `${node.tracks.toLocaleString()} songs`;
        if ((px >= 56 || selected) && (selected || this.claimLabel(note, spot.x, spot.y + size, size * 0.76, room))) {
          ctx.font = `400 ${size * 0.76}px ${FONT}`;
          ctx.fillStyle = withAlpha(this.palette.ink, 0.55);
          ctx.fillText(note, spot.x, spot.y + size, room);
        }
      }
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}
