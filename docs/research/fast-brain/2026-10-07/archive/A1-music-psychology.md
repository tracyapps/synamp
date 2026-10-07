# A1 — Music Psychology research pack (SynAmp "fast learning brain")

Task: goal-language ↔ psychological constructs ↔ musical features, plus implications for
session-scoped learning. Every web source below was retrieved during this task (2026-10-06) with
the AutoGLM search/open-link skills, or via publisher/API records when full text was not
accessible; nothing is cited from memory. Sources I know of but could not retrieve are labelled
**UNRETRIEVED** and are never presented as fetched. Internal SynAmp documents are cited as
[SynAmp-*] and are not independent evidence. Every feature claim carries a citation or is labelled
**[design assumption]**.

---
## Return format (required)

**Conclusion.** The psychology literature gives a coherent, buildable skeleton: goal language
should be decomposed into (a) *arousal regulation* targets, (b) *distraction* terms (overwhelmingly
lyrics vs. verbal tasks), (c) *entrainment/groove* terms for movement goals, (d) *familiarity /
self-relevance* terms for comfort/nostalgia, and (e) *sequencing* as a match-then-shift arc
(iso-principle) rather than a fixed "mood dial". Feature tendencies are trustworthy at
sign level; almost all numeric bands (except exercise tempo bands and sedative tempo guidance from
Karageorghis & Priest) are **[design assumption]** and must be calibrated. Declared fields
(arousal, valence, etc.) have no producer today — any constraint on them is inert and must stay
soft forever until a calibrated producer lands. For fast learning: the evidence supports learning
*session-scoped context* quickly (skips, repeats, loves within hours) and *global taste* slowly; it
warns against overreacting to single skips, against imposing a mood (sad music made listeners
sadder in a controlled study), and against modelling "same track, opposite reaction" as noise — it
is, mechanically, context and autobiographical association.

**Evidence.** 34 retrieved sources (full texts for 20+; abstracts/records for the rest); key
clusters: exercise music (Karageorghis & Priest 2012 Part II; Terry et al. 2020 meta; Delleli et
al. 2023), mechanisms (Juslin & Västfjäll 2008; Juslin 2013), iso-principle (Starcke et al. 2021;
Cheung et al. 2025 + Heiderscheit & Madson 2015 UNRETRIEVED), groove (Witek et al. 2014;
Stupacher et al. 2020; Janata et al. 2012 UNRETRIEVED), frisson (Blood & Zatorre 2001; Sloboda
1991 UNRETRIEVED), lyrics/verbal interference (Perham & Currie 2014; Souza & Barbosa 2023;
Kämpfe et al. 2011), sleep (Cordi et al. 2019), stress (Thoma et al. 2013, mixed), sadness
(Taruffi & Koelsch 2014; Sachs et al. 2015; Garrido & Schubert 2015), nostalgia (Sedikides et al.
2022; Janata 2009), exposure (Madison & Schiölde 2017), driving (Li et al. 2019), a final
correction of the "30 % of songs evoke memories" headline (it is a selection threshold in Janata
2009, not a population prevalence).

**Analysis.** The registry maps well onto these constructs *if we are honest about proxies*: only
produced DSP/beat fields can carry real ranking weight today; declared fields are future-ready
annotations. The strongest actionable rules are: (1) low `vocal_fraction` for verbal work [High
evidence]; (2) `bpm` bands 125–140 for sustained exercise and <80 (60–70 sedative) for
calming [Karageorghis & Priest]; (3) mid-energy + high rhythmic regularity for driving and
chores [Medium]; (4) moderate complexity bands for dance/groove [Medium]; (5) match-then-shift
sequencing for catharsis and pump-up [Medium/weak]; (6) familiarity via feedback, not fields
[Medium].

**Gaps and risks.** Not retrieved (paywalls/blocks): Janata 2012 full text; Stupacher 2016 full
text; Sloboda 1991; Husain et al. 2002; Pietschnig et al. 2010; Zillmann 1988; Heiderscheit &
Madson 2015; Karageorghis & Priest Part I; van Goethem & Sloboda 2011. Risks: (1) extending lab
findings (Witek stimuli = funk drum-breaks; Li = one classical piece) to "party" and "commute"
contexts is [design assumption]; (2) collinearity of tempo/loudness/onset means single skips
cannot identify the offending feature — feature attribution stays provisional; (3) culture and
individual differences (dancers vs non-, SMT, musical anhedonia) mean bands must be adaptive, not
universal; (4) any hard constraint on declared fields is forbidden by design and must stay
forbidden; (5) "null is never zero" — every skipped term must surface as "not measured", not as a
low value.

**Suggested final-report placement.** §1 → "goal language → psychology" chapter (or appendix A of
the brain dossier); §2 → engineering appendix "soft constraint bundles v0 (research-derived)";
§3 → sequencing section of the roadmap (arcs as extension target); §4 → session-scoped learning
design chapter (with A3); §5 → science appendix "sound & the brain"; §6 → sources appendix with
confidence tiers.

---
## 1. Goal families

Scope note: popular goal language ("focus", "pump me up") mixes felt goals with task descriptions.
Per [MP-4][MP-5], emotion is a property of a *musical event* (music × listener × context), so every
row below is a **hypothesis bundle**, to be closed by feedback, not a lookup table. "Strong/mixed/
weak" = evidence quality for the *feature-tendency* claims, not for the existence of the goal.

### 1.1 Focus / study / deep work

| Aspect | Findings (sources retrieved) |
|---|---|
| Mechanisms | Arousal–mood route to performance (background music shifts arousal/mood, not "musical cognition") — framework live in [MP-32]; distraction via the **irrelevant-speech / changing-state effect**: task-irrelevant speech-like sound competes with verbal short-term memory when the task needs serial order [MP-20; ISE origins Colle & Welsh 1976, Salamé & Baddeley 1982 — cited *within* [MP-20], originals not retrieved]. Predictability/low surprise is a plausible design lever [design assumption, informed by [MP-22] task-specificity]. Mind-wandering suppression (Kiss & Linnell 2021) — **UNRETRIEVED**, described in [SynAmp-dossier], treat as candidate. |
| Feature tendencies | (1) **Lyrics are the reliable lever**: vocal music impairs verbal tasks; instrumental music shows no credible harm or benefit [MP-21: lyrics hindered verbal memory, visual memory, reading (d ≈ −0.3), arithmetic not credible; instrumental neutral]. Preference does not rescue it: liked and disliked lyrical music were *equally* disruptive to reading comprehension [MP-20]. (2) Background music disturbs reading and slightly harms memory; effects are task-specific [MP-22 meta]. (3) High-arousing music can raise *felt effort* on demanding attentional tasks [MP-32]. (4) Tempo of background music paces the concurrent activity [MP-22] — for quiet desk work, extreme tempos are risky [design assumption]. (5) Familiar/salient material risks autobiographical capture during work [MP-29; attention risk described in [SynAmp-dossier]] — keep salience moderate [design assumption]. |
| Individual/context | Task type dominates: reading/serial recall (lyrics matter most) vs design/arithmetic (smaller effects; [MP-21]). Introversion/extraversion moderates distraction [MP-20, citing Dobbs et al. and Furnham et al. — cited-in]. Preference ≠ protection [MP-20]; instrumental may be *perceived* as helpful even when neutral [MP-21]. |
| Evidence quality | **High** for "lyrics harm verbal work / instrumental ≈ neutral"; **Mixed** for "music helps focus" (global meta null [MP-22]; positive-before-assessment claims from de la Mora Velasco 2023 are UNRETRIEVED here — dossier only). Counterevidence: the near-null global effect [MP-22]; no on/off "focus music" rule is justified. |

### 1.2 Pump up (pre-game, pre-task, workout, gaming)

| Aspect | Findings |
|---|---|
| Mechanisms | Arousal optimisation + task-relevant imagery for **pre-task** music [MP-1]; affect enhancement, dissociation from exertion, synchronisation (entrainment) for **in-task** music [MP-1][MP-2]; ergogenic effect (power/endurance) [MP-2][MP-3]. |
| Feature tendencies | (1) **Sustained exercise band: 125–140 bpm** for 40–90 % max HRR when music is asynchronous; **>120 bpm + prominent percussive/rhythmic features** for a stimulative effect; synchronous music increases benefits vs asynchronous [MP-1]. (2) Meta-analysis: benefits on affect g=0.48, performance g=0.31, perceived exertion g=0.22, VO₂ g=0.15; **performance moderated by tempo — fast > slow/medium** [MP-2]. (3) Pre-task music improves completion time, relative mean/peak power, fatigue symptoms, and "feeling scale"; **self-selected > preselected**; benefits larger post-warm-up [MP-3]. (4) Music is largely ineffective for perceived exertion above the anaerobic threshold [MP-1]. |
| Individual/context | Self-selection and "motivational qualities" magnify effects [MP-1][MP-3]; sex/status moderators (jumping gains larger in males; untrained > trained on several outcomes) [MP-3]; heterogeneity is high (wide prediction intervals in [MP-3]). Gaming: no direct evidence retrieved — [design assumption] extension of arousal + high-groove logic. |
| Evidence quality | **Strong** for exercise/sport as a domain (two meta-analyses + review). Counterevidence: RPE benefit disappears above anaerobic threshold [MP-1]; wide prediction intervals [MP-3]; press "20 % endurance" claims are not in the retrieved sources. |

### 1.3 Dance / party

| Aspect | Findings |
|---|---|
| Mechanisms | Groove = sensorimotor coupling / urge to move; pleasure from moving [MP-10]; social entrainment and bonding via synchronised movement [MP-14]; rhythmic-entrainment mechanism among BRECVEMA [MP-5]. |
| Feature tendencies | (1) **Moderate syncopation maximises wanting-to-move and pleasure (inverted-U)** in funk drum-breaks [MP-10]. (2) ~120 bpm is the perceptual centre (spontaneous tapping ≈120; 125–140 for vigorous activity; preferred-tempo adjusted toward individuals' internal tempo ~ the 120 bpm family) [MP-1][MP-13]. (3) Synchrony + **enjoyment** of the music drives social closeness; cultural familiarity effects differ from enjoyment effects [MP-14]. (4) Dense/percussive rhythms typical of groove genres [MP-10]. |
| Individual/context | Effect of syncopation is strongest for people who enjoy dancing [MP-10]; **enjoyment matters more than familiarity** for bonding during synchronised movement [MP-14]; culture modulates entrainment responses (cross-cultural caveat stressed in [MP-14]); lab stimuli vs. party context = [design assumption]. |
| Evidence quality | **Medium**: replication-worthy lab effects; no field studies of parties retrieved. Counterevidence: audio entropy was a poor predictor in [MP-10] — do not use "busy-ness" as a proxy for groove. |

### 1.4 Calm / wind-down / sleep

| Aspect | Findings |
|---|---|
| Mechanisms | Arousal reduction; iso-principle (match current state, then gradually shift) as the standard clinical sequencing logic [MP-8][MP-9]; stress-system modulation is plausible but mixed [MP-27]. |
| Feature tendencies | (1) **Sedative profile: tempo < 80 bpm; 60–70 bpm (≈ resting heart rate), simple rhythmic structure, regular pulsation, repetitive tonal patterns** [MP-1]. (2) For sleep: relaxing music before a nap improved *subjective* sleep quality (3.69 vs 3.28 on 1–5, p=.048) and reduced N1 sleep; no significant effects on other stages; small sample [MP-26]. (3) Subjective sleep benefits are well established across studies; objective results are scarce/inconsistent [MP-26, reviewing metas]. (4) Music before a stressor: mixed — faster sAA recovery, but the music group showed the *highest* cortisol response (against hypothesis); no HR or subjective-stress group differences [MP-27]. |
| Individual/context | Suggestibility interacted with REM outcomes [MP-26]; sleep use is widespread (62 % of a survey sample have used music to sleep [MP-26]); familiar vs unfamiliar relaxing music not resolved [MP-26][design assumption]. |
| Evidence quality | **Medium** for subjective sleep/wind-down; **Mixed/weak** for objective physiology ([MP-26] small n; [MP-27] mixed directions). Counterevidence: objective sleep-stage effects mostly null [MP-26]; "stress-reduction" is not automatic [MP-27]. |

### 1.5 Catharsis (sad when sad)

| Aspect | Findings |
|---|---|
| Mechanisms | Mood management (hedonic optimisation via selective exposure) [MP-6, secondary-Low]; **mood-congruent** appreciation of sad music [MP-18]; "distancing-embracing"-style account: sad music is pleasurable when non-threatening, aesthetically pleasing, and produces psychological benefits (regulation, empathy, reflection) [MP-17]; episodic memory/nostalgia route [MP-18][MP-29]. |
| Feature tendencies | (1) Sad-music rewards are: imagination, emotion regulation, empathy, "no real-life implications" [MP-18]. (2) **Nostalgia — not sadness — is the most frequent emotion evoked**; memory is the top evocation principle; appreciation is mood-congruent and higher in high-empathy / low-emotional-stability listeners [MP-18]. (3) Framework conditions for pleasure: non-threatening, aesthetic, benefit-producing [MP-17]. (4) Controlled sequencing: **sad→happy produced the best affect shift**, but contrasts were partial [MP-8]. Musical features per se: slower/darker minor-key material is conventional for sad repertoire but I found no retrieved study mapping specific DSP features to catharsis — **[design assumption]**. |
| Individual/context | Rumination/depression risk: both ruminators and non-ruminators showed **increased depression** after self-selected sad music in [MP-19]; "catharsis works" is not a safe default. Empathy/emotional stability traits moderate sad-music appreciation [MP-18]. |
| Evidence quality | **Conflict** (report both): pleasure/benefit [MP-17][MP-18] vs mood worsening [MP-19]; sequence-dependent improvement [MP-8]. Design implication: offer, never impose; make "stay sad" vs "shift up" an explicit choice. |

### 1.6 Nostalgia / comfort

| Aspect | Findings |
|---|---|
| Mechanisms | Music-evoked autobiographical memory (MEAM) recruits a self-referential (medial prefrontal) network [MP-29]; nostalgic music confers approach-oriented benefits: social connectedness, self-esteem, youthfulness, optimism, inspiration, meaning in life, self-continuity; buffers sadness [MP-28]. |
| Feature tendencies | Nostalgia is fundamentally **self-referential, not timbral**: cues are personal history (era of youth, specific recordings, familiar voices) [MP-28][MP-29]. Feature proxies are weak: cohort year tag (release year, tag-dependent) + high familiarity (behavioral) are the practical levers — [design assumption] with support from the mechanism literature [MP-28]. |
| Individual/context | Age/cohort and dementia contexts matter [MP-28]; "familiarity necessary for nostalgia?" is explicitly discussed as open [MP-28]. Comfort overlaps with calm but is goal-distinct: comfort = safety/identity; calm = low arousal. |
| Evidence quality | **Medium–High** for benefits of music-evoked nostalgia [MP-28 review + MP-29 neuroscience]. Counterevidence: MEAM during *work* is a capture risk, not a benefit ([SynAmp-dossier]; [MP-29] shows the retrieval network activates even with low task demands). |

### 1.7 Drive / commute

| Aspect | Findings |
|---|---|
| Mechanisms | Arousal maintenance / fatigue countermeasure vs distraction; two models compete (arousing vs distracting effect of music) [MP-31]. |
| Feature tendencies | (1) Real-road experiment: **medium tempo best** to reduce fatigue and maintain attention over a 140-min monotonous drive; slow tempo worst; fast tempo most stimulating but not best overall [MP-31]. (2) Complementary simulator work (not retrieved in full; dossier only) suggests higher intensity/tempo, danceable, less instrumental tracks are more effective short-term [SynAmp-dossier — UNVERIFIED here]. |
| Individual/context | Driver differences matter (dynamic model of arousal vs distraction) [MP-31]; study used a single classical piece — generalization caveat stated by authors [MP-31]; commute length/condition (morning alertness vs evening fatigue) = [design assumption]. |
| Evidence quality | **Medium**: one strong primary study [MP-31] + consistent model of competing effects. Counterevidence: "faster = better" is not supported; slow/low-energy playlists can *increase* fatigue risk [MP-31]. |

### 1.8 Chores / power-through

| Aspect | Findings |
|---|---|
| Mechanisms | Entrainment/pacing: "the tempo of the music influences the tempo of activities performed while exposed" [MP-22]; positive emotional reactions to background music [MP-22]; boredom/distraction management [design assumption]; mood maintenance [MP-6 secondary]. |
| Feature tendencies | No dedicated studies of household chores were retrieved — the cluster is extrapolated from [MP-22] (pacing + affect) and [MP-2][MP-1] (movement tasks). Practical suggestions: steady mid-to-up tempo (~105–135 bpm), clear pulse, percussive timbre, familiar material — all **[design assumption]** except the pacing effect [MP-22]. |
| Individual/context | Task split matters: physical chores tolerate vocals (no verbal interference), administrative "chores" are verbal tasks where the focus rules apply [MP-20][MP-21]. Preference/familiarity should carry most of the personalisation. |
| Evidence quality | **Weak** — mostly design assumptions on top of one meta-analytic pacing effect [MP-22]. Do not oversell; this family should lean hardest on feedback learning. |

---
## 2. Mapping to SynAmp's signal registry

### 2.0 Conventions used in this section

- **Soft only.** Every constraint below is a soft weighted term. No hard constraints are proposed
  anywhere; hard constraints on declared fields are forbidden by design (and none appear here).
- **Weight convention (suggested; calibrate with the ranking owner):** w ∈ [0,1];
  **0.5 = strong, 0.3 = medium, 0.15 = weak, 0.05 = whisper**. Keep each audio bundle's total ≤ 1.0
  and each single term ≤ 0.5 so user hard constraints and explicit feedback (bounded
  `feedbackBonus ≤ 0.15·tanh`) always dominate. Weights are research suggestions, not tuned values.
- **Ops** use the schema's closed set: `lt | lte | gt | gte | between | in | nin | exists | is_null`
  (from `apps/brain/src/query/plan.ts`). "Lower is better" terms are expressed as a single upper
  bound; the evaluator's soft term should score *distance from the band*, not membership.
- **Bands** are given either from sources (e.g., 125–140 bpm) or as **[design assumption]**. For
  library-relative bands I recommend quantiles (e.g., "lower third of the user's library") instead
  of absolute numbers, because absolute thresholds mis-calibrate per-library.
- **Null semantics (null is never zero):**
  - Produced field null = "not measured / not estimated" → the term contributes **nothing**; the
    track stays eligible; the explanation must say "not measured", never "low".
  - `bpm` null with `tempo_confidence` low (typically on non-Western/less common metres): damp the
    bpm term (suggest ×0.5 when `tempo_confidence < 0.5`) or skip it; lean on
    `percussiveness`/`onset_rate` instead. Octave errors (60/120/240) are possible per the registry
    note — a "slow tempo" report can be an artefact [SynAmp-CONTEXT requirement 4].
  - Beat-gated fields (`beat_grid_strength`, `beat_interval_cv`, `tempo_drift`): only eligible when
    `beat_status = tracked`; else skip (not zero).
  - Timing-gated fields (`microtiming_tightness`, `microtiming_signed`, `swing_ratio`): only
    eligible when `timing_status = measured_relative_to_fitted_grid`; else skip.
  - Declared fields (`arousal`, `valence`, `danceability`, `mood`, `mode`, `vocal_fraction`,
    `instrumental`, `instruments.*`): **no producer today → unknown for every real track**. All
    terms on them are **inert today** (future-ready annotations only). When a producer lands,
    re-derive weights; a model output is a proxy, not a measurement.
  - Metadata: `genre` missing tag ≠ absence; `year` = release year, not sonic era; `duration_s`
    missing = unknown length.

### 2.1 Bundles

Notation: `field op band — w · mechanism · refs`. "DA" = design assumption.

#### Focus / study (F)
| # | Constraint | Mechanism & refs |
|---|---|---|
| F1 | `vocal_fraction lte 0.1` — w 0.45 (declared; inert today) | Irrelevant-speech/changing-state effect; lyrics harm verbal work, preference doesn't rescue [MP-20][MP-21][MP-22]. Primary lever. |
| F2 | `bpm between 85 125` — w 0.15 | Mid-arousal optimum; avoid extremes that over/under-stimulate [MP-32][MP-22; band = DA]. |
| F3 | `pulse_clarity gte 0.5` — w 0.15 | Predictability/low surprise for sustained tasks [DA; compatible with [MP-22] task-specificity]. |
| F4 | `onset_rate lte 4 (onsets/s)` — w 0.15 | Lower event density = fewer attention grabs [DA; direction supported by [MP-21][MP-22] "distraction" family]. Library-relative option: lower ~40 %. |
| F5 | `dynamic_complexity lte 8` — w 0.1 | Low surprise/slow change [DA]. |
| F6 | `lufs_integrated between p25 p75(library)` — w 0.1 | Loud = arousing; high-arousal music raised felt effort [MP-32]. [DA for band] |
| F7 | `spectral_flatness lte 0.3` — w 0.1 | Tonal (not noisy/harsh) preference for verbal work [DA]. |
| F8 | `spectral_centroid between p20 p80(library)` — w 0.1 | Avoid extreme brightness (harsh) and extreme darkness (muffled) [DA]. |
| F9 | `beat_interval_cv lte 0.05` (gated `beat_status=tracked`) — w 0.15 | Temporal predictability; steady grid [DA]. |
| F10 | `arousal between 0.3 0.65` — w 0.25 (declared; inert today) | Mid-arousal dip; higher on hard tasks [MP-32]. |
| — | `valence`, `mode`, `mood`: **no constraint** | No retrieved evidence that positive/sad/major-minor reliably helps or hurts focus; imposing them risks mood mismatch (see §4). Omission is deliberate. |
| — | `instrumental gte 0.85` — w 0 (alternative to F1) | Use only if `vocal_fraction` has no producer but `instrumental` does; duplicate of F1. |

#### Pump up (P)
| # | Constraint | Mechanism & refs |
|---|---|---|
| P1 | `bpm between 125 140` — w 0.35 | Sustained 40–90 % max HRR asynchronous band [MP-1]; tempo moderates performance [MP-2]. |
| P2 | `bpm gte 120` — w 0.2 (alternative/additive for short/explosive) | Stimulative threshold [MP-1]. |
| P3 | `percussiveness gte 0.5` — w 0.3 | "Prominent percussive and rhythmical features" for stimulation [MP-1]. |
| P4 | `pulse_clarity gte 0.55` — w 0.25 | Synchronisation benefits; steady beat for movement [MP-1][DA for threshold]. |
| P5 | `beat_grid_strength gte 0.5` (gated) — w 0.2 | Synchronous use has larger ergogenic/psychological effects [MP-1]. |
| P6 | `onset_rate gte p60(library)` — w 0.2 | Higher event density → drives energy [DA]. |
| P7 | `lufs_integrated gte p60(library)` — w 0.2 | Loud/bright energising [DA; keep ≤ 0.3 to avoid loudness-war bias]. |
| P8 | `spectral_centroid gte p60(library)` — w 0.15 | Bright timbre = energetic [DA]. |
| P9 | `beat_interval_cv lte 0.06` (gated) — w 0.15 | Steady tempo for synchronisation [DA]. |
| P10 | `arousal gte 0.6` — w 0.3 (declared; inert today) | Arousal optimisation [MP-1][MP-2][MP-3]. |
| — | familiarity/self-selection → **feedback channel**, not a field | Self-selected > preselected [MP-3]; motivational qualities [MP-1]. |
| — | `vocal_fraction`: **no constraint** | Exercise studies rarely require instrumental; lyrics can carry imagery. Do not import the focus rule here. |

#### Dance / party (D)
| # | Constraint | Mechanism & refs |
|---|---|---|
| D1 | `bpm between 115 130` — w 0.3 | Perceptual centre ~120 [MP-1][MP-13]; DA for exact band. |
| D2 | `pulse_clarity gte 0.55` — w 0.3 | Entrainment precondition [DA]. |
| D3 | `percussiveness gte 0.5` — w 0.3 | Groove repertoire is percussive [MP-10]. |
| D4 | `onset_rate between p40 p90(library)` — w 0.15 | Moderate-high density; do NOT over-weight busy-ness — entropy was a poor predictor [MP-10]. |
| D5 | `lufs_integrated gte p50(library)` — w 0.15 | Party energy [DA]. |
| D6 | `spectral_centroid gte p50(library)` — w 0.1 | Bright [DA]. |
| D7 | `beat_grid_strength gte 0.5` (gated) — w 0.2 | Move-along regularity [DA]. |
| D8 | `beat_interval_cv lte 0.06` (gated) — w 0.1 | Machines-steady vs live variability; both exist in dance — keep weak [DA]. |
| D9 | `danceability gte 0.6` — w 0.4 (declared; inert today) | Direct construct; once a producer lands, it carries the family [MP-10]. |
| — | `swing_ratio` / `microtiming_*`: **off by default (w 0)** | "Human feel" is plausible for groove but no product evidence retrieved; keep as an experimentation hook only (and only when `timing_status` passes). |

#### Calm / wind-down / sleep (S)
| # | Constraint | Mechanism & refs |
|---|---|---|
| S1 | `bpm between 55 80` — w 0.4 | Sedative <80 bpm [MP-1]. |
| S2 | `bpm between 50 70` (sleep subset) — w 0.45 | 60–70 bpm ≈ resting HR guidance [MP-1]. |
| S3 | `percussiveness lte 0.35` — w 0.3 | Inverse of percussive for sedation [MP-1]. |
| S4 | `onset_rate lte p40(library)` — w 0.3 | Sparse events, simple structure [MP-1 "simplistic rhythmical structure"; band DA]. |
| S5 | `lufs_integrated lte p50(library)` — w 0.25 | Soft volume for sleep [MP-1 "soft-volume" in sedative tradition; magnitude DA]. |
| S6 | `loudness_range lte p50(library)` — w 0.15 | Low dynamic swings [DA]. |
| S7 | `spectral_centroid lte p50(library)` — w 0.2 | Dark/warm timbre [DA]. |
| S8 | `spectral_flatness lte p0.4(library)` — w 0.1 | Tonal/repetitive [MP-1 "repetitive tonal patterns"]. |
| S9 | `beat_interval_cv lte 0.05` (gated) — w 0.15 | "Regular pulsation" [MP-1]. |
| S10 | `vocal_fraction lte 0.4` — w 0.15 (declared; inert today) | For sleep onset, speech-like audio is the distraction mechanism [extrapolation from [MP-20]; DA] — for wind-down, vocals are fine; branch by goal wording. |
| S11 | `arousal lte 0.4` — w 0.3 (declared; inert today) | Relaxation goal [MP-26][MP-27 mixed — keep weight moderate]. |
| — | `valence`: **no constraint** | Sad music can soothe some listeners [MP-18]; do not impose positivity at bedtime. |

#### Catharsis (sad when sad) (C) — *only on explicit ask / opt-in*
| # | Constraint | Mechanism & refs |
|---|---|---|
| C1 | `valence lte 0.4` — w 0.25 (declared; inert today) | Mood-congruent appreciation [MP-18]. |
| C2 | `mode in [minor]` — w 0.15 (declared; inert today) | Western sad-repertoire convention; proxy only [DA]. |
| C3 | `bpm between 60 100` — w 0.15 | Sad repertoire skews slower [DA]. |
| C4 | `spectral_centroid lte p45(library)` — w 0.1 | Darker timbre [DA]. |
| C5 | `lufs_integrated lte p50(library)` — w 0.1 | Intimate dynamics [DA]. |
| — | personal salience / MEAM → **feedback channel** | Memory is the top evocation principle [MP-18]; MEAM network [MP-29]. |
| — | **Defaults**: this bundle runs only when the user asks in sad/angry language and only as a soft mix; pair with an explicit "stay here / lift me" control (§3, §4). Even then: [MP-19] warning. |

#### Nostalgia / comfort (N)
| # | Constraint | Mechanism & refs |
|---|---|---|
| N1 | `year between Y1 Y2` (user cohort window; soft, missing tag = skip) — w 0.25 | Cohort effect via personal history [MP-28][MP-29]. `year` is release year, not sonic era; treat tags as weak. |
| N2 | `valence between 0.4 0.8` — w 0.15 (declared; inert today) | Bittersweet-positive: nostalgia is mixed but approach-oriented [MP-28]. |
| N3 | `bpm between 70 120` — w 0.1 | Mid-tempo comfort [DA]. |
| N4 | `mode in [major]` — w 0.05 (declared; optional) | Gentle positivity flavour [DA]. |
| — | familiarity → **feedback channel** (play counts, loves) | Familiarity is the practical lever [MP-28][MP-30]; "necessary?" is open [MP-28]. |
| — | no timbre/dynamics terms | Nostalgia is self-referential; timbre constrains nothing reliable [MP-28][MP-29]. |

#### Drive / commute (V)
| # | Constraint | Mechanism & refs |
|---|---|---|
| V1 | `bpm between 95 135` — w 0.3 | Medium tempo best for fatigue/attention [MP-31]; band DA around "medium". |
| V2 | `bpm lte 70` — w **penalty** (soft, negative weight suggestion −0.2) | Slow tempo worst on long monotonous drives [MP-31]. |
| V3 | `lufs_integrated gte p40(library)` — w 0.1 | Avoid low-energy sleepiness [DA; direction: fatigue countermeasure [MP-31]]. |
| V4 | `onset_rate between p30 p80(library)` — w 0.1 | Maintain engagement without distraction [DA]. |
| V5 | `percussiveness gte p40(library)` — w 0.1 | Alerting texture [DA]. |
| — | familiarity → **feedback channel**; prefer familiar | Less interaction with device; singalong; [DA informed by [MP-31] individual differences]. |
| — | `vocal_fraction`: no constraint | Driving is not a verbal-serial task (this is a scope statement, not an evidence claim about singing-and-driving). |

#### Chores / power-through (W)
| # | Constraint | Mechanism & refs |
|---|---|---|
| W1 | `bpm between 105 135` — w 0.25 | Pacing effect [MP-22]; band DA. |
| W2 | `pulse_clarity gte 0.5` — w 0.2 | Entrainment precondition [DA]. |
| W3 | `percussiveness gte p45(library)` — w 0.15 | Physical-task energy [DA]. |
| W4 | `lufs_integrated between p30 p80(library)` — w 0.1 | Avoid fatigue at both ends [DA]. |
| W5 | `onset_rate between p35 p85(library)` — w 0.1 | Momentum without clatter [DA]. |
| — | branch: "admin chores" → apply F1/F2 instead | Verbal tasks obey the lyrics rule [MP-20][MP-21]. |
| W6 | `valence gte 0.5` — w 0.1 (declared; inert today) | Background music supports positive emotional reactions [MP-22]; weak. |

### 2.2 Worked example (consistency check)

"Pump me up for the gym, nothing too slow" →
`bpm gte 120 (w 0.2)` + `bpm between 125 140 (w 0.35)` + `percussiveness gte 0.5 (w 0.3)`
+ `pulse_clarity gte 0.55 (w 0.25)` + `arousal gte 0.6 (inert, w 0.3)`; hard exclusion "too slow"
stays a user/hard phrase (`bpm gte` hard is the user's explicit exclusion, compiled by the existing
guard machinery — not re-proposed here). Unknown `bpm` → term skipped, reason "tempo not
estimated", track not penalised.

---
## 3. Sequencing (order) implications

General principle: sequencing recommendations are **arousal-regulation hypotheses** justified by
(a) the iso-principle — match the current state, then move gradually [MP-8][MP-9] — and (b) the
arousal–performance curve [MP-32]. There are **no retrieved experiments showing that any specific
list arc beats a flat list**. Treat all arcs as bounded, per-session, learnable defaults, not laws.
Current code supports `arc:"flat"` only; `build`/`peak`/`cooldown`/`wave` are stated extension
targets [SynAmp-CONTEXT].

| Goal | Suggested arc | Justification | Ramp risks / mitigations |
|---|---|---|---|
| Focus | **flat** (steady mid-energy); optional gentle late-session variation | Stability = predictability; avoid attention draws from change [DA; [MP-22]] | Ramp itself may distract; if a "warm-up" phase is used, keep ≤ 1 track and soft. |
| Pump up | **build**: 2–3 tracks ascending to the 125–140 band, then hold | Pre-task music optimises arousal and imagery [MP-1][MP-3]; iso-logic from low state | Short pre-game windows can't afford a slow build → allow "instant max" variant; don't assume the user starts calm. |
| Dance/party | **build to peak, then wave** (energy held high; vary texture, not tempo) | Groove needs moderate complexity, not monotonically rising complexity [MP-10]; monotony fatigue [DA] | Early peak can exhaust novelty; keep tempo steady, rotate repertoire; use crowd/feedback signals. |
| Calm / wind-down / sleep | **cooldown**: descending energy; final tracks at the lowest band | Iso-logic; sedative guidance (simple, regular, <80 bpm) [MP-1]; sleep prep [MP-26] | Starting too slow from high arousal can feel jarring (mismatch); begin slightly above target then descend [DA]. No evidence for an ideal ramp length — keep short (≥ 3 tracks) but user-overridable. |
| Catharsis | **match first, then offer shift**: hold in the sad/angry state, then optionally transition "sad→hopeful" | Sad-first-then-happy produced the best affect shift in a controlled study [MP-8]; mood-congruent appreciation [MP-18] | **Do not auto-apply the lift** — sad listening increased depression in [MP-19]; make the shift an explicit, revocable choice. |
| Nostalgia / comfort | **flat, gentle** | Comfort thrives on familiarity/predictability [MP-28][MP-30] | Surprises (genre jumps, novelty slots) break the effect; suppress exploration slots inside comfort arcs. |
| Drive / commute | **flat medium**; rotate flavor every ~30–45 min on long drives | Medium tempo best for fatigue/attention [MP-31]; monotony drives fatigue [MP-31] | Sudden tempo jumps are distracting; changes should be gradual and spaced [DA]. |
| Chores | **flat mid-up**; optional build for long physical sessions | Pacing effect [MP-22]; momentum maintenance [DA] | Over-energetic music can overshoot for precision tasks — allow a "steady" variant. |

Additional sequencing cautions:
- Arcs must never violate the user's stated constraints mid-list ("nothing too slow" stays true at
  every position).
- Where a producer is missing (declared fields), arc targets can only be expressed through produced
  proxies (bpm, loudness, percussiveness); document which proxy stands for which arc intention.
- Ramp *direction* assumptions ("build up" for pump, "cool down" for sleep) are folk practice
  conventions; the iso-principle supplies the mechanism, but magnitude and duration should be
  learned from session feedback, not fixed.

---
## 4. Fast-learning implications (session-scoped)

These are psychology anchors for the learning design (A3 owns the algorithm; this is the domain
constraint set).

**Within-session preference dynamics — learn fast here:**
1. **Session = hours, not days.** Feedback from a session may express a transient state
   (mood-congruence, context) rather than taste [MP-18]; decay session terms fast (the dossier's
   candidate half-lives — hours for session, days for playlist, months for global — are unverified
   candidate values [SynAmp-dossier]).
2. **Usable fast signals:** early skips (bounded, small weight), repeats, explicit love/remove,
   skip *patterns* within the current plan (e.g., skipping the slow end twice in a workout session
   → nudge the session's tempo band up a small step). All changes bounded and revertible, with
   per-track reasons [SynAmp-CONTEXT].
3. **Only session-scoped inferences from weak signals.** A single skip = "not this moment"
   (context-dependent); it is not a dislike of the track, artist, or feature [SynAmp-dossier;
   implicit-feedback literature cited there]. Corroboration (≥2 sessions or an explicit action)
   before any global change; feature-level attribution stays provisional because tempo, loudness
   and onset-rate co-vary [SynAmp-dossier].

**Satiation / habituation / exposure:**
4. Liking **increases** with repetition in a controlled repeated-listening study (monotonic up to
   their exposures, at all complexity levels; no inverted-U detected) [MP-30]. So repetition within
   reason is not dangerous per se; but recommender research warns that underexplored systems cause
   satiation and filter bubbles [SynAmp-dossier, citing Chen et al. RecSys'21]. Practical rule:
   spacing, not prohibition — avoid immediate repeats of the same track unless requested
   ("on repeat" is an explicit signal), and keep a small exploration slot. Exact spacing = [design
   assumption].
5. Complexity/habituation: increased familiarity lowers *perceived* complexity [MP-30]; a track
   that is "too simple" today can become loved later. Never write off a track from one exposure.

**Mood congruence vs. mood repair (the "impose a mood" caution):**
6. Users sometimes want **congruence** (sad when sad: appreciation of sad music is mood-congruent
   [MP-18]) and sometimes **repair** (mood management predicts hedonic optimisation [MP-6
   secondary]) — and repair can backfire (sad listening increased depression [MP-19]). The system
   must not assume which; ask ("stay here" vs "lift me") or learn from explicit signals, and never
   impose a mood change on an unconsenting listener. This is both an evidence finding and an
   autonomy/ethics requirement for the agent instructions.

**"Same track, opposite reaction on a different day":**
7. This is expected, not noise. Mechanisms: BRECVEMA's **episodic memory** and **evaluative
   conditioning** routes make the same sound mean different things in different states and contexts
   [MP-5]; MEAM retrieval recruits self-referential networks and is cued by situational context
   [MP-29]; chills are reproducible for an individual *for a specific piece* but are
   state/attention sensitive [MP-16]. Corollary: store reactions as (track × session context),
   not track-only; treat a "flip" as evidence about *context*, not about the track.

**What the system should NOT learn quickly:**
- Global dislikes from skips or single partial plays (context-dependent) [SynAmp-dossier].
- Hard exclusions from behaviour (only explicit user statements create hard rules).
- Global "no lyrics" or any global feature rule from one study/workout session (task-context
  dependent [MP-20][MP-21]).
- "The user is sad" from a few sad song choices, or "the user loves X" from one repeat; cap
  inference steps per session and require corroboration for cross-session claims.

**What it SHOULD learn quickly (bounded):**
- Session energy/tempo corrections; session-scoped queue preferences; explicit love/remove (with
  the declared scopes); "not now" reasons ("wrong energy", "not now") as first-class feedback
  [SynAmp-CONTEXT P3 reasons already exist].
- Timing-context associations if (and only if) the data volume justifies them per user; do not
  assume a fixed pattern (one user's "gym session = fast" shouldn't generalise to their evening
  reading).

---
## 5. Sound & brain connections (appendix material)

| Topic | Key finding | Citation | Confidence | Why it matters for SynAmp |
|---|---|---|---|---|
| Frisson / chills | Subject-selected music that elicits "chills" recruits reward/motivation, emotion and arousal circuitry (ventral striatum, midbrain, amygdala, OFC, VMPFC) with autonomic changes (HR/EMG/respiration); links music to survival-related reward circuits. | [MP-16] Blood & Zatorre 2001 | **High** (classic, widely replicated direction; small original sample; Sloboda 1991 UNRETRIEVED) | The strongest "this track is special" signal is listener-specific and not derivable from audio; learn it from love/repeat behaviour, not features. |
| Groove & sensorimotor coupling | Moderate syncopation maximises urge-to-move and pleasure (inverted-U); dancer-status moderates; audio entropy poor predictor. | [MP-10] Witek et al. 2014; [MP-14] Stupacher et al. 2020 | **Medium** (lab; replication across samples; Janata 2012 foundational text UNRETRIEVED) | Dance/party bundles should target moderate complexity and high enjoyment — and syncopation itself isn't directly measurable today (use proxies; keep soft). |
| Musical reward (and its absence) | A healthy subgroup shows reduced pleasure/autonomic response to music with intact monetary reward — specific musical anhedonia. | [MP-33] Mas-Herrero et al. 2014 (abstract retrieved) | **Medium–High** | "Music = reward" is not universal (~3–5 % of people per secondary sources); flat responses are valid data, not failure states. |
| Music-evoked autobiographical memory | Familiar popular music triggers autobiographical memories via a medial-prefrontal/self-referential network; **the famous "~30 %" figure is a study selection threshold (subjects high in MEAM frequency were recruited for fMRI), not a population prevalence.** | [MP-29] Janata 2009 | **High** for mechanism; **correction** for the 30 % headline | Explains "same track, different day"; fuels nostalgia/comfort; also a focus *risk* when the user wants concentration. |
| Entrainment | Body/activity entrainment to musical tempo (pacing effects; synchronous exercise benefits); individuals' internal tempo (SMT) predicts preferred and adjusted tempo; social entrainment strengthens with enjoyment. | [MP-22] Kämpfe et al. 2011; [MP-1]; [MP-13] Hine et al. 2025; [MP-14] | **Medium** | Tempo bands and sequencing arcs rest on entrainment; BUT "brainwave entrainment" products (binaural beats) have conflicting evidence [SynAmp-dossier; Ingendoh et al. 2023 vs Garcia-Argibay — UNRETRIEVED here] and must not be implemented as science-backed. |

---
## 6. Sources appendix

All retrievals performed 2026-10-06. "Retrieved" = page/PDF/abstract actually fetched in this
task; "via API" = metadata/abstract obtained from Semantic Scholar / Unpaywall / Europe PMC REST
in this task; "UNRETRIEVED" = known source, could not access (no fabricated content used).

[MP-1] Karageorghis, C. I., & Priest, D.-L. (2012). *Music in the exercise domain: a review and
synthesis (Part II).* International Review of Sport and Exercise Psychology, 5(1), 67–84.
Retrieved: PMC3339577 (full text). Claims: pre-task optimises arousal/imagery; asynchronous band
125–140 bpm (40–90 % max HRR); stimulative >120 bpm + percussive; sedative <80 bpm, 60–70 bpm
guidance; synchronous benefits; RPE limits above anaerobic threshold.
(Part I: **UNRETRIEVED**; PMC hit was a different paper; Part II links its content.)

[MP-2] Terry, P. C., Karageorghis, C. I., Curran, M. L., Martin, O. V., & Parsons-Smith, R. L.
(2020). *Effects of music in exercise and sport: A meta-analytic review.* Psychological Bulletin,
146(2), 91–117. Retrieved: BURA green-OA PDF (full). Claims: affect g=0.48; performance g=0.31;
RPE g=0.22; VO₂ g=0.15; HR ns; tempo moderation (fast > slow-to-medium).

[MP-3] Delleli, S., Ouergui, I., Ballmann, C. G., Messaoudi, H., Trabelsi, K., Ardigò, L. P., &
Chtourou, H. (2023). *The effects of pre-task music on exercise performance…: systematic review
with multilevel meta-analysis.* Frontiers in Psychology, 14:1293783. Retrieved: PMC10701429
(full). Claims: pre-task gains in completion time, power, fatigue, feeling scale; self-selected >
pre-selected; wide prediction intervals.

[MP-4] Juslin, P. N., & Västfjäll, D. (2008). *Emotional responses to music: The need to consider
underlying mechanisms.* Behavioral and Brain Sciences, 31, 559–575. Retrieved: PubMed 18826699
(abstract). Claims: six-mechanism framework; emotions induced via non-music-specific mechanisms.

[MP-5] Juslin, P. N. (2013). *From everyday emotions to aesthetic emotions.* Physics of Life
Reviews, 10(3), 235–266. Retrieved: PubMed 23769678 (abstract). Claims: BRECVEMA = brain-stem
reflex, rhythmic entrainment, evaluative conditioning, contagion, visual imagery, episodic memory,
musical expectancy, aesthetic judgment; musical event = music × listener × context.

[MP-6] communicationtheory.org. *Mood Management Theory (Zillmann).* Retrieved (secondary).
Claims: media chosen to optimise mood (affect-dependent stimulus arrangement; selective exposure).
**Low-tier secondary.** Zillmann 1988 (American Behavioral Scientist) **UNRETRIEVED**.

[MP-7] Heiderscheit, A., & Madson, A. (2015). *Use of the iso principle as a central method in
mood management.* Music Therapy Perspectives, 33(1), 45–52. **UNRETRIEVED** (publisher/blocks;
record metadata verified via search + Semantic Scholar). Cluster covered by [MP-8][MP-9].

[MP-8] Starcke, K., et al. (2021). *Emotion modulation through music after sadness induction —
the iso principle in a controlled experimental study.* Int J Environ Res Public Health, 18(23),
12486. Retrieved: PMC8656869 (full). Claims: sad→happy sequence yielded highest positive affect /
lowest negative affect; not all contrasts significant.

[MP-9] Cheung, D. S. K., et al. (2025). *Individualized music playlist based on iso-principle for
de-escalating agitation of people with dementia: RCT feasibility.* Int J Geriatr Psychiatry,
40(4), e70070. Retrieved: PMC11949771 (full). Claims: feasible; **not more effective than control**
for de-escalation; efficacy unconfirmed.

[MP-10] Witek, M. A. G., Clarke, E. F., Wallentin, M., Kringelbach, M. L., & Vuust, P. (2014).
*Syncopation, body-movement and pleasure in groove music.* PLOS ONE, 9(4), e94446. Retrieved
(full). Claims: inverted-U; medium syncopation max wanting/pleasure; dancers stronger; entropy poor.

[MP-11] Janata, P., Tomic, S. T., & Haberman, J. M. (2012). *Sensorimotor coupling in music and
the psychology of the groove.* J Exp Psychol Gen, 141(1), 54–75. **UNRETRIEVED** (closed; metadata
verified via Semantic Scholar API).

[MP-12] Stupacher, J., Hove, M. J., & Janata, P. (2016). *Audio features underlying perceived
groove and sensorimotor synchronization in music.* Music Perception, 33(5), 571–589.
**UNRETRIEVED** (closed; record verified via search).

[MP-13] Hine, K., Wakana, Y., & Nakauchi, S. (2025). *How we remember music tempo: the role of
spontaneous motor tempo in recall and preference.* Frontiers in Psychology, 16:1631625. Retrieved:
PMC12549237 (full). Claims: SMT predicts adjusted preferred tempo; internal tempo differences.

[MP-14] Stupacher, J., Witek, M. A. G., Vuoskoski, J. K., & Vuust, P. (2020). *Cultural
familiarity and individual musical taste differently affect social bonding when moving to music.*
Scientific Reports, 10 (doi 10.1038/s41598-020-66529-1). Retrieved: PMC7308378 (full). Claims:
synchrony × enjoyment drives closeness; familiarity vs enjoyment dissociate; syncopation
manipulated.

[MP-15] Sloboda, J. A. (1991). *Music structure and emotional response: some empirical findings.*
Psychology of Music, 19(2), 110–120. **UNRETRIEVED** (paywall; mirrors blocked).

[MP-16] Blood, A. J., & Zatorre, R. J. (2001). *Intensely pleasurable responses to music correlate
with activity in brain regions implicated in reward and emotion.* PNAS, 98(20), 11818–11823.
Retrieved: PMC58814 (full). Claims: chills + autonomic changes; rCBF changes in ventral striatum,
midbrain, amygdala, OFC, VMPFC.

[MP-17] Sachs, M. E., Damasio, A., & Habibi, A. (2015). *The pleasures of sad music: a systematic
review.* Frontiers in Human Neuroscience, 9:404. Retrieved (full). Claims: sadness pleasurable
when non-threatening, aesthetically pleasing, benefit-producing.

[MP-18] Taruffi, L., & Koelsch, S. (2014). *The paradox of music-evoked sadness: an online
survey.* PLOS ONE, 9(10), e110490. Retrieved (full). Claims: 4 rewards; mood-congruent;
nostalgia most frequent; memory top principle; empathy/instability traits.

[MP-19] Garrido, S., & Schubert, E. (2015). *Moody melodies: do they cheer us up?* Psychology of
Music, 43(2), 244–261. Retrieved: SAGE abstract page. Claims: increased depression after
self-selected sad music (both ruminators and non-ruminators).

[MP-20] Perham, N., & Currie, H. (2014). *Does listening to preferred music improve reading
comprehension performance?* Applied Cognitive Psychology, 28(2), 279–284. Retrieved: full PDF
(mirror). Claims: liked = disliked lyrical music, both worse than non-lyrical/quiet; ISE requires
changing-state + seriation.

[MP-21] Souza, A. S., & Barbosa, L. C. L. (2023). *Should we turn off the music? Music with
lyrics interferes with cognitive tasks.* Journal of Cognition, 6(1), 24. Retrieved: PMC10162369
(full). Claims: lyrics hindering d≈−0.3 on verbal memory/visual memory/reading; arithmetic ns;
instrumental neutral.

[MP-22] Kämpfe, J., Sedlmeier, P., & Renkewitz, F. (2011). *The impact of background music on
adult listeners: a meta-analysis.* Psychology of Music, 39(4), 424–448. Retrieved: ERIC EJ944201
(abstract). Claims: global null; task-specific: reading disturbed, small memory detriments, positive
emotional reactions, sports achievements; tempo paces concurrent activity.

[MP-23] Husain, G., Thompson, W. F., & Schellenberg, E. G. (2002). *Effects of musical tempo and
mode on arousal, mood, and spatial abilities.* Music Perception, 20(2), 151–171. **UNRETRIEVED**
(SAGE blocked). Core result noted from publisher record: tempo→arousal, mode→mood; the
arousal–mood framework appears in [MP-32] and [MP-20] literature discussion.

[MP-24] Pietschnig, J., Voracek, M., & Formann, A. K. (2010). *Mozart effect–Shmozart effect: a
meta-analysis.* Intelligence, 38(3), 314–323. **UNRETRIEVED** (ScienceDirect captcha). Cluster
covered by [MP-25].

[MP-25] Oberleiter, S., & Pietschnig, J. (2023). *Unfounded authority, underpowered studies, and
non-transparent reporting perpetuate the Mozart effect myth: a multiverse meta-analysis.*
Scientific Reports, 13:3175. Retrieved (full). Claims: little evidence of any Mozart-specific
benefit; publication bias; underpowered studies.

[MP-26] Cordi, M. J., Ackermann, S., & Rasch, B. (2019). *Effects of relaxing music on healthy
sleep.* Scientific Reports, 9:9079. Retrieved (full). Claims: subjective sleep quality 3.69 vs
3.28 (p=.048) vs text; N1 sleep reduced; other stages ns; small sample; suggestibility interaction
(REM).

[MP-27] Thoma, M. V., La Marca, R., Brönnimann, R., Finkel, L., Ehlert, U., & Nater, U. M.
(2013). *The effect of music on the human stress response.* PLOS ONE, 8(8), e70156. Retrieved
(full). Claims: mixed — faster sAA recovery after stressor in music group; cortisol response
highest in music condition (against hypothesis); HR/subjective ns.

[MP-28] Sedikides, C., Leunissen, J., & Wildschut, T. (2022). *The psychological benefits of
music-evoked nostalgia.* Psychology of Music, 50(6), 2044–2062. Retrieved: author PDF (full).
Claims: social connectedness, self-esteem, youthfulness, optimism, inspiration, meaning in life,
self-continuity; buffers sadness; context/individual moderation; familiarity necessity open.

[MP-29] Janata, P. (2009). *The neural architecture of music-evoked autobiographical memories.*
Cerebral Cortex, 19(11), 2579–2594. Retrieved: PMC2758676 (full). Claims: MPFC network for MEAMs;
subjects selected for high MEAM frequency (≥30 % threshold) — **correction for the "~30 %"
headline**.

[MP-30] Madison, G., & Schiölde, G. (2017). *Repeated listening increases the liking for music
regardless of its complexity.* Frontiers in Neuroscience, 11:147. Retrieved: PMC5374342 (full).
Claims: monotonic liking increase with repetition at all complexity levels (no inverted-U in their
data); familiarity strongest predictor.

[MP-31] Li, R., Chen, Y. V., & Zhang, L. (2019). *Effect of music tempo on long-distance driving:
which tempo is the most effective at reducing fatigue?* i-Perception, 10(4). Retrieved (full).
Claims: medium tempo best for fatigue/attention; slow worst; fast most stimulating; single-piece
caveat; individual-difference model.

[MP-32] Gigliotti, M. F., et al. (2025). *The sonic energy of background music impacts cognitive
performances: a behavioral and physiological investigation.* Cognitive Research: Principles and
Implications (doi 10.1186/s41235-025-00676-9). Retrieved: PMC12627320 (full). Claims: both
low/high-arousing music raised physiological activation and pleasure; high-arousing raised felt
effort on a demanding attentional task; verbal fluency unaffected.

[MP-33] Mas-Herrero, E., Zatorre, R. J., Rodriguez-Fornells, A., & Marco-Pallarés, J. (2014).
*Dissociation between musical and monetary reward responses in specific musical anhedonia.*
Current Biology, 24(6), 699–704. Retrieved: abstract via Europe PMC in this session. Claims:
subgroup with reduced musical pleasure/autonomic responses, normal monetary reward.

[MP-34] Juslin, P. N., Liljeström, S., Västfjäll, D., Barradas, G., & Silva, A. (2008). *An
experience sampling study of emotional reactions to music: listener, music, and situation.*
Emotion, 8(5), 668–683. Retrieved: abstract via Europe PMC in this session. Claims: music occurred
in 37 % of episodes; 64 % of music episodes affected how listeners felt.

Internal (non-independent): [SynAmp-dossier] docs/research/synamp-brain-dossier.html;
[SynAmp-CONTEXT] .cluster/synamp-fast-brain/CONTEXT.md; plan schema read from
apps/brain/src/query/plan.ts and signals.ts. Not evidence about the world; used only for internal
consistency.

### Confidence tiers by claim cluster

- **High (≥2 independent, retrieved):** lyrics harm verbal/serial work [MP-20][MP-21][MP-22];
  exercise-domain benefits & tempo bands [MP-1][MP-2][MP-3]; music-reward circuitry & frisson
  [MP-16] + direction consistent in [MP-33]; MEAM existence/network [MP-29][MP-28].
- **Medium (1 authoritative or consistent but narrow):** groove inverted-U [MP-10] (+[MP-12]/[MP-11]
  unretrieved); SMT→tempo preference [MP-13]; sleep subjective benefits [MP-26]; medium-tempo
  driving [MP-31]; nostalgia benefits [MP-28]; iso-sequence [MP-8]; social entrainment [MP-14].
- **Weak / extrapolated:** chores family [MP-22 only]; gaming pump-up; all [design assumption]
  bands; catharsis feature mapping (literature covers psychology, not DSP features).
- **Conflict (listed, not smoothed):**
  1. Background-music global effect: null global [MP-22] vs positive pre-assessment (de la Mora
     Velasco 2023, UNRETRIEVED; dossier) vs task-specific harms [MP-20][MP-21].
  2. Sad music: pleasurable/beneficial [MP-17][MP-18] vs mood-worsening [MP-19] vs
     sequence-dependent improvement [MP-8].
  3. Exposure/preference: classic inverted-U expectation vs monotonic increase [MP-30].
  4. Iso-principle: clinical canon [MP-7, unretrieved] vs partial controlled support [MP-8] vs
     no superiority in RCT feasibility [MP-9].
  5. Stress response: [MP-27] mixed directions (sAA vs cortisol).
  6. Mozart effect: popular claim vs meta-analytic no-support [MP-25] ([MP-24] unretrieved).
  7. Groove: syncopation U [MP-10] vs cultural/individual moderation [MP-14]; and no direct
     syncopation field exists in the registry today.

### Required-cluster coverage check

| Required cluster | Status | Where |
|---|---|---|
| Exercise/sport (Karageorghis & Priest 2012) | **Covered** (Part II full; Part I UNRETRIEVED) | [MP-1], [MP-2], [MP-3] |
| Mechanisms (Juslin & Västfjäll 2008) | **Covered** (abstract) | [MP-4], [MP-5] |
| Mood management (Zillmann) | **Gap** (primary UNRETRIEVED; secondary only) | [MP-6] |
| Iso-principle | **Covered with gaps** ([MP-7] UNRETRIEVED; [MP-8][MP-9] retrieved) | §1.4, §3 |
| Groove (Janata 2012; Witek 2014) | **Partial** (Witek full; Janata UNRETRIEVED) | [MP-10], [MP-11] |
| Frisson (Sloboda 1991; Blood & Zatorre 2001) | **Partial** (B&Z full; Sloboda UNRETRIEVED) | [MP-16], [MP-15] |
| Lyrics/verbal interference (ISE; Perham & Currie) | **Covered** (both retrieved; ISE originals cited-in) | [MP-20], [MP-21], [MP-22] |
| Arousal–mood (Husain 2002) | **Partial** (original UNRETRIEVED; framework in [MP-32]) | [MP-23], [MP-32] |
| Mozart caution (Pietschnig 2010) | **Partial** (original UNRETRIEVED; successor meta full) | [MP-24], [MP-25] |

Changelog / verification notes:
- "~30 % of songs evoke autobiographical memories" — corrected: a selection threshold in [MP-29],
  not prevalence. Flag for the dossier and final report.
- "Music as sleep aid" journals: subjective benefits well-supported; objective modest [MP-26].
- All weights and bands in §2/§3 are **research suggestions**; the algorithm owners must treat them
  as initial guesses to be calibrated per user, never as validated constants.
