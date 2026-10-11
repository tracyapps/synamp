import { evaluatePlan, type EvaluateOptions, type Library, type LibraryTrack } from "../query/evaluate.ts";
import { validatePlan, type QueryPlan } from "../query/plan.ts";
import type { ListeningEvent } from "./events.ts";
import { SessionError } from "./session.ts";

/** Select a small fresh horizon. Anchors remain in the full library even when
 * excluded from playback; neither saved hard rules nor removal hides relax. */
export function continuationTracks(library: Library, options: {
  seeds: string[]; excluded: ReadonlySet<string>; recent: string[];
  events: readonly ListeningEvent[]; playable: (track: LibraryTrack) => boolean;
  count: number; plan?: QueryPlan; policy?: EvaluateOptions;
}): { tracks: LibraryTrack[]; recycled: boolean } {
  const rejected = new Set<string>(), removed = new Set<string>(), broken = new Set<string>();
  const loves: string[] = [], heard: string[] = [], explicitNegatives: string[] = [], skips: string[] = [];
  for (const event of options.events) {
    if (event.signal === "love" || event.signal === "thumb_up") loves.push(event.track_id);
    if (event.signal === "full_play") heard.push(event.track_id);
    if (event.signal === "thumb_down") rejected.add(event.track_id);
    if (event.signal === "remove") removed.add(event.track_id);
    if (event.signal === "restore") removed.delete(event.track_id);
    if (event.signal === "playback_error") broken.add(event.track_id);
    if (event.signal === "learning_reset") { heard.length = 0; skips.length = 0; }
    if (event.signal === "skip_early") skips.push(event.track_id);
    if ((event.signal === "thumb_down" || event.signal === "remove") && event.reason !== "not_now" && event.reason !== "has_words") explicitNegatives.push(event.track_id);
  }
  const lastUnique = (ids: string[], limit: number) => [...new Set([...ids].reverse())].slice(0, limit);
  const positives = lastUnique(loves.length ? loves : [...options.seeds, ...heard], 12).filter(id => !rejected.has(id) && !removed.has(id));
  const plan: QueryPlan = options.plan ? structuredClone(options.plan) : {
    version: "2.0", intent: { query_type: "exemplar" }, target_size: 500, constraints: [],
    ranking: { signals: [] }, relaxation: { min_results: 0, tiers: "strict", ladder: [], require_confirmation_for: [] },
  };
  plan.target_size = Math.min(500, Math.max(1, options.count));
  plan.relaxation = { ...plan.relaxation, min_results: 0, tiers: "strict", ladder: [] };
  // Feedback replaces the starting sound anchors, while all saved feature rules remain.
  const anchors = loves.length || !plan.ranking.exemplars?.positive?.length ? positives : plan.ranking.exemplars.positive;
  plan.ranking.exemplars = { positive: anchors, negative: lastUnique([...(plan.ranking.exemplars?.negative ?? []), ...explicitNegatives, ...skips], 12) };
  if (anchors.length && !plan.ranking.signals.some(s => s.name === "exemplar_pos")) plan.ranking.signals.push({ name: "exemplar_pos", weight: 1 });
  if (plan.ranking.exemplars.negative!.length && !plan.ranking.signals.some(s => s.name === "exemplar_neg")) plan.ranking.signals.push({ name: "exemplar_neg", weight: .5 });
  const checked = validatePlan(plan);
  if (!checked.ok) throw new SessionError("This playlist’s rules need updating before continuing", 409);
  const blockedHashes = new Set(library.tracks.filter(t => options.excluded.has(t.id) || rejected.has(t.id) || removed.has(t.id) || broken.has(t.id)).flatMap(t => t.audio_hash ? [t.audio_hash] : []));
  const candidates = library.tracks.filter(t => !options.excluded.has(t.id) && !rejected.has(t.id) && !removed.has(t.id) && !broken.has(t.id) && (!t.audio_hash || !blockedHashes.has(t.audio_hash)));
  const recent = new Set(options.recent);
  const recentHashes = new Map(library.tracks.filter(t => recent.has(t.id) && t.audio_hash).map(t => [t.audio_hash!, options.recent.lastIndexOf(t.id)]));
  const allowed = new Set(candidates.filter(t => !recent.has(t.id) && (!t.audio_hash || !recentHashes.has(t.audio_hash))).map(t => t.id));
  const byId = new Map(candidates.map(t => [t.id, t]));
  const playable = new Map<string, boolean>();
  const pick = (validated = checked) => {
    const selectedHashes = new Set<string>();
    const rows = evaluatePlan(validated, library, { ...options.policy, candidateIds: allowed, acceptCandidate: t => {
      if (!playable.has(t.id)) playable.set(t.id, options.playable(t));
      if (!playable.get(t.id) || (t.audio_hash && selectedHashes.has(t.audio_hash))) return false;
      if (t.audio_hash) selectedHashes.add(t.audio_hash);
      return true;
    } }).strict;
    return rows.map(t => byId.get(t.id)!);
  };
  let tracks = pick(), recycled = false;
  // Only cycle when no fresh eligible song is available. Release the oldest
  // recording first; current and queued recordings are always excluded.
  if (!tracks.length) {
    const lastPlayed = new Map(options.recent.map((id, index) => [id, index]));
    for (const t of candidates) if (t.audio_hash && recentHashes.has(t.audio_hash)) lastPlayed.set(t.id, Math.max(lastPlayed.get(t.id) ?? -1, recentHashes.get(t.audio_hash)!));
    for (const id of lastPlayed.keys()) if (byId.has(id)) allowed.add(id);
    const cyclePlan = validatePlan({ ...plan, target_size: 500 });
    if (cyclePlan.ok) {
      tracks = pick(cyclePlan).sort((a, b) => (lastPlayed.get(a.id) ?? -1) - (lastPlayed.get(b.id) ?? -1)).slice(0, 1);
      recycled = tracks.length > 0;
    }
  }
  return { tracks, recycled };
}
