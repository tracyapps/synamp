# Dispatch prep — review (C) & writing (D) waves (fill exact facts from receipts when spawning)

## C-round reviewers (spawn after B5+B6+B4b; one dimension each; write to .cluster/synamp-fast-brain/Cn-*.md)

### C1 — Code correctness & numbers (default subagent, isolated context)
Task shape: independent re-verification of the whole slice. Run: full brain suite, type-checks, brain-lab, route smoke replay (exact commands from B5 receipt). Adversarially falsify: epoch isolation (day-2 events cannot move day-1 values — construct fresh probes), 30:00 vs 30:01 gap boundary, midnight split, ±0.15 bound under flood (20 loves / 20 skips), determinism (two derives byte-equal), hide rules (k=1 none, k=2 hide, not_now hide, cleared after epoch end), reset marker semantics, legacy vs epoch-v1 switch behaviour, planned-push interplay (high bonus cannot pass a hard rule), sequence arcs invariants, hash stability claims from B1 (arcs now hashed). Check numbers against A3 parameter table P1-P25 (spot-check 8+ rows) and report any drift. Also verify the two known pre-existing reds are unchanged (macOS librarian; webamp chain) and NOT introduced by us. Output: C1-code-review.md with a findings list (severity, evidence, repro).

### C2 — Bias & ethics adversarial review (default subagent)
Check (list, each with severity): (a) lexicon/goal profiles vs A2 §4.2-4.4 rules — culture-flavoured defaults labelled; no universal "energy"; no genre→culture claims; attribution present in docs; (b) pan-Indigenous flattening anywhere in code/docs/copy; (c) overclaiming vs evidence tiers — hunt statements that outrun A1/A2 confidence tiers (e.g., tempo bands presented as fact; "improves focus" phrasing); (d) learning features vs dark patterns — proposals consent, hides transparency, forget works, no engagement optimisation; privacy of mood data (local-only, no telemetry; verify no new outbound calls); (e) the "global_only" and `declared` scope reading — name the tension, verdict. Verify claims by reading code + docs + running the relevant tests. Output: C2-bias-review.md (explicit "bias statements" inventory for report ch.3 + AGENT-BRIEF).

### C3 — Music Psychologist review (agentId music-psychologist)
Review the implemented goal bundles & learning behaviour against A1 claims: weight normalisation (B1's floor-normalisation) still respects dominance; F/P/D/S/C/N/V/W terms match A1 tables semantically; sequencing arcs match A1 §3 caveats (catharsis opt-in; no auto mood lift; ramp risk notes); fast-learning behaviour consistent with §4 (no global dislikes from skips; caps on inference); flag overclaims + missing cautions in UI copy/docs. Output: C3-psych-review.md.

### C4 — Production readiness & delivery audit (default subagent, after B6+C1..C3)
Verify: rollback paths (branch revert instructions correct; listening_policy switch works; forget endpoint; no event mutation anywhere — grep append-only); config/env documented (scratch recipe correct); error paths for new endpoints (bad ids, bad scope, missing epoch, auth); docs consistency (FAST-LEARNING-BRAIN.md vs code names vs receipts; AGENT-ROADMAP entry format); DELIVERY dir audit (files exist, links open, no placeholders); run the fresh-clone runbook commands (as far as possible without install). Output: C4-production-review.md.

After C1-C4: mainline merges into review.md (High/Medium/Low/Conflict), routes any must-fix items to a hotfix agent (single writer per file), then D-wave.

## D-round writers (each writes markdown to .cluster/synamp-fast-brain/report-sources/*.md; English; cite sources by ID; [FIGURE: id] placeholders)

Deliver brief to each writer: "You are writing chapter N of the SynAmp Fast Brain delivery report. Sources: <files>. Rules: every factual claim traceable to a receipt/source file; mark candidate values as candidates; keep bias statements explicit; do not invent numbers; target length <X>; use plain professional English (the report audience is the project owner + future agents)."

- W1 Ch.1 (~900-1200 words): translation layer; include three worked examples (focus, pump-up, dance) + 2 failure examples (vague, contradictory); audit table example.
- W2 Ch.2 (~1200-1500): learning spec; include parameter table (from A3 §3.7 annotated with "implemented as"); isolation guarantees; composition math explained in plain terms.
- W3 Ch.3 (~900-1200): bias/culture/measurement; include the design-implications table (trimmed to 8 rows) + ethics guardrails; cite CC IDs.
- W4 Ch.4 (~900-1200): verification (baseline vs final counts; scenario list; smoke transcript excerpts; rollback/ops; next experiments).
- W5 Appendix (~variable): sources merged & deduped (MP-1..34, CC-1..52, ML-1..~22 as retrieved; keep UNRETRIEVED lists as "not retrieved in this pass"); parameter table; glossary (epoch, hide, proposal, near-miss, unknown policy, reliability).
- W6 Executive summary (~300-400) + abstracts: after all chapters; summarizes ACTUAL output.
- W7 AGENT-BRIEF (~800-1200): for agent personas: Music Psychologist (what to double-check: weights, claims), DS&ML (tuning plan, evaluation), implementers (file map, run commands, how to extend goals/parameters); bias/safety/ethics pitfalls checklist (from C2/C3); operational notes (settings, forget, proposals).

Mainline afterwards: render HTML (skills: delivery-artifact, aesthetic-preset-library preset "11 Build"), attempt PDF, assemble DELIVERY.
