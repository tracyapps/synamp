/**
 * SynAmp brain — HTTP API.
 *
 * Phase 0 skeleton. Deliberately framework-free (node:http) so it runs on a bare
 * Node install with no build step, via native TypeScript type stripping.
 *
 * Architectural rule this file exists to establish: **the server owns the
 * playback session.** Party requests and the DJ display (Phase 6) are thin
 * clients of this state, not owners of it.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.ts";
import { PlaylistError, PlaylistStore } from "./playlists.ts";
import type { CreateNode, TrackRef } from "./playlists.ts";
import { draftPlan } from "./query/draft.ts";
import { evaluatePlan } from "./query/evaluate.ts";
import type { Evaluation, EvaluateOptions } from "./query/evaluate.ts";
import { LibrarySource } from "./query/library.ts";
import { validatePlan } from "./query/plan.ts";
import type { QueryPlan } from "./query/plan.ts";
import { REGISTRY_VERSION, SIGNALS } from "./query/signals.ts";
import { sequenceTracks } from "./query/sequence.ts";
import { interpretGoal } from "./intent/interpret.ts";
import { deriveEpochPolicy } from "./learning/derive.ts";
import type { EpochPolicyView, Proposal } from "./learning/types.ts";
import { EventLog } from "./session/events.ts";
import { deriveFeedback, FeedbackError, recordFeedback } from "./session/feedback.ts";
import type { FeedbackInput, FeedbackView } from "./session/feedback.ts";
import { SessionError, SessionStore } from "./session/session.ts";
import type { Session } from "./session/session.ts";
import { resolveInside, sendFile, StreamSigner } from "./session/stream.ts";
import { LIGHTER_KBPS, lighterAvailable, planLighter, probeSeconds, sendLighter } from "./session/lighter.ts";
import { POLICY_VERSION } from "./session/events.ts";
import type { ListeningEvent } from "./session/events.ts";
import { relativeFromReported, trackIdForPath } from "./subsonic/identity.ts";
import { createSubsonicProxy } from "./subsonic/proxy.ts";
import { MOODS, Radio, RadioError } from "./radio/radio.ts";
import { guestKey, PartyError, PartyStore, RateLimit } from "./party/party.ts";
import type { Station } from "./radio/radio.ts";
import { PlaylistSync, SyncError, syncName } from "./subsonic/playlist-sync.ts";
import type { SyncSource } from "./subsonic/playlist-sync.ts";
import type { CapturedPlay } from "./subsonic/proxy.ts";
import { LastfmClient, LastfmError } from "./lastfm/client.ts";
import { RuntimeSettings, SettingsError } from "./settings.ts";
import { VersionCheck } from "./version.ts";
import { SpotCheckError, SpotChecks } from "./library/spotcheck.ts";
import { otherAppPlays, pingCore, SetupError, SetupStore } from "./setup.ts";
import { Scrobbler } from "./lastfm/scrobbler.ts";
import { AnalysisStatus, HealthError, libraryStats } from "./library/health.ts";
import { albumFolder, groupAlbums } from "./library/albums.ts";
import { ImportError, matchPlaylists, parsePlaylistFile } from "./library/playlist-import.ts";
import type { MatchedPlaylist } from "./library/playlist-import.ts";
import { albumTracks, BrowseError, listAlbums, searchTracks, shuffled, trackSummary } from "./library/browse.ts";
import { explore } from "./library/explore.ts";
import { galaxy, galaxyArtist, galaxyRandom } from "./library/galaxy.ts";
import { AlbumMatches, chooseRelease, Matcher, MissingError, MissingNotes, missingCsv, missingList } from "./library/missing.ts";
import { MusicBrainz, MusicBrainzError } from "./library/musicbrainz.ts";
import { buildPlan, carryMatches, OrganiseError, OrganiseStore, PathOverlay } from "./library/organise.ts";
import { AUDIO_EXTENSIONS, buildImport, COMPANION_EXTENSIONS, IncomingScanner, PART_SUFFIX, WEB_FOLDER } from "./library/import.ts";
import { isSafeRelative } from "./library/naming.ts";
import { AnalyzerControl, AnalyzerError } from "./library/analyzer.ts";
import { artistStats, chooseArtist, DiscographyChecker, DiscographyError, discographyReport, DiscographyStore } from "./library/discography.ts";
import type { ArtistStat } from "./library/discography.ts";
import { open as openFile, mkdir, rename as renameFile, unlink, stat as statFile } from "node:fs/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { posix } from "node:path";
import type { Decision } from "./library/organise.ts";

const STARTED_AT = Date.now();
const library = new LibrarySource(config.librarySignalsPath);
const dataDir = dirname(config.playlistDataPath);
const events = new EventLog(config.eventsPath || join(dataDir, "events.jsonl"));
const sessions = new SessionStore(config.sessionPath || join(dataDir, "session.json"), events);
const signer = new StreamSigner(config.playlistApiToken || undefined);
const analysisStatus = new AnalysisStatus(join(dataDir, "analysis-status.json"));
const albumMatches = new AlbumMatches(join(dataDir, "albums.json"));
const missingNotes = new MissingNotes(join(dataDir, "missing-notes.json"));
/** Settings changed in the web app (Settings panel); deploy/.env gives the starting values. */
const runtime = new RuntimeSettings(join(dataDir, "settings.json"), {
  musicbrainzContact: config.musicbrainzContact, lastfmApiKey: config.lastfmApiKey, lastfmApiSecret: config.lastfmApiSecret,
  publicUrl: config.publicUrl, uploadMaxMb: Math.round(config.uploadMaxBytes / 1048576), listeningPolicy: "epoch-v1",
});
/** Which code is running, and whether a newer copy on the NAS is waiting for Build. */
const versionCheck = new VersionCheck(config.buildInfoPath, config.sourcePath);
/** One client for the whole process, so every MusicBrainz request shares one rate limit. */
let musicbrainz: MusicBrainz | undefined;
const mbClient = () => (musicbrainz ??= new MusicBrainz({ contact: runtime.musicbrainzContact }));
const organise = new OrganiseStore(join(dataDir, "organise.json"));
/** Moved files keep working before the analyzer re-exports (see PathOverlay). */
const overlay = new PathOverlay(join(dataDir, "organise-moves.jsonl"), config.libraryPath);
/** "Listen anywhere": the Phase 1 checklist (Navidrome, Tailscale, apps). */
const setup = new SetupStore(join(dataDir, "setup.json"));

// --- your playlists in your phone apps (Navidrome) ------------------------------
const phonePlaylists = new PlaylistSync(join(dataDir, "phone-playlists.json"), { coreUrl: config.coreUrl, coreMusicPath: config.coreMusicPath });
/** Every playlist, roll-up and smart playlist, with its current tracks. Folders only lend their names. */
function phoneSources(): SyncSource[] {
  const nodes = playlists.list();
  return nodes.filter((node) => node.type !== "folder").flatMap((node) => {
    // Radio stations stay in SynAmp: Subsonic playlists only hold songs.
    try { return [{ id: node.id, name: syncName(nodes, node.id), trackIds: playlists.resolve(node.id).filter((track) => !track.id.startsWith("radio:")).map((track) => library.canonicalId(track.id)) }]; }
    catch { return []; } // e.g. a smart playlist while the library list is missing
  });
}
function sendPhonePlaylists() {
  return phonePlaylists.sync(phoneSources(), currentLibrary().version, (relative) => library.idForPath(relative) ?? trackIdForPath(relative));
}
let phoneTimer: NodeJS.Timeout | undefined;

// --- party mode ---------------------------------------------------------------------
const party = new PartyStore(join(dataDir, "party.json"));
const partySearchLimit = new RateLimit(40);
const partyWriteLimit = new RateLimit(20);
const clientAddress = (req: IncomingMessage) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim() || req.socket.remoteAddress || "?";
/** What everyone at the party can see: now playing, the next few, and the requests. */
function partyGuestView(code: string, guest?: string) {
  const p = party.forCode(code);
  const s = sessions.get();
  const now = s.queue[s.index];
  const brief = (entry: { title: string; artist?: string; requested_by?: string }) => ({ title: entry.title, ...(entry.artist ? { artist: entry.artist } : {}), ...(entry.requested_by ? { requested_by: entry.requested_by } : {}) });
  return {
    code: p.code, auto_add: p.auto_add,
    now: now ? { ...brief(now), playing: s.state === "playing" } : null,
    next: s.queue.slice(s.index + 1, s.index + 6).map(brief),
    requests: party.guestRequests(guest),
  };
}
function partyHostView() {
  const p = party.party;
  return {
    party: p ? { code: p.code, started_at: p.started_at, auto_add: p.auto_add } : null,
    requests: p ? party.waiting().map(({ guest, votes, ...item }) => ({ ...item, votes: votes.length })) : [],
    address: runtime.publicUrl || "",
  };
}
/** Queue a request: "Play next" from the host, or behind the other requests when they add themselves. */
function queueRequest(request: { id: string; track_id: string; title: string; artist?: string; name?: string }, afterRequests: boolean) {
  const session = sessions.playNext(`party-${request.id}`, [{ id: request.track_id, title: request.title, ...(request.artist ? { artist: request.artist } : {}), requested_by: request.name || "a guest" }], { afterRequests });
  party.decide(request.id, "queued");
  return session;
}

// --- world radio --------------------------------------------------------------------
const radio = new Radio(join(dataDir, "radio.json"));
/** A signed, expiring link the <audio> element can play (it can't send the access token). */
function radioListenUrl(id: string): string {
  const signed = signer.url(`radio:${id}`);
  return `/api/v1/listen/radio/${encodeURIComponent(id)}${signed.slice(signed.indexOf("?"))}`;
}
const withListen = (station: Station) => ({ ...station, listen_url: radioListenUrl(station.id) });

// --- bringing old playlists across: read + match now, create on "Import" -------
const pendingImports = new Map<string, { at: number; source: string; playlists: MatchedPlaylist[] }>();
async function rawText(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ImportError(`That file is over ${Math.round(limit / 1048576)} MB`, 413);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function importSummary(id: string) {
  const pending = pendingImports.get(id)!;
  return {
    import_id: id, source: pending.source,
    playlists: pending.playlists.map((item) => ({
      key: item.key, name: item.name, total: item.total, found: item.tracks.length, missing: item.missing.slice(0, 200), missing_count: item.missing.length,
      ...(item.parent ? { parent: item.parent } : {}), ...(item.folder ? { folder: true } : {}), ...(item.smart ? { smart: true } : {}),
    })),
  };
}
/** Make the chosen playlists (and their iTunes folders) inside a new folder. */
function createImported(id: string, keys: unknown, folderName: unknown) {
  const pending = pendingImports.get(id);
  if (!pending) throw new ImportError("That import has expired — choose the file again", 410);
  if (!Array.isArray(keys) || !keys.length) throw new ImportError("Choose at least one playlist");
  const chosen = new Set(keys.map(String));
  const name = typeof folderName === "string" && folderName.trim() ? folderName.trim().slice(0, 120) : "";
  const root = name ? playlists.create({ type: "folder", name, parentId: null }).id : null;
  const made = new Map<string, string>();
  let lists = 0, songs = 0;
  const byKey = new Map(pending.playlists.map((item) => [item.key, item]));
  /** Its nearest chosen folder, so the iTunes folder structure carries over. */
  const parentOf = (item: MatchedPlaylist): string | null => {
    let parent = item.parent ? byKey.get(item.parent) : undefined;
    while (parent && !chosen.has(parent.key)) parent = parent.parent ? byKey.get(parent.parent) : undefined;
    return parent ? ensure(parent) : root;
  };
  const ensure = (item: MatchedPlaylist): string => {
    const existing = made.get(item.key);
    if (existing) return existing;
    const parentId = parentOf(item);
    const node = playlists.create({ type: item.folder ? "folder" : "playlist", name: item.name, parentId });
    made.set(item.key, node.id);
    if (!item.folder) { playlists.addTracks(node.id, item.tracks); lists++; songs += item.tracks.length; }
    return node.id;
  };
  for (const item of pending.playlists) if (chosen.has(item.key)) ensure(item);
  playlistsChanged();
  return { created: lists, songs, folder_id: root };
}
setInterval(() => { for (const [id, item] of pendingImports) if (Date.now() - item.at > 60 * 60_000) pendingImports.delete(id); }, 10 * 60_000).unref();
/** After a change, send soon (changes usually come in bursts); never while signed out or switched off. */
function playlistsChanged(delayMs = 15_000) {
  if (!phonePlaylists.signedIn || !phonePlaylists.state.auto) return;
  clearTimeout(phoneTimer);
  phoneTimer = setTimeout(() => { sendPhonePlaylists()?.catch((error) => console.warn(`phone playlists: ${(error as Error).message}`)); }, delayMs);
}
// Smart playlists change as the library does, so send them every half hour too.
setInterval(() => playlistsChanged(0), 30 * 60_000).unref();
/** Tempo checks you made in "Check the measurements": answers and corrections. */
const spotChecks = new SpotChecks(join(dataDir, "spotchecks.json"));
/** As analysed (moved files followed), before your tempo corrections. */
function measuredLibrary() { return overlay.apply(library.get()); }
function currentLibrary() { return spotChecks.apply(measuredLibrary()); }
/** The analyzer on the Mac takes its orders from here (Library strip buttons). */
const analyzerControl = new AnalyzerControl(join(dataDir, "analyzer-control.json"));
/** Discography gaps: artists you love, what they released, what you don't have. */
const discography = new DiscographyStore(join(dataDir, "discography.json"));
let statsCache: { key: string; stats: ArtistStat[] } | undefined;
function stats(): ArtistStat[] {
  const lib = currentLibrary();
  const key = `${lib.version}|${events.all().length}`;
  if (statsCache?.key !== key) statsCache = { key, stats: artistStats(lib, events.all(), (id) => library.canonicalId(id)) };
  return statsCache.stats;
}
const discographyChecker = new DiscographyChecker(discography, mbClient, stats, () => albumMatches.records);
function discographyView() {
  return {
    ...discographyReport(currentLibrary(), stats(), discography, albumMatches.records),
    settings: discography.state.settings,
    checker: { state: discographyChecker.state, current: discographyChecker.current, done_this_run: discographyChecker.done, last_error: discographyChecker.lastError, contact_set: !!runtime.musicbrainzContact },
  };
}
const statFor = (key: unknown) => {
  const found = stats().find((stat) => stat.key === key);
  if (!found) throw new DiscographyError("No artist with that key in the library", 404);
  return found;
};
/** New music waiting in incoming/ (import is off when INCOMING_PATH isn't set). */
const incoming = config.incomingPath ? new IncomingScanner(config.incomingPath) : undefined;
const matcher = new Matcher(albumMatches, mbClient, () => currentLibrary());
function matcherView() {
  return {
    state: matcher.state, current: matcher.current, done_this_run: matcher.done, last_error: matcher.lastError,
    waiting: albumMatches.due(groupAlbums(currentLibrary())).length, contact_set: !!runtime.musicbrainzContact,
  };
}
const lastfmClient = () => runtime.lastfmApiKey && runtime.lastfmApiSecret
  ? new LastfmClient({ apiKey: runtime.lastfmApiKey, secret: runtime.lastfmApiSecret }) : undefined;
const scrobbler = new Scrobbler(config.lastfmStatePath || join(dataDir, "lastfm.json"), lastfmClient());
// Saved in Settings: picked up straight away, no restart.
runtime.onChange = (changed) => {
  if (changed.includes("musicbrainz_contact")) musicbrainz = undefined;
  if (changed.includes("lastfm_api_key") || changed.includes("lastfm_api_secret")) scrobbler.setClient(lastfmClient());
};

/** After new events: tell Last.fm what's playing now, and send finished plays soon. */
let flushTimer: NodeJS.Timeout | undefined;
function afterEvents(added: readonly ListeningEvent[]): void {
  if (!scrobbler.configured) return;
  const lib = currentLibrary();
  for (const event of added) {
    if (event.signal === "started") {
      const track = lib.tracks.find((item) => item.id === event.track_id);
      if (track?.metadata_source === "tags" && track.artist) {
        void scrobbler.nowPlaying({ artist: track.artist, track: track.title, ...(track.album ? { album: track.album } : {}) });
      }
    }
    if (event.signal === "now_playing" && typeof event.detail?.title === "string" && typeof event.detail?.artist === "string") {
      void scrobbler.nowPlaying({ artist: event.detail.artist, track: event.detail.title, ...(typeof event.detail.album === "string" ? { album: event.detail.album } : {}) });
    }
  }
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { void scrobbler.flush(events.all(), currentLibrary()); }, 5_000);
}
setInterval(() => { void scrobbler.flush(events.all(), currentLibrary()).catch((error) => console.error("Last.fm flush failed", error)); }, 60_000).unref();

/** Plays reported by other Subsonic apps, mapped onto library IDs by real path. */
function recordCaptured(plays: CapturedPlay[]): void {
  const added: ListeningEvent[] = [];
  for (const play of plays) {
    const relative = relativeFromReported(play.song?.path, config.coreMusicPath);
    // Look the path up first: a moved track keeps its original ID, which hashing the new path would miss.
    const trackId = relative ? (overlay.idForPath(relative, library.get()) ?? library.idForPath(relative) ?? trackIdForPath(relative)) : `subsonic:${play.songId}`;
    const when = play.time ?? Date.now();
    const key = `${play.user ?? ""}|${play.client ?? ""}|${play.songId}|${play.submission}|${play.time ?? Math.floor(when / 60_000)}`;
    const id = `${play.submission ? "ext" : "np"}:${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
    const detail: Record<string, string | number | boolean> = { mapped: !!relative, subsonic_id: play.songId, played_at: when };
    if (play.client) detail.client = play.client;
    if (play.song?.title) detail.title = play.song.title;
    if (play.song?.artist) detail.artist = play.song.artist;
    if (play.song?.album) detail.album = play.song.album;
    if (play.song?.duration) detail.duration_s = play.song.duration;
    const result = events.append({
      id, ts: when, signal: play.submission ? "external_play" : "now_playing", track_id: trackId,
      scope: play.submission ? "global" : "none", source: "subsonic", policy_version: POLICY_VERSION, detail,
    });
    if (!result.duplicate) added.push(result.event);
  }
  afterEvents(added);
}
const subsonic = createSubsonicProxy({ coreUrl: config.coreUrl, onPlays: recordCaptured });

function callbackBase(req: IncomingMessage): string {
  if (runtime.publicUrl) return runtime.publicUrl;
  const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0]!.trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0]!.trim();
  return `${proto}://${host}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function sendPage(res: ServerResponse, status: number, title: string, message: string): void {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · SynAmp</title><body style="font:16px/1.6 system-ui;background:#0e0e10;color:#ececec;max-width:36rem;margin:15vh auto;padding:0 20px">
<h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a style="color:#e0a33e" href="/">Back to SynAmp</a></p></body></html>`;
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html), "x-content-type-options": "nosniff" });
  res.end(html);
}

/** Derived feedback for the legacy rollback (`listening_policy = "legacy-v1"`), recomputed only when the log grows. */
let feedbackCache: { size: number; version: string; view: FeedbackView } | undefined;
function feedback(): FeedbackView {
  const size = events.all().length;
  const version = currentLibrary().version;
  if (!feedbackCache || feedbackCache.size !== size || feedbackCache.version !== version) {
    feedbackCache = { size, version, view: deriveFeedback(events.all(), Date.now(), (id) => library.canonicalId(id), "heuristic-v1") };
  }
  return feedbackCache.view;
}

/** The active policy's view carries the epoch surface in epoch mode and nothing extra in legacy mode. */
type ActivePolicyView = FeedbackView & Partial<Pick<EpochPolicyView, "epoch" | "epochHides" | "proposals" | "reliabilityNotes">>;
/**
 * The active learning policy's combined view (decision 3). Epoch mode is derived fresh per
 * call: `now` drives decay and hide expiry, so a view is never cached across time (B2 §6.7;
 * the derivation is O(n) and this scale is small). Legacy mode reuses the cached v1 view.
 */
function activePolicyView(): ActivePolicyView {
  if (runtime.listeningPolicy === "legacy-v1") return feedback();
  return deriveEpochPolicy(events.all(), {
    now: Date.now(),
    library: currentLibrary(),
    canonical: (id) => library.canonicalId(id),
    scopePersistence: "declared",
  });
}
/** EvaluateOptions for the active policy: epoch mode passes the one combined view in both slots. */
function policyOptions(playlistId?: string): EvaluateOptions {
  const view = activePolicyView();
  return {
    feedback: view,
    ...(playlistId !== undefined ? { playlistId } : {}),
    ...(runtime.listeningPolicy === "legacy-v1" ? {} : { adaptive: view }),
  };
}

/** Post-evaluate arc sequencing (B1): strict tier only, synchronous, set-preserving. */
type SequencedEvaluation = Evaluation & { sequencing_applied?: string[] };
function applySequencing(evaluation: Evaluation, plan: QueryPlan): SequencedEvaluation {
  const sequenced = sequenceTracks(evaluation.strict, plan, { library: currentLibrary() });
  return sequenced.applied.length
    ? { ...evaluation, strict: sequenced.tracks, sequencing_applied: sequenced.applied }
    : { ...evaluation, strict: sequenced.tracks };
}

/**
 * Saved plans are re-validated on use, so a registry change that retires a field
 * surfaces as an error instead of a silently different playlist.
 */
function evaluateSaved(plan: unknown, playlistId: string) {
  const checked = validatePlan(plan);
  if (!checked.ok) throw new PlaylistError("This smart playlist's saved plan is no longer valid; re-create it", 409);
  const evaluation = evaluatePlan(checked, currentLibrary(), policyOptions(playlistId));
  return applySequencing(evaluation, checked.plan);
}
const playlists = new PlaylistStore(config.playlistDataPath, {
  // Re-evaluated on every read: a newly analysed track joins without a restart.
  resolveSmart: (plan, _hash, playlistId) => evaluateSaved(plan, playlistId).strict
    .map((track) => ({ id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}) })),
});

// --- the session brain: epoch readout, forget, cross-epoch proposals ---------

/**
 * Decisions on cross-epoch suggestions, kept beside the other app data. The event log
 * is append-only; a decided suggestion is recorded here and filtered from the readout.
 */
class ProposalDecisions {
  private path: string;
  private decisions: Record<string, { action: "accept" | "dismiss"; at: number }>;
  constructor(path: string) {
    this.path = path;
    try {
      const loaded = JSON.parse(readFileSync(path, "utf8")) as { decisions?: Record<string, { action: "accept" | "dismiss"; at: number }> };
      this.decisions = loaded.decisions ?? {};
    } catch { this.decisions = {}; }
  }
  get(id: string): { action: "accept" | "dismiss"; at: number } | undefined { return this.decisions[id]; }
  record(id: string, action: "accept" | "dismiss"): void {
    this.decisions = { ...this.decisions, [id]: { action, at: Date.now() } };
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify({ format: "synamp.brain-proposals/1", decisions: this.decisions }) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }
}
const proposalDecisions = new ProposalDecisions(join(dataDir, "brain-proposals.json"));

/**
 * Accepting a suggestion writes one explicit signal — the suggestion itself changes
 * nothing until confirmed (A3 §3.4). The event id is stable, so a retried accept
 * dedupes instead of double-writing.
 *
 * Log honesty (C2 F3): the event carries NO `reason` — reason codes are user-authored
 * only, and accepting a suggestion is not a statement about why it was wrong.
 * Provenance lives in `detail.proposal_id`.
 */
function applyProposalAccept(proposal: Proposal): void {
  const signal =
    proposal.kind === "track_repeat_skip" || proposal.kind === "not_now_pattern" ? "thumb_down" as const :
    proposal.kind === "repeat_positive" ? "thumb_up" as const :
    proposal.kind === "external_play_positive" && proposal.subject_type === "track" ? "thumb_up" as const :
    null;
  // artist_repeat_skip — and an artist-level external-play suggestion — has no track to
  // stamp: a thumbs event keyed by an artist name could never match a track, so the
  // decision is recorded only and the UI says the fix is a playlist edit / follow.
  if (!signal) return;
  events.append({
    id: `proposal-${proposal.id.replace(/[^A-Za-z0-9_-]/g, "-")}`,
    ts: Date.now(), signal, track_id: proposal.subject, scope: "global",
    session_id: sessions.get().id, source: "server", policy_version: POLICY_VERSION,
    detail: { proposal_id: proposal.id },
  });
}

/**
 * The session-brain readout: active policy, epoch context, hides, undecided proposals,
 * reliability notes, and per-track adjustments for the current queue (≤50, canonical ids).
 */
function brainSessionView() {
  const view = activePolicyView();
  const canonical = (id: string) => library.canonicalId(id);
  const seen = new Set<string>();
  const queueAdjustments: Array<{ track_id: string; playlist_id?: string; value: number; parts: Array<{ label: string; value: number }> }> = [];
  for (const entry of sessions.get().queue.slice(0, 50)) {
    const trackId = canonical(entry.track_id);
    const key = JSON.stringify([trackId, entry.source?.playlist_id ?? null]);
    if (seen.has(key)) continue;
    seen.add(key);
    queueAdjustments.push({ track_id: trackId, ...(entry.source ? { playlist_id: entry.source.playlist_id } : {}), ...view.adjust(trackId, entry.source?.playlist_id) });
  }
  return {
    policy_version: view.policy_version,
    listening_policy: runtime.listeningPolicy,
    events: view.events,
    epoch: view.epoch ?? null,
    hides: view.epochHides ? [...view.epochHides()].sort() : [],
    proposals: (view.proposals ? view.proposals() : []).filter((item) => !proposalDecisions.get(item.id)),
    reliability_notes: view.reliabilityNotes ? view.reliabilityNotes() : [],
    queue_adjustments: queueAdjustments,
  };
}

/** The session as clients see it: each entry says whether it can be streamed, and from where. */
function sessionView(session: Session) {
  const lib = currentLibrary();
  const byId = new Map(lib.tracks.map((track) => [track.id, track]));
  return {
    ...session,
    queue: session.queue.map((entry) => {
      // A radio station saved in a playlist: always "playable", never ends by itself.
      if (entry.track_id.startsWith("radio:")) return { ...entry, playable: true, live: true, stream_url: radioListenUrl(entry.track_id.slice(6)) };
      const track = byId.get(entry.track_id);
      const playable = !!(track?.path && resolveInside(config.libraryPath, track.path));
      // The album folder lets the player play an album straight through instead of crossfading inside it.
      return { ...entry, playable, ...(playable ? { stream_url: signer.url(entry.track_id), album_key: albumFolder(track!.path!) } : {}) };
    }),
  };
}

/**
 * One uploaded file → incoming/_web/<upload>/<path>. Written to a temporary
 * name while it streams, checked (size, and the browser's checksum when it
 * sent one), then renamed into place, so the import never sees half a file.
 */
async function receiveUpload(req: IncomingMessage, url: URL) {
  if (!incoming) throw new OrganiseError("Importing is off: set INCOMING_PATH on the brain", 409);
  const upload = url.searchParams.get("upload") ?? "";
  const relative = url.searchParams.get("path") ?? "";
  if (!/^[a-z0-9-]{6,40}$/.test(upload)) throw new OrganiseError("Bad upload id");
  if (!isSafeRelative(relative) || relative.split("/").length > 8 || relative.split("/").some((part) => part.startsWith("."))) throw new OrganiseError("Bad file path");
  const extension = posix.extname(relative).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension) && !COMPANION_EXTENSIONS.has(extension)) {
    throw new OrganiseError(`Only music files and the artwork, cue sheets or logs that go with them can be added (not ${extension || "this file"})`, 415);
  }
  const declared = Number(req.headers["content-length"] ?? NaN);
  if (declared > runtime.uploadMaxBytes) throw new OrganiseError(`Files over ${Math.round(runtime.uploadMaxBytes / 1048576)} MB aren't accepted`, 413);
  const expected = String(req.headers["x-content-sha256"] ?? "").toLowerCase();
  const target = join(incoming.root, WEB_FOLDER, upload, ...relative.split("/"));
  if (await statFile(target).then(() => true, () => false)) throw new OrganiseError("That file was already uploaded", 409);
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}${PART_SUFFIX}-${randomBytes(4).toString("hex")}`;
  const handle = await openFile(temp, "wx");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      if (bytes > runtime.uploadMaxBytes) throw new OrganiseError(`Files over ${Math.round(runtime.uploadMaxBytes / 1048576)} MB aren't accepted`, 413);
      hash.update(chunk);
      await handle.write(chunk);
    }
    await handle.close();
    const sha256 = hash.digest("hex");
    if (Number.isFinite(declared) && bytes !== declared) throw new OrganiseError("The upload was cut short; try again", 422);
    if (/^[0-9a-f]{64}$/.test(expected) && expected !== sha256) throw new OrganiseError("The file arrived damaged (checksum mismatch); try again", 422);
    await renameFile(temp, target);
    incoming.invalidate();
    return { path: `${WEB_FOLDER}/${upload}/${relative}`, bytes, sha256 };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/** The organise plan, rebuilt only when the library, the matches or the settings change. */
let planCache: { key: string; plan: Decision[] } | undefined;
function organisePlan(): Decision[] {
  const lib = currentLibrary();
  const scan = incoming?.scan();
  const key = `${lib.version}|${albumMatches.revision}|${JSON.stringify(organise.state.settings)}|${scan?.scanned_at ?? 0}|${JSON.stringify(organise.choices)}`;
  if (planCache?.key !== key) {
    const imports = scan ? buildImport(scan, lib, organise.state.settings, { incomingRoot: incoming!.root, libraryRoot: config.libraryPath }) : [];
    planCache = { key, plan: [...imports, ...buildPlan(lib, albumMatches.records, organise.state.settings, organise.choices)] };
  }
  return planCache.plan;
}
function filterPlan(plan: Decision[], query: URLSearchParams): Decision[] {
  const kind = query.get("kind") ?? "all";
  const status = query.get("status") ?? "all";
  const q = (query.get("q") ?? "").trim().toLowerCase();
  return plan.filter((decision) => {
    if (kind !== "all" && decision.kind !== kind) return false;
    const current = organise.statusOf(decision);
    if (status === "conflict" ? !decision.conflicts.length : status === "duplicates" ? !decision.duplicates?.length : status !== "all" && current.status !== status) return false;
    return !q || decision.title.toLowerCase().includes(q) || decision.preview.some((p) => p.from.toLowerCase().includes(q) || p.to.toLowerCase().includes(q));
  });
}
const LIBRARIAN_ONLINE_MS = 90_000;
function organiseView(query: URLSearchParams) {
  const plan = organisePlan();
  const summary = { total: plan.length, proposed: 0, approved: 0, skipped: 0, conflicts: 0, changed: 0, artist: 0, album: 0, import: 0, approved_moves: 0, set_aside: 0 };
  for (const decision of plan) {
    const { status, changed } = organise.statusOf(decision);
    summary[status]++;
    summary[decision.kind]++;
    if (changed) summary.changed++;
    if (decision.conflicts.length) summary.conflicts++;
    summary.set_aside += decision.duplicates?.length ?? 0;
    if (status === "approved" && !decision.conflicts.length) summary.approved_moves += decision.moves.length;
  }
  const matching = filterPlan(plan, query);
  const offset = Math.max(0, Number(query.get("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 25));
  const seen = organise.state.librarian;
  return {
    summary,
    settings: organise.state.settings,
    matching: matching.length,
    offset,
    decisions: matching.slice(offset, offset + limit).map(({ moves, folders: _folders, ...decision }) => ({
      ...decision, ...organise.statusOf(decision as Decision), move_count: moves.length,
      moves: moves.slice(0, 40).map(({ from, to, to_area }) => ({ from, to, ...(to_area ? { to_area } : {}) })),
    })),
    batches: organise.state.batches.slice(0, 10).map((batch) => ({
      ...batch,
      decisions: batch.decisions.map(({ moved, ...decision }) => ({ ...decision, moved_count: moved?.length ?? 0 })),
    })),
    busy: !!organise.busy(),
    progress: organise.progressView(),
    librarian: seen ? { ...seen, online: Date.now() - seen.last_seen < LIBRARIAN_ONLINE_MS } : null,
    pending_export: overlay.count > 0 && measuredLibrary().version !== library.get().version,
    incoming: incoming ? (({ files, arriving, ignored, set_aside, truncated }) => ({ enabled: true, files: files.length, arriving, ignored, set_aside, truncated }))(incoming.scan())
      : { enabled: false },
    upload_max_mb: runtime.uploadMaxMb,
    paused: organise.state.paused ?? null,
  };
}

/** The next track to check (with a link to play it) and how the checks add up so far. */
function spotCheckView() {
  const lib = measuredLibrary();
  const track = spotChecks.next(lib);
  return {
    track: track ? {
      id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}), ...(track.album ? { album: track.album } : {}),
      ...(track.year ? { year: track.year } : {}), ...(track.duration_s ? { duration_s: track.duration_s } : {}),
      bpm: track.signals?.bpm, tempo_confidence: track.signals?.tempo_confidence ?? null,
      stream_url: signer.url(track.id),
    } : null,
    summary: spotChecks.summary(lib),
  };
}

function settingsView() {
  return { settings: runtime.view(), lastfm_configured: scrobbler.configured };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2) + "\n";
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function body(req: IncomingMessage, limit = 256_000): Promise<Record<string, unknown>> {
  let input = "";
  for await (const chunk of req) {
    input += chunk;
    if (input.length > limit) throw new PlaylistError("Request body too large", 413);
  }
  try {
    const value: unknown = JSON.parse(input);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new PlaylistError("Invalid JSON object"); }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  // Subsonic apps: forwarded to the library core as-is; Navidrome does the auth.
  if (url.pathname.startsWith("/rest/")) return subsonic(req, res);

  // The Last.fm sign-in callback is a browser navigation, so it carries no bearer token.
  // The one-time state nonce issued by /lastfm/connect is what authorises it.
  if (path === "/api/v1/lastfm/callback" && req.method === "GET") {
    try {
      const name = await scrobbler.completeConnect(url.searchParams.get("state"), url.searchParams.get("token"));
      return sendPage(res, 200, "Last.fm connected", `Scrobbling is on for ${name}. You can close this tab — plays from now on will be sent.`);
    } catch (error) {
      return sendPage(res, 400, "Last.fm was not connected", (error as Error).message);
    }
  }

  // Streams are not here: <audio> cannot send a bearer token, so they carry a signed, expiring URL instead.
  const protectedPath = ["/api/v1/playlists", "/api/v1/plans", "/api/v1/library", "/api/v1/session", "/api/v1/feedback", "/api/v1/events",
    "/api/v1/lastfm", "/api/v1/listening", "/api/v1/analysis", "/api/v1/missing", "/api/v1/albums",
    "/api/v1/organise", "/api/v1/librarian", "/api/v1/import", "/api/v1/discography", "/api/v1/analyzer", "/api/v1/settings", "/api/v1/system", "/api/v1/spotcheck", "/api/v1/setup", "/api/v1/phone-playlists", "/api/v1/radio", "/api/v1/party-host", "/api/v1/brain"]
    .some((prefix) => path.startsWith(prefix));
  if (protectedPath && config.playlistApiToken &&
      req.headers.authorization !== `Bearer ${config.playlistApiToken}`) {
    return send(res, 401, { error: "unauthorized" });
  }

  const nodePath = path.match(/^\/api\/v1\/playlists\/([^/]+)$/);
  const resolvePath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/resolve$/);
  const tracksPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/tracks$/);
  const trackPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/tracks\/(\d+)$/);
  const explainPath = path.match(/^\/api\/v1\/playlists\/([^/]+)\/explain$/);

  // --- listening: session, reports, feedback, streaming ----------------------
  const streamPath = path.match(/^\/api\/v1\/tracks\/([^/]+)\/stream$/);
  if (streamPath && (req.method === "GET" || req.method === "HEAD")) {
    const trackId = decodeURIComponent(streamPath[1]!);
    if (!signer.verify(trackId, url.searchParams.get("exp"), url.searchParams.get("sig"))) return send(res, 403, { error: "invalid or expired stream link" });
    const track = currentLibrary().tracks.find((item) => item.id === trackId);
    const file = track?.path ? resolveInside(config.libraryPath, track.path) : null;
    if (!file) return send(res, 404, { error: "no audio file for this track" });
    // quality=lighter: a smaller copy for mobile data (the player decides when; see playback-prefs.ts).
    if (url.searchParams.get("quality") === "lighter" && lighterAvailable()) {
      const seconds = track!.duration_s ?? track!.audio_duration_s ?? await probeSeconds(file) ?? undefined;
      const plan = planLighter(file, seconds);
      if (plan.kind === "lighter") return sendLighter(req, res, file, plan);
    }
    return sendFile(req, res, file);
  }
  const radioListen = path.match(/^\/api\/v1\/listen\/radio\/([^/]+)$/);
  if (radioListen && (req.method === "GET" || req.method === "HEAD")) {
    const id = decodeURIComponent(radioListen[1]!);
    if (!signer.verify(`radio:${id}`, url.searchParams.get("exp"), url.searchParams.get("sig"))) return send(res, 403, { error: "invalid or expired stream link" });
    const station = await radio.station(id);
    if (req.method === "GET") radio.countClick(id);
    return radio.relay(req, res, station);
  }
  if (path === "/api/v1/session" && req.method === "GET") return send(res, 200, { session: sessionView(sessions.get()) });
  if (path === "/api/v1/session/queue" && req.method === "POST") {
    const input = await body(req);
    const shuffle = input.shuffle === true;
    const order = <T,>(tracks: T[]) => (shuffle ? shuffled(tracks) : tracks);
    const ref = (track: { id: string; title: string; artist?: string }): TrackRef => ({ id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}) });
    // An album, or some songs picked from the library: no playlist behind them.
    if (typeof input.album_key === "string") {
      const { tracks } = albumTracks(currentLibrary(), input.album_key);
      const session = sessions.replaceQueue(String(input.event_id ?? ""), order(tracks.map(ref)), undefined, Number(input.start_index ?? 0));
      return send(res, 200, { session: sessionView(session) });
    }
    if (Array.isArray(input.track_ids)) {
      const lib = currentLibrary();
      const byId = new Map(lib.tracks.map((track) => [track.id, track]));
      const tracks = input.track_ids.slice(0, 2000).map((id) => byId.get(library.canonicalId(String(id)))).filter((track) => track !== undefined).map(ref);
      const session = sessions.replaceQueue(String(input.event_id ?? ""), order(tracks), undefined, Number(input.start_index ?? 0));
      return send(res, 200, { session: sessionView(session) });
    }
    if (typeof input.playlist_id !== "string") throw new SessionError("playlist_id, album_key or track_ids is required");
    const node = playlists.list().find((item) => item.id === input.playlist_id);
    if (!node) throw new PlaylistError("Playlist node not found", 404);
    // A snapshot: later membership changes do not touch what is queued.
    // Shuffle works on anything, folders included: every playlist inside, mixed together.
    const tracks = order(playlists.resolve(node.id));
    const session = sessions.replaceQueue(String(input.event_id ?? ""), tracks,
      { playlist_id: node.id, ...(node.type === "smart" ? { plan_hash: node.planHash } : {}) }, shuffle ? 0 : Number(input.start_index ?? 0));
    return send(res, 200, { session: sessionView(session) });
  }
  if (path === "/api/v1/session/report" && req.method === "POST") {
    const input = await body(req);
    const result = sessions.report(String(input.event_id ?? ""), input.report);
    afterEvents(result.derived);
    return send(res, 200, { session: sessionView(result.session), derived: result.derived.map((event) => event.signal), duplicate: result.duplicate });
  }
  if (path === "/api/v1/feedback" && req.method === "POST") {
    const input = (await body(req)) as unknown as FeedbackInput;
    const result = recordFeedback(events, { ...input, session_id: input.session_id ?? sessions.get().id });
    // In a hand-made playlist, "remove" also takes the track out of the list itself.
    if (!result.duplicate && input.signal === "remove" && input.playlist_id) {
      const node = playlists.list().find((item) => item.id === input.playlist_id);
      if (node?.type === "playlist") {
        const index = node.tracks.findIndex((track) => track.id === input.track_id);
        if (index >= 0) { playlists.removeTrack(node.id, index); playlistsChanged(); }
      }
    }
    return send(res, result.duplicate ? 200 : 201, { event: result.event, duplicate: result.duplicate });
  }
  // --- library health: analyzer progress (pushed from the Mac) + index stats ---
  if (path === "/api/v1/analysis/progress" && req.method === "POST") {
    const progress = analysisStatus.record(await body(req));
    return send(res, 202, { received: progress.received_at });
  }
  // --- browsing the library ----------------------------------------------------
  if (path === "/api/v1/library/explore" && req.method === "GET") {
    return send(res, 200, explore(currentLibrary(), Object.fromEntries(url.searchParams)));
  }
  if (path === "/api/v1/library/galaxy" && req.method === "GET") {
    const q = url.searchParams;
    return send(res, 200, galaxy(currentLibrary(), { q: q.get("q") ?? "", sort: q.get("sort") ?? "", offset: Number(q.get("offset") ?? 0), limit: Number(q.get("limit") ?? 60) }));
  }
  if (path === "/api/v1/library/galaxy/artist" && req.method === "GET") {
    return send(res, 200, galaxyArtist(currentLibrary(), url.searchParams.get("key") ?? ""));
  }
  if (path === "/api/v1/library/galaxy/random" && req.method === "GET") {
    return send(res, 200, galaxyRandom(currentLibrary(), { q: url.searchParams.get("q") ?? "" }));
  }
  if (path === "/api/v1/library/albums" && req.method === "GET") {
    const q = url.searchParams;
    return send(res, 200, listAlbums(currentLibrary(), { q: q.get("q") ?? "", sort: q.get("sort") ?? "", offset: Number(q.get("offset") ?? 0), limit: Number(q.get("limit") ?? 60) }));
  }
  if (path === "/api/v1/library/album" && req.method === "GET") {
    const { album, tracks } = albumTracks(currentLibrary(), url.searchParams.get("key") ?? "");
    return send(res, 200, { album, tracks: tracks.map(trackSummary) });
  }
  if (path === "/api/v1/library/search" && req.method === "GET") {
    return send(res, 200, searchTracks(currentLibrary(), url.searchParams.get("q") ?? "", Number(url.searchParams.get("limit") ?? 50)));
  }
  if (path === "/api/v1/library/health" && req.method === "GET") {
    return send(res, 200, { analysis: analysisStatus.view(), library: libraryStats(currentLibrary()) });
  }
  // --- missing tracks (read-only toward the music) ----------------------------
  if (path === "/api/v1/missing" && req.method === "GET") {
    return send(res, 200, { ...missingList(currentLibrary(), albumMatches, missingNotes), matcher: matcherView() });
  }
  if (path === "/api/v1/missing.csv" && req.method === "GET") {
    const csv = missingCsv(missingList(currentLibrary(), albumMatches, missingNotes).rows);
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="synamp-missing-tracks.csv"',
      "content-length": Buffer.byteLength(csv) });
    return void res.end(csv);
  }
  const missingItem = path.match(/^\/api\/v1\/missing\/([0-9a-f-]{36}:\d{1,2}-\d{1,3})$/);
  if (missingItem && req.method === "POST") {
    return send(res, 200, { note: missingNotes.update(missingItem[1]!, await body(req)) });
  }
  if (path === "/api/v1/missing/match" && req.method === "POST") {
    const input = await body(req);
    if (input.action === "start") {
      const run = matcher.start();
      run?.catch((error) => console.error("Album matching stopped", error));
    } else if (input.action === "pause") matcher.pause();
    else throw new MissingError('action must be "start" or "pause"');
    return send(res, 200, { matcher: matcherView() });
  }
  const unitFor = (key: unknown) => {
    const unit = groupAlbums(currentLibrary()).find((item) => item.key === key);
    if (!unit) throw new MissingError("No album folder with that key", 404);
    return unit;
  };
  if (path === "/api/v1/albums/record" && req.method === "GET") {
    const unit = unitFor(url.searchParams.get("key"));
    return send(res, 200, { album: { key: unit.key, title: unit.title, artist: unit.artist, tracks: unit.tracks.length }, record: albumMatches.records[unit.key] ?? null });
  }
  if (path === "/api/v1/albums/search" && req.method === "POST") {
    const input = await body(req);
    const unit = unitFor(input.key);
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 200) : unit.title;
    const artist = typeof input.artist === "string" ? input.artist.trim().slice(0, 200) : unit.artist;
    return send(res, 200, { candidates: await mbClient().searchReleases(title, artist || undefined) });
  }
  if (path === "/api/v1/albums/choose" && req.method === "POST") {
    const input = await body(req);
    const releaseId = input.release_id === null ? null : String(input.release_id ?? "");
    return send(res, 200, { record: await chooseRelease(albumMatches, unitFor(input.key), releaseId, mbClient()) });
  }

  // --- the analyzer on the Mac: buttons in the web app, a worker that asks for work ---
  if (path === "/api/v1/analyzer" && req.method === "GET") return send(res, 200, analyzerControl.view());
  if (path === "/api/v1/analyzer/request" && req.method === "POST") {
    analyzerControl.request((await body(req)).action);
    return send(res, 202, analyzerControl.view());
  }
  if (path === "/api/v1/analyzer/stop" && req.method === "POST") {
    analyzerControl.stop();
    return send(res, 200, analyzerControl.view());
  }
  if (path === "/api/v1/analyzer/settings" && req.method === "POST") {
    analyzerControl.setSettings(await body(req));
    return send(res, 200, analyzerControl.view());
  }
  if (path === "/api/v1/analyzer/claim" && req.method === "POST") {
    const input = await body(req);
    return send(res, 200, { command: analyzerControl.claim(input.worker) });
  }
  const analyzerCheck = path.match(/^\/api\/v1\/analyzer\/commands\/(a_[0-9a-f]{12})\/check$/);
  if (analyzerCheck && req.method === "POST") return send(res, 200, analyzerControl.check(analyzerCheck[1]!));
  const analyzerDone = path.match(/^\/api\/v1\/analyzer\/commands\/(a_[0-9a-f]{12})$/);
  if (analyzerDone && req.method === "POST") {
    const command = analyzerControl.complete(analyzerDone[1]!, await body(req));
    if (command.status === "done") incoming?.invalidate();
    return send(res, 200, { command });
  }

  // --- discography gaps (read-only toward the music) --------------------------
  if (path === "/api/v1/discography" && req.method === "GET") return send(res, 200, discographyView());
  if (path === "/api/v1/discography/artists" && req.method === "GET") {
    // Every library artist, for "follow someone": filtered by name, best first.
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const followed = new Set(discography.followed(stats()).map((s) => s.key));
    const list = stats().filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 40)
      .map((s) => ({ ...s, followed: followed.has(s.key), status: discography.state.artists[s.key]?.status ?? null }));
    return send(res, 200, { artists: list, total: stats().length });
  }
  if (path === "/api/v1/discography/follow" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.follow !== "boolean") throw new DiscographyError("follow must be true or false");
    discography.follow(statFor(input.key).key, input.follow, stats());
    return send(res, 200, discographyView());
  }
  if (path === "/api/v1/discography/check" && req.method === "POST") {
    const input = await body(req);
    if (input.action === "start") discographyChecker.start()?.catch((error) => console.error("Discography check stopped", error));
    else if (input.action === "pause") discographyChecker.pause();
    else throw new DiscographyError('action must be "start" or "pause"');
    return send(res, 200, discographyView());
  }
  if (path === "/api/v1/discography/choose" && req.method === "POST") {
    const input = await body(req);
    await chooseArtist(discography, statFor(input.key), input.mbid === null ? null : String(input.mbid ?? ""), mbClient());
    return send(res, 200, discographyView());
  }
  if (path === "/api/v1/discography/search" && req.method === "POST") {
    const input = await body(req);
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 200) : statFor(input.key).name;
    const record = discography.state.artists[statFor(input.key).key];
    const candidates = await mbClient().searchArtists(name);
    // Remember them, so picking one can name it.
    discography.set({ ...(record ?? { key: statFor(input.key).key, name: statFor(input.key).name, checked_at: Date.now() }), status: "needs_choice", candidates });
    return send(res, 200, { candidates });
  }
  if (path === "/api/v1/discography/note" && req.method === "POST") {
    const input = await body(req);
    discography.note(String(input.id ?? ""), input.status as "want");
    return send(res, 200, discographyView());
  }
  if (path === "/api/v1/discography/settings" && req.method === "POST") {
    discography.setSettings(await body(req));
    return send(res, 200, discographyView());
  }

  // --- this install: version, and whether an update is waiting for Build -------
  if (path === "/api/v1/system" && req.method === "GET") {
    return send(res, 200, { version: versionCheck.view(Date.now(), url.searchParams.has("fresh") ? 0 : 60_000) });
  }

  // --- listen anywhere: the Phase 1 checklist ------------------------------------
  if (path === "/api/v1/setup" && (req.method === "GET" || req.method === "POST")) {
    if (req.method === "POST") setup.update(await body(req));
    return send(res, 200, {
      ...setup.state,
      checks: { navidrome: await pingCore(config.coreUrl), other_apps: otherAppPlays(events.all()) },
    });
  }

  // --- check the measurements (tempo) ----------------------------------------------
  if (path === "/api/v1/spotcheck" && req.method === "GET") return send(res, 200, spotCheckView());
  if (path === "/api/v1/spotcheck" && req.method === "POST") {
    const input = await body(req);
    const track = measuredLibrary().tracks.find((item) => item.id === input.track_id);
    if (!track) throw new SpotCheckError("No track with that id", 404);
    const check = spotChecks.record(track, input);
    return send(res, 200, { checked: { id: track.id, ...check }, ...spotCheckView() });
  }
  if (path === "/api/v1/spotcheck/forget" && req.method === "POST") {
    spotChecks.forget(String((await body(req)).track_id ?? ""));
    return send(res, 200, spotCheckView());
  }

  // --- settings changed in the web app ----------------------------------------
  if (path === "/api/v1/settings" && req.method === "GET") {
    return send(res, 200, settingsView());
  }
  if (path === "/api/v1/settings" && req.method === "POST") {
    const changed = runtime.update(await body(req));
    return send(res, 200, { changed, ...settingsView() });
  }

  // --- organise: the brain proposes, the owner approves, the librarian applies ---
  if (path === "/api/v1/organise" && req.method === "GET") {
    return send(res, 200, organiseView(url.searchParams));
  }
  if (path === "/api/v1/organise/review" && req.method === "POST") {
    const input = await body(req);
    const status = input.status;
    if (status !== "approved" && status !== "skipped" && status !== "proposed") throw new OrganiseError('status must be "approved", "skipped" or "proposed"');
    const plan = organisePlan();
    let chosen: Decision[];
    if (Array.isArray(input.ids)) {
      const ids = new Set(input.ids.slice(0, 10_000).map(String));
      chosen = plan.filter((decision) => ids.has(decision.id));
    } else if (input.filter && typeof input.filter === "object") {
      // "Approve everything shown": the same filter the list uses, applied to the whole plan.
      const filter = new URLSearchParams(Object.entries(input.filter as Record<string, unknown>).map(([k, v]): [string, string] => [k, String(v)]));
      chosen = filterPlan(plan, filter);
    } else throw new OrganiseError("Send ids, or a filter");
    // Decisions with conflicts can be skipped, but not approved.
    if (status === "approved") chosen = chosen.filter((decision) => !decision.conflicts.length);
    return send(res, 200, { reviewed: organise.review(chosen, status), ...organiseView(url.searchParams) });
  }
  if (path === "/api/v1/organise/settings" && req.method === "POST") {
    organise.setSettings(await body(req));
    return send(res, 200, organiseView(url.searchParams));
  }
  if (path === "/api/v1/organise/keep" && req.method === "POST") {
    // "Keep this one instead" on a pair of duplicate copies.
    const input = await body(req);
    const found = organisePlan().flatMap((d) => d.duplicates ?? []).find((p) => p.pair === input.pair);
    if (!found) throw new OrganiseError("That pair of copies isn't in the plan any more", 404);
    if (input.keep !== null && input.keep !== found.keep.id && input.keep !== found.aside.id) throw new OrganiseError("keep must be one of the two copies");
    organise.choose(input.pair, input.keep);
    return send(res, 200, organiseView(url.searchParams));
  }
  if (path === "/api/v1/organise/pause" && req.method === "POST") {
    organise.setPaused((await body(req)).paused);
    return send(res, 200, organiseView(url.searchParams));
  }
  if (path === "/api/v1/organise/apply" && req.method === "POST") {
    const batch = organise.apply(organisePlan());
    return send(res, 202, { batch, ...organiseView(url.searchParams) });
  }
  if (path === "/api/v1/organise/undo" && req.method === "POST") {
    const batch = organise.undo(String((await body(req)).batch ?? ""));
    return send(res, 202, { batch, ...organiseView(url.searchParams) });
  }
  // Web drag-and-drop: one file per request, streamed into incoming/_web/<upload>/ (never the library).
  if (path === "/api/v1/import/upload" && req.method === "PUT") {
    return send(res, 201, await receiveUpload(req, url));
  }
  if (path === "/api/v1/import/rescan" && req.method === "POST") {
    incoming?.invalidate();
    return send(res, 200, organiseView(url.searchParams));
  }
  // The librarian (the only process that writes to the music) asks for work and reports back.
  if (path === "/api/v1/librarian/claim" && req.method === "POST") {
    const input = await body(req);
    const about = (input.librarian && typeof input.librarian === "object" ? input.librarian : {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 300) : undefined);
    const job = organise.claim({
      ...(text(about.version) ? { version: text(about.version) } : {}),
      ...(text(about.root) ? { root: text(about.root) } : {}),
      ...(text(about.incoming) ? { incoming: text(about.incoming) } : {}),
      ...(text(about.journal) !== undefined ? { journal: text(about.journal) } : {}),
    });
    return send(res, 200, { job });
  }
  const librarianProgress = path.match(/^\/api\/v1\/librarian\/jobs\/(j_[0-9a-f]{12})\/progress$/);
  if (librarianProgress && req.method === "POST") {
    organise.progress(librarianProgress[1]!, await body(req));
    return send(res, 202, { ok: true });
  }
  const librarianJob = path.match(/^\/api\/v1\/librarian\/jobs\/(j_[0-9a-f]{12})$/);
  if (librarianJob && req.method === "POST") {
    // A big batch's report lists every file moved: thousands of decisions are megabytes.
    const { job, moved, folders } = organise.complete(librarianJob[1]!, await body(req, 128_000_000));
    overlay.record(moved);
    carryMatches(albumMatches, folders);
    incoming?.invalidate();
    // Files moved: have the analyzer scan and export, so analysis and the library list follow them.
    if (moved.length) analyzerControl.afterLibrarian();
    planCache = undefined;
    return send(res, 200, { job: { id: job.id, status: job.status } });
  }

  // Can this brain make lighter streams (is ffmpeg here)? The Settings screen says so either way.
  if (path === "/api/v1/listening/streams" && req.method === "GET") return send(res, 200, { lighter: lighterAvailable(), kbps: LIGHTER_KBPS });
  if (path === "/api/v1/listening" && req.method === "GET") {
    const external = events.all().filter((event) => event.source === "subsonic");
    const byClient: Record<string, number> = {};
    for (const event of external) if (event.signal === "external_play") {
      const client = String(event.detail?.client ?? "unknown app");
      byClient[client] = (byClient[client] ?? 0) + 1;
    }
    return send(res, 200, {
      other_apps: {
        plays: external.filter((event) => event.signal === "external_play").length,
        unmatched: external.filter((event) => event.signal === "external_play" && event.detail?.mapped === false).length,
        by_client: byClient,
        last_at: external.at(-1)?.ts ?? null,
      },
      lastfm: scrobbler.status(events.all(), currentLibrary()),
    });
  }
  if (path === "/api/v1/lastfm/connect" && req.method === "POST") return send(res, 200, { url: scrobbler.connectUrl(callbackBase(req)) });
  if (path === "/api/v1/lastfm/settings" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.enabled !== "boolean") throw new PlaylistError("enabled must be true or false");
    scrobbler.setEnabled(input.enabled);
    if (input.enabled) afterEvents([]);
    return send(res, 200, { lastfm: scrobbler.status(events.all(), currentLibrary()) });
  }
  if (path === "/api/v1/lastfm/disconnect" && req.method === "POST") {
    scrobbler.disconnect();
    return send(res, 200, { lastfm: scrobbler.status(events.all(), currentLibrary()) });
  }
  if (path === "/api/v1/lastfm/flush" && req.method === "POST") {
    const result = await scrobbler.flush(events.all(), currentLibrary());
    return send(res, 200, { result, lastfm: scrobbler.status(events.all(), currentLibrary()) });
  }
  if (path === "/api/v1/events" && req.method === "GET") {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const visible = events.all().filter((event) => event.signal !== "receipt" && event.signal !== "exposure");
    return send(res, 200, { policy_version: activePolicyView().policy_version, total: visible.length, events: visible.slice(-limit).reverse() });
  }

  // --- the session brain: epoch learning readout, forget, proposals ------------
  if (path === "/api/v1/brain/session" && req.method === "GET") {
    return send(res, 200, brainSessionView());
  }
  if (path === "/api/v1/brain/forget" && req.method === "POST") {
    const input = await body(req);
    const scope = String(input.scope ?? "epoch");
    if (scope !== "epoch") throw new PlaylistError('scope must be "epoch" — the event log is never edited, only marked');
    // Append-only forget (decision 1): the marker bounds the ACTIVE epoch's evidence on the
    // next derivation; loves/thumbs/removes (the explicit cross-epoch channel) survive it.
    events.append({
      id: randomUUID(), ts: Date.now(), signal: "learning_reset", track_id: "", scope: "none",
      session_id: sessions.get().id, source: "server", policy_version: POLICY_VERSION,
      detail: { scope: "epoch" },
    });
    return send(res, 200, brainSessionView());
  }
  if (path === "/api/v1/brain/proposals" && req.method === "POST") {
    const input = await body(req);
    const id = typeof input.id === "string" ? input.id : "";
    const action = input.action;
    if (!id) throw new PlaylistError("id is required");
    if (action !== "accept" && action !== "dismiss") throw new PlaylistError('action must be "accept" or "dismiss"');
    const proposal = (activePolicyView().proposals?.() ?? []).find((item) => item.id === id);
    if (!proposal) throw new PlaylistError("No suggestion with that id", 404);
    const decided = proposalDecisions.get(id);
    if (decided && decided.action !== action) throw new PlaylistError("That suggestion was already decided", 409);
    if (action === "accept") applyProposalAccept(proposal); // idempotent: stable event id
    if (!decided) proposalDecisions.record(id, action);
    return send(res, 200, brainSessionView());
  }

  // --- natural-language plans ---------------------------------------------
  if (path === "/api/v1/plans/draft" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 500) {
      throw new PlaylistError("prompt must be 1–500 characters");
    }
    const lib = currentLibrary();
    const draft = draftPlan(input.prompt, lib);
    // B1: translate the goal language. The chosen reading supersedes the raw draft when the
    // interpreter found one; reading plans stay server-side (only summaries leave).
    const interpretation = interpretGoal(input.prompt, { library: lib, now: Date.now() });
    const chosen = interpretation.chosen_index >= 0 && interpretation.chosen_index < interpretation.readings.length
      ? interpretation.readings[interpretation.chosen_index] : undefined;
    const checked = chosen ? validatePlan(chosen.plan) : validatePlan(draft.plan);
    return send(res, 200, {
      parser: "rule-based draft (no LLM yet)",
      recognized: draft.recognized,
      unparsed: draft.unparsed,
      encoder_text: draft.encoder_text,
      validation: checked,
      interpretation: {
        parser: interpretation.parser,
        accuracy: interpretation.accuracy,
        chosen_index: interpretation.chosen_index,
        readings: interpretation.readings.map((reading, index) => ({
          label: reading.label, confidence: reading.confidence, assumptions: reading.assumptions,
          caveats: reading.caveats, culture_notes: reading.culture_notes,
          chosen: index === interpretation.chosen_index,
        })),
        asks: interpretation.asks,
        audit: interpretation.audit,
      },
      preview: checked.ok ? applySequencing(evaluatePlan(checked, lib, policyOptions()), checked.plan) : null,
    });
  }
  if (path === "/api/v1/plans/evaluate" && req.method === "POST") {
    const checked = validatePlan((await body(req)).plan);
    if (!checked.ok) return send(res, 422, { validation: checked });
    const evaluation = applySequencing(evaluatePlan(checked, currentLibrary(), policyOptions()), checked.plan);
    return send(res, 200, { validation: checked, result: evaluation });
  }
  if (path === "/api/v1/library" && req.method === "GET") {
    const lib = currentLibrary();
    return send(res, 200, { version: lib.version, tracks: lib.tracks.length, rejected: library.rejected, source: config.librarySignalsPath });
  }
  if (path === "/api/v1/plans/fields" && req.method === "GET") {
    return send(res, 200, { registry: REGISTRY_VERSION, fields: [...SIGNALS.values()] });
  }
  if (explainPath && req.method === "GET") {
    const node = playlists.list().find((item) => item.id === explainPath[1]);
    if (!node) throw new PlaylistError("Playlist node not found", 404);
    if (node.type !== "smart") throw new PlaylistError("Only smart playlists have an explanation");
    return send(res, 200, { result: evaluateSaved(node.plan, node.id) });
  }
  if (path === "/api/v1/playlists" && req.method === "GET") {
    return send(res, 200, { nodes: playlists.list() });
  }
  if (path === "/api/v1/playlists" && req.method === "POST") {
    const node = playlists.create((await body(req)) as CreateNode);
    playlistsChanged();
    return send(res, 201, { node });
  }
  if (resolvePath && req.method === "GET") {
    return send(res, 200, { tracks: playlists.resolve(resolvePath[1]!) });
  }
  if (tracksPath && req.method === "POST") {
    const node = playlists.addTrack(tracksPath[1]!, (await body(req)) as TrackRef);
    playlistsChanged();
    return send(res, 201, { node });
  }
  if (trackPath && req.method === "DELETE") {
    const node = playlists.removeTrack(trackPath[1]!, Number(trackPath[2]));
    playlistsChanged();
    return send(res, 200, { node });
  }
  if (nodePath && req.method === "DELETE") {
    playlists.delete(nodePath[1]!);
    playlistsChanged();
    return send(res, 200, { deleted: true });
  }
  // --- party mode: guests (the code is the key) -----------------------------------------
  const partyPath = path.match(/^\/api\/v1\/party\/([A-Za-z0-9]{4,12})(\/search|\/request|\/vote)?$/);
  if (partyPath) {
    const [, code, action] = partyPath;
    const guestHeader = req.headers["x-party-guest"];
    const guest = guestHeader ? guestKey(String(guestHeader)) : undefined;
    if (!action && req.method === "GET") return send(res, 200, partyGuestView(code!, guest));
    if (action === "/search" && req.method === "GET") {
      party.forCode(code!);
      partySearchLimit.check(clientAddress(req));
      const found = searchTracks(currentLibrary(), url.searchParams.get("q") ?? "", 15);
      return send(res, 200, { tracks: found.tracks.map(({ id, title, artist, album }) => ({ id, title, ...(artist ? { artist } : {}), ...(album ? { album } : {}) })) });
    }
    if (action === "/request" && req.method === "POST") {
      if (!guest) throw new PartyError("Reload the party page and try again");
      partyWriteLimit.check(clientAddress(req));
      const input = await body(req, 4_000);
      const track = currentLibrary().tracks.find((item) => item.id === input.track_id && item.path);
      if (!track) throw new PartyError("That song can't be played right now", 404);
      const request = party.request(code!, guest, track, input.name);
      if (party.party?.auto_add && request.status === "waiting") queueRequest(request, true);
      return send(res, 201, partyGuestView(code!, guest));
    }
    if (action === "/vote" && req.method === "POST") {
      if (!guest) throw new PartyError("Reload the party page and try again");
      partyWriteLimit.check(clientAddress(req));
      party.vote(code!, guest, (await body(req, 4_000)).request_id);
      return send(res, 200, partyGuestView(code!, guest));
    }
  }
  // --- party mode: the host --------------------------------------------------------------
  if (path === "/api/v1/party-host" && req.method === "GET") return send(res, 200, partyHostView());
  if (path === "/api/v1/party-host/start" && req.method === "POST") { party.start((await body(req)).auto_add === true); return send(res, 200, partyHostView()); }
  if (path === "/api/v1/party-host/end" && req.method === "POST") { party.end(); return send(res, 200, partyHostView()); }
  if (path === "/api/v1/party-host/settings" && req.method === "POST") { party.setAutoAdd((await body(req)).auto_add); return send(res, 200, partyHostView()); }
  if ((path === "/api/v1/party-host/play-next" || path === "/api/v1/party-host/dismiss") && req.method === "POST") {
    const id = String((await body(req)).id ?? "");
    const request = party.waiting().find((item) => item.id === id);
    if (!request) throw new PartyError("That request isn't waiting any more", 404);
    if (path.endsWith("/dismiss")) party.decide(id, "dismissed");
    else return send(res, 200, { ...partyHostView(), session: sessionView(queueRequest(request, false)) });
    return send(res, 200, partyHostView());
  }
  // --- world radio --------------------------------------------------------------------
  if (path === "/api/v1/radio" && req.method === "GET") return send(res, 200, { favourites: radio.favourites.map(withListen), moods: MOODS });
  if (path === "/api/v1/radio/search" && req.method === "GET") {
    const q = url.searchParams;
    const stations = await radio.search({ q: q.get("q") ?? "", tag: q.get("tag") ?? "", country: q.get("country") ?? "", offset: Number(q.get("offset") ?? 0) });
    return send(res, 200, { stations: stations.map(withListen) });
  }
  if (path === "/api/v1/radio/countries" && req.method === "GET") return send(res, 200, { countries: await radio.countries() });
  if (path === "/api/v1/radio/favourites" && req.method === "POST") {
    radio.addFavourite((await body(req)).id);
    return send(res, 200, { favourites: radio.favourites.map(withListen) });
  }
  if (path === "/api/v1/radio/favourites/remove" && req.method === "POST") {
    radio.removeFavourite((await body(req)).id);
    return send(res, 200, { favourites: radio.favourites.map(withListen) });
  }
  // --- bringing old playlists across -------------------------------------------------
  if (path === "/api/v1/playlists/import" && req.method === "POST") {
    const filename = url.searchParams.get("filename") ?? "";
    const parsed = parsePlaylistFile(await rawText(req, 300 * 1048576), filename);
    const id = randomBytes(9).toString("base64url");
    pendingImports.set(id, { at: Date.now(), source: filename, playlists: matchPlaylists(parsed, currentLibrary()) });
    return send(res, 200, importSummary(id));
  }
  if (path === "/api/v1/playlists/import/create" && req.method === "POST") {
    const input = await body(req);
    return send(res, 201, createImported(String(input.import_id ?? ""), input.keys, input.folder_name));
  }
  // --- your playlists in your phone apps -----------------------------------------
  if (path === "/api/v1/phone-playlists" && req.method === "GET") return send(res, 200, phonePlaylists.view());
  if (path === "/api/v1/phone-playlists/sign-in" && req.method === "POST") {
    const input = await body(req);
    await phonePlaylists.signIn(input.user, input.password);
    await sendPhonePlaylists();
    return send(res, 200, phonePlaylists.view());
  }
  if (path === "/api/v1/phone-playlists/sign-out" && req.method === "POST") {
    phonePlaylists.signOut();
    return send(res, 200, phonePlaylists.view());
  }
  if (path === "/api/v1/phone-playlists/settings" && req.method === "POST") {
    phonePlaylists.setAuto((await body(req)).auto);
    playlistsChanged(0);
    return send(res, 200, phonePlaylists.view());
  }
  if (path === "/api/v1/phone-playlists/send" && req.method === "POST") {
    await sendPhonePlaylists();
    return send(res, 200, phonePlaylists.view());
  }

  switch (path) {
    case "/health":
      return send(res, 200, {
        status: "ok",
        service: "synamp-brain",
        uptimeMs: Date.now() - STARTED_AT,
      });

    default:
      return send(res, 404, { error: "not_found", path });
  }
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    if (error instanceof PlaylistError || error instanceof SessionError || error instanceof FeedbackError) {
      return send(res, error.status, { error: error.message });
    }
    if (error instanceof HealthError || error instanceof MissingError || error instanceof OrganiseError || error instanceof DiscographyError || error instanceof AnalyzerError || error instanceof SettingsError || error instanceof SpotCheckError || error instanceof SetupError || error instanceof BrowseError || error instanceof SyncError || error instanceof ImportError || error instanceof RadioError || error instanceof PartyError) return send(res, error.status, { error: error.message });
    if (error instanceof MusicBrainzError) return send(res, error.status === 400 ? 400 : 502, { error: error.message });
    if (error instanceof LastfmError) return send(res, error.code === -1 ? 400 : 502, { error: error.message });
    console.error("Brain request failed", error);
    send(res, 500, { error: "internal_error" });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`synamp-brain listening on http://${config.host}:${config.port}`);
});

// Stop (Container Manager, docker stop) means stop now. Every store is written
// atomically as it changes, so there is nothing to flush. Without this, Node
// as the container's first process ignores the request and Stop hangs.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`synamp-brain: ${signal}, stopping`);
    server.close();
    setTimeout(() => process.exit(0), 1500).unref();
    server.closeAllConnections?.();
  });
}
