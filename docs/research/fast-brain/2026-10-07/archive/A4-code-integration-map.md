# A4 — Code Integration Map (SynAmp fast-learning-brain)

Status: complete · Author: A4 interface auditor (code risk / interface audit) · Date: 2026-10-06
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD = `b6ea5ce1`, identical to `main`; no task commits exist yet, working tree clean).

---

## Conclusion

- **Baseline is green except two pre-existing, environment-level issues that are NOT regressions:** (1) brain tests: 147/149 pass, 1 fail, 1 skip — the failure is a macOS case-insensitive-filesystem artifact in `librarian.test.ts` (unrelated module), deterministic on re-run and identical on `main`; (2) root `pnpm type-check` stops in the vendored `webamp` package because the raw script skips turbo's declared dependency builds. The two packages the engineering round touches, `@synamp/brain` and `@synamp/web`, both type-check with exit 0.
- **The extension seams named in `plan.md` exist and are clean:** `evaluatePlan` options (`feedback` pattern to copy for `adaptive`), four `evaluatePlan` call sites in `index.ts` (one shared resolve path + preview paths), a single protected-path prefix list to extend, a closed plan schema that must be updated in `plan.ts` if any plan field is added, and strip-types conventions already consistently followed.
- **The biggest correctness trap for the fast-learning feature:** `session.id` is a *server store id minted once* (only when `session.json` is missing; survives restarts, spans days). It is NOT a per-listening epoch. Epoch segmentation must be derived from `ts` continuity gaps (+ daypart) in the learning layer, and several events (Subsonic `external_play`/`now_playing`) carry no `session_id` at all.
- **A durable "forget" cannot edit the event log.** The whole architecture is append-only + pure replay (undo = new event). `POST /api/v1/brain/forget` must be represented as a marker event or an auxiliary store that becomes a derivation input. This needs a mainline decision before B2/B5 wire it.
- **Web readout placement:** the "Session brain" readout belongs as a new panel on the existing **"The Brain" screen** (new `BrainSession.tsx` + `styles/brain.css`, exactly the B5 ownership in plan.md) — not the Describe panel (whose job is goal interpretation / playlist preview) and not the Player bar (transport strip; its feedback row is hidden on ≤820 px). Details + rationale in §2.5.

## Evidence

- Commands run, verbatim: `pnpm --filter @synamp/brain test`; `pnpm --filter @synamp/brain type-check`; `pnpm --filter @synamp/web type-check`; `pnpm type-check` (root); single-file re-run `node --experimental-strip-types --test src/librarian/librarian.test.ts`. Node v24.13.0 on Darwin 25.6 (repo requires ≥22). `node_modules` present (`READY`).
- Files read in full or in extract: `apps/brain/src/{index.ts, config.ts, settings.ts}`, `apps/brain/src/query/{evaluate.ts, plan.ts, draft.ts, library.ts}`, `apps/brain/src/session/{session.ts, events.ts, feedback.ts}`, `apps/brain/src/library/{spotcheck.ts, apply.ts segments, librarian.test.ts segment}`, `apps/web/src/{App.tsx, Describe.tsx, Playlists.tsx segments, Player.tsx segments, api.ts, Listening.tsx}`, `apps/web/src/styles/{tokens.css, describe.css, player.css}`, `apps/brain/package.json`, `apps/web/package.json`, root `package.json`, `turbo.json`, `apps/web/vite.config.ts`.
- Cluster docs read: `.cluster/synamp-fast-brain/CONTEXT.md`, `plan.md`.

## Analysis

Summarised here; the full map with `file:line` references and excerpts is §2, recipes §3, risks §4.

1. The query/session modules are deliberately small and pure; every seam needed by B1/B2 has an adjacent precedent to copy (`EvaluateOptions.feedback`, `deriveFeedback`, the `SpotChecks` cache pattern, `RuntimeSettings.onChange`).
2. `index.ts` is the only integration hub (`route()` if-chain); B5 owns it. New routes are one `if (path === … && req.method === …)` block plus one prefix in `protectedPath`.
3. The four `evaluatePlan` call sites (`evaluateSaved` L335, draft preview L927, evaluate L933; plus `resolveSmart` via `evaluateSaved`) are the only places sequence/adaptive wiring must reach for the API surface to stay consistent.

## Gaps and risks

- Root `pnpm type-check` is red locally (webamp) — receipts must call out the exact per-filter commands instead (§1.2).
- Full brain suite will always show 1 fail on macOS until the librarian case-folding issue is fixed upstream; the engineering round must not "fix" it accidentally, nor be blamed for it (§1.1).
- No CI workflows exist in-repo; there is no remote green to compare against.
- `plan.md` mentions a `BRAIN_DATA_DIR` env var that **does not exist**; scratch-dir runs must use `PLAYLIST_DATA_PATH` (+ `LIBRARY_SIGNALS_PATH`) — recipe in §2.4.
- Forget-endpoint semantics, daypart timezone determinism, and whether `adaptive` gets its own `score_breakdown` field are open (see §5).

## Suggested final-report placement

- Chapter 2 ("the fast learning brain") — readout placement + resolve/preview wiring; cite §2.2/§2.5/§3c.
- Chapter 4 ("verification, handoff, rollback, risks") — baseline numbers, the two environment caveats, landmines §4; raw logs staged under `DELIVERY/verification/` (keep `/tmp/synamp-brain-test.log`, `/tmp/synamp-typecheck.log` or copies).
- `brief.md` — link this memo as the integration appendix for B1/B2/B4/B5; recipes §3 are written to be lifted directly.

---

## 1. Baseline results (exact commands, exact counts)

### 1.1 `pnpm --filter @synamp/brain test`

Command (verbatim): `pnpm --filter @synamp/brain test` (script: `node --experimental-strip-types --test src/*.test.ts src/*/*.test.ts`).

Result: **exit 1. `tests 149 · suites 0 · pass 147 · fail 1 · cancelled 0 · skipped 1 · todo 0 · duration_ms 696.365083`**

Failing test (verbatim from the runner):

```
test at src/librarian/librarian.test.ts:149:1
✖ artist merge: whole folders, everything follows, the variant folder disappears (5.608334ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    [
  +   'Ani Difranco/Dilate/01 Untouchable Face.mp3',
  +   'Ani Difranco/Dilate/folder.jpg',
  +   'Ani Difranco/Evolve/01 Promised Land.mp3',
  +   'Ani Difranco/notes.txt'
  -   'Ani DiFranco/Dilate/01 Untouchable Face.mp3',
  -   'Ani DiFranco/Dilate/folder.jpg',
  -   'Ani DiFranco/Evolve/01 Promised Land.mp3',
  -   'Ani DiFranco/notes.txt'
    ]
      at TestContext.<anonymous> (file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/librarian/librarian.test.ts:162:12)
```

Determinism: re-ran that single file — same failure. Mechanism (traced, Medium-High confidence): the librarian never renames the *directory* for an artist-merge; it performs case-only file moves through a temp name (`apply.ts` `moveOne()` L145–156: `existsSync(to) && sameFile(from,to)` → temp dance) and expects the old folder to be emptied and pruned. On macOS (case-insensitive APFS) the "old" and "new" spellings are the same directory inode, so files keep living in the original spelling and `pruneEmpty` can never remove it; on Linux CI this passes. Pre-existing on `main` (same commit `b6ea5ce1`).
The 1 skipped test is the cross-disk import case `skip: !existsSync("/dev/shm") …` (`librarian.test.ts:250`) — expected skip on macOS.

### 1.2 `pnpm type-check`

Root command (verbatim): `pnpm type-check` → chain `brain && web && webamp && ani-cursor && winamp-eqf`.

- `@synamp/brain` type-check → **exit 0** (no output). Confirmed also standalone: `pnpm --filter @synamp/brain type-check` → exit 0.
- `@synamp/web` type-check → **exit 0** (no output). Confirmed standalone: exit 0.
- `webamp@2.3.1` type-check → **exit 1**; chain stops there (ani-cursor/winamp-eqf never ran). Representative errors, verbatim:

```
js/actionCreators/files.ts:1:33 - error TS2307: Cannot find module 'winamp-eqf' or its corresponding type declarations.
js/components/App.tsx:40:25 - error TS2742: The inferred type of 'App' cannot be named without a reference to '.pnpm/@types+react@19.2.7/node_modules/@types/react'. This is likely not portable. A type annotation is necessary.
js/components/App.tsx:148:8 - error TS2786: 'Css' cannot be used as a JSX component.
js/components/Skin.tsx:10:39 - error TS2307: Cannot find module 'ani-cursor' or its corresponding type declarations.
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  webamp@2.3.1 type-check: `tsc`
```

Why this is structural, not a branch regression: `turbo.json` declares `webamp#type-check` `dependsOn: ["ani-cursor#build", "winamp-eqf#build"]`; the raw root script invokes the filters directly and skips those builds (their `built/` outputs are absent in a fresh checkout). It is untouched by this task (no B-round owns `packages/webamp`). Do not "fix" it; use the two per-filter commands for receipts, or expect `npx turbo run type-check` to pass (not run here to keep the repo read-only — turbo would write `built/` outputs).
No `.github/workflows` exists in the repo, so there is no CI run to cross-check against.

Environment note: node_modules was already installed and ready (`READY`); the mainline's background `pnpm install --frozen-lockfile` did not need to be waited on.

---

## 2. Integration map

### 2.1 `apps/brain/src/index.ts` (1107 lines) — routing anatomy

Everything HTTP lives in one `route(req, res)` if-chain. Structure, in order:

- **Entry**: `async function route(...)` **L511**; URL normalisation L512–513; Subsonic passthrough `/rest/` before anything else; Last.fm browser callback special case (token-free by design, L518–527).
- **Auth gate** — L530–537:

```ts
const protectedPath = ["/api/v1/playlists", "/api/v1/plans", "/api/v1/library", "/api/v1/session", "/api/v1/feedback", "/api/v1/events",
  "/api/v1/lastfm", "/api/v1/listening", "/api/v1/analysis", "/api/v1/missing", "/api/v1/albums",
  "/api/v1/organise", "/api/v1/librarian", "/api/v1/import", "/api/v1/discography", "/api/v1/analyzer", "/api/v1/settings", "/api/v1/system", "/api/v1/spotcheck", "/api/v1/setup", "/api/v1/phone-playlists", "/api/v1/radio", "/api/v1/party-host"]
  .some((prefix) => path.startsWith(prefix));
if (protectedPath && config.playlistApiToken && req.headers.authorization !== `Bearer ${config.playlistApiToken}`) {
  return send(res, 401, { error: "unauthorized" });
}
```

  ⚠️ **New routes MUST add their prefix here** (e.g. `"/api/v1/brain"`). The list is a hard-coded array, easy to miss; miss it and `GET /api/v1/brain/session` is unauthenticated whenever `PLAYLIST_API_TOKEN` is set.
- **Path regexes** L538–542: `nodePath`, `resolvePath`, `tracksPath`, `trackPath`, `explainPath` (+ more inline later: `missingItem`, `analyzerCheck`, `librarianJob`, `partyPath`). Routes are plain `if (path === "…" && req.method === "…")` blocks in rough feature sections (comments `// --- listening…`, `// --- natural-language plans`, …).
- **Helpers** (conventions to reuse):
  - `send(res, status, body)` **L489–497** — JSON, pretty-printed, explicit `content-length`.
  - `body(req, limit = 256_000)` **L498–509** — JSON object only; throws `PlaylistError("Invalid JSON object")`; use a larger `limit` for big payloads (precedent: 128 MB for librarian complete).
  - `sendPage(...)` for HTML one-offs; `rawText()` for uploads.
  - **Error convention**: domain classes carry `status` (e.g. `PlaylistError`, `SessionError`, `FeedbackError`, `SpotCheckError`, `SettingsError`, `RadioError`, `PartyError`, `ImportError`…). Top-level handler **L1080–1091** maps known classes to `{ error: message }` with their status; everything else → `console.error` + 500 `internal_error`. New code should throw an existing class (prefer `PlaylistError`/`SettingsError`) rather than inventing a handler.
- **Store graph** (single-writer: `index.ts` only):
  - L65 `library = new LibrarySource(config.librarySignalsPath)`; L66 `dataDir = dirname(config.playlistDataPath)`; L67 `events = new EventLog(config.eventsPath || join(dataDir,"events.jsonl"))`; L68 `sessions = new SessionStore(config.sessionPath || join(dataDir,"session.json"), events)`.
  - L209 `spotChecks`; L211 `measuredLibrary() = overlay.apply(library.get())`; L212 `currentLibrary() = spotChecks.apply(measuredLibrary())` — **every consumer reads `currentLibrary()`**, so spot corrections + move overlay are always in force.
  - L74 `runtime = new RuntimeSettings(join(dataDir,"settings.json"), {...})`; L250 `runtime.onChange = (changed) => {…}` (picks up MB/Last.fm changes live).
- **Feedback + saved plans**:
  - L319–327 `feedbackCache`/`feedback()` — recompute only when `events.all().length` or `currentLibrary().version` changes; `deriveFeedback(events.all(), Date.now(), (id) => library.canonicalId(id))`. Copy this cache pattern for an `adaptive()` view.
  - L332–336 `evaluateSaved(plan, playlistId)`: **re-validates the saved plan every use**; invalid → `PlaylistError(..., 409)`; then `evaluatePlan(checked, currentLibrary(), { feedback: feedback(), playlistId })`.
  - L337–343 `playlists = new PlaylistStore(config.playlistDataPath, { resolveSmart: (plan,_hash,playlistId) => evaluateSaved(plan,playlistId).strict.map(...) })`. Resolve is **synchronous** (`playlists.ts` L152 `resolve(id, random = Math.random)` → L160 calls `resolveSmart(node.plan, node.planHash, node.id)`). Sequence/adaptive must be sync.
  - `evaluatePlan` call sites in this file: **L335** (resolveSmart/explain), **L927** (draft preview), **L933** (`/plans/evaluate`). Only these three lines + tests call it.
- **Session view**: `sessionView()` L344–363 decorates queue entries (playable/stream_url/album_key/live radio). Extend additively if the readout needs session fields.
- **Representative routes to copy**:
  - GET JSON: `/api/v1/spotcheck` L765 `if (path === "…" && req.method === "GET") return send(res, 200, spotCheckView());`.
  - POST small body: `/api/v1/spotcheck/forget` L773–776 (`String((await body(req)).track_id ?? "")`).
  - POST big body / async work: `/api/v1/plans/draft` L913–929, `/api/v1/plans/evaluate` L930–933; `/api/v1/settings` L779–786.
  - Event log endpoint: `/api/v1/events` L906–910 (hides `receipt`/`exposure`; returns newest-first slice).
- **Boot**: `createServer(...)` L1080; `server.listen(config.port, config.host, …)`; SIGTERM/SIGINT graceful close. **Importing `index.ts` starts a server** — route-level tests therefore use spawned processes or curl smoke (there is no supertest-style harness; `session.test.ts` spins its own tiny `createServer` for stream-signing tests, not the brain's `route`).

### 2.2 `apps/brain/src/query/evaluate.ts` (486 lines) — scoring pipeline & insertion points

Order of work inside `evaluatePlan(validated, library, options)` (**L290**):

1. Exemplar resolution L291–294; **similar channel** L297–305 (top `target*4` by cosine, blind to filters).
2. `run(current)` L307–326: hard guard on filter ∪ similar union.
3. Relaxation ladder L328–337 (only declared steps; protected constraints excluded by the validator).
4. **Hidden (playlist removes)** L339–342: `options.feedback.removed(playlistId)` filtered out of strict before scoring.
5. **Scoring** L344–398; **selection caps + MMR** L401–428; `toResult` L430–438; near-miss L440–451; counts/return L453–486.

The feedback application — the exact pattern an `adaptive` hook should mirror (**L382–392**):

```ts
const scored = pass.strict.map((row) => {
  const s: ... = score(row.track);
  if (options.feedback) {
    const adj = options.feedback.adjust(row.track.id, options.playlistId);
    if (adj.parts.length) {
      const bonus = feedbackBonus(adj.value);              // ±0.15 * tanh(v/2)
      s.breakdown = { base: …, feedback: … };
      s.score += bonus;
      s.reasons.push(`your listening: ${adj.parts.map((part) => `${part.label} (${part.value > 0 ? "+" : ""}${part.value.toFixed(1)})`).join(", ")}`);
    }
  }
  for (const result of row.results) { … }                   // rule reasons
  return { row, ...s };
}).sort((a, b) => b.score - a.score || a.row.track.id.localeCompare(b.row.track.id));   // L398
```

Facts that matter for the adaptive hook:

- **Strict tier only, automatically**: this map runs over `pass.strict`; the near-miss tier is scored later (L445 `const s = score(row.track)`) **without** feedback. An adaptive bonus added in this block is strict-only for free — matching the frozen interface ("strict tier only; reasons merged").
- **Ordering interplay**: bonuses apply **before** the sort (L398) and **before** caps/MMR selection (L401–428). So learning already reorders which tracks survive `max_per_artist`/`max_per_album` and which MMR picks (`value = lambda*score − (1−lambda)*redundancy`, L410–419). Any new bonus changes adjudicated membership, not just order — keep bounds small and documented.
- `EvaluateOptions` L283–287: `{ feedback?: FeedbackView; playlistId?: string }` — add `adaptive?: AdaptiveView` here (additive; existing callers unaffected).
- Near-miss sort L449; near-miss items carry `near_miss.label`; feedback reasons never appear there. If review expects "learning" notes on near misses, that's a mismatch to discuss.
- `toResult` L430–438 dedups reasons via `[...new Set(s.reasons)]`; `score_breakdown` is only included when set. **Web mirror types ignore unknown fields** (see §2.5) — adding a parallel `adaptive` breakdown object is safe server-side; rendering it requires a web edit (B5's file).
- `Evaluation` return L457–486 includes `feedback_policy` only when options.feedback passed; an analogous `adaptive_policy`/epoch field would follow the same conditional-spread style.

### 2.3 `apps/brain/src/session/session.ts` + `events.ts` — session/epoch facts

- **New session id minted in exactly one place**: `SessionStore.fresh()` **L94–97** (`id: randomUUID()`), called **only from the constructor when the session file is missing**. The session is persisted (atomic temp+rename, L103–109) and **restored on restart** (test: "restart restores the session and keeps retries recognised"). **There is no expiry and no rotation** — `updated_at` only. So `session_id` in events is effectively a stable install-level id; **do not treat it as a listening epoch**.
- `Session` fields (L28–38): `id, queue(≤2000), index, state(idle|playing|paused), current{entry_id, played_ms, duration_ms?, started_at}, completed[], updated_at, policy_version`.
- **Classification constants** (L74–90): `EARLY_SKIP_MS = 30_000`; early skip = `playedMs < min(30 s, 25 % duration)`; `PLAY_THROUGH_FRACTION = 0.8` → `full_play`; else `skip_late`. Full play gets **playlist scope**; skips are **session scope** (L237).
- `ListeningEvent` (events.ts L44–62) fields available for epoch segmentation: **`ts` (number, ms)** and **`session_id?: string`** plus `scope/scope_id/entry_id/playlist_id/plan_hash/rank_shown/play_ms/duration_ms/reason/source/policy_version/detail`. `Signal` union L21–38; `Scope` L40 (`global|playlist|session|none`); `POLICY_VERSION = "heuristic-v1"` **L19**.
- **Events missing `session_id`**: Subsonic-captured `external_play`/`now_playing` (index.ts `recordCaptured`, no session_id field); explicit feedback POSTs get one defaulted at the route (`session_id: input.session_id ?? sessions.get().id`, index.ts L598–603). Epoch logic must tolerate gaps and prefer `ts`-gap segmentation; treat missing session_id as its own bucket, not as "same session".
- Append-only mechanics (events.ts): client-supplied `id` dedupe, torn last line skipped, fsync on append. **Nothing is ever edited** — a "forget" must be a new marker/aux input (see §5).
- `POLICY_VERSION` feeds every event's `policy_version` and the feedback view's `policy_version` — bump only when meaning changes; derivations stay pure functions of `(event log, library, config, now)`.

### 2.4 `apps/brain/src/config.ts` — env vars (exact names)

| Env var | Default | Meaning |
|---|---|---|
| `BRAIN_PORT` | `3001` | HTTP port |
| `BRAIN_HOST` | `127.0.0.1` | bind host |
| `PLAYLIST_DATA_PATH` | `./data/playlists.json` | playlist store; **`dataDir = dirname(…)** — every other store defaults beside it |
| `LIBRARY_SIGNALS_PATH` | `./fixtures/library.sample.json` | the analysis export read as the library |
| `EVENTS_PATH` | `""` → `dataDir/events.jsonl` | append-only event log |
| `SESSION_PATH` | `""` → `dataDir/session.json` | server-owned session |
| `LIBRARY_PATH` | `/music` | read-only music root (stream resolution) |
| `CORE_URL` / `CORE_MUSIC_PATH` | `http://core:4533` / `/music` | Navidrome passthrough + path mapping |
| `PLAYLIST_API_TOKEN` | `""` (auth off) | bearer token gate for `/api/v1/*` |
| `UPLOAD_MAX_MB` | `2048` | upload cap |
| `INCOMING_PATH` | `""` (import off) | incoming folder |
| `PUBLIC_URL`, `MUSICBRAINZ_CONTACT`, `LASTFM_API_KEY`, `LASTFM_API_SECRET`, `LASTFM_STATE_PATH`, `DATABASE_URL`, `BUILD_INFO_PATH`, `SOURCE_PATH` | … | as in config.ts |

Stores derived from `dataDir` (all created lazily): `events.jsonl`, `session.json`, `analysis-status.json`, `albums.json`, `missing-notes.json`, `settings.json`, `organise.json`, `organise-moves.jsonl`, `setup.json`, `phone-playlists.json`, `party.json`, `radio.json`, `spotchecks.json`, `analyzer-control.json`, `discography.json`, `lastfm.json`.

**Scratch-dir recipe for tests/smoke** (verified against code):

```sh
cd apps/brain
PLAYLIST_DATA_PATH=/tmp/synamp-scratch/playlists.json \
LIBRARY_SIGNALS_PATH=$PWD/fixtures/library.sample.json \
BRAIN_PORT=3901 BRAIN_HOST=127.0.0.1 \
node --experimental-strip-types src/index.ts
```

Notes: default signal/library paths are **CWD-relative**, so run from `apps/brain` or use absolute paths. `plan.md`'s `BRAIN_DATA_DIR` **does not exist** — use `PLAYLIST_DATA_PATH` as the scratch anchor. `PLAYLIST_API_TOKEN` empty (default) disables auth on loopback; set it for auth-path smoke tests plus `-H "Authorization: Bearer …"`.

### 2.5 `apps/web/src` — where a readout should mount

**App shell** (`App.tsx`, 209 lines): screens are URL-hash-addressed (`ScreenId` L33; `NAV` L34–50 groups Listen/Understand/System); switch L135–198; **the `brain` case L156–162 mounts `<SpotCheck … startOpen/>` + `<Listening …/>`** under `ScreenHead eyebrow="Understand" title="The Brain"` ("What SynAmp has learned from listening to your music and to you…"). Player bar mounts at L204 (sticky, all screens). `makeApi(token)` at L80; `play()` → `POST /session/queue`.

**Describe.tsx** (195 lines): mounted from `Playlists.tsx` **L135** (`<Describe request={request} onSaved={…} />`); posts `/plans/draft` in `preview()` L125–133; renders "What I understood" (recognized → becomes), unparsed text, assumptions, validation errors, and `ResultView` (strict + counts + near-miss + hidden-by-you). **Mirror types are deliberately minimal** (comment L5: "Shapes mirror apps/brain/src/query/evaluate.ts — kept minimal on purpose") — additive API fields are ignored until the mirror + renderer are updated. `ResultView` renders `track.reasons` (which is where the current per-track "your listening: …" feedback sentence appears) and `unverified`; it does **not** render `score_breakdown`.

**api.ts** (57 lines): `makeApi(token)` L15 → `{ call, download, upload }`; `call` prefixes `/api/v1`, adds bearer when present, maps 401 → `AccessError`, non-OK → `Error(data.error …)`.

**Design system**: `styles/tokens.css` — one gold signal (`--gold`/`--accent`, `--gold-hi`, `--gold-wash`), slate surfaces (`--surface`, `--well`), text (`--fg`, `--muted`, `--faint`), semantic inks (`--success-ink`, `--warn-ink`, `--danger-ink`, `--info-ink`, `--lavender-ink`), `--font-display/-sans/-mono`, spaces `--s-1..8`, radii `--r-*`, `--shadow-*`, motion `--dur-*`/`--ease*`; shared classes `.panel`, `.muted`, `.mono`, `.eyebrow`, `.amp`, `.visually-hidden`. `styles/ui.css` — `.btn` (+ `--primary/--coral/--ghost/--quiet/--danger/--sm/--lg`), `.chip`, etc. Panel-specific styles live in one file per feature (`describe.css`, `player.css`, …); `describe.css` classes: `.panel.describe`, `.describe__form/__actions/__out/__understood/__warnings/__parser/__save`, `.rules`, `.smart-result`, `.smart-result__summary`, `.smart-counts`, `.smart-list` (+`__body`, `__miss`), `.is-unverified`, `.near-miss`, `.hidden-by-you`. `player.css`: `.player`, `.player__now/text/title/meta`, `.player__transport/btn/play`, `.player__right/seek/volume`, `.player__feedback` (grid full-width row with chips + `.player__status` role=status), `.player__why`, `.player__queue*`; **`.player__feedback` is hidden ≤820 px unless the queue is expanded**.
UI kit: `ui/kit.tsx` `ScreenHead` L12, `SectionCard` L23, `Callout` L43, `Badge` L53, `EmptyState` L57; icons `ui/Icon.tsx` (`IconName` L36) include `brain, heart, smart, queue, check, warn, info, note, plus, close…`.

**Recommendation — "Session brain" readout placement.** Primary: **new panel on the existing "The Brain" screen** (new `BrainSession.tsx` + `styles/brain.css`, exactly the file ownership B5 has in plan.md; mount in `App.tsx` `case "brain"` beside SpotCheck/Listening). Why: (a) information architecture already says that screen answers "what SynAmp has learned … and a way to double-check it"; (b) the readout needs room for epoch context + proposals + a Forget control — it is a panel, not a line; (c) it follows the established fetch-on-open panel pattern with the `request` prop; (d) it keeps the two other surfaces clean.
Between the two asked options: **the Describe panel is the right place only for the *interpretation*** (B1's `interpretation` added to `/plans/draft`, rendered next to "What I understood"; and playlist-*level* learning already shows up there as the per-track "your listening: …" reason lines — do not move that). **The Player bar is the wrong place for the readout**: it is a transport strip; its feedback row is one line hidden on phones; a proposals/epoch panel would be cramped and invisible exactly when a phone listener generates learning data. If a *compact* "this session" hint is ever wanted, the precedent is the `.player__status` slot fed by the `session` prop — strictly a one-liner, optional, not the readout itself.

### 2.6 Tests — commands, placement, syntax conventions (observed)

- Commands: brain tests `pnpm --filter @synamp/brain test` (or `node --experimental-strip-types --test src/*.test.ts src/*/*.test.ts` from `apps/brain`); brain type-check `pnpm --filter @synamp/brain type-check`; web type-check `pnpm --filter @synamp/web type-check`; web build `pnpm --filter @synamp/web build` (= `tsc --noEmit && vite build`). Repo-wide `pnpm test` = `npx turbo test`.
- **Placement — the glob only reaches one subdirectory level**: `src/*.test.ts` and `src/*/*.test.ts`. A test at `src/learning/epoch/derive.test.ts` would **never run**. New modules must place tests at `src/intent/<name>.test.ts`, `src/learning/<name>.test.ts`, `src/query/sequence.test.ts` etc. (matches B1/B2/B5 file plans).
- Observed conventions (`session.test.ts`, `query.test.ts` heads): `import { test } from "node:test"`; `import assert from "node:assert/strict"`; relative imports **with `.ts` extension**; type-only imports via `import type`; temp dirs via `mkdtempSync(join(tmpdir(), "synamp-…-"))` + `rmSync(..., {recursive:true, force:true})`; never the live data dir; fixture values are hand-written/synthetic (query.test.ts docstring: "NOT evidence that any classifier is accurate on real music").
- Sample library: `apps/brain/fixtures/library.sample.json` (60 synthetic tracks; regenerate with `apps/brain/fixtures/make-sample-library.mjs`). Tests mostly build inline libraries or write JSON to tmp paths; the dev server default is the sample.
- **strip-types dos/don'ts actually observed** — dos: `.ts` specifiers, `import type`, `private` class members, plain classes/arrow fns, `as const` arrays, `String.raw`. Don'ts (frozen by CONTEXT; consistent with the code): **no `enum`**, **no `namespace`** (grep: zero occurrences), **no constructor parameter properties**, no path aliases, no decorators. ⚠️ `tsconfig` does **not** enable `erasableSyntaxOnly` (TS 5.6), so `tsc` will NOT flag an enum/parameter property — only the Node runtime will, at import time. Therefore: always run the test command, not just type-check.

---

## 3. Extension recipes (sketches — NOT applied)

### (a) Registering a new GET/POST route (e.g. `GET /api/v1/brain/session`, `POST /api/v1/brain/forget`)

```ts
// 1) index.ts, protectedPath (L530) — append the new prefix:
const protectedPath = [ …, "/api/v1/party-host", "/api/v1/brain"]  // ← new

// 2) inside route(), in the natural-language/learning section:
if (path === "/api/v1/brain/session" && req.method === "GET") {
  return send(res, 200, { adaptive: adaptiveView(), epoch: epochInfo(), proposals: adaptiveView().proposals() });
}
if (path === "/api/v1/brain/forget" && req.method === "POST") {
  const input = await body(req);                       // default 256 KB is plenty
  const scope = String(input.scope ?? "epoch");
  if (scope !== "epoch") throw new PlaylistError('scope must be "epoch"');
  const result = forgetEpoch(events, { … });           // pure/append-only design — see §5
  return send(res, 200, result);
}
```

Plus a small cached view following the `feedback()` pattern (L319–327): key on `events.all().length` + `currentLibrary().version`; recompute with `opts.now`/`Date.now()` at the boundary.

### (b) Additively returning `interpretation` from `/plans/draft` (L913–929)

Add a **sibling response key**; do not put it inside the plan object — the plan schema is closed (`c.keys` fails unknown properties) and the plan is hashed.

```ts
const draft = draftPlan(input.prompt, lib);
const checked = validatePlan(draft.plan);
const interpretation = interpretGoal(input.prompt, { library: lib, now: Date.now() });   // B1 module
return send(res, 200, {
  parser: "rule-based draft (no LLM yet)",
  recognized: draft.recognized, unparsed: draft.unparsed, encoder_text: draft.encoder_text,
  validation: checked,
  interpretation: { accuracy: interpretation.accuracy, readings: interpretation.readings.map(r => ({ label: r.label, confidence: r.confidence, assumptions: r.assumptions })), chosen_index: interpretation.chosen_index, asks: interpretation.asks, audit: interpretation.audit, parser: interpretation.parser },
  preview: checked.ok ? evaluatePlan(checked, lib, { feedback: feedback(), adaptive: … }) : null,
});
```

Note: each reading's `plan` stays untrusted; if included in the response, validate per-reading and keep the raw plan out (or expose only `validatePlan(r.plan)` results) so the response stays explainable. Web ignores the new key until `DraftResponse` in `Describe.tsx` is widened.

### (c) Applying sequence + adaptive in resolve & preview (sync, strict tier)

```ts
// index.ts L332-336 — one seam for resolveSmart + explain:
function evaluateSaved(plan: unknown, playlistId: string) {
  const checked = validatePlan(plan);
  if (!checked.ok) throw new PlaylistError("This smart playlist's saved plan is no longer valid; re-create it", 409);
  const evaluation = evaluatePlan(checked, currentLibrary(), { feedback: feedback(), playlistId, adaptive: adaptive() });
  const sequenced = sequenceTracks(evaluation.strict, checked.plan, { library: currentLibrary() });
  return { ...evaluation, strict: sequenced.tracks, sequencing_applied: sequenced.applied };  // keep fields additive
}
// resolveSmart then maps sequenced .strict as today (L339).

// draft preview L927 + evaluate route L933: same two options — thread { feedback, adaptive }
// so a playlist and its preview never disagree about learning effects.
```

`evaluatePlan` hook (sketch, mirroring L384–392): read `options.adaptive?.adjust(id)`; if parts, compute a bounded bonus (`ADAPTIVE_WEIGHT * tanh(v/2)` style), `s.score += bonus`, push `learning this session: …` into `s.reasons`; optionally add `s.breakdown.adaptive`. Keep inside the `pass.strict` map — near-miss scoring must stay unadjusted.

### (d) Adding a settings key (follow `settings.ts`)

1. `Saved` type (L30–36): add the snake_case key, e.g. `learning_strength: number;`.
2. `Defaults` + constructor default in `index.ts` L74–78.
3. Getter beside L50–57.
4. `view()` L64–85 — expose value (+ an `origins` entry via `origin()`); secrets only as "set".
5. `update()` — validate before saving; empty/`undefined` → delete the saved override (`set(field, undefined)`).
6. Persistence is automatic: JSON `{ format: "synamp.settings/1", settings: {…} }`, atomic temp+rename, mode 0600; `onChange` fires with changed field names (used at L250 to hot-apply).

### (e) Emitting a new event signal safely

```ts
// events.ts — extend the union (type-only; all consumers compile):
| "learning_reset"   // e.g. a forget marker; add near "receipt"
// then append like any event (copy session.ts record() style):
log.append({ id, ts: Date.now(), signal: "learning_reset", track_id: "", scope: "none",
  session_id: sessions.get().id, source: "server", policy_version: POLICY_VERSION,
  detail: { scope: "epoch", epoch_id } });
```

Consumer audit (grep, complete): `deriveFeedback` switch (feedback.ts L113) has a `default: break` → new signals are **ignored, not crashes**; discography stats count only `full_play|external_play|love|thumb_up` (discography.ts L63–64); the scrobbler candidate filter whitelists `full_play|skip_late|skip_early` (scrobbler.ts L69) → no accidental scrobbles; `/api/v1/events` viewer hides only `receipt|exposure`; `/api/v1/listening` counts `external_play`. **No exhaustive switch exists** — adding a Signal is type-safe by design. Still: decide deliberately whether the new signal must (i) alter `deriveFeedback`, (ii) be hidden from `/events`, and (iii) bump `POLICY_VERSION` (bump when meaning/derivation changes; it feeds every event + view).

---

## 4. Landmines & risks for the engineering round (B1/B2/B4/B5)

1. **Closed plan schema + hash coupling (B1).** `plan.ts` `Checker.keys()` fails unknown properties; `planHash` = sha256(REGISTRY_VERSION + stableStringify(canonical plan)). To support arcs (`build/cooldown/peak/wave`) you must update the type **and** the validator's rebuild (sequencing acceptance), and expect **hash values to change only for plans that now carry arcs** (today those are dropped + reported as unsupported). Never add plan fields without plan.ts + query tests (plan.md says the same). **Do not touch `REGISTRY_VERSION`** (`"signals/1"`, signals.ts L19) casually — it is an input to every plan hash; changing it rehashes every plan (tests asserting stable hashes update their expectations, and stored `planHash` values in playlists/events become stale relative to recomputed hashes). Nothing appears to compare stored vs recomputed hashes at resolve time today (`resolveSmart` ignores its `_hash` argument), but treat it as frozen unless A-side evidence demands a change with a migration note.
2. **`evaluateSaved` re-validates on every resolve** → any validator rule that *rejects* what old plans contain turns existing smart playlists into 409 errors. Keep changes additive; new optional fields tolerated; don't retire/rename constraint semantics.
3. **strip-types static-check gap.** `tsc` (5.6, no `erasableSyntaxOnly`) will not stop enums/namespaces/parameter properties — Node `--experimental-strip-types` fails them at **runtime**. Always run `pnpm --filter @synamp/brain test`; keep `.ts` specifiers and `import type`.
4. **Test glob is one level deep** (`src/*.test.ts src/*/*.test.ts`) — deep test paths silently never run. Keep `src/<module>/<name>.test.ts`.
5. **Single-writer discipline (from plan.md).** `index.ts`, `evaluate.ts`, `Describe.tsx`, `feedback.ts`, `api.ts` = B5 only (wave 2). B1 owns `plan.ts` + `query.test.ts`; B2 owns `src/learning/**`; B4 owns `tools/brain-lab/**`. Overlapping edits will clobber — this is the stated top risk.
6. **`session_id` ≠ epoch** (§2.3). Most subtle correctness trap for "never learn across session/day/hour". Derive epochs from ordered `ts` gaps (+ explicitly-specified daypart), tolerate missing `session_id` (Subsonic events), and pin `TZ` in tests if daypart is part of the derivation (local-time dependence is a determinism hazard for a "pure replay" policy).
7. **Determinism contract.** All derivations pure functions of (events, library, config, `now`); take `now` as an option (precedent: `deriveFeedback(events, now, canonical)`, `SpotChecks.record(..., now)`); no hidden mutable state; caches keyed like `feedbackCache` (size+version) are fine, unbounded memoization of `Date.now()` results is not.
8. **Resolve path is synchronous** — sequence/adaptive must not be async. `resolveSmart` is invoked inside `playlists.resolve()` for every read.
9. **Bonus application order** (§2.2): adjustments happen before sort and before caps/MMR — learning changes membership (which tracks survive caps), not just order. Keep the bound small (v1 uses ±0.15), document it, and unit-test that an adaptive bonus cannot promote a track past a hard rule (mirror the existing test "feedback re-ranks but cannot break a hard rule").
10. **Protected-path list**: forget to add `"/api/v1/brain"` → unauthenticated new endpoints when a token is set (C4 will flag). Also keep route bodies validated with existing error classes so the central handler maps statuses.
11. **Forget semantics vs append-only log** (§5): the event log is never edited and all learning is pure replay. A durable forget must be a new marker event or an auxiliary store that the derivation consumes. Proposals that "delete events" or mutate jsonl violate the architecture.
12. **Web mirrors ignore additive fields** — server changes are safe, but nothing renders until B5 updates the mirror types in `Describe.tsx` (`ResultTrack`/`Evaluation`/`DraftResponse`) and/or the new `BrainSession.tsx`. Player bar feedback row hidden on phones; don't rely on it for the readout.
13. **Baseline reds to quote, not chase**: librarian case-fold test (macOS-only) + root type-check webamp chain (turbo dependency builds skipped). Full-suite final receipts will inherit the librarian failure; state it explicitly in B5/B4 receipts and DELIVERY/verification.
14. **B4 harness conventions**: `tools/` scripts run manually (precedent `tools/nas/check-playback.test.mjs`, `tools/roadmap/build.mjs` — root `package.json` only wires `roadmap:build`; turbo has no tools task, and `pnpm test` won't discover `tools/brain-lab`). Document the exact invocation (`node --experimental-strip-types tools/brain-lab/<entry>.ts` or `.mjs`) and keep fixtures under `tools/brain-lab/`. Brain-lab output must never write into `apps/brain` stores — use scratch `PLAYLIST_DATA_PATH`.
15. **Draft prompt validator**: `/plans/draft` rejects >500 chars (L914–916) — interpretation tests must respect that. `/plans/evaluate` returns 422 with validation, not 400.

---

## 5. Open questions for the mainline

1. **Forget/reset representation.** `POST /api/v1/brain/forget` (scope epoch) is specified, but the system is append-only + pure replay. Options: (a) new `Signal` marker (e.g. `learning_reset`) with `detail.scope/epoch_id`, derivation honors it; (b) an auxiliary `learning-resets.json` sidecar passed into `deriveAdaptive` as an extra input (deterministic, versionable). Which is authoritative? This decides B2's `AdaptiveView` inputs and C1's replay tests.
2. **Epoch id semantics.** Given §2.3, confirm the epoch definition: `(session continuity gap threshold, daypart bucket, optional playlist/goal context)` → a deterministic id hash. What gap threshold (e.g. 45–90 min)? Is daypart local-time (needs TZ policy + test pinning) or UTC? A3's designs should have the parameters; A4 flags that the code has no epoch entity to reuse — it must be derived.
3. **`BRAIN_DATA_DIR` does not exist** (plan.md smoke section). Confirm using `PLAYLIST_DATA_PATH` as the scratch anchor (recipe §2.4) — or add a new env var deliberately (that is a config change B5 would own, with tests).
4. **Adaptive exposure in responses.** Should `adaptive` get its own `score_breakdown` sub-object and/or an `Evaluation.adaptive_policy` field (mirroring `feedback_policy`), and must `interpretation` include full readings (with validated plans) or only summaries? Affects B1/B5 response shape and C-round checks.
5. **Player-bar hint.** Confirm the readout placement decision (§2.5): Brain-screen panel primary, Describe = interpretation only, Player bar untouched (or one-line status hint later). If a "this session" surface on the player is a hard requirement, it needs a design that survives the ≤820 px rule.

---

## Appendix — exact anchors used

- `index.ts`: route L511; helpers send L489 / body L498; protectedPath L530–537; regexes L538–542; session routes L563–596; feedback route L598–603; spotcheck L765–777; settings L779–786; listening L873; events L906–910; draft L913–929; evaluate L930–933; error handler L1080–1091; boot L1093–1095.
- `evaluate.ts`: options L283–287; evaluatePlan L290; hidden L339–342; feedback application L382–392; sort L398; caps L401; MMR L407–428; toResult L430–438; near-miss L440–451.
- `session.ts`: classifyStop L68–76; constants L74–79; constructor L83; fresh L94–97; replaceQueue L134; report L180. `events.ts`: POLICY_VERSION L19; Signal L21–38; ListeningEvent L44–62; append L93.
- `feedback.ts`: recordFeedback L47; deriveFeedback L99; switch L113–140; half-lives L88; feedbackBonus L181–182.
- `plan.ts`: PLAN_VERSION L18; c.keys closure ~L118; planHash L217; validatePlan L222; encoderText L466. `draft.ts`: Draft L21–26; draftPlan L46. `signals.ts`: REGISTRY_VERSION L19.
- `spotcheck.ts`: SpotChecks L76; corrected L142; apply L152. `library.ts`: LibrarySource L20; canonicalId L78.
- `web`: App.tsx ScreenId L33/NAV L34–50/brain case L156–162/Player L204; Describe.tsx mirror L5–27/preview L125/save L135/render L149; Playlists.tsx Describe mount L135; api.ts makeApi L15; vite.config.ts proxy `/api → localhost:3001`; styles tokens.css/describe.css/player.css/ui.css as listed.
- Baseline logs: `/tmp/synamp-brain-test.log`, `/tmp/synamp-typecheck.log`, `/tmp/synamp-librarian-test.log` (copy into `DELIVERY/verification/` before temp cleanup).
