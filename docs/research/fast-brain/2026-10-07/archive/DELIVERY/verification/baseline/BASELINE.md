# BASELINE — SynAmp brain, pre-engineering baseline evidence (B4)

Date: 2026-10-06 · Branch: `feat/fast-learning-brain` @ `b6ea5ce1` (identical to `main`; no task commits yet at capture time)
Platform: macOS (Darwin 25.6, arm64) · Node v24.13.0 (repo requires ≥ 22) · `node_modules` present.
Collector: B4 (verification harness & baseline subagent). All counts below are pasted from the raw logs in this directory.

## 1. Brain test suite

Command (verbatim): `pnpm --filter @synamp/brain test`
Script it runs: `node --experimental-strip-types --test src/*.test.ts src/*/*.test.ts`

| source | command run | tests | pass | fail | skipped | duration |
|---|---|---|---|---|---|---|
| `synamp-brain-test.log` (A4 capture, ~22:35) | same | **149** | **147** | **1** | **1** | 696.4 ms |
| `brain-test-rerun-2026-10-06T2258CDT.log` (B4 re-run, started 2026-10-06T22:58:15-0500, ended 22:58:16) | same | **149** | **147** | **1** | **1** | 667.6 ms |

Exit status: **1** in both runs (the single failure). The two runs agree exactly; the re-run was taken while other agents were
working in parallel — at that moment `git HEAD` was still `b6ea5ce1` (no task commits yet), so the counts are directly comparable.
A later re-run may differ if parallel edits land mid-flight; re-check the timestamp before quoting.

## 2. The two known pre-existing reds (carry, do not chase)

### (a) librarian artist-merge case-fold test — macOS-only
- Failing test: `apps/brain/src/librarian/librarian.test.ts:149` "artist merge: whole folders, everything follows, the variant folder disappears".
- Expects `Ani DiFranco/...` after a merge from the `Ani Difranco/...` spelling; on macOS the two spellings are the same case-insensitive
  directory, so the folder is never re-spelled and `pruneEmpty` cannot remove it. Deterministic on re-run (see `synamp-librarian-test.log`);
  pre-existing on `main` (same commit). On Linux CI this test passes.
- The 1 skipped test is the cross-disk import case (`skip: !existsSync("/dev/shm")` in `librarian.test.ts`): expected skip on macOS.
- Do not "fix" it in this task; quote it in every final receipt so it is not mistaken for a regression.

### (b) Root `pnpm type-check` stops in vendored `webamp` — pre-broken chain
- `pnpm type-check` → `brain && web && webamp && ani-cursor && winamp-eqf`. `@synamp/brain` → exit 0; `@synamp/web` → exit 0;
  then `webamp@2.3.1` fails (e.g. `TS2307 Cannot find module 'winamp-eqf'`, `TS2307 ... 'ani-cursor'`, `TS2742`, `TS2786`) and the
  chain stops. Cause: the raw root script calls filters directly and skips turbo's declared dependency builds
  (`turbo.json`: `webamp#type-check dependsOn ani-cursor#build, winamp-eqf#build`). Unrelated to this task (nothing owns `packages/webamp`).
- **Receipt commands that must be used instead**: `pnpm --filter @synamp/brain type-check` (exit 0) and
  `pnpm --filter @synamp/web type-check` (exit 0) — see `synamp-typecheck.log` for the raw output.

## 3. Same-day second signal (identical failure, single file)

`synamp-librarian-test.log` — single-file re-run of the librarian suite confirming the failure is deterministic (same assertion, same
actual/expected folders). Full-suite context for the same run is in `synamp-brain-test.log`.

## 4. Evidence files in this directory

| file | content |
|---|---|
| `synamp-brain-test.log` | full brain suite output (A4 capture): 149/147/1/1, the librarian failure + skip |
| `brain-test-rerun-2026-10-06T2258CDT.log` | B4's own re-run, timestamped start/end + git HEAD, same counts |
| `synamp-typecheck.log` | root `pnpm type-check` output: brain/web clean, webamp chain failure |
| `synamp-librarian-test.log` | single-file librarian re-run (deterministic failure excerpt) |

## 5. Notes / limitations

- Fixture caveat (repo convention): the sample library is synthetic — these numbers say nothing about real music.
- No CI workflows exist in-repo; there is no remote green to compare against.
- Test glob is one level deep (`src/*.test.ts src/*/*.test.ts`) — tests nested deeper never run (carried from A4 §2.6).
- Counts expected after engineering: pass count should only go **up** (new `src/intent|learning|query` tests join the same glob);
  fail should stay exactly the one librarian case; skipped exactly the one `/dev/shm` case.
