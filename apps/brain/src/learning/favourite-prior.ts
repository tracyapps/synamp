/**
 * Favourites as a small, fading head start for the Brain.
 *
 * A heart is a standing preference, but a weak one next to what you're asking
 * for right now and what you're doing this session. So its weight depends on
 * two things (the owner's design, 2026-10-10):
 *
 *   how vague the request is — "something to listen to" leans on favourites
 *     more than "fast instrumental piano from the 70s", which already says a lot;
 *   how much this session has taught the Brain — at the start of a session the
 *     favourites help; after a dozen skips and keeps, what you're doing now
 *     speaks louder, and the favourites fade to a whisper.
 *
 * The value joins the other listening adjustments, so it goes through the same
 * cap (evaluate.ts: 0.15·tanh(v/2)) and can never outweigh the request itself.
 * Every song it touches says why ("one of your favourite albums").
 */

import type { QueryPlan } from "../query/plan.ts";
import type { FavouriteKind } from "../library/favourites.ts";
import type { Adjustment } from "./types.ts";

/** At full weight. A love in the player is 2, so a favourite song is half a love at most. */
export const FAVOURITE_VALUE: Record<FavouriteKind, number> = { song: 1, album: 0.6, artist: 0.4 };
const LABEL: Record<FavouriteKind, string> = { song: "one of your favourite songs", album: "on one of your favourite albums", artist: "by one of your favourite artists" };
/** After this many listening events in the session, favourites count half as much. */
export const HALF_AFTER_EVENTS = 8;

/** How much a request already pins down: hard rules count 1, soft ones ½, each example song ½. */
export function specificity(plan: QueryPlan | undefined): number {
  if (!plan) return 1; // no request (a queue, the Brain readout): middling
  const hard = plan.constraints.filter((constraint) => constraint.hard).length;
  const soft = plan.constraints.length - hard;
  return hard + soft / 2 + (plan.ranking.exemplars?.positive?.length ?? 0) / 2;
}

/** 0–1: full weight for a vague request at the start of a session, less as either fills in. */
export function favouriteWeight(plan: QueryPlan | undefined, sessionEvents: number): number {
  const vague = 1 / (1 + specificity(plan) / 2);
  const fresh = 1 / (1 + Math.max(0, sessionEvents) / HALF_AFTER_EVENTS);
  return Math.round(vague * fresh * 1000) / 1000;
}

type View = { adjust(trackId: string, playlistId?: string): Adjustment };

/** The same view, with each track's favourite nudge added to its adjustment (and its reason). */
export function withFavourites<T extends View>(view: T, kindOf: (trackId: string) => FavouriteKind | null, weight: number): T {
  if (weight <= 0) return view;
  const adjust = (trackId: string, playlistId?: string): Adjustment => {
    const base = view.adjust(trackId, playlistId);
    const kind = kindOf(trackId);
    if (!kind) return base;
    const value = Math.round(FAVOURITE_VALUE[kind] * weight * 100) / 100;
    if (!value) return base;
    return { value: base.value + value, parts: [...base.parts, { label: LABEL[kind], value }] };
  };
  // Keep the view's other methods (removed, epoch, proposals…) bound to it.
  return new Proxy(view, { get: (target, prop, receiver) => (prop === "adjust" ? adjust : Reflect.get(target, prop, receiver)) });
}
