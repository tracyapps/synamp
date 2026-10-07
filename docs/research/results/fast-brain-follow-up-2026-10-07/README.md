# Fast-brain follow-up evidence — 2026-10-07

Base: clean `main` fast-forwarded from `b6ea5ce1` to merged `be308a56`.
Autoclaw originals remain separate under `../../fast-brain/2026-10-07/archive/`.
This receipt describes the new local working-tree slice, not a commit or deployment.

| Requirement / seam | Fresh evidence | Status |
|---|---|---|
| Research continuity | 321 preserved files, 16,762,262 bytes; SHA-256/size checks and all catalog paths pass in `pnpm research:check` | Confirmed |
| Unsupported numeric residue | Focused intent tests: before 17/19 passed, two new tests failed at absent behavior; after 19/19 passed (`intent-before.log`, `intent-after.log`) | Confirmed |
| Goal-specific caveats | Focused test checks focus, first workout phase and plain BPM reading; real draft route returns metadata; browser expands notes | Confirmed locally |
| Playlist-context readout | `brain-readout.test.ts` starts owned child with scratch stores; same track P1/P2 returns two rows, only P1's thumb contributes there | Confirmed locally |
| Policy UI | Browser selects legacy → Save → Brain shows legacy-v1/heuristic-v1; switches back to epoch; API route covers both | Confirmed locally |
| Proposal honesty | Focused proposals 7/7 pass; scratch route acceptance writes global thumb_down/proposal_id/no reason, same-action retry appends nothing, conflicting action 409, missing id 404 | Confirmed locally |
| Append-only forget/auth | Same route check: unauthenticated readout 401, unsupported scope 400, original log prefix survives acceptance/reset | Confirmed locally |
| Fresh Brain regression suite | `pnpm --filter @synamp/brain test`: **222 tests, 220 pass, 1 fail, 1 skip**, exit 1 (`final-brain.log`) | Partial: unchanged baseline failure |
| Deterministic lab | **8 scenarios, 86 pass, 0 fail, 0 pending, 5 skips**, exit 0 (`final-lab.json/log`) | Confirmed synthetic invariants |
| Type checks | Brain, web and `pnpm brain:readback:type-check` all exit 0 | Confirmed |
| Web build | `pnpm --filter @synamp/web build`, exit 0 (`web-build.log`) | Confirmed |
| Read-only replay tool | `pnpm brain:readback:test`: 2/2 pass; source files unchanged, explicit clock/timezone, future event exclusion, contradictory prompt refusal, exclusive-create output, deterministic policy output except runtime | Confirmed synthetic behavior |
| Research browser layout | Desktop and 390×844 screenshots; appendix opens with 321 rows, no page horizontal overflow; console errors/warnings 0 | Confirmed locally |
| Original report navigation | Browser opens preserved report; all internal TOC fragment targets exist | Confirmed locally |
| Source-kit reconstruction | Disposable copy, `sources` renamed to `report-sources`, figures copied beneath it; Python markdown renderer exits 0, 122,225-byte HTML with 4 figures | Confirmed; original kit unchanged |
| Real-library listening / tuning | No actual listening session used to tune weights or confirm usefulness | Unverified |
| Public publication | Local static index only; private evidence not exported to a public site | Not performed |

Baseline reproduced Autoclaw's 218/216/1/1 count and the same librarian artist-name
case-fold failure (`baseline-brain.log`). The failed assertion expects
`Ani DiFranco` after renaming `Ani Difranco` on case-insensitive macOS storage;
the `/dev/shm` cross-filesystem case is skipped. The added checks create no new
suite failures. Do not call the full suite green. No vendored Webamp edits or
claims about its root type-check chain are part of this slice.

Browser: built local dist, scratch brain at :39821 and a scratch HTTP proxy at
:39822; unique temporary playlist/event/session stores and synthetic library.
No owner's :3001/:5173 process or app data was used. Playwright's default Chrome
path was unavailable; the check used the already-installed Chromium test binary.
Screenshots demonstrate the changed flow and index, not deployed behavior.

Science erratum: indexed primary-source excerpts from Janata 2009 (Subjects)
and Janata et al. 2007 (abstract) were freshly checked. Direct PMC/PubMed opening
was blocked, so this run does not claim full-text retrieval. Sources:
[2009 primary page](https://pmc.ncbi.nlm.nih.gov/articles/PMC2758676/) and
[2007 primary abstract](https://pubmed.ncbi.nlm.nih.gov/17965981/).

Next evidence: freeze a real library/event/plan snapshot with applied spot-check
corrections, explicit time/timezone and playlist context; run `readback.mts` and
have the owner compare its explanations with one actual listening session and
later contexts. The replay cannot establish causal improvement. Keep raw private
reports outside publishable knowledge-base content.
