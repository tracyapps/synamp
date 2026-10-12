# B02 frozen listening baseline

Suite `2026-10-11.1` is frozen in
[`business-prompts.v1.json`](../../tools/brain-lab/business-prompts.v1.json).
Change the version when changing the requests; retain earlier reports. The
twelve cases include exclusions, mixed instruments, weak/no pulse, live metadata,
contradictory/unsupported asks, shortages, similarity, correction persistence and
a full workday. Candidate cases are hypotheses, not already-supported claims.

## Offline capture

Use a consented, frozen export of a bounded library subset. Keep input snapshots
and reports in separate private directories outside the repository; reports
include private track IDs and interpreted plans. Do not recompute a running
analyzer stage just to prepare this report. No audio files belong in fixtures.

```sh
node --experimental-strip-types tools/brain-lab/business-baseline.mts \
  --library /absolute/private/snapshots/library.json \
  --now 2026-10-11T18:00:00Z --material real \
  --out /absolute/private/reports/library-01-baseline.json
```

Use a new output filename each run. The tool refuses overwrites and outputs in
the input directory, creates mode-0600 reports, verifies input stability, and
records input/suite hashes, source SHA/dirty state, stage markers, available
export counts, plan and requested/returned/unknown counts. It never invokes a
model, downloads weights, writes events/corrections or contacts a server. A
`real` declaration is not verification of origin. Stage markers and failed-job
counts are different evidence: absent markers/counts remain unknown.

Six prompts currently evaluate against the synthetic 60-track sample; three
require interpretation review, including the live-recording request and two
unsupported requests. “A steady beat” now uses the existing measured-pulse
definition, with unknown signals excluded and no beat-grid accuracy claim.
Those remaining gaps are retained. Three cases need real app/listening sessions.
Exit 0 means a report was captured; it does not mean the quality gate passed.
Ambiguous/partial requests are not silently given an arbitrary reading. Resolve
them explicitly and save the chosen validated plan with the private receipt;
the existing `readback.mts` can inspect that plan against frozen events.

The offline snapshot does not include the live server's correction or path
overlay stores. Freeze their applied view explicitly before comparing with the
UI. Computational replay time is not analysis throughput or time to first value.

## Two-rater procedure

1. Record random library ID, source/build, consent and material origin, subset
   selection rationale, track count/formats and all stage/export denominators.
   Preserve difficult examples: vocals, wordless voices, piano mixtures, live,
   unfamiliar artists and beatless music. Do not select only clean successes.
2. Capture the frozen report. Keep every case, ambiguity and shortage. Record
   supported versus unsupported disposition **before** scoring; narrow the
   promise explicitly if necessary. Do not retroactively omit a failed pair.
3. Each of two raters independently hears the returned tracks and records
   fit 1–5, useful yes/no/unknown, audible hard-rule violations by track ID,
   and notes about missing evidence. The report starts all judgments at null.
   Report the two scores separately; require both ≥4/5 for a pair to qualify.
4. For a supported pair, require at least three useful tracks, or the full
   independently reviewed eligible set if fewer than three exist. An empty
   result is an honest shortage, not a useful supported playlist. Record the
   eligible-set denominator or leave usefulness unassessed; do not equate the
   algorithm's returned count with a ground-truth eligible count.
5. Complete Q10–Q12 in the actual app using a trial state: seed/returned IDs and
   unfamiliar artists; correction before/after and restart; actual workday
   duration, repeat cycling, shortages and restart. Synthetic queue tests do
   not pass these cases. Record device/browser versions and private evidence.
6. Preserve raw judgments privately. Publish aggregate results only with
   permission: all applicable supported pairs, qualifying pairs, misses,
   pending ratings, unsupported refusals, shortages and observed violations.
   The proposed release gate remains ≥80% useful supported pairs across ten
   real libraries with two raters each, and no observed known-hard-rule
   violation. Missing reports cannot pass the gate.

## Local checks

```sh
pnpm business:baseline:test
pnpm brain:readback:type-check
```

Synthetic regression tests prove unknown/shortage reporting, retained manual and
unsupported cases, input preservation and private/exclusive output. They cannot
establish audible classifier accuracy, usefulness, coverage on the owner's music,
improvement over another model or the ten-library release gate.
