/**
 * Cross-epoch proposals (A3 §3.4) — the ONLY channel by which patterns from
 * closed sessions come back to the user.
 *
 * A proposal changes nothing by itself: it must be confirmed as an explicit
 * signal (e.g. a global thumbs down) or a plan edit. Thresholds are the
 * conservative candidates P21–P23 — for behaviour to count it must recur
 * across epochs AND calendar dates ("mood ≠ habit"), and the scan window is
 * bounded to 30 days (bounded compute and bounded memory of old listening).
 *
 * Pure scan over closed epochs; `now` is injected; identical inputs ⇒ identical
 * proposals in a fixed order.
 */

import { createHash } from "node:crypto";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import type { EpochRun } from "./epochs.ts";
import type { Daypart, Proposal, ProposalKind } from "./types.ts";
import { DAYPARTS } from "./types.ts";

/** P23: no proposal is generated from evidence older than this. */
export const PROPOSAL_SCAN_DAYS = 30;
const DAY_MS = 86_400_000;

export type ProposalThreshold = { epochs: number; dates: number; dayparts?: number; min_tracks?: number };

/** P21/P22 candidate thresholds (untested guesses — conservative on purpose). */
export const PROPOSAL_THRESHOLDS: Record<ProposalKind, ProposalThreshold> = {
  track_repeat_skip: { epochs: 3, dates: 2 },
  artist_repeat_skip: { epochs: 3, dates: 2, min_tracks: 2 },
  not_now_pattern: { epochs: 3, dates: 2, dayparts: 2 },
  external_play_positive: { epochs: 5, dates: 3 },
  repeat_positive: { epochs: 4, dates: 3 },
};

export type ProposalOptions = {
  now: number;
  library?: Library;
  canonical?: (id: string) => string;
  /** The epoch that is still live: its evidence is not yet a pattern (A3: scan closed epochs). */
  excludeEpochId?: string | null;
};

type Finding = {
  epochs: Set<string>;
  dates: Set<string>;
  dayparts: Set<Daypart>;
  playlists: Set<string>;
  tracks: Set<string>;
};

const newFinding = (): Finding => ({
  epochs: new Set<string>(),
  dates: new Set<string>(),
  dayparts: new Set<Daypart>(),
  playlists: new Set<string>(),
  tracks: new Set<string>(),
});

const KIND_ORDER: Record<ProposalKind, number> = {
  track_repeat_skip: 0,
  artist_repeat_skip: 1,
  not_now_pattern: 2,
  external_play_positive: 3,
  repeat_positive: 4,
};

export function generateProposals(runs: readonly EpochRun[], opts: ProposalOptions): Proposal[] {
  const canonical = opts.canonical ?? ((id: string) => id);
  const windowStart = opts.now - PROPOSAL_SCAN_DAYS * DAY_MS;
  const eligible = runs.filter(
    (run) =>
      run.epoch.id !== (opts.excludeEpochId ?? null) &&
      run.epoch.t_start <= opts.now &&
      run.epoch.t_end >= windowStart,
  );

  const trackById = new Map<string, LibraryTrack>();
  if (opts.library) for (const track of opts.library.tracks) trackById.set(track.id, track);
  const artistOf = (id: string): string | undefined => trackById.get(id)?.artist || undefined;
  const label = (id: string): string => {
    const track = trackById.get(id);
    if (!track) return `track ${id}`;
    return track.artist ? `“${track.title}” (${track.artist})` : `“${track.title}”`;
  };

  const findings = {
    track_skip: new Map<string, Finding>(), // key: track id
    artist_skip: new Map<string, Finding>(), // key: artist
    not_now: new Map<string, Finding>(), // key: track id
    external: new Map<string, Finding>(), // key: artist name, or track id when untagged
    repeat: new Map<string, Finding>(), // key: track id
  };
  const externalKind = new Map<string, "artist" | "track">();

  const ensure = (map: Map<string, Finding>, key: string): Finding => {
    const existing = map.get(key);
    if (existing) return existing;
    const created = newFinding();
    map.set(key, created);
    return created;
  };
  const markRun = (finding: Finding, run: EpochRun): void => {
    finding.epochs.add(run.epoch.id);
    finding.dates.add(run.epoch.date);
    finding.dayparts.add(run.epoch.daypart);
  };

  for (const run of eligible) {
    const skip = new Map<string, { count: number; playlists: Set<string> }>();
    const notNowTracks = new Set<string>();
    const repeatTracks = new Set<string>();
    const externalTracks = new Set<string>();

    for (const event of run.events) {
      const t = canonical(event.track_id);
      switch (event.signal) {
        case "skip_early": {
          const entry = skip.get(t) ?? { count: 0, playlists: new Set<string>() };
          entry.count += 1;
          if (event.playlist_id) entry.playlists.add(event.playlist_id);
          skip.set(t, entry);
          break;
        }
        case "thumb_down":
        case "remove":
          if (event.reason === "not_now") notNowTracks.add(t);
          break;
        case "repeat":
          repeatTracks.add(t);
          break;
        case "external_play":
          externalTracks.add(t);
          break;
        default:
          break;
      }
    }

    // "this track keeps disappearing early here": repeat early-skips (k ≥ 2) this epoch.
    for (const [t, entry] of skip) {
      if (entry.count < 2) continue;
      const finding = ensure(findings.track_skip, t);
      markRun(finding, run);
      finding.tracks.add(t);
      for (const playlist of entry.playlists) finding.playlists.add(playlist);
    }

    // "you keep skipping <artist>": ≥ 2 distinct hidden tracks by one artist this epoch.
    const hiddenByArtist = new Map<string, { tracks: Set<string>; playlists: Set<string> }>();
    for (const [t, entry] of skip) {
      if (entry.count < 2) continue;
      const artist = artistOf(t);
      if (!artist) continue;
      const group = hiddenByArtist.get(artist) ?? { tracks: new Set<string>(), playlists: new Set<string>() };
      group.tracks.add(t);
      for (const playlist of entry.playlists) group.playlists.add(playlist);
      hiddenByArtist.set(artist, group);
    }
    const minTracks = PROPOSAL_THRESHOLDS.artist_repeat_skip.min_tracks ?? 2;
    for (const [artist, group] of hiddenByArtist) {
      if (group.tracks.size < minTracks) continue;
      const finding = ensure(findings.artist_skip, artist);
      markRun(finding, run);
      for (const t of group.tracks) finding.tracks.add(t);
      for (const playlist of group.playlists) finding.playlists.add(playlist);
    }

    for (const t of notNowTracks) {
      const finding = ensure(findings.not_now, t);
      markRun(finding, run);
      finding.tracks.add(t);
    }

    for (const t of repeatTracks) {
      const finding = ensure(findings.repeat, t);
      markRun(finding, run);
      finding.tracks.add(t);
    }

    for (const t of externalTracks) {
      const artist = artistOf(t);
      const key = artist ?? t;
      externalKind.set(key, artist ? "artist" : "track");
      const finding = ensure(findings.external, key);
      markRun(finding, run);
      finding.tracks.add(t);
    }
  }

  const evidenceOf = (finding: Finding): Proposal["evidence"] => ({
    epochs: finding.epochs.size,
    dates: finding.dates.size,
    dayparts: [...finding.dayparts].sort((a, b) => DAYPARTS.indexOf(a) - DAYPARTS.indexOf(b)),
  });
  const meets = (finding: Finding, threshold: ProposalThreshold): boolean =>
    finding.epochs.size >= threshold.epochs &&
    finding.dates.size >= threshold.dates &&
    (threshold.dayparts === undefined || finding.dayparts.size >= threshold.dayparts);

  const proposalId = (kind: ProposalKind, subject: string): string =>
    `pr1:${createHash("sha256").update(`${kind}\u0000${subject}`).digest("hex").slice(0, 12)}`;

  const proposals: Proposal[] = [];

  for (const [t, finding] of findings.track_skip) {
    if (!meets(finding, PROPOSAL_THRESHOLDS.track_repeat_skip)) continue;
    const samePlaylist = finding.playlists.size === 1;
    proposals.push({
      id: proposalId("track_repeat_skip", t),
      kind: "track_repeat_skip",
      subject: t,
      subject_type: "track",
      thesis: `You keep skipping ${label(t)} early — ${finding.epochs.size} sessions across ${finding.dates.size} days${samePlaylist ? " in one playlist" : ""}.`,
      evidence: evidenceOf(finding),
      // Consequence copy (C2 F5): the accept writes a GLOBAL thumbs-down even when the
      // evidence was "in one playlist" — say so before the click, offer the playlist edit
      // as the alternative.
      suggested_action: "Keeps it out of suggestions everywhere (a global thumbs-down) — or exclude it from that playlist instead",
    });
  }

  for (const [artist, finding] of findings.artist_skip) {
    if (!meets(finding, PROPOSAL_THRESHOLDS.artist_repeat_skip)) continue;
    proposals.push({
      id: proposalId("artist_repeat_skip", artist),
      kind: "artist_repeat_skip",
      subject: artist,
      subject_type: "artist",
      thesis: `You keep skipping tracks by ${artist} early — ${finding.tracks.size} different tracks across ${finding.epochs.size} sessions.`,
      evidence: evidenceOf(finding),
      suggested_action: `Records your decision — no automatic change; edit the playlist to exclude ${artist}`,
    });
  }

  for (const [t, finding] of findings.not_now) {
    if (!meets(finding, PROPOSAL_THRESHOLDS.not_now_pattern)) continue;
    proposals.push({
      id: proposalId("not_now_pattern", t),
      kind: "not_now_pattern",
      subject: t,
      subject_type: "track",
      thesis: `You often say “not now” to ${label(t)} — ${finding.epochs.size} sessions across ${finding.dates.size} days and ${finding.dayparts.size} parts of the day.`,
      evidence: evidenceOf(finding),
      suggested_action: "Keeps it out of suggestions everywhere (a global thumbs-down) — you decide",
    });
  }

  for (const [key, finding] of findings.external) {
    if (!meets(finding, PROPOSAL_THRESHOLDS.external_play_positive)) continue;
    const kind = externalKind.get(key) ?? "track";
    const name = kind === "artist" ? key : label(key);
    proposals.push({
      id: proposalId("external_play_positive", key),
      kind: "external_play_positive",
      subject: key,
      subject_type: kind,
      thesis: `Your other apps keep playing ${name} — ${finding.epochs.size} sessions across ${finding.dates.size} days.`,
      evidence: evidenceOf(finding),
      suggested_action: kind === "artist"
        ? "Records your decision — no automatic change; follow the artist from the Library"
        : "Adds a global thumbs-up — future lists weigh it in",
    });
  }

  for (const [t, finding] of findings.repeat) {
    if (!meets(finding, PROPOSAL_THRESHOLDS.repeat_positive)) continue;
    proposals.push({
      id: proposalId("repeat_positive", t),
      kind: "repeat_positive",
      subject: t,
      subject_type: "track",
      thesis: `You keep coming back to ${label(t)} — replayed in ${finding.epochs.size} sessions across ${finding.dates.size} days.`,
      evidence: evidenceOf(finding),
      suggested_action: "Adds a global thumbs-up — future lists weigh it in",
    });
  }

  proposals.sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0),
  );
  return proposals;
}
