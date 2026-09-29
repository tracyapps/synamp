# Beat timing investigation — 2026-09-29

## Baseline and scope

Starting HEAD: `513d9ef3` (`analyzer beat grid`), with 11 already-modified analyzer
files. Those changes included the unfinished DP tracker, AAC decode fallback,
parallel directory walking and tests. They were preserved and built upon; this
report does not attribute all of that work to this pass.

Relevant research: [Brain dossier](synamp-brain-dossier.html), especially the
metric taxonomy, query compiler, feedback model and adversarial review; and the
[Sound Booth plan](synamp-sound-booth-plan.html), especially objective synthetic
labels, owner-first calibration and synthetic-to-real validity. Product sequencing
remains in [ROADMAP.md](../synamp/ROADMAP.md).

Baseline command, from `services/analyzer`: `uv run pytest -q`.
Result: **10 failed, 31 passed**, exit 1. Every failure was a `NameError` from the
removed `MIN_GRID_STRENGTH` constant still referenced by `extract_beat`.
This is distinct from the earlier real-recording rejection reported by AutoClaw.

## Root causes and repairs

1. **Incomplete gate refactor.** Remove the obsolete gate, not just restore its
   constant. It tested unweighted onset phase concentration against one global
   tempo before allowing the dynamic tracker to run. Dense unrelated peaks dilute
   that statistic; drift invalidates the global reference as well.
2. **Pulse evidence versus timing evidence.** Track a candidate pulse, predict
   interior beat positions from adjacent beats, and compare local onset energy
   with equally wide phase-shifted controls. Multiply contrast by supported-beat
   fraction so a handful of strong beats cannot justify a mostly unsupported
   sequence. It is a heuristic; neighbour predictions remain coupled to the
   fitted tracker, so the score is not independently calibrated confidence.
3. **Penalty scale.** With peak-normalized envelope scores, DP tightness 20
   inserted unsupported beats into the slow half of the constructed 100→140 BPM
   ramp and even reported the wrong drift direction. Tightness 6 follows the
   constructed ramp. This was selected on a development fixture, not held-out
   evidence of generalization.
4. **Timing eligibility.** Keep beat diagnostics but abstain from timing/swing
   when the fitted whole-track reference RMS exceeds 15 ms, onset concentration
   is below 0.3, or tracker resolution exceeds 15 ms. Do not replace the line with
   the same selected onset times and thereby erase timing residuals by design.
5. **Bookkeeping.** Count tracked beats rather than extrapolated grid lines;
   use the decimated frame rate when centering the envelope; preserve envelope
   length for short inputs; calculate fractional BPM drift as
   `first_interval / second_interval - 1`, rather than fractional interval change.
6. **Whole-recording cost.** Replace quadratic direct autocorrelation with FFT
   correlation. A test compares public tempo outputs with direct correlation.
   One local 40,000-frame timing probe measured 20.44 ms direct versus 2.52 ms
   FFT, about 8.1× faster, normalized correlation discrepancy below 4e−9. This is
   one microbenchmark, not an end-to-end library throughput estimate.
7. **Inspectable outcomes.** Persist `beat_status`, `timing_status`,
   `beat_method` and `beat_diagnostics`. Add a read-only JSON evaluation command
   that records errors without stopping subsequent files. No production catalog
   was scanned or rewritten during validation.

The method identifier is `dp_predictive_contrast_v1`. Old stored numbers have a
different meaning and must not be mixed without version checks. Automatic stage
revision invalidation is still future work; use `analyze --redo-stage beat` on
an explicitly selected analysis database when ready to refresh it.

## Fresh evidence

| Requirement | Evidence | Status |
|---|---|---|
| Existing analyzer behavior survives | Entire analyzer suite: 56 passed, 3 existing audioread deprecation warnings | Confirmed |
| Dense accompaniment does not automatically erase a pulse | Constructed pulse with 700 random quiet transients, 90/120/150 BPM and three seeds | Confirmed on these fixtures |
| Optimization does not justify arbitrary dense peaks | Four independent exponential random envelopes rejected by pulse-evidence gate | Confirmed on these controls |
| Early/late signs and swing remain correct on identifiable patterns | Existing ±30 ms layers, straight eighths and triplet swing tests | Confirmed on these fixtures |
| Drift is reported without inventing a timing label | Accelerating fixture retains beat/drift and null timing/swing | Confirmed |
| Reasons survive persistence | SQLite save/load test of drifting result and diagnostic fields | Confirmed |
| Real-library timing accuracy | No independent beat or instrument-offset annotations | Unverified |
| Timing predicts owner-perceived energy | No listening experiment in this pass | Unverified |

### Two full-recording smoke checks

The [saved JSON report](results/beat-smoke-2026-09-29.json) records the exact paths,
file size/mtime, dependencies, parameters, diagnostics and runtime. Inputs were
selected for quick diagnostic breadth, not random sampling or a frozen benchmark.

| Recording | Pulse result | Timing result | Interpretation |
|---|---|---|---|
| Ani DiFranco — Talk To Me Now | Score about 0.221, below 0.5 acceptance | No reliable grid | This method lacks enough evidence; no claim that the music lacks a beat |
| Fleetwood Mac — Dreams | Score about 0.529; 514 tracked beats | Straight-reference RMS about 100 ms, timing withheld | Pulse detection can succeed while microtiming is unidentifiable with this reference |

“Dreams” has 7,351 detected onsets but onset phase concentration only about
0.034. That directly illustrates why a gate over all onset phases discards useful
pulse evidence. Its accepted timeline has not been manually validated.

A third candidate, Daft Punk's 45-minute ALIVE 1997 file, was excluded before
analysis to keep this probe bounded. It is not counted as an analyzed track.
No audio was copied into the repository. This probe does not reproduce the
previous 119-track live corpus and must not be reported as doing so.

Reproduce a report from the analyzer directory:

```sh
uv run python -m synamp_analyzer.evaluate_beat \
  '/Volumes/music/library/Ani DiFranco/Ani DiFranco/02 Talk To Me Now.mp3' \
  '/Volumes/music/library/Fleetwood Mac/Rumours (35th Anniversary Super Deluxe Edition) (Disc 1)/02 Dreams.mp3'
```

## Research conclusions to carry forward

The original README interpreted real-track rejection as proof of no steady grid.
That conclusion has been removed. A method's rejection is not independent musical
truth. Likewise, the synthetic secondary-layer mean (roughly half the injected
shift) does not estimate a specific player's displacement.

The next hard problem is an independently anchored local timing reference and
onset attribution, not another lower threshold. The research's energy hypothesis
needs a separate personal listening test after measurement works. The code does
not yet classify real recordings as before/on/after the beat.

The dossiers also contain implementation hazards: an illustrative query schema
with incomplete validation and unsafe relaxation actions; producer names that do
not match current fields; unverified checkpoint permissions alongside confident
“shippable” tables; no independent sonic-era truth; and conflicting booth pilot
conversion/agreement gates. The [agent roadmap](../synamp/plans/AGENT-ROADMAP.md)
makes these explicit rather than silently turning them into defaults.

Next work: [beat timing plan](../synamp/plans/BEAT-TIMING.md), then stage revisions,
supported query predicates, actual playback feedback, feature producers and
owner calibration. No public booth launch is implied by this handoff.

## Final verification

- `uv run pytest -q` from `services/analyzer`: exit 0, **56 passed**, 3 existing
  audioread deprecation warnings, 2.19 seconds on this run.
- Real-recording evaluation command above: exit 0; saved report regenerated
  after the final timing-resolution guard.
- `node tools/roadmap/build.mjs --date 2026-09-29`: exit 0, eight phases and
  one cross-cutting section; generated roadmap refreshed.
- `git diff --check`: exit 0. Existing unrelated analyzer edits preserved.

No commit, deployment, model installation or production reanalysis was performed.
