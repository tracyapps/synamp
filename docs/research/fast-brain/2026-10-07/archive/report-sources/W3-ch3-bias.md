# W3 — Report Ch.3 source: Bias, culture, and measurement honesty

Writer: W3 (chapter writer) · Date: 2026-10-07 · Inputs: A2 §1–§5, A1 §5, C2 (incl. its statement inventory), C3, H1/H2/H3 fix receipts · Status: chapter draft for mainline assembly (body below the return block).

## Return format (for mainline)

**Conclusion.** Bias is framed as a correctness problem before an ethics problem: the measurement layer inherits Western 12-TET 4/4-pop defaults, so wrong metrics become confident falsehoods — and learnable ones. The chapter grounds this with named traditions (Ewe timeline, Indian tala, gamelan tuning, Sámi yoik ontology), documents the design responses actually shipped (labelled proxies; soft-only declared fields; reliability gates; the tap path; user-verified outranking measured; never auto-4/4; no genre→culture claims; labelled starting points), states the ethics anchors (CARE/UNDRIP/Indigenous Protocol & AI), and closes with a 12-line quotable bias-statement inventory adapted from C2's 15 — with the still-open items (ceremony flags, metre-correction UI depth, catharsis angry-word coverage judged but not user-tested) carried honestly. `[FIGURE: reliability]` sits with the reliability-gate paragraph.

**Evidence.** A2 §1 traditions [CC-1..CC-19]; §2 perception [CC-29..CC-36]; §3 failure modes [CC-37..CC-46]; §4 guardrails [CC-47..CC-49]; §5 symptom→response table; A1 §5; C2 findings F1–F15, positives P1–P11, probes E1–E3, statements 1–15; C3 F-LEARN-1/F-COPY-1/F-PB-3; H1-2..H1-8, H2 F3–F8, H3 E1/E3/D8 fix states.

**Analysis.** Editorial line: defaults are claims; confident wrongness on non-Western material is a correctness bug (false facts order lists and feed the learner); the fix shape is honesty machinery — gates, abstention, asks, user-verified tiers, labels — plus ethics as design constraint, not disclaimer. Statements kept near-verbatim so Ch.3, the agent brief and the final reply quote the same lines.

**Gaps and risks.** No claim in this chapter is evidence about real music (fixtures synthetic; probes exercise logic only). A2's UNRETRIEVED list stays unreported as claims (Indian intonation literature; direct note-density→perceived-speed evidence; Agawu/Fürniss/Polak full texts; Saraga text; AIATSIS). Test counts deliberately excluded (Ch.4's job; numbers moved across H1/H2 captures). Culture notes still unrendered in UI (C2 F7 open); no per-track restore for session hides — "Forget this session" only (H2 F4).

**Suggested final-report placement.** Ch.3 as written; statements list reusable in the agent brief (W7) and the final reply's bias section; C2 probes E1/E2 remain Ch.4 verification exhibits.

---

## Chapter 3 — Bias, culture, and measurement honesty

### 3.1 Dominant-culture bias is a correctness problem

Every default in a playlist brain is a claim about how music works. SynAmp inherits defaults built for Western, equal-tempered, 4/4 pop: one global tempo per track, key as a twelve-tone template, loudness as a stand-in for intensity, "energy" as one dial. On a real library they are confidently wrong — and learnable. Bias here is a correctness problem: measurements are a moving target, and a system that will not admit it builds lists on claims it cannot support [A2 §0, §3].

Counterexamples:

- **Ewe timeline patterns.** The gankogui bell carries the twelve-pulse standard pattern ⟨2212221⟩; 3:2 relations underpin typical West African polyrhythmic textures [CC-1, CC-2]. Several true pulses coexist, so onset analysis can lock onto the wrong layer — low pulse clarity can describe fully rhythmic music. Ambiguity is not "no beat" (CC-1 full text UNRETRIEVED; CC-2 tertiary).
- **Indian tala.** Metre is cyclic and additive — the same 14 beats group differently (Jhoomra 3+4+3+4 vs Dhamar), the sam carries the weight, tempo is elastic [CC-6]. State-of-the-art beat tracking, meter estimation and downbeat detection on Carnatic, Hindustani and Turkish material is "not adequate" [CC-38].
- **Gamelan.** Slendro and pelog are per-ensemble tunings ("island to island, village to village") with deliberate paired-instrument beating; 12-TET chroma models misreport key, and interlocking kotekan "sounds faster than any single human could possibly play" — a double-time trap [CC-8, CC-10, CC-11].
- **Sámi yoik — ontology, not genre.** Yoik is wordless and often unaccompanied — "singing into being" a person, landscape or animal, not singing about one [CC-16, CC-17]. The right behaviour is abstention plus artist-provided descriptions.

The machine side is a moving target. Tempo estimation has a named octave-error class (60/120/240), and its standard metric forgives factors 2, 3, ½, ⅓ [CC-37]. Dataset skew is systematic: canonical tempo sets are Western/electronic-heavy with documented mislabels; similarity models diverge from human cross-cultural judgments across nine traditions [CC-42]. SynAmp's own case: 7,351 onsets, phase concentration ≈0.034 — pulse trackable, timing withheld [INT-2]. "Energy carried by microtiming" stays a labelled candidate [CC-46].

The listener is enculturated too: 12-month-olds respond culture-specifically; adults without exposure miss foreign non-isochronous metres; the groove inverted-U inverts outside 4/4 for Western listeners [CC-29, CC-30, CC-35, CC-36]. Universal "energy" semantics is unsupported at both ends of the chain [A2 §2].

### 3.2 What shipped, in response

The response is honesty machinery, not cleverer scores.

- **No universal "energy".** Energy asks compile to labelled proxies with named inputs (tempo, onsets, percussiveness, loudness) — loudness smallest-weighted, because LUFS is a normalisation standard, not felt intensity [CC-43–45; C2 P3].
- **Soft-only for declared fields.** Mood, arousal, valence, danceability and the other unproduced fields never supply measurements — constraints stay soft, carrying the "no producer yet" note [C2 P10]. Documented caveat: neutral terms still enter the soft average as a constant-0.5 saturation, shifting feedback and MMR margins [H3 E1].
- **Reliability gates.** BPM is gated by tempo confidence (full ≥ 0.5; damped with a note below; refused at ≤ 0.2 or missing); beat-stage fields are timing-gated. "A method's rejection is not independent musical truth": rejected tracks are never called arrhythmic — rejection lowers confidence and asks, not asserts [C2 P9; INT-2, INT-3].

[FIGURE: reliability]

- **"Tempo unclear — tap it", partially shipped.** The spot-check is live (right / half / double / counted-in-threes / tap-to-replace / "no steady beat"), and user-verified values outrank measured ones — a correction holds while the measured BPM still matches [INT-1]. Tap-the-cycle for 5/7/9/11 is planned [C2 S2].
- **Never auto-4/4.** No metre field is emitted, so nothing asserts 4/4 or any bar length; no bar-level hard rules [C2 P11].
- **No auto genre→culture claims.** Tags are weak hints; "latin party music" reads dance from "party" and asks about "latin"; no "Latin = danceable" claim [C2 P2, E1].
- **Culture-flavoured defaults, labelled.** No tradition-named default ships at all [A2 §4.3]; what ships is the calibration line — "Tempo/energy bands are research starting points, not universal — they stay soft and learn from your session feedback and spot-check corrections." Culture notes are code metadata, unrendered [H3 E3; C2 F7].

### 3.3 Ethics guardrails as design constraints

The anchors are named: CARE, with its shift "from regulated consultation to value-based relationships" [CC-47]; UNDRIP rights over cultural heritage and traditional cultural expressions, including free, prior and informed consent [CC-49]; and the Indigenous Protocol & AI paper's insistence on no single unified statement [CC-48]. In practice: public sources only; no sacred or restricted knowledge; no ceremonial inference from audio; attribution in the appendix, which names the traditions used here specifically (Ewe; Sámi; gamelan/kotekan; Yolŋu manikay; Māori taonga pūoro; others) [H3 E3]. Nothing crosses a session without an explicit yes; exploration ships off; adjustments are bounded (±0.15), explainable, reward-free; mood is never inferred from behaviour — only explicit sad or angry language opens catharsis [C2 P4–P6, S10, S14; H1-8].

### 3.4 Bias statements, quotable

Twelve lines adapted from C2's inventory; each is true of the shipped slice and quotable as-is.

1. **Bands are starting points, never laws:** "Tempo/energy bands are research starting points, not universal — they stay soft and learn from your session feedback and spot-check corrections." [CC-29/30/36/37]
2. **Tempo is the weakest signal:** octave errors (60/120/240) are a named MIR failure class; low-confidence tempo is damped or refused, never stated as fact; tap-the-cycle remains planned. [CC-37; INT-1; C2 S2]
3. **No universal "energy":** asks compile to labelled proxies with named inputs; loudness smallest-weighted because LUFS is not perceived intensity. [CC-43–45]
4. **No genre→culture claims:** tags are weak hints; "latin party music" reads dance, not culture, and asks about "latin". [C2 P2]
5. **Sensitive words are never product language:** "tribal", "primitive", "exotic", "gypsy", "world music" appear nowhere in shipped code or copy — only echoed back from the user's own prompt. [C2 P1]
6. **Attribution, not absorption — with a caveat:** the appendix names traditions and peoples; shipped code cites rule ids, names no one, and culture-note rendering stays open. [H3 E3; C2 F1]
7. **No invented traditions, no sacred-knowledge inference:** ceremonial function is never inferred from audio; no tradition-named default ships before consultation and a decision record. [A2 §4.2–4.3]
8. **Quiet-time and ceremony is a named gap, not a feature:** no ceremonial-flag mechanism exists; user exclusions stay hard; a user-taggable context flag is the recommended next step. [C2 F10]
9. **Learning is epoch-scoped, not person-scoped; nothing crosses a session without a yes:** implicit behaviour hard-masks at the session boundary; only deliberate signals and accepted proposals cross. [C2 S9, S10]
10. **Suspect measurements can't teach feature tastes:** a skip on low-reliability material is identity-level evidence only, never a tempo or rhythm hypothesis — a method's rejection is not musical truth. [A2 §5 r12; INT-2]
11. **Null is never zero:** unmeasured fields stay unknown with "not measured" reasons; a missing tag is not absence. [C2 S13]
12. **Where a protection isn't built, the report says so:** still open — ceremony flags, metre-correction depth, angry-word coverage (added after review; not user-tested). [C2 S15; H1-8]

Boundary note: behaviour claims rest on code and probes on a synthetic fixture — none is evidence about real music; A2's UNRETRIEVED list stays un-upgraded.
