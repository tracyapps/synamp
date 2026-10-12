# SynAmp early-access execution backlog

Status updated October 12, 2026: local implementation slices are recorded in
[October 11](execution-2026-10-11.md) and [October 12](execution-2026-10-12.md).
No release gate is closed. The table separates reviewable local work from
acceptance evidence still required. The backlog uses the
[90-day roadmap](90-day-roadmap.md) gates and the owner's 20–25h/week capacity.

| Package | Local progress available | Next acceptance dependency |
|---|---|---|
| B01/B02 | Scope/read-write inventory; frozen synthetic and private owner-library evaluations; strict shortages retained | Owner listening judgments, throughput and ten two-rater library reports; Q01 producer gap remains |
| B03 | Rename regression; pinned CI including three browser harnesses; fresh local tests/build | Push, hosted six-job result on candidate SHA and authorized required-check configuration |
| B04 | Read-only install preflight; build identity; install receipts | Real cold-install/resume/upgrade attempts on candidate hardware |
| B05 | Playback fixes; browse worker; offline state backup/restore rehearsal; critical-store read/parse failures stop startup | NAS/device retest, full-system recovery, full disk/power loss, second writer and remaining optional-store audit |
| B06 | External-service/write inventory and explicit unresolved rights | Per-artifact distribution evidence, provider/counsel/owner decisions |
| B07 | Offline install/activation/W4 scorecard and private-record guide | Consented testers, working support route, actual attempts/check-ins and mature windows |
| B08 | Draft messaging/surface map and evidence boundaries | Reviewed copy/consent implementation, actual clips and visual audit |
| B09/B10 | Proposed offer, economics and gated distribution plan | Approved rights/offer/provider, sandbox flow and later real cohorts/channels |

Existing capabilities are inputs to the work, not proof that a launch gate is
complete. One implementer owns each shared contract/persistence file at a time.
The user will review/push local commits and update/test the NAS separately.

## B01 Establish the baseline and supported scope

Owner: product/technical lead. First review October 18. No dependencies.

Files: `README.md`, `docs/synamp/FIRST-RUN.md`, `deploy/README.md`,
`docs/synamp/plans/CONTINUOUS-PLAYBACK.md`, this business directory.

- Record build SHA, supported server/Mac/browser combination, library size,
  formats, analysis stage coverage, first playback and known limitations.
- Separate installed owner evidence, generated-audio/browser evidence, and
  independent customer evidence. Do not recast historical test counts as fresh.
- Map file reads/writes and optional external calls. First beta uses one owner,
  one library, private access, and an optional reviewed librarian.
- Accept when a new implementer can identify the precise supported promise,
  current evidence and next failed gate without reading the research archive.

## B02 Prove the listening promise

Owner: analyzer/Brain lead, with owner and tester raters. Depends on B01.
Baseline October 18; repairs through November 17; continued cohort listening.

Files: `services/analyzer/src/synamp_analyzer/{listen,tonal,beat,export}.py`,
`apps/brain/src/query/`, `apps/brain/src/library/moodcheck.ts`,
`apps/brain/src/library/lyrics.ts`, `apps/web/src/MoodCheck.tsx`,
`tools/brain-lab/`, `docs/synamp/plans/{FAST-BRAIN-FOLLOW-UP,BEAT-TIMING,CONTINUOUS-PLAYBACK}.md`.
Confirm filenames before assigning implementation; do not alter a running
owner analysis to produce a scratch benchmark.

- Freeze twelve versioned prompts and a consented evaluation set. Include
  vocal false negatives, wordless voices, piano in mixtures, live recordings,
  weak/no pulse, unfamiliar artists, strict shortages, unsupported requests,
  correction persistence and similar-song selection.
- Start with a bounded selected subset, then expand coverage. Show measured,
  unmeasured and failed analysis separately. Measure actual initial wait and
  resume behavior on each supported hardware combination.
- Use the quality gate in the roadmap. Record raw judgments privately and
  publish aggregates only with permission. No copyrighted audio in fixtures or
  marketing without appropriate rights.
- Add a full workday check of the current smart mix, variety, repeat cycling,
  correction behavior and a Brain restart mid-session. Strong queue tests do
  not establish musical fit.
- Fix the weakest **supported** condition before adding a new model. Keep
  unvalidated mood, microtiming and voice-character claims out of sales copy.
- Accept with ten real-library reports, two raters each, complete failure counts,
  method/build identity and the agreed quality gate. If the gate fails, narrow
  the supported promise or repair it; do not quietly weaken exclusions.

## B03 Make release checks trustworthy

Owner: release lead. Depends on B01. Target November 8.

Files: `package.json`, `apps/brain/package.json`, `services/analyzer/pyproject.toml`,
`apps/brain/src/library/` tests, `tools/*.test.mts`, `tools/player/check-actions.mjs`,
`site/tests/site.test.mjs`; proposed `.github/workflows/ci.yml`,
`.github/ISSUE_TEMPLATE/`, `docs/dev/RELEASE.md`, `CHANGELOG.md`.

- Inventory the actual commands and coverage before adapting template §1.1.
  The Brain test script has explicit globs; root/tool tests are separate.
- Diagnose the case-only artist rename on the filesystem where it fails. Fix
  the root cause and verify a genuine regression test on a case-insensitive
  volume. Never catch an expected failure and count it as a pass.
- CI should run the supported runtime, Brain tests/typecheck, selected current
  tool/contract checks, web build, site tests/build and analyzer tests. Add a
  targeted macOS check for the rename behavior. Validate heavy optional model
  stages separately, with license/download policy and a bounded runtime.
- Test actual first-listen, correction/shortage, saved-playlist, update and undo
  flows through stable public seams. Do not duplicate implementation-only tests.
- Accept with visible, required checks on the candidate SHA, documented known
  issues, reproducible failures and no hidden release-blocking failure. GitHub
  settings and publishing require their own authorized change; local YAML alone
  is not hosted CI evidence.

## B04 Guided install and versioned lifecycle

Owner: deployment lead. Spike in week one, depends on B01; full gate uses B03/B05.

Files: `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/README.md`,
`docs/synamp/FIRST-RUN.md`, `services/analyzer/mac-env.example.sh`,
`services/analyzer/README.md`; proposed `tools/install/` and release documentation.

- First support Synology x86-64 Container Manager plus an Apple Silicon Mac
  only after verifying it. Other combinations are experimental until tested.
- Remove owner hostnames/paths from the public quickstart. Discover or ask for
  paths, permissions, memory and ports. Generate secrets without displaying or
  uploading them. Fail safely before writes if prerequisites are absent.
- Version the setup script and let users inspect it. Do not use an opaque
  `curl | sh` shortcut as the definition of success. Make setup resumable and
  idempotent; distinguish active setup minutes from unattended analysis.
- Provide a first-listen subset path, honest analysis coverage/progress,
  actionable errors, and working native-client URL guidance.
- Pin tested service/image versions or digests; expose the running version;
  rehearse upgrade and rollback with real persistent data. A code checkout
  rollback alone does not undo a data migration.
- Accept with ten consecutive eligible cold attempts, ≥9 successful without
  live rescue, ≥5 non-friends, and a receipt for every attempt. Validate upgrade,
  rollback, resume and the DSM stop/build workaround on supported hardware.

## B05 Safety, durability and device closure

Owner: persistence/playback lead. Depends on B01; release gate before B09.

Files: `apps/brain/src/{playlists.ts,index.ts}`, `apps/brain/src/session/`,
`apps/brain/src/library/tag-writer.ts`, `apps/brain/src/librarian/tags-apply.ts`,
`deploy/docker-compose.yml`, `tools/nas/check-playback.mjs`,
`apps/web/src/audio/`, `docs/synamp/plans/LIBRARY-CARE.md`.

- Preserve librarian-only music writes and review-before-apply. Verify small
  apply/undo on a separate library, unchanged audio, stale-plan refusal and
  safe refusal for unsupported formats. State the M4A write limitation.
- Test power interruption/process restart, restore from backup, full disk,
  corrupt/torn state, and prevention of a second writer. Define safe storage
  growth/compaction limits and rollback boundaries. Trigger storage migration
  if the supported envelope cannot satisfy these checks.
- Complete actual Navidrome export/playback, native-client controls, cellular
  access through the chosen private network, iPhone screen lock and by-ear
  gapless/crossfade checks. Record device/browser/OS/build and result.
- Restrict the initial release to private-network access. Verify token creation,
  revocation/rotation, secret redaction, party-code scope and request limits;
  do not market it as safe for a public internet URL without separate hardening.
- Accept with restore, interrupted-write, active-session restart, authorized
  write/undo and supported-device receipts, plus zero open release-blocking S1/S2.

## B06 Distribution and selling clearance

Owner: founder, with qualified counsel/provider input where necessary.
Depends on the B01 dependency inventory; begin October 11 because response
times may exceed development time. This work is assessment, not legal clearance.

Files: `LICENSE.txt`, retained package licenses, `services/analyzer/pyproject.toml`,
`deploy/docker-compose.yml`, `apps/brain/src/lastfm/`,
`apps/brain/src/library/lyrics.ts`; proposed `NOTICE` and `docs/legal/` inventory.

- Preserve Jordan Eldredge/Webamp copyright notices. Add confirmed ownership
  notices for original work rather than replacing inherited attribution.
- Inventory exact code, model weights, ontology data, images, audio and fonts
  in each shipped artifact, including transitive dependencies. Verify notices
  against the actual package, not a blanket MIT statement.
- Verify PANNs model file identity/license and required credits; correct stale
  owner-only notes only after the artifact is matched. Check AudioSet ontology
  adaptation separately. Keep validation-only Essentia outside the release
  unless its obligations have been deliberately satisfied.
- Document Navidrome's GPL duties for the actual distribution arrangement.
  Pulling the official image helps packaging scope; it is not blanket clearance.
- Obtain a written Last.fm commercial position, or exclude that integration
  from the commercial artifact pending clearance. Default-off is not a legal
  exception. Do not presume a user-provided API key solves it.
- Resolve LRCLIB/lyric rights and AcoustID terms. A user clicking an opt-in
  does not establish rights to cache or redistribute lyrics. Use embedded
  user-provided lyrics only within reviewed terms; exclude unresolved external
  lookup from the commercial package and promise.
- Commission a SynAmp name search appropriate to intended markets; record
  the decision and a fallback. Search results alone are not trademark clearance.
- Confirm hosting permits the intended commercial site; decide actual privacy,
  refund and support terms. A merchant of record does not settle IP obligations.
- Accept with a dated per-component disposition: cleared with evidence,
  excluded with verified build/runtime behavior, or release blocked. No vague
  'licensing done' checkbox.

## B07 Beta operations and support

Owner: founder/customer lead. Depends on B01/G1; expand only on G2/G3.

Files: proposed `docs/beta/` public quickstart/charter/intake; private tester
registry outside the public repository; `.github/ISSUE_TEMPLATE/` for public-safe
reports. Templates §2.1–2.8 are adapted in the messaging kit.

- Five supported testers, then ten; Wave 2 in batches of five; no more than
  fifteen concurrently active. Prioritize ≥10k-track owners, then different
  supported hardware. Five non-friends minimum for cold-install evidence.
- Maintain timestamps for attempt, completion, activation and weekly replies.
  Log setup help minutes, bug severity and support minutes; no secret telemetry.
- Offer private email feedback for personal logs; public GitHub issues are
  optional. Do not promise a 'no-login form' and then require a GitHub account.
- Record quotes, interview recording and publication permission independently.
  Tell testers the selected software license and any complimentary offer only
  after those terms are approved.
- Accept with denominator-complete cohort records, daily S1 triage, weekly
  check-ins, five interviews, a deletion process and a working support route.

## B08 Messaging, consent and proof

Owner: product/content lead. Depends on B01/B02; pricing language depends on B09.

Files: `README.md`, `site/src/{index,coming-soon,thanks,help,contact,app-preview,roadmap}.html`,
`site/src/partials/{early-access,signup-fields,footer}.html`,
`site/api/{subscribe,contact}.js`, `site/api/_lib/forms.js`,
`site/src/assets/synamp.js`, `site/content/roadmap.md`, this messaging kit.

- Apply the complete surface map in the kit. Correct party tense and demo
  labels; introduce the collector/NAS audience and supported setup requirements.
- Keep the existing single-launch-email promise. Tester check-ins and progress
  notes require separate explicit opt-in carried through UI, API validation,
  stored contact metadata, notifications and segmentation. Do not merely add
  a decorative checkbox. Preserve no-JavaScript success/error behavior.
- Capture two evidence clips: own-library playlist/why/correction and reviewed
  library care/undo. Combine into a short overview; add party only when real
  multi-device evidence exists. No fake DJ decks, waveform or beat lock.
- Draft privacy/credits/pricing/help from real behavior. Self-host fonts and
  improve accessibility/SEO when implementing the copy sweep; check responsive
  layouts, mock focusability and headings, not just generated HTML text.
- Accept with a consistent claim ledger, built-site link/copy audit, consent
  tests for opted-out contacts, visual checks and real-build evidence labels.

## B09 Paid offer and checkout

Owner: founder/business lead plus payment implementer. Depends on B06 and G3;
paid launch requires all G4 criteria. Research can proceed before clearance.

Files: proposed offer decision record, pricing page, checkout integration and
support terms. Keep code changes bounded; no new license server needed for EA.

- Test one offer: optional **Home** convenience/support purchase, **$39 launch,
  $49 standard** as a hypothesis, with MIT source available. Define delivered
  artifacts and a sustainable support window. Proposed starting boundary:
  30 days of setup help, best effort on weekdays; maintenance policy stated
  explicitly, without an indefinite security-support promise.
- Interview five activated users about their last real problem and demonstrate
  the actual offer. Stated intent is not purchase conversion. Do not count
  gifts or promised founder licenses as buyers.
- Compare merchant-of-record eligibility, onboarding delay, fees including
  international/payout/refund treatment and support for this specific product.
  Provisional shortlist: Polar Starter and Paddle; choose based on approval and
  tested workflow, not the conflicting rankings in the attachments.
- Test purchase, duplicate webhook/idempotency, fulfillment, failed payment,
  refund and customer deletion in sandbox. Manual fulfillment is acceptable
  for a capped cohort if reliably tracked. No custom online activation or DRM
  on the MIT app; purchase terms concern the service/artifact offer.
- Accept with an approved offer, sandbox receipts, working contact/refund path
  and a complete paid-release gate. Live sales/publication are separate actions.

## B10 Controlled distribution and January review

Owner: founder/growth lead. Depends on G4; broad publicity requires G5.

Files: launch drafts in this directory; actual receipts in release notes;
source-tagged private campaign/metric records; `site/content/roadmap.md` for
verified feature status only.

- First invite already-qualified people; then two small moments from the same
  relevant community at least three days apart. Each should produce ≥3
  activated households before calling the channel repeatable. Record cost,
  owner time, source, cohort size and follow-up completeness.
- Show HN only when people can actually try the product without a signup wall.
  Recheck each community's current rules before submitting. Do not send pitches
  or moderator messages without explicit authorization.
- Pause recruitment/promotion for any data-safety event, open S1, or support
  >5h/week. The source's '>10 tickets/day' trigger is too late for this capacity.
- Review January scorecard and mature retention. Write the bottom-up market
  memo using reached/eligible/contacted/installed/active/paid cohorts; do not sum
  overlapping follower, download and star counts into a market estimate.
- Accept with two measured recruitment batches, honest revenue/cohort report,
  and the next-quarter decision with dependencies and budget.

## Weak-point coverage and deferral register

| Weak point from the attachments | Package and launch disposition |
|---|---|
| Producer gaps; demo versus real-library disappointment | B02, G4 quality report; unsupported capabilities excluded from promise |
| First analysis takes days; throughput unknown | B02/B04 subset onboarding and measured wait; no invented ETA |
| Installer and owner-specific paths | B04, G3 independent trials |
| Synology stop/build and unversioned updates | B04 reproducible install, upgrade and rollback |
| JSON durability, unbounded logs and second writer | B05 safety gate; Postgres deferred only if envelope is demonstrated |
| Known failing test and no CI | B03 root cause and candidate checks; no masking |
| Web reliability | B03 critical browser flows plus existing tools; no blanket claim of zero web coverage |
| Real Navidrome/phone/party/audio seams | B05 hardware evidence; restrict marketing until checked |
| Single owner/token, public-exposure risk | B05 private-network scope and auth verification; hosted/multiuser deferred |
| Companion unsigned/runtime unverified | Browser workflow first; signing required if companion is distributed |
| Licensing, credits, Last.fm, lyrics, AcoustID, name | B06 component decisions before distribution/payment |
| Inconsistent promises, fake labels and stale phase tense | B08 all-surface copy and evidence ledger |
| No measured funnel, consent or tester artifacts | B07/B08; manual privacy-preserving registry first |
| Pricing/entitlement ambiguity; lifetime support liability | B09 one concrete offer with bounded support |
| No willingness-to-pay or repeatable channel evidence | B09 purchases and B10 two channel batches |
| Market census, moat and investor story unproven | B10 memo; raising/acquisition deferred, assumptions labeled |
| Support burden and community fragmentation | B07/B10 capacity cap; email/issues before Discord |
| Monolithic routes, broad platform and feature debt | Refactor only for observed risk; retain as next-quarter work |

## First implementation handoff

Start B01, B02's baseline and B04's read-only install spike. Then B03 and B05
repair the first demonstrated failures. Prepare B07/B08 in parallel within the
same owner budget. Do not start cloud, multi-user, native NAS packaging or
advanced DJ work to make the launch story sound more complete.

For each package completion, record SHA, date, exact command/device, observed
result, evidence location and remaining limits. Protect private library data
and support contacts; publish only reviewed aggregate evidence.
