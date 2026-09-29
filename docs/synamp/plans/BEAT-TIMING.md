# Beat timing: implementation and validation plan

Updated 2026-09-29. Entry point for the next rhythm agent.

## Current boundary

`services/analyzer/src/synamp_analyzer/beat.py` now tracks a candidate pulse,
checks local predictive contrast, and separately decides whether timing can be
measured. See [the investigation](../../research/beat-timing-findings-2026-09-29.md).
The dense-mix rejection and unfinished refactor are repaired. **Real-recording
before/on/after classification is not validated or ready for query predicates.**

Positive `microtiming_signed` means early; negative means late. This is the mean
of eligible mixed-audio onset residuals, not a specific instrument's delay.
A 30 ms late secondary layer plus an on-time anchor can average to −15 ms.
Shifting the entire recording changes phase, not musical feel. No method can
recover an absolute offset without a reference. Do not train an energy model
on these values as if the perceptual hypothesis were already established.

## Working agreement

Own `beat.py`, rhythm fixtures/tests, and rhythm evaluation artifacts. Coordinate
changes to `models.py` with the stage-versioning owner. Preserve the existing
uncommitted decoder/scanner/pipeline work. Run from `services/analyzer`:

```sh
uv run pytest tests/test_beat.py tests/test_contract.py -q
uv run pytest -q
```

Use the existing permissive DSP stack first. New model code, weights, data and
output-use terms require separate provenance review; a repository licence alone
is insufficient. No model downloads or full-library reanalysis are prerequisites
for the next slice.

## R1 — Freeze a benchmark before changing thresholds

Inputs: `tests/synth.py`, current tests, real-library read access. Deliver a local
manifest and machine-readable report; never copy the music into the repository.
Record source identity (hash or size/mtime with that limitation), excerpt times,
annotation version, extractor version, parameters, machine, wall time and errors.

1. Generate separate anchor and target parts with event times in a manifest.
   Sweep target offsets {−60, −45, −30, −15, 0, 15, 30, 45, 60} ms, several
   tempi, swing, amplitude ratios, density, timbres, compression and reverberation.
2. Include global shifts, accelerating/decelerating tempi, tempo steps, silence,
   steady tones, speech-like irregular events, applause, missing beats, shuffled
   onsets, syncopation and half/double-time ambiguity. Include 22.05/44.1/48 kHz.
3. Split by generator recipe, seed and timbre. Hold out whole recipes, not just
   another rendering of the same loop. The current dense fixture is a regression,
   not a realism benchmark.
4. Freeze a diverse real set: acoustic/live, programmed, dense full-band, sparse,
   rubato, and non-music. The two-track smoke test is not representative. Obtain
   independent beat annotations on selected passages before claiming accuracy;
   do not validate against beats emitted by the same tracker.
5. Report pulse coverage AND false acceptance, beat-time error with octave-aware
   alternatives reported separately, timing sign/offset error, abstention reason,
   runtime and memory. A high coverage rate alone is not success.

Exit: repeatable report; frozen development/held-out split; every known label
traceable to construction or an independent annotation. Suggested synthetic
acceptance gates for the next method: ≥95% correct signs for identifiable target
shifts of at least 30 ms, median target-offset error ≤10 ms, and ≤5% pulse false
acceptance on null controls. These are proposed engineering gates, not existing
results. Freeze them before running the expanded evaluation; report zero-offset
bias separately. No real-music accuracy threshold is meaningful without labels.

## R2 — Local tempo reference without erasing the effect

Depends on R1. The current straight-line residual guard intentionally abstains
on drift. Replacing it with the tracked beat times would hide the problem by
forcing residuals toward zero.

1. Introduce a diagnostic beat timeline: seconds, local interval, support,
   coverage and ambiguity. Keep it in an evaluation artifact initially; choose
   durable segment storage with the schema owner before growing result payloads.
2. Compare a robust local tempo curve with leave-one-event-out predictions.
   Fit on a reference layer independent of the target events where possible.
   A full-mix tracker plus neighbour prediction is still statistically coupled;
   it is not independent ground truth.
3. Choose the smoothing scale using held-out drift-versus-offset fixtures.
   Overly rigid fits turn drift into feel; overly flexible fits absorb the offset.
4. Detect breaks and low-support spans. Do not interpolate through speech,
   long rests or track boundaries and call the interpolation observed beats.
5. Preserve several tempo/phase hypotheses when half/double time or offbeat
   locking is unresolved. Abstain rather than silently choosing a metrical level.

Exit: ramps retain their known direction and recover target offsets relative to
an independent anchor; global shifts leave the relative metric unchanged; gaps
produce missing spans; no regression on null controls. Export error and coverage
per segment rather than only a track average.

## R3 — Attribute onsets before measuring lead/lag

Depends on R2. Uniformly averaging all spectral-flux peaks conflates instruments,
subdivisions, flams and detector latency.

1. Prototype band-specific/percussive onset streams without new checkpoints.
   Measure attack-time bias per timbre and sample rate using the rendered events.
2. Associate target events with reference beats monotonically and one-to-one
   within the declared subdivision; keep unmatched events out of the denominator
   and report them. Do not snap every event to its nearest beat and discard the
   evidence that disagrees with the model.
3. Report target-to-anchor signed median, robust spread, observation count,
   interval/uncertainty and supported duration. State the anchor and target.
4. Distinguish kick/snare placement, swing and purposeful syncopation. Define
   swing's metrical orientation; equal-strength antipodal patterns are ambiguous.
5. If separation is needed, evaluate bleed and latency before adding a model.
   Audit exact weights and benchmark its cost on the M4 Pro separately.

Exit: R1's held-out gates pass across density and timbre; ambiguous mixtures
abstain; isolated stem offsets survive remixing within declared error bounds.
Keep existing scalar fields for compatibility but version their interpretation.

## R4 — Aggregate, then ask whether people hear it

Depends on R3 plus the [owner study](AGENT-ROADMAP.md#p6--owner-study-and-conditional-booth).
Aggregate only supported segments, carry coverage and uncertainty, and preserve
opposing section-level feels instead of cancelling them into “on beat.”
Before/on/after must use an explicit, calibrated neutral band and an independent
reference. A null measurement is never “on beat.”

Compare owner-rated perceived energy against matched stimuli with tempo and
loudness controlled. Keep “sounds energetic” separate from “helps me focus.”
If timing is measurable but does not predict the owner's judgement, keep it as a
musical descriptor and do not use it as an energy proxy. No crowd vote can repair
an objectively inaccurate timing extractor.

## Do not repeat these approaches

- Global unweighted phase concentration as a prerequisite for beat detection.
- A high tempo peak treated as proof that a beat exists.
- Relaxing thresholds until every real track returns a number.
- Calling rejected tracks “arrhythmic” without independent evidence.
- Reading tightness against the same individual peaks selected as beats.
- Calling a mixed onset mean the exact displacement of one instrument.
- Claiming a whole-track conclusion from a convenient short excerpt.
