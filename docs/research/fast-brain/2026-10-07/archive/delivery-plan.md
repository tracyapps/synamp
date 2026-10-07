# Delivery plan — synamp-fast-brain (S5 assembly sheet)

## Final DELIVERY layout (all under `.cluster/synamp-fast-brain/DELIVERY/`)

| Artifact | Source | Notes |
|---|---|---|
| `SynAmp-Fast-Brain-Report.html` | D-round chapter markdown → rendered by mainline (delivery-artifact + aesthetic preset "11 Build") | Self-contained HTML dossier: chapters 1-5 + sources appendix + inline SVG diagrams. THE main read. |
| `SynAmp-Fast-Brain-Report.pdf` | Rendered from the HTML (pdf skill or headless Chrome print) | Bonus carrier; attempt, note downgrade if impossible. |
| `agent-instructions/AGENT-BRIEF-FAST-BRAIN.md` | Writer W7 (from C2/C3 + receipts) | For Music Psychologist / DS&ML / future implementers: what to verify, bias/safety/ethics pitfalls, run commands, ownership map. |
| `code/` | Mainline snapshot: new modules + tests + `PATCH.diff` (git diff main..feat/fast-learning-brain) + README | The organised algorithm code library as delivered; repo branch is the live copy. |
| `verification/` | test logs, brain-lab canonical run (log+json), route smoke transcripts, screenshots, baseline logs | Copied from `.cluster/.../evidence/**` + B5 evidence; provenance timestamps. |
| `review.md` (copy) | C-round conclusions | Also referenced by report ch.4. |

## Acceptance criteria → evidence map (Goal Brief)

- Execution path → plan.md + report ch.1 + final reply.
- Materialized deliverables → DELIVERY files (above) + repo branch paths; absolute links in final reply.
- Verification evidence → verification/ dir + report ch.4 (counts, scenario list, smoke).
- Production readiness → report ch.4 rollback/ops + C4 audit + settings switch + forget endpoint.
- Final handoff → report ch.4 + AGENT-BRIEF + code/README.
- Bias statements → report ch.3 + C2 review + inline code comments (already present) + AGENT-BRIEF pitfalls + final reply section.

## D-round writers (dispatch after C-round; chapters from A/B/C material + repo)

| Writer | Chapter / artifact | Must cite | Source files |
|---|---|---|---|
| W1 | Ch.1 "Words in, music out — the translation layer" (goal lexicon, accuracy classes, contradictions, asks, sequencing arcs, worked examples incl. the three user phrases) | A1 §2-4, B1 receipt, code | A1, B1, A2 §5 |
| W2 | Ch.2 "The fast learning brain" (epoch-v1: epochs, weights, hides, centroids, artist, proposals, exploration-off, isolation guarantees, one-saturation composition) | A3 §3, B2 receipt, code; name candidate-value caveat | A3, B2 |
| W3 | Ch.3 "Bias, culture, and measurement honesty" (dominant-culture critique; traditions; MIR failure modes; CARE/UNDRIP; product rules; reliability gating; what remains unverified) | A2 §2-5, A1 §5; C2/C3 outcomes | A2, A1 |
| W4 | Ch.4 "Verification, rollback, and handoff" (baseline→final counts, harness scenarios, smoke transcripts, rollback levers, ops notes, next smallest experiments) | B4/B5 receipts, B4b, C1/C4, review.md | B4, B5, C1, C4 |
| W5 | Appendix: Sources (curated merge MP-*/CC-*/ML-* with retrieval honesty + confidence tiers), parameter table, glossary | A1/A2/A3 appendices; keep UNRETRIEVED lists | A1, A2, A3 |
| W6 | Executive summary (last, from finished chapters) + chapter abstracts | all chapters | D1-D5 outputs |
| W7 | AGENT-BRIEF-FAST-BRAIN.md (agent instructions + bias/safety/ethics pitfalls) | C2, C3, A2 §4, receipts | C2, C3, A2 |

Figures (SVG, rendered by mainline; writers use `[FIGURE: id]` placeholders):
- `flow` — words → interpret → plan → evaluate → sequence → queue; feedback loop events → epoch policy.
- `epochs` — timeline: epoch boundaries (gap/day/session-id), what crosses boundaries (explicit yes, implicit no, proposals confirm-first).
- `reliability` — measurement → reliability gates → scoring/learning; suspect-metric freeze path.
- `modules` — file map of the new library.

## S5 verification steps (mainline, before closing)

1. Re-run: brain suite, type-checks, brain-lab (fresh, capture to verification/), route smoke quick pass.
2. `git -C ~/_dev/web-apps/SynAmp diff main..feat/fast-learning-brain --stat` + generate PATCH.diff; snapshot new files into DELIVERY/code/.
3. Build HTML report (read delivery-artifact + aesthetic-preset-library skills first; preset "11 Build"; explain any brand-driven adaptation).
4. Attempt PDF render; record result.
5. Check every DELIVERY link opens (paths exist, sizes non-zero); write verification/README.md manifest with checksums (shasum -a 256).
6. Final reply: S1 sentence, plan (all done), deliverables list w/ absolute links, acceptance self-check, downgrades if any, [[final:submit_result]]; update_goal complete.

## Assembly QA list (running)

1. W5 appendix: update lab counts to H4 canonical (8 scenarios / 86 checks; verify exact numbers via `evidence/final-lab/EVIDENCE.md` + `run.json` hash) — W5 was written before the H4 refresh (7/66).
2. H4 receipt recovery requested (file absent; record also in evidence/final-lab).
3. W6 exec summary + W4 verification chapter must quote S5-recaptured final counts, not intermediate ones.
4. C1 F4 quoting guidance: never quote stale numbers (64-check lab / "Brain 205" / hash f260b260…) in delivery.
5. Final counts re-capture at S5 (brain suite, type-checks, lab) for verification manifest + report.
6. Report palette adaptation note: preset "11 Build" rendered with SynAmp brand tokens (dark slate + ivory + single gold accent) — stronger brand context; explain in delivery.

## Known downgrades to state at delivery

- docx unavailable (no docx skill in this environment) → HTML dossier (+PDF if rendered) is the report carrier; chapter markdown sources also staged in DELIVERY (report-sources/).
- Exploration ON path and proposals magnitudes are untuned candidates (design honesty).
- Declared-field producers (voice/instrument/mood) remain future work — lexicon terms on them are inert on real data by design.
