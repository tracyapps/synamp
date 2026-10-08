/*
 * Two small helpers for Library care → Organise, kept pure so they're tested
 * on their own (tools/organise-select.test.mts):
 *
 *  - pick(): checkboxes with shift-click. A plain click ticks or unticks one
 *    and remembers it; shift-click sets everything between that one and this
 *    one (on the page, in the order shown) to what this click made it.
 *  - summarise(): the problems a batch ran into, counted by kind, so a batch
 *    with hundreds of them reads as one line until you open it.
 */

export type Picked = { selected: ReadonlySet<string>; anchor: string | null };
export const NOTHING_PICKED: Picked = { selected: new Set(), anchor: null };

/** `order` is the ids on screen, top to bottom. */
export function pick(state: Picked, order: readonly string[], id: string, shift: boolean): Picked {
  const turnOn = !state.selected.has(id);
  const next = new Set(state.selected);
  const from = state.anchor ? order.indexOf(state.anchor) : -1;
  const to = order.indexOf(id);
  if (shift && from >= 0 && to >= 0) {
    const [a, b] = from < to ? [from, to] : [to, from];
    for (const item of order.slice(a, b + 1)) { if (turnOn) next.add(item); else next.delete(item); }
  } else if (turnOn) next.add(id);
  else next.delete(id);
  return { selected: next, anchor: id };
}

/** "Select all on this page": all on, or (when they already are) all off. */
export function pickAll(state: Picked, order: readonly string[]): Picked {
  const all = order.length > 0 && order.every((id) => state.selected.has(id));
  return { selected: all ? new Set() : new Set(order), anchor: null };
}

/** Keep only what's still on screen (after a filter or page change, or a review that moved things off the list). */
export function keepVisible(state: Picked, order: readonly string[]): Picked {
  const visible = new Set(order);
  const selected = new Set([...state.selected].filter((id) => visible.has(id)));
  if (selected.size === state.selected.size && (!state.anchor || visible.has(state.anchor))) return state;
  return { selected, anchor: state.anchor && visible.has(state.anchor) ? state.anchor : null };
}

export type ProblemKind = "gone" | "exists" | "left" | "other";
export const PROBLEM_TEXT: Record<ProblemKind, [string, string]> = {
  gone: ["file was no longer there", "files were no longer there"],
  exists: ["new name was already taken", "new names were already taken"],
  left: ["file was left where it was", "files were left where they were"],
  other: ["other problem", "other problems"],
};

export function kindOf(problem: string): ProblemKind {
  if (/^Left /.test(problem)) return "left";
  if (/is no longer there$/.test(problem)) return "gone";
  if (/already exists$|^Something is already at/.test(problem)) return "exists";
  return "other";
}

/** Counts by kind (most common first), for one batch. */
export function summarise(problems: readonly string[]): Array<{ kind: ProblemKind; count: number }> {
  const counts = new Map<ProblemKind, number>();
  for (const problem of problems) counts.set(kindOf(problem), (counts.get(kindOf(problem)) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}

export const describe = (summary: ReturnType<typeof summarise>) =>
  summary.map(({ kind, count }) => `${count.toLocaleString()} ${PROBLEM_TEXT[kind][count === 1 ? 0 : 1]}`).join(", ");
