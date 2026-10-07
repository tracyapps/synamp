# C3 evidence — music-psychology review probes

Run from `apps/brain/` with `node --experimental-strip-types /path/to/probeX.mjs`.
All probes are read-only: they import brain modules and evaluate against
`fixtures/library.sample.json` (synthetic, 60 tracks). Nothing writes to app stores.

## Files

| file | what it shows |
|---|---|
| `probe1-bundles.mjs` + `probe1-out.json` + `probe1-summary.txt` | Goal-family bundle fidelity: 27 trigger phrases → emitted constraints (field/op/band/weight) per goal |
| `probe2-neutrality.mjs` | Scaled vs raw focus weights: pure prompt identical; "focus + jazz" mixed plan reorders |
| `probe2b-detail.mjs`, `probe2c.mjs`, `probe2d.mjs` | Mixed-plan divergence detail (emitted list positions, per-track scores) |
| `probe2e.mjs` | Decomposition: scale effect (raw vs exact-k) vs floor effect (floor vs exact-k) |
| `probe2f.mjs` | First micro-swap caused by `Math.floor` weight truncation (pure plan) |
| `probe3-declared.mjs` | Declared-field simulations (declared fields stripped = "real library"): feedback flip example |
| `probe3b.mjs`, `probe3c.mjs` | Score-order inertness (MMR off) vs MMR-on divergence with/without declared constraints |
| `probe4-sequence.mjs` | Sequencing arcs: build/peak/cooldown directions, set-preservation, coverage fallback |
| `probe5-learning.mjs` | Skips session-scoped; not_now; repeats monotonic; proposal thresholds (epochs/dates/dayparts, active-epoch exclusion) |
| `probe6.mjs` | Emitted-weight arithmetic; supersede; fast+calm pair; drive "energetic" leak |
| `probe7-years.mjs` | "years 1990–2005" not parsed / silently dropped in one phrasing |
| `probe8-blends.mjs` | calm+sleep merge; calm+chores merge; pump_up+sleep NOT opposed ("workout then sleep") |
| `probe9.mjs` | User-example phrases fire the right goal with one valid reading |

Logs (`*.log`) are the captured stdout of the same probes (rerun after `probe1-out.json` was created).
