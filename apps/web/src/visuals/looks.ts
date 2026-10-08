/*
 * Which MilkDrop look comes next. Pure functions (tested in tools/visual-looks.test.mts).
 *
 * `order` is every look, shuffled once when the visuals start. Hidden looks
 * are never picked. With "Just my favourites", Next, Previous and
 * "Change by itself" stay within your favourites; with no favourites yet (or
 * every favourite hidden away) they fall back to all looks, and say so.
 * Picking a look from the list always works, hidden or not.
 */

export type Pool = "all" | "favourites";
export type Looks = { favourites: string[]; hidden: string[]; pool: Pool };
export const NO_LOOKS: Looks = { favourites: [], hidden: [], pool: "all" };

/** The looks Next/Previous/auto choose from, and why it isn't what you asked for (if it isn't). */
export function poolOf(order: readonly string[], looks: Looks): { pool: string[]; fallback: "no-favourites" | "all-hidden" | null } {
  const hidden = new Set(looks.hidden);
  const visible = order.filter((name) => !hidden.has(name));
  if (looks.pool === "favourites") {
    const loved = new Set(looks.favourites);
    const mine = visible.filter((name) => loved.has(name));
    if (mine.length) return { pool: mine, fallback: null };
    if (visible.length) return { pool: visible, fallback: "no-favourites" };
  }
  if (visible.length) return { pool: visible, fallback: null };
  // Everything hidden: rather than a blank screen, show them anyway.
  return { pool: [...order], fallback: "all-hidden" };
}

/**
 * The look after (or before) `current`, in shuffled order, within the pool.
 * `current` may be outside the pool (picked by hand, or just hidden): the
 * step goes from where it sits in the full order.
 */
export function step(order: readonly string[], looks: Looks, current: string, direction: 1 | -1): string {
  const { pool } = poolOf(order, looks);
  if (!pool.length) return current;
  const inPool = new Set(pool);
  const from = order.indexOf(current);
  if (from < 0) return pool[0]!;
  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(from + direction * offset + order.length * offset) % order.length]!;
    if (inPool.has(candidate) && candidate !== current) return candidate;
  }
  return current; // the only look in the pool
}

/** The same change the brain makes (see apps/brain/src/visuals/looks.ts), applied straight away on screen. */
export function change(looks: Looks, name: string, edit: { favourite?: boolean; hidden?: boolean }): Looks {
  const without = (list: string[]) => list.filter((item) => item !== name);
  let { favourites, hidden } = looks;
  if (edit.favourite !== undefined) {
    favourites = without(favourites);
    if (edit.favourite) { favourites = [...favourites, name]; hidden = without(hidden); }
  }
  if (edit.hidden !== undefined) {
    hidden = without(hidden);
    if (edit.hidden) { hidden = [...hidden, name]; favourites = without(favourites); }
  }
  return { ...looks, favourites, hidden };
}

/** "Geiss - Spiral" → "Geiss — Spiral", as shown on screen. */
export const lookLabel = (name: string) => name.replace(/\s+-\s+/, " — ");

/** Search: every word must appear, ignoring case and accents. */
export function matches(name: string, query: string): boolean {
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const haystack = fold(name);
  return fold(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}
