# Fast-brain follow-up — research into working evidence

Status: 2026-10-07. Autoclaw's implementation was merged as `be308a56` (feature
commit `66cbe4e8`). Current task states live in the [research catalog](../../research/index.html#tasks),
whose editable source is [catalog.json](../../research/catalog.json). This handoff
supersedes the historical branch/worktree instructions and intermediate counts.

## Where the single source of truth lives

- [Research library with TOC and source appendix](../../research/index.html): entry point for all research, current work and errata.
- [Original report](../../research/fast-brain/2026-10-07/archive/DELIVERY/SynAmp-Fast-Brain-Report.html): immutable Autoclaw edition, with its original TOC, figures and appendix.
- [Preservation manifest](../../research/fast-brain/2026-10-07/manifest.json): every original content file, SHA-256, bytes, role, original path and source modification time. Four `.DS_Store` files excluded; no research excluded.
- `docs/research/fast-brain/2026-10-07/archive/`: full original tree, including raw A1–A4 packs, B/H receipts, C reviews, report-kit, PDF, verification, probe scripts and historical code snapshot. Runtime code belongs in `apps/` and `tools/brain-lab/`.
- [FAST-LEARNING-BRAIN.md](FAST-LEARNING-BRAIN.md): original implementation contract; this follow-up provides current operations and remaining work.
- [AGENT-ROADMAP.md](AGENT-ROADMAP.md): system-wide dependency order. P4 producer work remains under that contract, rather than gaining a conflicting second roadmap.

`pnpm research:build` regenerates the library from the catalog and checks every
archive hash. `pnpm research:check` also rejects stale HTML. Never rewrite the
archive to fix a claim; add an erratum and edit the maintained document or code.
Scientific claims retain MP/CC/ML IDs, retrieval dates and retrieval modes. A past
confidence label is not evidence of full-text access or present correctness.

## First implementation slice (FB01–FB06)

One integration owner; keep the policy magnitudes and thresholds at `epoch-v1`.
The interpreter is `intent-v2` because numeric-residue behavior changes. No event
migration, feature producer, automatic exploration, or parameter tuning is needed.

| ID | Owner role | Files and seam | Acceptance |
|---|---|---|---|
| FB01 | Research librarian | archive, manifest, catalog, `tools/research/build.mjs`, docs links | All original research content retained, hashes verified, TOC and appendix usable, generated index repeatable. |
| FB02 | Intent implementer | `intent/interpret.ts`, `intent/intent.test.ts` | Unmapped years, ranges, short numbers and decimals appear in audit/asks; supported BPM ranges remain specific; prompt/ask/schema caps hold. |
| FB03 | Intent/web implementer | interpreter reading metadata; `index.ts` draft summaries; `Describe.tsx` | Caveats/culture notes follow each applied reading, including contradictions and first-phase-only requests; expandable UI shows them; scoring plan is unaffected by metadata. Clarifying asks remain visible alongside usable readings. |
| FB04 | Session/web implementer | `index.ts` readout; `BrainSession.tsx`; scratch route test | Adjust with each entry's playlist ID; same canonical track in different playlists gets separate rows; 50-entry cap; UI uses context-aware keys. Settings offers both existing policy values and hot-applies on Save. |
| FB05 | Learning/web implementer | `learning/proposals.ts`, `proposals.test.ts`, `BrainSession.tsx` | Global thumbs-down is described as lower preference, never guaranteed exclusion. Real route acceptance appends one normal event, preserves reason honesty and dedupes retries; conflicting decisions return 409. |
| FB06 | Research editor | maintained brain dossier; catalog errata | Correct the memory statistic using primary sources. Janata 2007's study-specific 30% result is separate from Janata 2009's ≥30% recruitment threshold. No population prevalence or focus-impairment inference. |

## Next experiments (FB07–FB13)

**FB07 — real-library read-back, before tuning.** Owner/evaluation implementer;
depends on FB02–FB05. The read-only `tools/brain-lab/readback.mts` is implemented and uses `LibrarySource`, `EventLog`,
`deriveEpochPolicy`, `deriveFeedback`, `evaluatePlan` and `sequenceTracks`.
Inputs must explicitly name library snapshot, event snapshot, validated plan,
playlist context, `now` and timezone. Outputs: input hashes, versions, denominator,
missing-axis coverage, baseline versus epoch ranks, explanation parts, hidden IDs,
underfill, timing cost and exclusions. No writes to the input stores and no live
signals synthesized. Static replay tests invariants and exposes differences; it
cannot establish causal improvement. First real listening closure: owner listens
through one session and compares the readout with what they meant, including a
break >30 minutes and a later day. Record anonymous verdicts separately from raw
private tracks/events. Only then propose changes to A3 P1–P25, with a new policy
version and fresh isolation/bounds/hard-rule checks. Never tune from fixtures.

**FB08 — metre correction.** Analyzer/spot-check implementer; depends on the
current spot-check contract and FB07's observed failures. Files:
`apps/brain/src/library/spotcheck.ts`, its tests, web `SpotCheck.tsx`,
`learning/reliability.ts`, analyzer export registry and BEAT-TIMING R2/R4.
Start with explicit user states: layered/ambiguous and tap-the-cycle 2/4/8,
5/7/9/11. Store verification tier and the source measurement/version; invalidate
when the measurement changes. Do not conflate cycle length with BPM or assign
4/4. Tests cover odd/layered inputs, expiry and reliability consumption. Human
correction cannot retrospectively validate the beat detector on all real material.

**FB09 — tempo reliability in ordering.** Query/evaluation implementer; depends
on FB07 and a documented behavior decision. Files: `query/sequence.ts`, tests,
`learning/reliability.ts`. Today ordering uses uncertain BPM at half weight,
while learning refuses missing/≤0.2 confidence. Decide whether to share a rule
or retain the distinction explicitly. Test missing/0/.2/.35/.5/1 confidence,
coverage fallback, unknown-track positions, full permutations and hard guards.
Version any semantic change; no silent gate or band tuning.

**FB10 — producer readiness.** Analyzer implementer; depends on system P1/P4
and producer-specific evaluation. Retain the [agent roadmap's P4](AGENT-ROADMAP.md#p4--feature-producers-and-model-clearance)
for voice/piano first, embeddings next. Document code/checkpoint/weight licenses
separately, decode policy, resource cost, provenance, reliability/abstention,
resumability and independent held-out evaluation. Declared fields remain unknown;
no absolute “no piano” guarantee. Arousal/valence and culture-linked constructs
need additional validation, not merely a field appearing in an export.

**FB11 — explicit continuous-form arc protection.** Product/query owner; depends
on a schema/design decision. A2 §4.4 rule 9 / C2 F10–11 recommend user-declared
protection for continuous-form, quiet-time or ceremonial material. Never infer
these contexts from audio, artist or genre. Decide whether protection belongs
on track metadata, a listening context, or a plan; define mixed-list behavior,
hash and export compatibility first. Acceptance: explicitly protected material
keeps ordering with a visible reason; hard rules still hold.

**FB12 — proposal lifecycle.** Learning/product owner; depends on owner evidence
from FB07. Current `(kind,subject)` IDs plus persisted decisions suppress a
dismissed pattern permanently. Record that as intentional or design an explicit
review/reset/expiry control. New evidence must not silently overrule a dismissal.
Test restart persistence, accept retry, conflicting decisions and chosen reset.
Artist proposals record a decision only; they do not implement artist exclusion.

**FB13 — sequence experiments.** Query/music-psychology owner; depends on FB07,
FB09 and producer coverage. A1 §3's “2–3 tracks then hold,” optional instant-max,
texture waves and optional catharsis lift exceed the current full-list arcs.
Freeze the desired shape and outcome before implementing. No automatic mood
inference or mood-lift promise; preserve unknown positions, hard guards and
membership. Compare with flat order using owner read-back or a predeclared
switchback; deterministic replay supplies no fabricated propensities.

## Future public knowledge base (FB14)

Publication remains a separate work package. The repository now has a reusable
catalog and HTML index; use it as the seed, not a second copy of the research.

1. Topic navigation: goals/attention, memory/affect, rhythm/metre, cross-cultural
   measurement, recommendation learning, analyzer producers, evidence/experiments.
2. Each publishable article: question, supported findings, candidate design,
   disagreements, limits, source IDs/links with retrieval modes, update date,
   code/experiment links and attribution. Keep source confidence distinct from
   retrieval quality. Upgrade snippet/tertiary claims before authoritative public prose.
3. Explicit publication allowlist: original report may be adapted into public
   articles; private event logs, filenames/paths, operational logs and screenshots
   remain outside the public export. Review reuse rights for third-party visuals,
   quotations and cultural attribution. No tradition-named feature without the
   existing consultation and decision rule (D8/A2 §4.3).
4. Build static topic/TOC/source pages from maintained content, test local links,
   fragments, responsive layout, keyboard navigation, search and export reproducibility.
5. Decide hosting/domain and approve the concrete publication artifact last.
   This task preserves and organizes the research; it does not publish the archive.

## Verification and operations

Current evidence goes in `docs/research/results/fast-brain-follow-up-2026-10-07/`.
Baseline and post-change logs are separate from Autoclaw's immutable captures.
Run affected intent/learning tests, route test, brain suite, both app type-checks,
web build, lab and research integrity check. Known baseline: macOS case-fold
librarian failure and missing `/dev/shm` skip. Do not call the full suite green
when that failure remains. Vendored Webamp type errors are outside this slice.

Runtime rollback: Settings → Learning → Use the earlier feedback policy → Save,
or `POST /api/v1/settings {"listening_policy":"legacy-v1"}`. Both derive the same
append-only log. Re-enable through the corresponding session-learning choice.
Code rollback after merge is a reviewed Git revert of the intended change;
never follow the archival `reset --hard` recipe on current `main`.

For scratch smoke/browser work, use a new temporary data directory and a port
owned by the child process. Explicitly configure playlist, events, session,
library signals and library paths. Never reuse the owner's :3001/:5173 processes
or `apps/brain/data/`. End only processes started by the check. Leave a receipt
with exact inputs, versions, commands, exit status, exclusions, remaining evidence
and the next smallest experiment.
