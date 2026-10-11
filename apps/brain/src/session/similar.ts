import { evaluatePlan, type EvaluateOptions, type Library, type LibraryTrack } from "../query/evaluate.ts";
import { validatePlan, type QueryPlan } from "../query/plan.ts";
import { SessionError } from "./session.ts";

const measured = (v?: number[]) => !!v?.length && v.every(Number.isFinite) && v.some(x => x !== 0);
/** One immediate recommendation. Saved hard rules and exclusions are never relaxed. */
export function similarNext(library: Library, anchorId: string, options: {
  excluded: ReadonlySet<string>; playable: (track: LibraryTrack) => boolean;
  plan?: QueryPlan; policy?: EvaluateOptions;
}): LibraryTrack {
  const anchor = library.tracks.find(t => t.id === anchorId);
  if (!anchor || !measured(anchor.embedding)) throw new SessionError("This song needs sound analysis before SynAmp can find a similar one", 409);
  const constraints = structuredClone(options.plan?.constraints ?? []).filter(c => c.hard);
  const plan: QueryPlan = {
    version: "2.0", intent: { query_type: "exemplar" }, target_size: 500,
    constraints,
    ranking: { signals: [{ name: "exemplar_pos", weight: 1 }], exemplars: { positive: [anchor.id] } },
    relaxation: { min_results: 0, tiers: "strict", ladder: [], require_confirmation_for: (options.plan?.relaxation.require_confirmation_for ?? []).filter(id => constraints.some(c => c.id === id)) },
  };
  const checked = validatePlan(plan);
  if (!checked.ok) throw new SessionError("This playlist’s rules need updating before choosing a similar song", 409);
  const tracks = library.tracks.filter(t => t.id === anchor.id || (
    !options.excluded.has(t.id) && measured(t.embedding) && t.embedding!.length === anchor.embedding!.length
    && (!anchor.audio_hash || t.audio_hash !== anchor.audio_hash)
    && t.embedding!.reduce((sum, value, i) => sum + value * anchor.embedding![i]!, 0) > 0
  ));
  const byId = new Map(tracks.map(track => [track.id, track]));
  // Check files only for ranked candidates, rather than stat-ing the entire library.
  const result = evaluatePlan(checked, { ...library, tracks }, options.policy).strict.find(t => t.id !== anchor.id && options.playable(byId.get(t.id)!));
  const found = result && byId.get(result.id);
  if (!found) throw new SessionError("No unplayed similar song meets this playlist’s rules yet", 409);
  return found;
}
