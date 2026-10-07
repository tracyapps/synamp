# EVIDENCE — brain-lab final-lab (H4 refresh, POST hotfixes H1/H2/H3)

This directory is the canonical capture of the SynAmp brain-lab verification harness for the fast-learning brain
task, refreshed by **H4 (lab sync)** on **2026-10-07 00:13–00:14 CDT (UTC 05:13–05:14)** from
`/Users/tapps/_dev/web-apps/SynAmp` on branch `feat/fast-learning-brain` at commit-ish HEAD
`b6ea5ce1d891f084854407fba1f65ee5febc9e28` — working tree dirty by design (all B1/B2/B5/B4b and hotfix edits are
uncommitted; no commits were made, per task).

The lab ran green **post hotfixes H1/H2/H3**: **8 scenarios · 91 emitted checks — 86 pass · 0 fail · 0 pending ·
5 skips** (skip register in `tools/brain-lab/README.md`). Two consecutive runs are byte-identical JSON except for
`generated_at` (normalized content sha256
`c81b8753ddf79b61a023bf45a66bd581bef1a6634ef4199bd4b8e2335dfdb831`), and a third run from a different working
directory (`/tmp`) produced the same normalized output. `lab.json` is the canonical machine evidence (schema
`synamp.brain-lab/1`), `lab.stdout.log` its stdout trace; `hashes.txt` fingerprints the brain modules (same
curated set as the B4b capture, values refreshed) plus the harness; `run.json` is the machine-readable summary
(timestamps, counts, hashes); determinism artifacts: `determinism-run1.json`, `determinism-run2.json`,
`cwd-run.json`, `cwd-run.log`, `determinism.txt`.

## What changed vs the B4b capture (2026-10-07 ~04:39 UTC)

- **Stale check fixed (the point of this sync).** `learning-resolve-hidden` (scenario 05) asserted the old
  hide list; after H2's C2-F4 display split it read `hidden[]` as empty and failed (`65 pass · 1 fail · 5 skip`
  pre-H4 — the app was correct, the expectation was stale). It is now
  `learning-resolve-hidden-by-session`, asserting the **new display contract**: the epoch-hidden tracks
  (`sample-026`, `sample-028`) are out of `strict`, counted by `counts.hidden_by_session === 2`, **not** in the
  persistent `hidden[]` list, and the strict drop is accounted for by `hidden_by_session + hidden_by_you`.
- **+4 `sequence-wave-*` checks** in scenario 05 — the C1-F1 regression (odd measured counts n=1,3,5: full
  permutations, no `undefined`, JSON-clean; even counts keep the pre-fix interleave byte-identically; `applied[]`
  keeps the post-H1-2 pace/energy-proxy wording).
- **+1 scenario `08-culture-guardrails` (+16 checks)** — seeded from C2-bias-review.md §E1 (10 culture prompts +
  2 controls). Pins observed behaviour (`{slug}/pinned`) and asserts defensive properties: banned product-copy
  words absent (quoted user echo + audit input phrases excepted and counted), culture spans never asserted
  outside quoted echo (no invented semantics), every unparsed span surfaced in asks, no dead ends.
- Scenario count 7 → 8; emitted checks 71 → 91 rows (86 pass + 5 skip); **0 fail**.
- Pre-refresh references kept for history: `prerefresh-run.json` / `prerefresh-run.log` (pre-B4b state),
  the B4b-era `EVIDENCE.md` text is superseded by this file. Timestamps inside scenarios are pinned; the only
  run-over-run diff is `generated_at`.
