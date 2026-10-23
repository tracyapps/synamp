/*
 * Grouping and layout mathematics for the Galaxy views, kept free of canvas
 * concerns: every view computes target positions for artists and groups, and
 * the engine animates nodes towards whichever targets are current.
 */
import { hierarchy, pack, treemap } from "d3-hierarchy";
import type { HierarchyCircularNode, HierarchyRectangularNode } from "d3-hierarchy";
import type { EngineGroup, EngineNode, GalaxyGrouping } from "./types";

export const WORLD = { width: 2600, height: 1700 };

/** The part of a group that ordering and legend chips need. */
export type GroupLike = Pick<EngineGroup, "id" | "label" | "tracks" | "count">;
/** The part of an artist that grouping looks at. */
export type GroupableNode = Pick<EngineNode, "genres" | "decade" | "letter">;

/** The grouping label for one artist. Unknown facets stay visible as their own groups. */
export function groupOf(node: GroupableNode, grouping: GalaxyGrouping): string {
  if (grouping === "genre") return node.genres[0] ?? "Uncategorised";
  if (grouping === "decade") return node.decade === undefined ? "Unknown years" : `${node.decade}s`;
  return node.letter;
}

export function groupSort(grouping: GalaxyGrouping): (a: GroupLike, b: GroupLike) => number {
  if (grouping === "decade") {
    // Chronological, with "Unknown years" parked after the newest era.
    const when = (group: GroupLike) => (group.id === "Unknown years" ? Number.MAX_SAFE_INTEGER : Number(group.id.replace(/s$/, "")));
    return (a, b) => when(a) - when(b);
  }
  if (grouping === "letter") return (a, b) => a.id.localeCompare(b.id);
  return (a, b) => b.tracks - a.tracks || a.id.localeCompare(b.id);
}

type Datum = { group?: EngineGroup; node?: EngineNode; value?: number; children?: Datum[] };
const bySize = (a: Datum, b: Datum) => (b.value ?? 0) - (a.value ?? 0);

/** Decades get a timeline; everything else arranges its groups like a packed foam. */
export function clusterCenters(groups: EngineGroup[], grouping: GalaxyGrouping): void {
  const ordered = [...groups].sort(groupSort(grouping));
  if (grouping === "decade" && ordered.length > 1) {
    const span = WORLD.width - 560;
    ordered.forEach((group, index) => {
      group.tx = 280 + index * (span / (ordered.length - 1));
      group.ty = WORLD.height / 2 + Math.sin(index * 1.7) * 110;
      group.tr = group.r;
    });
    return;
  }
  if (grouping === "decade") { ordered.forEach(group => { group.tx = WORLD.width / 2; group.ty = WORLD.height / 2; }); return; }
  const root = hierarchy<Datum>({ children: ordered.map(group => ({ group, value: Math.max(1, group.tracks) })) })
    .sum(item => item.value ?? 0).sort(bySize);
  const laid: HierarchyCircularNode<Datum> = pack<Datum>().size([WORLD.width, WORLD.height]).padding(46)(root);
  for (const item of laid.leaves()) {
    const group = item.data.group;
    if (!group) continue;
    group.tx = item.x; group.ty = item.y; group.tr = item.r;
  }
}

/** Nested bubbles: one big circle per group, artists inside sized by songs. */
export function packPositions(groups: EngineGroup[]): void {
  const root = hierarchy<Datum>({ children: groups.map(group => ({ group, children: group.nodes.map(node => ({ node, value: Math.max(1, node.tracks) })) })) })
    .sum(item => item.value ?? 0).sort(bySize);
  const laid: HierarchyCircularNode<Datum> = pack<Datum>().size([WORLD.width, WORLD.height]).padding(item => (item.depth === 0 ? 20 : 24))(root);
  for (const item of laid.leaves()) {
    const node = item.data.node;
    if (!node) continue;
    node.tx = item.x; node.ty = item.y; node.tr = Math.max(2.2, item.r);
  }
  for (const item of laid.children ?? []) {
    const group = item.data.group;
    if (!group) continue;
    group.tx = item.x; group.ty = item.y; group.tr = item.r;
  }
}

/** Flat-topped tiles: each group is a labelled block of artist rectangles. */
export function tilePositions(groups: EngineGroup[]): void {
  const root = hierarchy<Datum>({ children: groups.map(group => ({ group, children: group.nodes.map(node => ({ node, value: Math.max(1, node.tracks) })) })) })
    .sum(item => item.value ?? 0).sort(bySize);
  const laid: HierarchyRectangularNode<Datum> = treemap<Datum>().size([WORLD.width, WORLD.height])
    .paddingOuter(18).paddingTop(item => (item.depth === 1 ? 44 : 4)).paddingInner(5).round(true)(root);
  for (const item of laid.leaves()) {
    const node = item.data.node;
    if (!node) continue;
    node.tx = (item.x0 + item.x1) / 2; node.ty = (item.y0 + item.y1) / 2;
    node.tr = Math.max(2.2, Math.min(item.x1 - item.x0, item.y1 - item.y0) / 2);
    node.tx0 = item.x0; node.ty0 = item.y0; node.tx1 = item.x1; node.ty1 = item.y1;
  }
  for (const item of laid.children ?? []) {
    const group = item.data.group;
    if (!group) continue;
    group.tx = (item.x0 + item.x1) / 2; group.ty = (item.y0 + item.y1) / 2;
    group.tr = Math.max(item.x1 - item.x0, item.y1 - item.y0) / 2;
    group.tx0 = item.x0; group.ty0 = item.y0; group.tx1 = item.x1; group.ty1 = item.y1;
  }
}
