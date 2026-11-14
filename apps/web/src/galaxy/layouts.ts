/*
 * Grouping and layout mathematics for the Galaxy views, kept free of canvas
 * concerns: every view computes target positions for artists and groups, and
 * the engine animates nodes towards whichever targets are current.
 */
import { hierarchy, pack, treemap } from "d3-hierarchy";
import type { HierarchyCircularNode, HierarchyRectangularNode } from "d3-hierarchy";
import type { EngineGroup, EngineNode, GalaxyGrouping, GalaxySubgrouping } from "./types";

export const WORLD = { width: 2600, height: 1700 };

/** The part of a group that ordering and legend chips need. */
export type GroupLike = Pick<EngineGroup, "id" | "label" | "tracks" | "count">;
/** The part of an artist that grouping looks at. */
export type GroupableNode = Pick<EngineNode, "genres" | "decade" | "letter" | "listening">;

/** Listening buckets, most engaged first — the order groups lay out in. */
export const LISTENING_BUCKETS = ["Played a lot", "Played sometimes", "Played once or twice", "Never played"];

export function listeningBucket(node: Pick<EngineNode, "listening">): string {
  const plays = node.listening?.plays ?? 0;
  if (plays >= 20) return LISTENING_BUCKETS[0]!;
  if (plays >= 5) return LISTENING_BUCKETS[1]!;
  if (plays >= 1) return LISTENING_BUCKETS[2]!;
  return LISTENING_BUCKETS[3]!;
}

/** The grouping label for one artist. Unknown facets stay visible as their own groups. */
export function groupOf(node: GroupableNode, grouping: GalaxyGrouping): string {
  if (grouping === "genre") return node.genres[0] ?? "Uncategorised";
  if (grouping === "decade") return node.decade === undefined ? "Unknown years" : `${node.decade}s`;
  if (grouping === "listening") return listeningBucket(node);
  return node.letter;
}

export function groupSort(grouping: GalaxyGrouping): (a: GroupLike, b: GroupLike) => number {
  if (grouping === "decade") {
    // Chronological, with "Unknown years" parked after the newest era.
    const when = (group: GroupLike) => (group.id === "Unknown years" ? Number.MAX_SAFE_INTEGER : Number(group.id.replace(/s$/, "")));
    return (a, b) => when(a) - when(b);
  }
  if (grouping === "listening") {
    const rank = (group: GroupLike) => {
      const index = LISTENING_BUCKETS.indexOf(group.id);
      return index === -1 ? LISTENING_BUCKETS.length : index;
    };
    return (a, b) => rank(a) - rank(b);
  }
  if (grouping === "letter") return (a, b) => a.id.localeCompare(b.id);
  return (a, b) => b.tracks - a.tracks || a.id.localeCompare(b.id);
}

type Datum = { group?: EngineGroup; sub?: EngineGroup; node?: EngineNode; value?: number; children?: Datum[] };
const bySize = (a: Datum, b: Datum) => (b.value ?? 0) - (a.value ?? 0);

/** A group's second-level buckets. A single bucket collapses back to one level. */
function subgroupsOf(group: EngineGroup, sub: GalaxySubgrouping): EngineGroup[][] {
  if (sub === "none") return [];
  const buckets = new Map<string, EngineNode[]>();
  for (const node of group.nodes) {
    const label = groupOf(node, sub);
    const bucket = buckets.get(label) ?? [];
    bucket.push(node); buckets.set(label, bucket);
  }
  const sorted = [...buckets.entries()].sort(([a], [b]) => {
    const order = groupSort(sub);
    return order({ id: a, label: a, tracks: 0, count: 0 }, { id: b, label: b, tracks: 0, count: 0 });
  });
  if (sorted.length < 2) return [];
  return sorted.map(([id, nodes]) => {
    const previous = group.subgroups.find(candidate => candidate.id === `${group.id}/${id}`);
    const cx = previous?.x ?? group.x; const cy = previous?.y ?? group.y; const cr = Math.max(8, (previous?.r ?? group.r) * 0.5);
    const x0 = previous?.x0 ?? group.x0; const y0 = previous?.y0 ?? group.y0; const x1 = previous?.x1 ?? group.x1; const y1 = previous?.y1 ?? group.y1;
    return [{ id: `${group.id}/${id}`, label: id, tracks: nodes.reduce((sum, node) => sum + node.tracks, 0), count: nodes.length, color: group.color, nodes, subgroups: [],
      x: cx, y: cy, r: cr, x0, y0, x1, y1, sx: cx, sy: cy, sr: cr, tx: cx, ty: cy, tr: cr,
      sx0: x0, sy0: y0, sx1: x1, sy1: y1, tx0: x0, ty0: y0, tx1: x1, ty1: y1 }];
  });
}

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

/** Nested bubbles: one circle per group — and per bucket inside when a "then by" is chosen. */
export function packPositions(groups: EngineGroup[], sub: GalaxySubgrouping): void {
  const root = hierarchy<Datum>({ children: groups.map(group => {
    const buckets = subgroupsOf(group, sub);
    return { group, children: buckets.length
      ? buckets.flat().map(bucket => ({ sub: bucket, children: bucket.nodes.map(node => ({ node, value: Math.max(1, node.tracks) })) }))
      : group.nodes.map(node => ({ node, value: Math.max(1, node.tracks) })) };
  }) }).sum(item => item.value ?? 0).sort(bySize);
  const laid: HierarchyCircularNode<Datum> = pack<Datum>().size([WORLD.width, WORLD.height])
    .padding(item => (item.depth === 0 ? 18 : item.depth === 1 ? 22 : 10))(root);
  for (const item of laid.leaves()) {
    const node = item.data.node;
    if (!node) continue;
    node.tx = item.x; node.ty = item.y; node.tr = Math.max(2.2, item.r);
  }
  for (const groupItem of laid.children ?? []) {
    const group = groupItem.data.group!;
    group.subgroups = (groupItem.children ?? []).map(subItem => subItem.data.sub).filter((bucket): bucket is EngineGroup => !!bucket);
    group.tx = groupItem.x; group.ty = groupItem.y; group.tr = groupItem.r;
    for (const subItem of groupItem.children ?? []) {
      const bucket = subItem.data.sub;
      if (!bucket) continue;
      bucket.tx = subItem.x; bucket.ty = subItem.y; bucket.tr = subItem.r;
    }
  }
}

/** Flat-topped tiles: each group is a labelled block, with labelled sub-blocks when a "then by" is chosen. */
export function tilePositions(groups: EngineGroup[], sub: GalaxySubgrouping): void {
  const root = hierarchy<Datum>({ children: groups.map(group => {
    const buckets = subgroupsOf(group, sub);
    return { group, children: buckets.length
      ? buckets.flat().map(bucket => ({ sub: bucket, children: bucket.nodes.map(node => ({ node, value: Math.max(1, node.tracks) })) }))
      : group.nodes.map(node => ({ node, value: Math.max(1, node.tracks) })) };
  }) }).sum(item => item.value ?? 0).sort(bySize);
  const laid: HierarchyRectangularNode<Datum> = treemap<Datum>().size([WORLD.width, WORLD.height])
    .paddingOuter(16).paddingTop(item => (item.depth === 1 ? 44 : item.depth === 2 ? 26 : 4)).paddingInner(4).round(true)(root);
  for (const item of laid.leaves()) {
    const node = item.data.node;
    if (!node) continue;
    node.tx = (item.x0 + item.x1) / 2; node.ty = (item.y0 + item.y1) / 2;
    node.tr = Math.max(2.2, Math.min(item.x1 - item.x0, item.y1 - item.y0) / 2);
    node.tx0 = item.x0; node.ty0 = item.y0; node.tx1 = item.x1; node.ty1 = item.y1;
  }
  for (const groupItem of laid.children ?? []) {
    const group = groupItem.data.group!;
    group.subgroups = (groupItem.children ?? []).map(subItem => subItem.data.sub).filter((bucket): bucket is EngineGroup => !!bucket);
    group.tx = (groupItem.x0 + groupItem.x1) / 2; group.ty = (groupItem.y0 + groupItem.y1) / 2;
    group.tr = Math.max(groupItem.x1 - groupItem.x0, groupItem.y1 - groupItem.y0) / 2;
    group.tx0 = groupItem.x0; group.ty0 = groupItem.y0; group.tx1 = groupItem.x1; group.ty1 = groupItem.y1;
    for (const subItem of groupItem.children ?? []) {
      const bucket = subItem.data.sub;
      if (!bucket) continue;
      bucket.tx = (subItem.x0 + subItem.x1) / 2; bucket.ty = (subItem.y0 + subItem.y1) / 2;
      bucket.tr = Math.max(subItem.x1 - subItem.x0, subItem.y1 - subItem.y0) / 2;
      bucket.tx0 = subItem.x0; bucket.ty0 = subItem.y0; bucket.tx1 = subItem.x1; bucket.ty1 = subItem.y1;
    }
  }
}
