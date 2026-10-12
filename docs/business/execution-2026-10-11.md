# Roadmap execution — October 11, 2026

Source base: `8568c9b8e04e1f5c355c9fb86028f55aadb67823`, initially clean.
Changes below are local and uncommitted. No deployment, invitations, live writes,
sales, payments or completed release gates are claimed.

## Delivered locally

| Package | Concrete progress | Acceptance still open |
|---|---|---|
| B01 | [Candidate scope/evidence ledger](baseline.md), source-derived read/write/outbound map; corrected storage and backup claims in root/deploy docs | Exact installed hardware/build, real-library size/formats/stages, first playback and throughput |
| B02 | Frozen twelve-case v1 suite; executable offline baseline; private/exclusive reports, hashes, counts, ambiguity and manual-case retention; [two-rater procedure](listening-evaluation.md) | Consented real snapshots, two raters across ten libraries, similarity/correction/workday runs and quality gate |
| B03 | Reproduced and fixed case-only artist directory spelling; nested filename/folder, undo and interruption regressions; isolated analyzer verification; Node 22/24 checks; CI source and generated-audio browser flow (continuation below) | Linux/DSM regression, hosted/required CI and further build-specific first-listen/update browser flows |
| B04 | Read-only NAS preflight and attempt receipt; Compose layout refusal; safe sample materialization and scoped scan/analysis instructions (continuation below) | Actual NAS prerequisite run, generic guided first-listen flow, version pinning, ten cold attempts, upgrade/data rollback |

The rename failure was directory spelling, not a bad expected fixture. On a
case-insensitive volume, recursive mkdir and file rename left the artist's
actual directory entry as `Ani Difranco` even when the requested target was
`Ani DiFranco`. The librarian now corrects aliased directory components through
temporary names, preserves distinct directories on case-sensitive volumes, and
restores directory spellings if a move fails. Existing collision checks remain.
Byte-preservation and undo are exercised on real temporary files; no owner
library was modified. Power-loss durability is still separate B05 work.

The install spike detects a material configuration constraint: Brain accepts a
custom MUSIC_PATH/INCOMING_PATH, but the current librarian mounts the share and
uses `/share/library` and `/share/incoming`. The preflight refuses a mismatched
layout rather than allowing two services to operate on different libraries.
It also checks secrets/placeholders, non-root numeric IDs, directory isolation,
bind directories, readable build inputs, Docker access and quiet Compose config.
Host UID permissions, remote Docker context, storage capacity and actual setup
remain manual checks. `ready` means these prerequisites only.

## Fresh verification

Host: macOS / arm64, Node `v24.13.0`, pnpm `9.12.0`.

| Command | Observed result |
|---|---|
| Initial `pnpm --filter @synamp/brain test` | Exit 1: 314 tests, 312 pass, one artist-merge failure, one cross-disk skip |
| `pnpm --filter @synamp/brain test` after repair | 316 tests, 315 pass, zero failures, one existing cross-disk skip |
| `node --experimental-strip-types --test apps/brain/src/librarian/librarian.test.ts` | 12 tests, 11 pass, one cross-disk skip; case-only apply/undo and rollback pass on real temporary files |
| `node --experimental-strip-types --test tools/*.test.mts tools/brain-lab/*.test.mts tools/nas/*.test.mjs tools/install/*.test.mjs` | 59 pass, zero failures or skips; includes preflight, baseline, readback, playback, selection/view and player contracts |
| `pnpm --filter @synamp/brain type-check` | Exit 0 |
| `pnpm brain:readback:type-check` | Exit 0; now includes business baseline and its tests |
| `pnpm --filter @synamp/web build` | Exit 0; TypeScript and Vite production bundle |
| `pnpm --dir site test` / `pnpm --dir site build` | Ten tests pass; ten pages build |
| Baseline against bundled synthetic 60-track library | Twelve cases retained: five evaluated/unrated, four interpretation-review, three manual-pending; quality gate not assessed |
| `services/analyzer/.venv/bin/python -m pytest services/analyzer/tests -q` | Exit 1 before collection: `No module named pytest`; analyzer tests not verified, environment left unchanged |
| `git diff --check` and added-document local-link check | Exit 0 |

The full Brain suite includes a 2,200-step temporary-state continuous-session
check; this run took about 55 seconds. That is software behavior evidence, not
an actual workday listening test. The single cross-disk skip is retained because
the configured second filesystem is absent. No hosted CI, browser interaction,
NAS, phone, cellular, installed restore/rollback, audio accuracy, rights or
customer evidence is established by these results.

## Next steps in dependency order

1. **B01/B02, owner plus Brain lead:** supply a deliberately frozen private
   bounded export; capture the report and record actual hardware/build, formats,
   stage/export denominators and analysis elapsed time. Do not interrupt the
   running analyzer. Review supported versus probe prompts before scoring.
2. **B04, deployment lead:** inspect/run preflight on the NAS, resolve manual
   prerequisites and record the first copied-library installation attempt.
   Validate the subset first-listen procedure before using it for beta users.
3. **B03, release lead:** recreate analyzer dev dependencies in an isolated
   environment, run its suite, and add Linux plus targeted macOS CI using the
   actual commands above. Hosted required-check configuration is a separate
   authorized action; local checks alone do not close B03.
4. **B02, Brain lead:** “a steady beat” is currently impossible and “live
   recordings without vocals” partial in the synthetic baseline. Diagnose
   interpretation against the existing registry before adding any producer;
   retain unsupported asks and strict unknown policies. No repaired semantics
   or musical usefulness are claimed by freezing these probes.
5. **B05 then B07/B08:** copied-library safety/restore, then consented five-person
   intake, private feedback and truthful all-surface copy. B06 rights inventory
   can proceed from the source map; no selling or external outreach yet.

Do not mark G0 complete from a synthetic run. The next deciding evidence is a
real supported-library first-listen and a NAS attempt, followed by independent
ratings and complete failure denominators.

## Continuation: CI, analyzer, browser and subset safety

The initial receipt above is retained as history. Current continuation work:

- B02: `a steady beat` now compiles to the existing analyzer definition,
  `pulse_clarity ≥ 0.30` AND `pulse_steadiness ≥ 0.50`. Both measurements are
  required; no producer, model, threshold calibration or relaxation was added.
  Negated requests cannot become affirmative steady-beat rules. The frozen
  suite version is unchanged because the requests are unchanged. Current sample
  readout: six evaluated/unrated, three interpretation reviews, three manual
  pending. Live-recording detection remains unsupported/partial and visible.
- B03: created an isolated uv environment outside the checkout using the
  committed lockfile and dev extra, then reproduced two existing analyzer test
  failures under Python 3.14 and 3.12. The missing-tool test mocked PATH but
  omitted Homebrew fallbacks; it now controls both and separately tests fallback
  precedence. The moved-file fixture now actually changes directory spelling
  via a temporary name on both case-insensitive and case-sensitive volumes.
  No analyzer model weights were downloaded or production environment changed.
- B03: added [CI workflow](../../.github/workflows/ci.yml) for Linux Node 22/24,
  Brain/tool/type/build/site checks, a macOS case-insensitive-volume librarian
  check, and isolated CPU-only Python 3.12 analyzer tests on Linux/macOS.
  Actions use verified commit pins; workflow permissions are read-only, checkout
  credentials are not retained, jobs have timeouts, and no failure is ignored.
  [Release procedure](../dev/RELEASE.md) separates local, hosted and hardware
  evidence. There has been no push or GitHub required-check configuration.
- B03: `tools/player/check-actions.mjs` passed 23 browser flow checks with
  Chromium and generated WAV audio: feedback/persistence/failure feedback,
  removals/undo, crossfade acknowledgement, visuals/display windows, continuous
  refill, desktop/mobile saved playback choice, finite Standard playback, strict
  exhaustion and restore. Zero captured browser errors. This does not prove
  physical displays, native controls, phone/cellular, by-ear fit or real audio
  quality. Browser: `Chrome/123.0.6312.86`.
- B04/B05: reproduced an unsafe `sample --out` on temporary generated FLACs.
  The old materializer could unlink a source file if output was the library
  itself, overwrite unrelated files, and leave mixed selections after changing
  seeds. It now refuses overlapping source/output trees (including resolved
  aliases), nonempty/unverified outputs and changed selections/links. An exact
  unchanged manifest/link tree can be repeated without rewriting it. No file is
  deleted or overwritten; partial/tampered samples require a new directory.
- B04: fixed sample instructions in the CLI and analyzer README: environment
  assignments before `scan && analyze` applied only to scan, risking analysis
  against inherited owner state. Both commands now run in a quoted subshell
  with scratch DB/cache and owner reporting/journal wiring disabled. A real
  shell regression checks both steps, spaces/quotes/command-substitution text
  in the sample path, and inherited owner settings. Never give the librarian
  write access to a symlink sample; use a copied library for write trials.
- Local subset rehearsal: three generated click FLACs → seeded sample → scan →
  analysis → export → twelve-case baseline. Export counted three tracks,
  no failures/missing/stale results, with identity/DSP/beat/tonal completed.
  Voice was not run. This establishes the local software seam only; no owner
  throughput or first-playback claim is made.

Continuation checks:

| Check | Result |
|---|---|
| Brain suite, Node 24.13.0 | 319 tests: 318 pass, one existing cross-disk skip, no failures |
| Brain suite, isolated Node 22.23.3 | Same 319 tests: 318 pass, one existing cross-disk skip, no failures |
| Root/lab/NAS/preflight tool suite | 59 pass, no failures/skips |
| Brain and lab TypeScript | Pass |
| Isolated Python 3.12.13 analyzer suite | 130 pass, zero failures/skips; three decoder deprecation warnings retained |
| Official actionlint 1.7.12, checksum verified | Workflow passes after fixing a runner-context placement error |
| Existing browser harness | 23 checks pass, zero captured errors |
| Docker Linux verification | Not run: local Docker daemon socket is absent; no daemon was started |

Temporary evidence/log root: `/tmp/synamp-release-check.HDoYKa/`; numerical
results and limitations above are the durable receipt. The full real-library
and NAS gates remain open. The real snapshot path has been requested; no personal
mounts, owner events or running analysis were inspected to invent that evidence.

## First owner-library snapshot and collection workbook

After the owner authorized locating the existing export, read the mounted
`library-signals.json` as data only. No owner shell configuration was sourced,
no worker/SQLite state was opened, and no audio files were changed or analyzed.

- Parent export: 46,267 catalogued, 46,039 exported, 228 missing on disk,
  15 failed jobs, 12 with no results, zero withheld-stale and zero outside-root.
  These diagnostics can overlap; they are not additive failure categories.
- Froze 200 rows uniformly without replacement from all exported rows, sorted
  by ID with Python random seed `20261011`. Did not select on completion or
  signal values. All 200 happened to carry identity/DSP/beat/tonal/voice
  completion markers. Sampling excludes rows absent from the parent export.
- Private snapshot receipt preserves source/subset hashes, original export
  timestamp/counts, selection method and stage denominators. Parent counts
  were deliberately not copied into the subset's `counts` field.
- Captured the twelve-case baseline using the snapshot-capture timestamp:
  six evaluated but unrated, three interpretation reviews, three manual
  pending. Five evaluated cases returned twelve tracks each. Q01 returned
  zero: `not_relaxing` was unknown for all 200, despite voice completion markers.
  Treat that as a concrete coverage gap to investigate, not a failed listening
  verdict or permission to relax the request. Seventy-one tracks also had an
  unknown `not_slow` signal. No audio was heard or classifier accuracy inferred.
- Created an editable two-tab workbook: suggested groups/counts and a filtered
  file-path table. Includes 200 random paths and 40 challenge slots (four each
  across ten groups). Amber fields accept paths and human listening notes.
  Counts recalculate as paths are entered. One or two examples per group is a
  useful starting contribution; four is a flexible first target.
- Workbook verified with formula inspection/error scan, a temporary entered
  path and restore, and rendered review of both tabs. Native Excel interaction
  has not been tested. Paths originate in the export and are not existence or
  playback checks. Keep random and challenge results separate.

Private durable root (outside Git):
`/Users/tapps/SynAmp-data/business-baseline/2026-10-11-first-library/`.
Authoritative report: `reports/random-200-capture-time-baseline.json`.
Editable workbook: `outputs/SynAmp-listening-sample.xlsx`.
Next: owner supplies challenge paths and listening labels; investigate the Q01
missing relaxation/energy coverage without changing the frozen request suite.
Two independent raters, real app cases and the ten-library gate remain open.

## Owner workflow: reveal songs in Finder

Added **Reveal in Finder** to song context menus in Explorer list/grid/table,
expanded albums, album pages and artist song lists. Brain resolves the current
path by track ID; the Mac worker selects a file with `open -R` using argument
arrays, preserving ordinary folder opening and missing-path parent fallback.
Worker rejects symlinks escaping the music roots. Queued feedback names the
analyzer Mac and does not claim confirmed Finder delivery. Offline/missing-song
errors stay visible. Existing expiry and one-shot queue behavior are preserved.

Fresh checks: web production build, Brain type check, 29 focused Brain/tool
tests, and all 131 analyzer tests pass (three existing decoder deprecations).
`node tools/player/check-library-finder.mjs` exercises real Library components
against a scratch Brain API, including song menus, exact queued paths,
one-shot delivery, disconnected/missing-ID errors and an export path change.
Browser evidence: `/tmp/synamp-library-finder-evidence/`. No owner deployment,
physical Finder selection, music moves, tag edits or rescans were performed.
To use this in the NAS install, update/rebuild Brain and web and let the Mac
worker load the updated analyzer source.

The reported album issue was traced read-only against the owner export:
`Various Artists/The 90's (1994)` contains 486 exported tracks from 251 artists.
Current album grouping uses that shared folder, so all 486 appear together.
Only 33 rows carry an album-artist tag; the plurality rule chooses the first
two-vote winner, Naughty by Nature, without checking its share of the folder.
This is a confirmed misleading-credit mechanism, not evidence that the owner
should reorganize the folder. Deferred follow-up: a reviewable “wrong grouping
or credit” flag/correction flow and compilation-aware grouping/credit rules.
Do not use a rescan as a promised repair: the same tags and folder reproduce it.
