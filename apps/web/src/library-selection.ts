/*
 * What's ticked in the Library list. Whole groups can be ticked without their
 * rows ever being loaded, so a selection is kept as rules, not as a list:
 *
 *   all       everything in the list
 *   groups    group paths ticked ("1990s", or "1990s\u0000Björk" for a sub-group)
 *   items     single rows ticked outside any ticked group: row id → its group path
 *   excluded  things unticked inside a ticked group or "all":
 *             "path\u0001type:key" for a row, "path\u0001*" for a whole sub-group
 *
 * The brain turns the same rules into songs (explore.ts pickRows), so what's
 * shown ticked here is exactly what an action uses. Pure functions: every
 * change returns a new selection.
 */

export const SEP = "\u0000";
const MARK = "\u0001";

export type Selection = { all: boolean; groups: ReadonlySet<string>; items: ReadonlyMap<string, string>; excluded: ReadonlySet<string> };
export type GroupState = "all" | "some" | "none";

export const emptySelection = (): Selection => ({ all: false, groups: new Set(), items: new Map(), excluded: new Set() });
export const isEmpty = (sel: Selection) => !sel.all && !sel.groups.size && !sel.items.size;
const parentOf = (path: string) => (path.includes(SEP) ? path.slice(0, path.indexOf(SEP)) : null);
const under = (path: string, other: string) => other === path || other.startsWith(path + SEP);

/** Is this group ticked as a whole (by itself, its parent, or "all"), and not unticked? */
export function groupCovered(sel: Selection, path: string): boolean {
  if (sel.excluded.has(path + MARK + "*")) return false;
  if (sel.groups.has(path)) return true;
  const parent = parentOf(path);
  if (parent !== null) {
    if (sel.excluded.has(parent + MARK + "*")) return false;
    if (sel.groups.has(parent)) return true;
  }
  return sel.all;
}

export function itemChecked(sel: Selection, id: string, path: string): boolean {
  if (sel.items.has(id)) return true;
  if (path === "") return sel.all && !sel.excluded.has(MARK + id);
  const parent = parentOf(path);
  return groupCovered(sel, path) && !sel.excluded.has(path + MARK + id) && !(parent !== null && sel.excluded.has(parent + MARK + id));
}

export function groupState(sel: Selection, path: string): GroupState {
  const exclusionsUnder = [...sel.excluded].some((entry) => {
    const scope = entry.slice(0, entry.indexOf(MARK));
    return under(path, scope) && entry !== path + MARK + "*";
  });
  if (groupCovered(sel, path)) return exclusionsUnder ? "some" : "all";
  const pickedUnder = [...sel.items.values()].some((itemPath) => under(path, itemPath))
    || [...sel.groups].some((group) => group !== path && under(path, group));
  return pickedUnder ? "some" : "none";
}

/** Tick or untick a whole group (a mixed group becomes fully ticked). */
export function toggleGroup(sel: Selection, path: string): Selection {
  const state = groupState(sel, path);
  const groups = new Set([...sel.groups].filter((group) => !under(path, group)));
  const items = new Map([...sel.items].filter(([, itemPath]) => !under(path, itemPath)));
  const excluded = new Set([...sel.excluded].filter((entry) => !under(path, entry.slice(0, entry.indexOf(MARK)))));
  const next: Selection = { all: sel.all, groups, items, excluded };
  if (state === "all") {
    // Still ticked through its parent or "all"? Then untick it explicitly.
    if (groupCovered(next, path)) excluded.add(path + MARK + "*");
  } else if (!groupCovered(next, path)) {
    groups.add(path);
  }
  return next;
}

export function toggleItem(sel: Selection, id: string, path: string): Selection {
  const items = new Map(sel.items);
  const excluded = new Set(sel.excluded);
  if (items.has(id)) items.delete(id);
  else if (path === "" ? sel.all : groupCovered(sel, path)) {
    const key = path + MARK + id;
    if (excluded.has(key)) excluded.delete(key); else excluded.add(key);
  } else items.set(id, path);
  return { ...sel, items, excluded };
}

/** The header's "select everything": on (fresh), or off when everything is already ticked. */
export function toggleAll(sel: Selection): Selection {
  return sel.all && !sel.excluded.size ? emptySelection() : { all: true, groups: new Set(), items: new Map(), excluded: new Set() };
}
export const allState = (sel: Selection): GroupState => (sel.all ? (sel.excluded.size ? "some" : "all") : isEmpty(sel) ? "none" : "some");

/** What the brain needs to resolve it (POST /library/explore/pick). */
export function selectionSpec(sel: Selection) {
  return { all: sel.all, groups: [...sel.groups], items: [...sel.items.keys()], excluded: [...sel.excluded] };
}
