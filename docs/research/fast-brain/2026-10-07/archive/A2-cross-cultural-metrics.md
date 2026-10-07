# A2 — Cross-cultural & metrics-reliability research pack

SynAmp "fast learning brain" · subagent A2 (cross-cultural music cognition + bias & ethics)
Date: 2026-10-06 · Status: research pack (Round A artifact)
Scope rules applied: public, published sources only; no sacred/restricted ceremonial knowledge; no pan-Indigenous flattening (specific peoples named throughout). All citations [CC-n] were retrieved during this task; blocked items are marked UNRETRIEVED. Evidence states: **retrieved-external** (source fetched in this task), **repo-confirmed** (already established in the SynAmp repo/cluster brief), **candidate** (reasoned, not yet evidenced), **unretrieved**.

---

## 0. Return format

### Conclusion

The SynAmp brain's "fast learning" safety story is as much a cross-cultural reliability problem as an algorithm problem. Retrieved evidence supports four conclusions:

1. **Metric reliability is culture- and corpus-shaped, not a fixed property of audio.** Tempo estimation has a codified octave-error problem and ambiguity that standard metrics deliberately forgive [CC-37]; beat/meter/downbeat methods evaluated on Indian art music and Turkish makam "performance… is not adequate" with state-of-the-art methods [CC-38]; gamelan tunings are per-ensemble and non-equal-tempered [CC-10, CC-11]; Turkish makam pitch practice shows "variability of pitch and the discrepancies between theory and practice" that discretized models are "not compatible with" [CC-40]. Any playlist feature that treats `bpm`, key/mode, or `pulse_clarity` as universally meaningful will be confidently wrong on a real library's non-Western material.
2. **Listeners themselves are enculturated, in measurable ways.** Infants at 6 months respond to both simple and complex (Balkan, non-isochronous) meters; by 12 months responding is culture-specific; adults who were not enculturated fail to hear foreign non-isochronous distinctions [CC-29, CC-30]. Rhythm priors show integer-ratio peaks across cultures but are culture-modulated [CC-31, CC-35]; groove responses to rhythmic complexity invert outside 4/4 for Western listeners [CC-36]. A "universal energy/mood" claim is therefore unsupported at both the machine and the human level.
3. **The product must design for uncertainty and correction, not for confident scores.** SynAmp already has the right seed: status-gated beat fields, `nearMiss` widths, honest counts, and the human tempo spot-check ("right / half / double / tap / no steady beat", 3-based metre ratios) [INT-1, INT-4]. This pack recommends extending exactly those mechanisms (tap-to-correct metre for non-binary cycles; abstention instead of guesses) and never training the per-epoch learner on metrics flagged by known failure modes.
4. **Ethics guardrails are a design constraint with concrete anchors.** CARE (Collective Benefit, Authority to Control, Responsibility, Ethics), and its shift "from regulated consultation to value-based relationships" [CC-47]; UNDRIP rights over cultural heritage, traditional knowledge and traditional cultural expressions, including "free, prior and informed consent" for cultural property [CC-49]; the Indigenous Protocol & AI position paper's insistence on heterogeneous Indigenous knowledge systems, relationships, and design guidelines rather than a single unified statement [CC-48]. Product consequence: culture-named defaults are starting points that must be labeled as such; attribution and provenance are features; new cultural concepts get consented, documented sources, or they do not ship as advertised capabilities.

### Evidence (highest-value retrieved items)

- Tempo octave errors are a named error class with a proposed formal metric; DJ use "octave errors are unacceptable"; standard ACC2 metric forgives factors 2, 3, ½, ⅓; human perception itself is ambiguous and P-Score was designed to respect that ambiguity [CC-37].
- Beat tracking, meter estimation, and downbeat detection for Carnatic/Hindustani/Turkish material: evaluated state-of-the-art "not adequate"; paper calls for culture-specific methods [CC-38].
- Powwow transcription history: Western notation fought the drum–vocal relationship ("disphony"; "the song meter does not seem to coincide with that of the drum"); Stanfield's notation keys the voice to the drum because the drum is the primary time reference [CC-19].
- Enculturation: 6-month-olds culture-general; 12-month-olds culture-specific; adults from Bulgaria/Macedonia discriminate complex-meter variations that other adults miss [CC-29, CC-30].
- Rhythm priors: integer-ratio peaks in US and native Amazonian participants, but qualitatively different distributions; "priors on musical rhythm are substantially modulated by experience" [CC-31]; cross-cultural tapping study adds culture-dependent 3:2 and 4:3 prototypes beyond the widespread 1:1 and 2:1 [CC-35].
- Groove: the inverted-U of rhythmic complexity holds only in 4/4 for Western listeners; in non-4/4 (e.g., 7/8) simpler rhythms groove most [CC-36] — perceivers' top-down meter models change what "works".
- Universality surveys: music present in 309/315 sampled societies; variation is larger within societies than across; acoustic features predict behavioral context (lullaby/dance/healing/love) [CC-33]; no absolute universals, dozens of statistical universals; group-coordination hypothesis [CC-34].
- Gamelan: slendro ≈ five near-equally-spaced steps; pelog heptatonic; tuning "varies so widely from island to island, village to village, and even among gamelans"; Balinese paired tuning deliberately stretched (beating) [CC-10, CC-11]; interlocking kotekan (polos/sangsih) creates "the illusion of a single melodic line… faster than any single human could possibly play" [CC-8]; colotomic gongs mark nested cycles up to gong ageng [CC-9].
- Loudness: perceived loudness relates to SPL via a power law (~0.67 exponent) and depends on frequency content and duration; equal-loudness contours codify frequency dependence; LUFS/LKFS is a K-weighted normalization standard — not a measure of felt intensity [CC-43, CC-44, CC-45].
- Microtiming caution: listeners failed to consistently detect small deviations (≤30 ms) and no consistent groove correlation with microtiming magnitude in cited studies [CC-46] — echoing SynAmp's own rule that mixed-onset mean residuals are not "feel" [INT-2, INT-3].
- Dataset skew: the canonical tempo datasets inventoried are Western/electronic-heavy (Ballroom, ISMIR04 songs, etc.), industry and academic genre priorities differ, and dataset quality issues (duplicates, mislabels, varying tempi) are documented [CC-37]; cross-cultural similarity work needed a new 9-tradition human-annotation study to test models [CC-42]; the MIR community position paper names cultural diversity and responsibility among six priorities [CC-41].

### Analysis (how this lands in SynAmp)

- **Query layer:** every field that can misreport must keep its abstraction gate, and the gates should cite this pack: beat-stage fields stay `timing_status`-gated; key/mode stays declared-but-unproduced until a producer exists that can abstain; swing/microtiming must never be called "feel".
- **Fast learning:** the per-epoch learner (A3 scope) should consume *user-corrected* or *high-reliability* values for rhythm features, and treat "unknown/tempo unclear" tracks as explore-able but not as evidence for tempo-based inferences. A skip on a track whose `pulse_clarity` is low-confidence must not be learned as "user dislikes this tempo".
- **Explainability:** per-track reasons already exist; add culture-aware wording ("tempo unclear — tap it") rather than confident numbers on suspect tracks.
- **UI default profiles:** culture-flavoured starting points (e.g., a "focus" arc built around timeline-pattern clarity vs one built around gamelan shimmer) are acceptable as labeled, user-visible defaults; "this is what focus sounds like in X tradition" is not.

### Gaps and risks

Gaps (detail in §6):
- Full texts not retrievable this pass: Agawu 2006 (PDF empty), Fürniss 2006 (HAL blocked), Clayton (India) and Locke's Drum Gahu (books), Polak 2018 full text (KTH blocked; abstract + MPI release retrieved), Jacoby & McDermott 2017 full text (publisher blocked; abstract retrieved), Saraga paper page (journal blocked; its prose claims are NOT cited here), Surjodiningrat's original tuning measurements (cited via Wikipedia summary only), Indian intonation MIR literature (repository blocked), U-M CSEAS tuning article (blocked), NMA Songlines page (JS-only).
- Several tradition facts rest on encyclopedic sources (Wikipedia + Britannica). They are consistent with the scholarly literature named in their references, but the pack marks them Low/Medium confidence and recommends upgrade in the review round.
- Akan (Asante) material beyond the pan-West-African "standard pattern" discussion was not retrieved in this pass — do not claim it.

Risks:
- **Overreach risk:** the "energy = microtiming" hypothesis appears in SynAmp docs [INT-2/INT-4]; retrieved audition evidence does not confirm microtiming magnitude → groove or energy [CC-46]; keep it a labeled candidate.
- **Stereotyping risk:** culture-flavoured presets can slide into genre stereotypes; mitigation: starting-point labeling, user renaming, no auto-claims about identity.
- **Governance risk:** shipping features that present living traditions as product attributes without provenance; mitigation: CARE/UNDRIP rules in §4, C2 review gate.
- **Evidence leakage risk:** claims from this pack must not be upgraded to "confirmed" without a second retrieval (High tier needs ≥2 independent sources).

### Suggested final-report placement

- **Ch. 3 (bias, culture & reliability):** §1 (traditions), §2 (perception science), §4 (ethics) — as the chapter's evidentiary spine.
- **Ch. 1 (translation layer):** §3 + §5 — the "metrics lie" section and the symptom→response table; feeds QA wording ("tempo unclear — tap it").
- **Ch. 2 (fast learning):** §0 analysis items — which signals the epoch learner may consume; "do not learn from suspect metrics" rule; §4 product rules on defaults.
- **Ch. 4 (verification/handoff):** §6 appendix + gaps — evidence-state ledger and the upgrade list for C2.
- **Code comments:** bias-note snippets for `signals.ts` (non-Western uncertainty), `spotcheck.ts` (metre extension), personality of `evaluate.ts` reasons.

---

## 1. Knowledge pack — named traditions (public scholarship only)

Format: tradition → retrieved structural facts → what it breaks in Western-default metrics → sources. Ethics boundary: only public, published material is summarized; no restricted/ceremonial content; where a study could not be retrieved, that is stated.

### 1.1 West African polyrhythm & timeline patterns (Ewe documented; Akan via the standard-pattern discussion)

- The **standard pattern / time line** is the best-known West African bell ostinato: "a seven-stroke figure spanning twelve eighth notes and disposed durationally as ⟨2212221⟩" [CC-1]. Agawu's article juxtaposes structural analysis with cultural understanding of this one pattern — the pattern itself is not the whole story [CC-1].
- Ewe ensembles: the **gankogui** (double clapperless bell) plays a "key pattern, or guide pattern, which the orchestra builds upon, although the tempo is set by the master drummer"; bell patterns from 8 to 24 pulses exist, the 12-pulse standard pattern being most common [CC-2]. The **atoke** and **axatse** complete the rhythmic foundation [CC-2].
- The 3:2 relationship (hemiola) is described as "the foundation of most typical polyrhythmic textures found in West African musics" (Novotney, in [CC-2]); Agawu: "'resultant' [3:2] rhythm holds the key to understanding… there is no independence here" [CC-2]. Melodies are additive, the time background divisive [CC-2].
- **Breakage for MIR:** multiple true pulses at once (3:2, 12-pulse cycle), guide-pattern prominence — onset-strength envelopes can lock onto the fastest or slowest layer; pulse clarity can be low while the music is entirely rhythmic. Do not call ambiguity "no beat".
- Akan/Asante material (e.g., adowa) is discussed in the same scholarly tradition but was not independently retrieved here — mark as gap (no Akan-specific claims in this pack).
- Sources: [CC-1] (abstract; full text UNRETRIEVED), [CC-2] (tertiary; references Agawu 2003, Novotney 1998, Locke). Locke's *Drum Gahu* appears in [CC-2]'s links; the book itself UNRETRIEVED.

### 1.2 Central African practices (Aka; Baka; Mbuti/Efé)

- The **Aka (Mbenga/Benzele)** and **Baka** in the west, **Mbuti (Efé)** in the east are "particularly known for their dense contrapuntal communal improvisation"; Arom is quoted that the level of polyphonic complexity of Mbenga–Mbuti music "was reached in Europe only in the 14th century" [CC-3]. Music is interwoven with daily life, hunting, honey-collecting, games and rituals [CC-3, CC-4].
- UNESCO inscription record: the tradition is transmitted orally; "during performances, each singer can change his or her voice to produce a multitude of variations, creating the impression that the music is continuously evolving"; songs are accompanied by "various percussion and string instruments" [CC-4].
- Fürniss's chapter (abstract): analyzes "the Aka's conception of polyphonic singing: cognitive premises; patterns and variation techniques; yodelling and melodic variations; the polyphonic pattern and the substratum of the song" — i.e., an emic theory of how the polyphony is constructed [CC-5].
- Whistle **hindewhu** (hocket/one-note-per-voice technique) is part of the regional practice; popularized in Western music without attribution historically [CC-3].
- **Breakage for MIR:** vocal-dense polyphony with no percussion grid; "note density" high; `pulse_clarity` frameworks built on percussive onsets under-read it. Vocalist count/roles are not "instrumentalness". Also relevant: a continuous, evolving, improvised texture breaks the "one tempo per track" assumption.
- Sources: [CC-3] (tertiary), [CC-4] (official UNESCO), [CC-5] (abstract only; full text UNRETRIEVED — HAL blocked by Anubis).

### 1.3 Indian classical tala / laya (Hindustani & Carnatic)

- **Tala** is the cyclic metric framework: each repeated cycle is an **avartan**; cycles are counted "additively in sections (vibhag or anga)" which "may not have the same number of beats (matra, akshara) and may be marked by accents or rests" — e.g., Jhoomra 14 beats as 3+4+3+4 vs Dhamar 14 beats differently grouped [CC-6]. The first beat, **sam**, is "always the most important and heavily emphasised"; **khali** is an empty beat [CC-6].
- **Laya** = tempo/rate concept with graded levels (vilambit/madhya/drut in Hindustani practice) — laya relations are compositional devices; the retrieved laya page was thin (see §6 gap), so only the tala-level claims above are carried [CC-6].
- Computational reality check for this music family: a dedicated evaluation "define[s] and describe[s] three relevant rhythm annotation tasks for these cultures—beat tracking, meter estimation, and downbeat detection," and finds "the performance of evaluated approaches is not adequate for the presented tasks," calling for culture-specific methods [CC-38]. This is the strongest retrieved evidence that India-family material is a known MIR weak spot.
- **Breakage for MIR:** cyclic, additive, non-equal-section metres; tempo as a graded, elastic practice (accelerando as norm in some forms); sam not necessarily at the acoustic downbeat a Western tracker expects. 4/4 bar models and "global tempo" both misfire.
- Sources: [CC-6] (tertiary but precise), [CC-38] (peer-reviewed abstract). Clayton's *Time in Indian Music* and Saraga dataset paper: UNRETRIEVED this pass (see §6).

### 1.4 Indonesian gamelan (kotekan, colotomic gongs, slendro/pelog)

- **Kotekan**: fast interlocking parts (polos and sangsih) in Balinese gamelan; "each of which fills in the gaps of the other to form a complete rhythmic texture"; the composite creates "the illusion of a single melodic line that often sounds faster than any single human could possibly play" (Vitale, in [CC-8]).
- **Colotomy**: instruments (kempyang, ketuk, kempul, kenong, gong suwukan, gong ageng) "mark off nested time intervals"; faster instruments keep the beat, larger gongs "group together these hits into larger groupings", the gong ageng = largest cycle [CC-9]. Structural time is hierarchical and gong-marked, not accent-patterned in the Western sense [CC-9].
- **Tuning**: slendro ≈ five roughly equally spaced pitches per octave; pelog heptatonic with subsets used per piece; "although the intervals vary from one gamelan to the next, the intervals between notes in a scale are very close to identical for different instruments within the same gamelan"; in Bali, paired instruments are tuned slightly apart on purpose, producing beating and "stretched octaves" — the shimmer [CC-10, CC-11]. Central Javanese pelog has been approximated as a subset of 9-tone equal temperament (Surjodiningrat 1972 via [CC-11] — original UNRETRIEVED).
- **Breakage for MIR:** chroma/key models assume 12-TET; gamelan is not; also the deliberate beating between paired instruments inflates spectral roughness and flattens harmonic clarity measures. Downbeat detection on nested gong cycles spanning long spans will pick arbitrary "bars". Kotekan's fastest strata can hijack tempo estimators into double-time.
- Sources: [CC-8], [CC-9], [CC-10], [CC-11], [CC-12] (tertiary; corroborated across the four wiki articles). Full scholarly monographs (e.g., Tenzer) UNRETRIEVED this pass.

### 1.5 Aboriginal Australian song cycles; clapstick / didgeridoo textures

- **Manikay** ("clan songs") of Yolŋu people (north-east Arnhem Land): "sacred song tradition performed by the Yolŋu when conducting public ceremonies… a medium through which the Yolŋu interpret reality, define their humanity, reckon their ancestral lineages" [CC-13]. Songlines/paths of creator beings are "recorded in traditional song cycles"; "intricate series of song cycles identify landmarks and tracking mechanisms for navigation" [CC-13].
- Performance textures: **clapsticks** (bilma/bimli) "establish the beat for the songs during ceremonies"; didgeridoo patterns ("the rhythm of the didgeridoo and the beat of the clapsticks are precise, and these patterns have been handed down for many generations") [CC-14]. The didgeridoo (yidaki) is a drone instrument (continuous drone; circular breathing) [CC-14]. In the Wangga genre the song-man starts vocals first, then introduces bilma with didgeridoo [CC-14].
- Regional genre names retrieved: Bunggul, Kun-borrk, Wajarra, Wangga (northern Australia) [CC-13].
- **Breakage for MIR:** long-form song cycles vs "one track = one song" assumptions; drone + stick texture where harmonics move but onset density is low; ceremonial contexts where extraction/analysis itself requires care (ethics: do not treat ceremony audio as generic catalogue content; UNDRIP Arts 11–13/31 [CC-49]). Public-source boundary: only public scholarship summarized here.
- Sources: [CC-13], [CC-14], [CC-15]. The National Museum of Australia "Songlines" page was JS-only = UNRETRIEVED; AIATSIS materials were not retrievable in this pass — mark as gap and do not cite.

### 1.6 Sámi yoik

- Yoik is the Sámi singing tradition (Sápmi, across Norway/Sweden/Finland and part of Russia) — "traditionally unaccompanied and often sung in wordless syllables"; it "describes or evokes an emotion, a person, a landscape, an animal" [CC-16].
- Ontological status: singer Mari Boine: "We don't sing about… we sing into being—a person, landscape, animal, situation" [CC-16]. That framing (yoik as being/relating, not "a song about X") is the core reason to treat it, in product vocabulary, as **not reducible to genre attributes**. Historically suppressed as witchcraft under Christianization; revival tied to Sámi cultural resurgence [CC-16].
- Peer-reviewed narrative review (health sciences): yoik is "a significant cultural marker which has survived… even though it was heavily prosecuted"; younger generations re-find yoik "as a marker of identity and belonging"; framing as socio-cultural resilience factor [CC-17].
- **Product implication:** a Sámi yoik in a library must not be auto-labeled with instrumentalness or "song about nature" claims; metadata should defer to the artist/community descriptions. Timing metrics may be rubato/parlando-like — beat fields should be allowed to abstain.
- Sources: [CC-16] (institutional page), [CC-17] (peer-reviewed review; full text retrieved). The literature explicitly notes research beyond ceremonial healing contexts is "under-researched" [CC-17] — say so rather than extrapolate.

### 1.7 Māori waiata / taonga pūoro

- Te Ara (Brian Flintoff): Māori musical instruments (taonga pūoro) are classified in families — melodic instruments of the family of **Rangi**, rhythmic instruments of the family of **Papa**; kōauau (flutes), pūrerehua (spinning discs), porotiti, pūtātara [CC-18]. Traditional instruments "experienced a revival in the late 20th century" after a period when they were regarded as belonging to a vanished past [CC-18].
- Sound aesthetics include natural-material timbres (wood, pounamu/greenstone, bone) and continuous/rotating sound sources (pūrerehua) — i.e., non-pitched and pitch-bending sound that onset/pitch-centric metrics misread [CC-18].
- **Product implication:** ensemble/track-level claims ("percussiveness", "instrumentalness") should abstain or invite user labels for such material rather than guess from sparse spectral cues.
- Sources: [CC-18] (national encyclopedia; full text retrieved).

### 1.8 Native American powwow structures (Northern-style, as documented)

- Stanfield (peer-reviewed, MUSICultures): the drum is the primary time reference; his notation approach "has the vocal part keyed to the drum part in an exact manner, basing all notational decisions on the primacy of the drum" [CC-19]. The article documents a century of scholars struggling with the drum–vocal relationship ("disphony": "the song meter does not seem to coincide with that of the drum" — McAllester 1984, quoted in [CC-19]).
- Song form: the melody's debated governing structure is AABCBC-type (form analysis focus) [CC-19]. Hoefnagels (abstract): powwows are "important social rituals closely linked to expressing affirmations of Native identities"; her study classifies Northern-style powwow music for teaching [CC-20].
- **Breakage for MIR:** drum and vocables sit in a polymetric relationship; a tracker keyed to Western "song meter" will misalign, exactly the historical notation problem [CC-19]. Downbeat/bar models and "vocal vs instrumental" splits both misdescribe it.
- Sources: [CC-19] (full article PDF retrieved), [CC-20] (abstract retrieved). Browner's *Heartbeat of the People* is referenced by [CC-19] but UNRETRIEVED.
- Ethics note: powwow music is public-performed, but community-specific protocols exist around recording; product should keep provenance with the community/powwow and avoid "tribal flavor" labeling (see §4).

### 1.9 Afro-Cuban clave & tresillo (3-3-2)

- Son clave: the "three-side" + "two-side" structure; the first three strokes of the son clave are known as **tresillo**, "a Spanish word meaning triplet, i.e. three almost equal beats in the same time as two main beats" [CC-21]. Tresillo = the 3+3+2 cell; habanera/"contradanza" lineage; the cell is central to Afro-Cuban popular music and moved into jazz (Buddy Bolden's "big four") and beyond [CC-22].
- The clave literature explicitly contrasts generation: in Afro-Cuban practice the pattern arises "through cross-rhythm", while in Middle Eastern/Asian practice the figure is generated "through additive rhythm, 3+3+2" (Agawu 2003, cited in [CC-22]) — a crisp illustration that identical note onsets ≠ same perceptual/metrical organization.
- **Breakage for MIR:** onset pattern alone cannot tell cross-rhythm from additive rhythm; clave directionality (2-3 vs 3-2) flips phrase anchoring; a tracker may lock to the offbeat or inverted metre. Onset-identical patterns can be heard differently — do not overstate metre confidence from onsets.
- Sources: [CC-21], [CC-22] (tertiary; cites Peñalosa's *Clave Matrix*, Agawu, Manuel; those books UNRETRIEVED).

### 1.10 Balkan & Turkish aksak metres (e.g., 2+2+3)

- **Aksak**: "the juxtaposition of rhythmic cells based on the alternation of binary and ternary quantities, as in 2+3, 2+2+3, 2+3+3"; literally "limping"; borrowed to describe irregular/additive meters generally [CC-23]. Strictly in Turkish theory the term covers the nine-pulse 2+2+2+3 grouping; a table gives named usuls incl. 7 = 2+2+3 (Devr-i Turan) and 11 = 2+2+3+2+2 (Gankino; Bulgarian names given) [CC-23]. Brăiloiu 1951 is the classic reference [CC-23].
- Britannica: "combinations of unequal beats, such as 2 + 3 and their extensions, particularly 2 + 2 + 2 + 3"; "called Bulgarian rhythm" (Bartók); extends to unequal subdivisions of eight beats (2+3+3) [CC-24].
- **Breakage for MIR:** non-isochronous beat ladders (long/short units); bar-length cycles of 7/9/11/15; typical 4/4-centric beat models and "regular" accent expectations misfire; and it is exactly this material on which non-enculturated listeners (and the enculturated-but-outside-the-tradition) diverge [CC-29, CC-30].
- Sources: [CC-23], [CC-24].

### 1.11 Andean genres (huayno; siku ensemble practice)

- Huayno: genre of Andean music/dance (Quechua/Inca heritage, developed across Andean countries); "distinctive rhythm in which the first beat is stressed and followed by two short beats"; typical instruments include quena, zampoña (siku), charango-adjacent guitars, violin, harp [CC-25].
- Siku (panpipe) practice: the instrument is divided into two rows, **ira** and **arka**; traditionally different musicians each played one row, interlocking to produce the melody — "a distinctive stereophonic sound"; ira≈male, arka≈female principles [CC-26].
- **Breakage for MIR:** interlocking between *players* (hocket) splits melodies/onsets across sources & channels; stressed-first-beat pattern plus hemiola feel (2/4 vs 6/8 ambiguity typical in Andean genres — note: hemiola claim itself is widely discussed but a specific retrieved source was not secured; mark candidate). Down-mixing/stereo handling affects what a per-mix tracker sees.
- Sources: [CC-25], [CC-26].

### 1.12 Japanese ma and jo-ha-kyū temporal aesthetics

- **Ma** (間): interval/space-time; "an emptiness full of possibilities"; "the silence between the notes which make the music"; more perception of a gap than a physical pause [CC-27]. Applies across arts (Noh, music, architecture) [CC-27].
- **Jo-ha-kyū**: "the Japanese tripartite form… the introduction, the scatterings, and the rushing toward the end" — a tempo/shape aesthetic applied both at piece level and within sections (dan), with typical placements of Noh musical styles [CC-28]. Britannica's Japanese-music frame stresses it is not a sonata-analogue: it concerns pacing across an event, not motif development [CC-28].
- **Breakage for MIR:** tension/pace as a *process* (deliberate long ma spans, accelerating to a rushing close) — flat global tempo and "energy = fast" readings miss the intended shape; structural silence is content, not absence of content.
- Sources: [CC-27], [CC-28] (Britannica topic stub + Japanese-music entry excerpt; both retrieved).

---

## 2. Cross-cultural perception science (all verified via retrieval)

1. **Enculturation & sensitive periods.** Hannon & Trehub (PNAS 2005, full text retrieved): 12-month-olds show "adult-like, culture-specific" responding; 6-month-olds are culture-general; "brief exposure to foreign music enables 12-month-olds, but not adults, to perceive rhythmic distinctions in foreign musical contexts" — suggesting "a sensitive period early in life for acquiring rhythm" [CC-29]. The companion experiments (CogSci 2003 full text + Psych Science 2005 abstract): North American adults fail to discriminate structure-violating alterations of a foreign (Balkan) **non-isochronous** meter, while Bulgarian/Macedonian adults and 6-month-olds differentiate in both simple and complex meters; conclusion: "metrical biases of North American adults reflect enculturation processes rather than processing predispositions for simple meters" [CC-30].
2. **Integer-ratio priors.** Jacoby & McDermott 2017 (abstract via PubMed): iterated reproduction estimated priors over two- and three-interval rhythm space; US participants' priors "showed peaks at rhythms with simple integer ratios", similar for musicians and non-musicians; a native Amazonian society's priors were "distinct from those in US participants but also featured integer ratio peaks"; conclusion: priors "substantially modulated by experience… may simply reflect the empirical distribution of rhythm that listeners encounter" [CC-31]. Full text UNRETRIEVED (publisher blocked).
3. **Cross-cultural tapping prototypes.** Polak et al. 2018 (abstract): musicians in Mali, Bulgaria, Germany tapped simple periodic rhythms; found support for "classic… 1:1 and 2:1 prototypes… across cultures" *and* for "culture-dependent prototypes characterized by more complex ratios such as 3:2 and 4:3"; "music-cultural environments specify links between music performance patterns and perceptual prototypes" [CC-35]. MPI press summary: "musical imprinting influences how the brain interprets rhythms" [CC-35b].
4. **Universality + diversity.** Mehr et al. 2019 (full text): ethnographic corpus from eHRAF, music described "in 309 of the 315 societies"; variation along formality/arousal/religiosity is "more within societies than across them"; music is associated with behavioral contexts (infant care, healing, dance, love); discography analyses: acoustic features predict behavioral context; tonality "widespread, perhaps universal"; rhythmic and melodic complexity vary; melodies/rhythms follow power laws [CC-33]. **Implication:** "music is universal" does not license universal *feature semantics*; complexity varies legitimately and is not a quality ranking.
5. **Statistical universals with caveats.** Savage et al. 2015 (full text): 304 global recordings; "no absolute universals but dozens of statistical universals", spanning pitch/rhythm but also domains "rarely cited including performance style and social context"; group-coordination hypothesis of cross-cultural regularities; note the paper explicitly wrestles with sampling/phylogenetic bias [CC-34].
6. **Meter expectations change groove.** Spiech et al. 2025 (full text): for Western listeners, groove is greatest for moderately complex rhythms **only in 4/4**; "In non-4/4 meters, simpler rhythms elicited the greatest groove"; bottom-up features (beat salience, pulse clarity, microtiming, syncopation) interact with top-down meter models [CC-36]. **Implication:** a system assuming the 4/4 "optimal complexity" heuristic exports its own enculturation.
7. **WEIRD-bias critique (methods).** Jacoby et al. 2020 (full PDF): "MOST RESEARCH… has been conducted on WEIRD participants"; "participants are almost always recruited from WEIRD societies, experimental materials are usually drawn from Western music, and studies tend to investigate constructs… disproportionately relevant to Western music"; recommendations target ethics, empirical methods, and definitions of "music" and "culture"; even the definition problem is flagged (sounds-as-music is a culturally negotiated agreement) [CC-32].
8. **Microtiming caution against "feel" overclaims.** Senn et al. 2016 (full text): reviewing the field, listeners "failed to consistently detect" small microtiming deviations (≈30 ms) [Butterfield 2010, cited]; studies found "no correlations between the magnitude of microtiming deviations and groove ratings" [Madison et al., cited]; groove correlated more with other properties like event density [CC-46]. **Implication for SynAmp:** do not convert `microtiming_signed`/swing into "energy" or "feel" claims; keep the dossier's hypothesis labeled candidate.

Corroboration status: items 1, 2, 5, 6 are internally sourced from the studies themselves (single authoritative retrievals → Medium tier each); item 2's cross-cultural-modulation claim is corroborated by item 3 (Polak) and item 7's framing → High for the meta-claim "priors are experience-shaped".

---

## 3. MIR failure modes with evidence

### 3.1 Tempo octave/ambiguity errors and non-4/4 weighting

- **Named error class + tolerance critique.** Schreiber & Müller 2020 (TISMIR, full text): ACC2 "allows estimates to be wrong by the factors 2, 3, ½ or ⅓ (so-called octave errors)"; this "metrical tolerance was not motivated by application requirements"; a cited industry statement: "From the perspective of the user of DJ software, it is absolutely mandatory that the tempo is annotated correctly. The so-called octave errors are unacceptable." They propose the "formal octave error" metric OE1 = log2(ŷ/y) so that clusters at ±1 (2/½) and ±1.58 (3/⅓) are visible; they note several systems show "octave bias… the ability to estimate the tempo appears tied to certain tempo ranges"; and that P-Score was invented because human tempo perception is genuinely ambiguous [CC-37].
- **Dataset/task tilt.** Same paper: canonical datasets (Ballroom, ISMIR04, etc.) are Western/electronic/dance-heavy; industry prioritizes "danceable genres Ballroom, EDM/Disco, Hip Hop/Rap, Reggae"; academic targets differ (Classical first among those with genre targets); "Ballroom and Folk were not ranked at all" by one group [CC-37]. "It is well known that some of the tracks in popular datasets have varying tempi" [CC-37].
- **Listener-side non-universality of the 4/4 optimum.** [CC-36] (above) shows the inverted-U complexity→groove relation is meter-dependent; and [CC-35] shows tapping prototypes differ by culture. Combined with [CC-29/30], the 4/4-assumed listener is an enculturated listener, not a baseline.
- **Repo cross-check.** SynAmp already gates "not too slow"-type predicates with "guarded against 60/120/240 octave errors" in its dossier plan [INT-4]; the spot-check supports half/double correction [INT-1]. This pack recommends treating octave ambiguity as a first-class UI state, not a trailing correction.

### 3.2 Beat / downbeat detection on heterophonic or rubato material (Indian art music; polymetric drum-vocal)

- Srinivasamurthy et al. 2014 (abstract): evaluated standard MIR rhythm methods on Carnatic, Hindustani and Turkish makam material for beat tracking, meter estimation, downbeat detection: "the performance of evaluated approaches is not adequate for the presented tasks, and… methods that are suitable to tackle the culture specific challenges… need to be developed" [CC-38]. (Saraga dataset paper's own text was not retrievable this pass — do not cite it.)
- Stanfield 2010 (full text): powwow drum↔voice relationship resisted Western notation for a century; the paper's method is to notate the vocal "keyed to the drum" because the drum is primary [CC-19]. This is a documented case of downbeat/meter inference failing when the analyst assumes the melodic line carries the metre.
- Rubato/expressive classical timing: [CC-37]'s "varying tempi" note + SynAmp's own analyzer result: on a real track ("Dreams") pulse could be tracked (score ≈0.529) "while microtiming is unidentifiable with this reference" (straight-reference RMS ≈100 ms → timing withheld) [INT-2]. SynAmp's own abstention rule (timing only when fitted-reference RMS ≤15 ms etc.) is precisely the right pattern; do not regress it [INT-2, INT-3].
- Heterophony note: dense unrelated onsets erode naive phase-concentration gates — demonstrated in-repo ("Dreams" onset phase concentration ≈0.034 while a beat was still trackable) [INT-2].

### 3.3 Key/mode detection assumptions vs non-12-TET tunings (gamelan; makam; Indian intonation)

- Gamelan: non-equal temperament, per-ensemble variance; slendro ≈ 5 near-equal steps; pelog heptatonic subsets; deliberate cross-tuning produces beating and "stretched octaves" — chroma templates and key models calibrated on 12-TET will produce unstable/meaningless keys [CC-10, CC-11]. No "standard" tuning exists to normalize to (variance "from island to island, village to village") [CC-11].
- Turkish makam: peer-reviewed 2026 TISMIR study (full text): "studies on Turkish makam music highlight the variability of pitch and the discrepancies between theory and practice"; its discretized-pitch model is explicitly "not compatible with the context-dependent pitch behavior observed in practice" [CC-40]. I.e., even a purpose-built makam model must choose a discretization; consumer key detection has no basis to claim "key" here.
- Indian intonation: the specific literature (tonic identification, raga intonation analysis) was **UNRETRIEVED** this pass (repositories blocked). Do not make Indian intonation claims; flagged as a gap to fill in the review round [gap].
- **Product rule:** key/mode outputs must be NULL on non-12-TET material rather than coerced; there is no confident path from chroma to "mode" for gamelan/makam right now, and honest nulls beat false keys.

### 3.4 Loudness metrics vs perceived intensity

- Loudness = perceptual quantity; "the perception of loudness is related to sound pressure level (SPL), frequency content and duration"; SPL→loudness is nonlinear (Stevens power law, exponent ≈0.67 approximated); historical units sone/phon exist precisely because dB-SPL ≠ loudness; modern standards (ISO 532-x etc.) are needed for loudness estimation [CC-43].
- Frequency dependence is codified: equal-loudness contours define SPL per frequency for constant perceived loudness (Fletcher–Munson etc.) [CC-44].
- LUFS/LKFS: "a standard loudness measurement unit used for audio normalization in broadcast television systems" (K-weighting, relative to full scale) [CC-45]. SynAmp's `lufs_integrated`, `loudness_range`, `crest_factor` are EBU R128-style measurements [INT-1, INT-4] — good for level, **not** for felt intensity/arousal.
- **Conclusion:** in the query compiler, "energy" must not silently compile to loudness alone; and on material whose timbre differs hugely from training data (gamelan beating, drone instruments, dense vocal polyphony), loudness↔intensity links are even weaker. Keep composite proxies [INT-4] but label them.

### 3.5 Note-density vs tempo confusion ("slow tempo but high note intensity")

- Evidence status: **candidate (internal) + partial external.** The TISMIR survey shows tempo estimation is defined around *tapping rate*, and evaluated mostly on dance/electronic material where density and tempo co-vary [CC-37]; Spiech et al. manipulate "rhythmic complexity" via event structure and show complexity perception interacts with meter [CC-36]; SynAmp's own materials already anticipate the failure: "A BPM number cannot separate laid-back from driving when both play at the same tempo" and "energy carried by microtiming, not BPM" [INT-4], and the user's brief lists "a slow tempo with high note intensity… can confidently report inaccurate metrics" as a target case [INT-1].
- A direct experimental citation for "note density biases perceived speed" was **UNRETRIEVED** (search attempts failed; do not cite a specific study). Recommendation: keep the design assumption (it is cheap to guard) but mark the external evidence as a gap for C2/A1 to fill.

### 3.6 Polyrhythm vs low pulse_clarity

- `pulse_clarity`-class measures operationalize "how clear is the beat to a listener" — Miguel et al. 2020 (full text) define pulse as "the base timing… expressed by a listener by performing periodic taps", a "cognitive construction" and "most basic expectation in rhythms", and frame their work as capturing pulse clarity through time [CC-39]. Spiech et al. use pulse clarity as a rating construct distinct from complexity [CC-36].
- Under polymetric/multilayer rhythm (Ewe 3:2 [CC-2]; powwow drum-vocal [CC-19]; interlocking kotekan [CC-8]), the *aggregate onset evidence* can be ambiguous even though every layer is rhythmic → low "clarity" score for high musical clarity to enculturated listeners. In-repo demonstration: real track with 7,351 onsets had phase concentration ≈0.034 yet a workable pulse existed [INT-2].
- **Product rule:** low `pulse_clarity` is *not* evidence of no beat; it is evidence to lower confidence and ask the user (tap) — consistent with the existing "pulse evidence ≠ timing evidence" separation [INT-2] and "Do not repeat: calling rejected tracks 'arrhythmic' without independent evidence" [INT-3].

### 3.7 Datasets and what they under-represent

- The tempo-estimation evaluation landscape is built on Western genre sets; new suitable datasets are "expensive to create"; existing sets have documented quality problems (duplicates, mislabelings, distortions — citing Sturm, Salamon in [CC-37]); human ambiguity annotation is rare [CC-37].
- Indian art music required its own datasets and still shows inadequate method performance [CC-38]; the Saraga effort is the community's counter-move (its paper was not retrievable this pass — do not quote it) [gap].
- Cross-cultural similarity: Papaioannou, Benetos & Potamianos (TISMIR, full text): "first comprehensive evaluation of computational music similarity methods against human cross-cultural music perception, spanning nine diverse musical traditions"; 125 participants; 1,130 audio pairs; human judgments along overall/cultural/recommendation dimensions compared to signal features and seven foundation models; results demonstrate that model performance (notably foundation models) diverges from human cross-cultural judgments in ways that matter for recommendation [CC-42]. **Product implication:** "sounds like" retrieval inherits this gap; SynAmp's per-user, per-library scope (as the dossier already argues [INT-4]) is the correct mitigation.
- MIR community stance: "AI and Music at a Crossroads" (full text): proposes "transparency, accountability, provenance, and sustainability" as assessment criteria and lists "cultural diversity and responsibility" among six priorities [CC-41]. This pack's §4 product rules follow that framing.

---

## 4. Bias & ethics guardrails

### 4.1 Normative anchors (retrieved)

- **CARE Principles (Carroll et al. 2020)** — Collective Benefit, Authority to Control, Responsibility, Ethics: "empower Indigenous Peoples by shifting the focus from regulated consultation to value-based relationships… within Indigenous cultures and knowledge systems"; framed alongside UNDRIP; goal: data "for governance" and "governance of data"; Indigenous Peoples move from "subjects of data that perpetuate unequal power distributions to self-determining users of data" [CC-47].
- **UNDRIP (2007, full text retrieved)** — rights most relevant to a music product:
  - Art. 8: no forced assimilation / destruction of culture; redress mechanisms [CC-49].
  - Art. 11: right to practise and revitalize cultural traditions; cultural property taken without "free, prior and informed consent" to be addressed (redress/restitution) [CC-49].
  - Art. 12: spiritual/religious traditions and ceremonies; control of ceremonial objects [CC-49].
  - Art. 13: transmit histories, languages, oral traditions [CC-49].
  - Art. 31: "maintain, control, protect and develop their cultural heritage, traditional knowledge and traditional cultural expressions" [CC-49].
- **Indigenous Protocol & AI position paper (Lewis et al., eds., 2020)** — a "collection of heterogeneous texts that range from design guidelines to scholarly essays", i.e., no single unified statement; centers "Indigenous epistemologies and ontologies" and relationship-based design (examples retrieved: Lakota 'Good Way' protocol steps; Basque relations with eels as design frame) [CC-48]. Relevance: do not universalize one "Indigenous perspective"; work with specific communities and protocols.

### 4.2 Attribution rules (product-level)

1. **Credit, don't absorb.** Any tradition-derived feature (e.g., a "focus arc" built on timeline-pattern behavior) must name its sources in the doc appendix and, where the feature ships, link to the tradition/its practitioners by name — not to a generic "world/tribal" label. (Consistent with CARE Authority-to-Control + UNDRIP 31.)
2. **Provenance metadata.** Keep source notes for every cultural concept used in defaults: which published sources, which communities, what was NOT claimed. [CC-41]'s provenance criterion as internal standard.
3. **No invented traditions.** Do not extrapolate beyond retrieved scholarship; where material is restricted/unknown, say "not documented here" (this pack models that at [CC-5], [CC-47]-adjacent items).
4. **No sacred/restricted knowledge.** No attempts to infer ceremonial function from audio; no scraping of community-restricted recordings; public published sources only for feature design.

### 4.3 Consent / consultation before productizing cultural concepts

- Before a tradition-named profile becomes a marketed feature (not just an internal default), do a consultation step: identify community stakeholders where feasible; if not feasible, publish the feature as "inspired by [tradition], based on public sources" with explicit limitations and an opt-out/rename path for users. Rooted in UNDRIP Art. 11's free-prior-informed-consent norm for cultural property and the CARE shift "from regulated consultation to value-based relationships" [CC-47, CC-49].
- Keep a decision record (DECISIONS.md entry) for each culture-named feature with: sources, consent status, reviewer, date. C2 (bias review) checks these.

### 4.4 Concrete product rules for the fast-learning brain

1. **Never claim a universal "energy".** Present "energy"-family asks as proxies with named inputs (loudness? onset rate? microtiming?) and confidence; see [INT-4]'s proxy field already in the plan schema. On suspect tracks, degrade to "unknown" rather than guess [§3].
2. **Label profile defaults as culture-flavoured starting points.** e.g., "Starts from West African timeline-pattern picks — adjust freely". Users can rename/save their own; the label never asserts cultural authority.
3. **Expose uncertainty everywhere.** Keep `*_confidence`-style fields and honest counts; UI strings for rhythmic doubt: "tempo unclear — tap it", "metre unclear — counted 7? tap the cycle." Never render a low-confidence bpm as a bare number.
4. **Tap-to-correct metre — extend the existing spot-check.** Current spot-check supports right/half/double/tap + "no steady beat" + some 3-based ratios [INT-1]. Extend to: tap-the-cycle (2/4/8 beat marking), odd-cycle acceptance (5/7/9/11), and "layered/ambiguous" (multiple valid pulses) — each storing a human-verified tier that supersedes measured values (mirrors the existing correction-holds-until-value-changes logic [INT-1]).
5. **Avoid genre stereotypes.** Genre tags are weak hints [INT-4]; never map genre → culture claims ("Latin = danceable") in speech or defaults. Cross-cultural similarity evidence says even embedding models mispredict human cross-cultural judgments [CC-42].
6. **Don't let the epoch learner learn from suspect metrics.** If `pulse_clarity` is low / `timing_status` abstained / metre is user-flagged ambiguous, a skip or repeat must not update tempo-based or timing-based preferences for that scope. Learn *content identity* (artist/track signals) in those cases, not *feature hypotheses* [analysis coupling to A3; INT-2].
7. **Show the human-verified tier ahead of the machine tier** ("you verified this tempo" > "measured 128±"). Required for trust + per-track reasons [INT-1].
8. **No pan-Indigenous flattening in copy or data.** Name peoples/traditions specifically when referenced (Ewe; Yolŋu; Sámi; Māori; Akan not claimed here). Ban "tribal", "primitive", "exotic" strings in UI/code review.
9. **Protect quiet-time and ceremony contexts.** Do not auto-generate "pump-up" arcs for material flagged as ceremonial by user tags; "respect explicit exclusions as hard" [INT-1] already encodes the mechanism — keep it for cultural contexts too.
10. **Language precision for yoik-like ontology.** UI must not render yoik (or similar relation-songs) with labels like "song about nature". Default to artist-provided descriptions; abstain otherwise [CC-16].

---

## 5. Design implications table (symptom → likely metric misreport → system response)

Column key: *Symptom* = what the measurement layer sees; *Likely misreport* = the wrong thing it suggests; *Response* = deterministic rule (each explainable in per-track reasons). Rows 1–4 are the task-required cases; 5–12 extend them.

| # | Symptom | Likely metric misreport | System response |
|---|---------|-------------------------|-----------------|
| 1 | Low `pulse_clarity` + high `onset_rate` | "Slow/ambiguous track" → wrong tempo or false 'relaxing' | Down-weight tempo-derived scoring; override auto values; surface "**tempo unclear — tap it**" (spot-check; store human tier). Cite: [CC-37] ambiguity; [CC-39]; [INT-2] (phase concentration 0.034 case). |
| 2 | Non-binary metre suspicion (e.g., autocorrelation peaks at 7/8, 9/8 or additive groupings) | 4/4 collapse / wrong downbeats | Do not auto-assign 4/4; prefer existing user-verified metre; offer "tap the cycle" and "layered/ambiguous" options; keep bar-level boost off. Cite: [CC-6] additive cycles; [CC-23, CC-24] aksak; [CC-29/30, CC-36] enculturation. |
| 3 | Strong microtiming on one layer only (mixed-onset residuals) | "This track has notable swing/feel" from mean of all onsets | Never render `microtiming_signed`/swing as "feel"; require layer attribution before any claim ([INT-3] R3); if only one layer deviates, mark "layer-specific timing" or abstain. Cite: [INT-2] (30 ms late layer → −15 ms mean); [CC-46] (microtiming↔groove not confirmed). |
| 4 | Sparse percussion + high spectral complexity | High `percussiveness` / "driving rhythm" from noise-like spectra | Percussiveness marked unreliable on this profile; fall back to absence-of-value (NULL) rather than high score; invite user label. Cite: [CC-10, CC-11] (gamelan shimmer/beating); [CC-18] (Māori non-pitched instruments); [CC-3] (dense vocal polyphony without percussion). |
| 5 | `bpm` ≈ 60 while onsets suggest double; or bpm ≈ 120 with strong subdivision | Octave error presented as fact | Present "60 / 120?" state; use existing half/double correction [INT-1]; exclude from tempo-range hard predicates until resolved (nearMiss logic). Cite: [CC-37] (OE class; octave bias by range). |
| 6 | High `lufs_integrated` + low onset density | "High energy" from loudness alone | Compile "energy" to labelled composite (loudness + onset + microtiming); show reasoning; never equate LUFS with arousal [INT-4] proxy field. Cite: [CC-43, CC-44, CC-45] (loudness ≠ intensity; frequency/duration dependence). |
| 7 | `loudness_range` high + `clipping_density` ≈ 0 | "Dynamic" ≠ "calm" confusion | Keep both dimensions; do not map dynamics to mood; explain each contribution in reasons. Cite: [CC-43] (duration/intensity dynamics); [INT-4] (dynamic_complexity field). |
| 8 | Interlocking textures (kotekan, siku ira/arka, drum-vocal polymetry) | Double-time tempo / wrong downbeat / 'two songs at once' confusion | Lower confidence across beat-stage fields; prefer "layered rhythm" note; enable tap; do not call it arrhythmic. Cite: [CC-8] (kotekan), [CC-19] (powwow), [CC-26] (siku). |
| 9 | Non-12-TET or stretched-octave material (gamelan; makam; unretrieved: Indian intonation) | Confident wrong `key`/`mode`; dissonance metric oddities | Key/mode fields abstain (NULL with reason "tuning not 12-TET-like"); dissonance guarded. Cite: [CC-10, CC-11, CC-40]. |
| 10 | Long-form cyclic content (song cycles; raga with alap sections; tala avartan) | "One track = one tempo/mood" flatness; arc sequencing inappropriate | Prefer flat arcs on flagged long-form; don't apply build/cooldown; note "continuous form" in reasons (ties to sequencing workstream). Cite: [CC-13] (manikay), [CC-6] (avartan). |
| 11 | Sparse, quiet, high-timbre-identity material (yoik; taonga pūoro) | "Boring/low energy" dismissal via loudness+onset heuristics | Boost semantic/artist signals over acoustic projections; suppress auto "relaxing" inference; never auto-claim cultural semantics. Cite: [CC-16, CC-17] (yoik), [CC-18] (taonga pūoro). |
| 12 | User skip on a low-confidence rhythm track | Learned as "dislikes this tempo/rhythm" | Epoch learner updates only entity/scope signals, not tempo/timing hypotheses, when reliability flags are set (couples to A3 design). Cite: [INT-2] (method rejection ≠ musical truth). |

Formatting/implementation notes: every row maps to a per-track "reason" string and a reliability flag; no new plan fields required beyond today's registry except an explicit "metre: user-verified / ambiguous" state and an extension of the spot-check UI (tap-cycle), preserving the "correction holds only while the measured value matches" rule [INT-1].

---

## 6. Sources appendix [CC-n] — retrieved URLs + confidence + gaps

Confidence tiers per cluster convention: **High** = ≥2 independent retrieved sources agreeing; **Medium** = one authoritative retrieved source; **Low** = weak/tertiary single source; **Conflict** = sources disagree.

| ID | Source | Retrieved as | URL | Confidence | Notes / caveats |
|----|--------|--------------|-----|------------|-----------------|
| CC-1 | Agawu, "Structural Analysis or Cultural Analysis? Competing Perspectives on the 'Standard Pattern' of West African Rhythm", JAMS 59(1), 2006 | Abstract text via OpenAlex API | https://doi.org/10.1525/jams.2006.59.1.1 | Medium (abstract) | Full PDF fetch returned empty; full text UNRETRIEVED. ⟨2212221⟩ quote from retrieved abstract. |
| CC-2 | "Ewe music", Wikipedia | Full text | https://en.wikipedia.org/wiki/Ewe_music | Low (tertiary) | Cites Agawu 2003, Novotney 1998, Jones; use as pointer. |
| CC-3 | "Pygmy music", Wikipedia | Full text | https://en.wikipedia.org/wiki/Pygmy_music | Low (tertiary) | Cites Arom; captures Aka/Baka/Mbuti distinction. |
| CC-4 | UNESCO ICH, "Polyphonic singing of the Aka Pygmies of Central Africa" (no. 00082) | Full text | https://ich.unesco.org/en/RL/polyphonic-singing-of-the-aka-pygmies-of-central-africa-00082 | Medium (official) | Inscribed 2008; oral transmission; improvisation. |
| CC-5 | Fürniss, "Aka Polyphony", 2006 (chapter) | Abstract via OpenAlex | https://doi.org/10.1093/acprof:oso/9780195177893.003.0006 | Medium (abstract) | Full text UNRETRIEVED (HAL/Anubis blocked). |
| CC-6 | "Tala (music)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Tala_(music) | Low–Medium | Additive cycles, avartan, sam, vibhag; detailed and consistent with [CC-38]. |
| CC-7 | Saraga README (MTG) | Fetched (content not quoted) | https://raw.githubusercontent.com/MTG/saraga/master/README.md | — | Not cited for claims (not read in time); listed as locatable resource. |
| CC-8 | "Kotekan", Wikipedia | Full text | https://en.wikipedia.org/wiki/Kotekan | Low | Vitale quote on interlocking illusion. |
| CC-9 | "Colotomy", Wikipedia | Full text | https://en.wikipedia.org/wiki/Colotomy | Low | Nested gong cycles; instrument names. |
| CC-10 | "Slendro", Wikipedia | Full text | https://en.wikipedia.org/wiki/Slendro | Low | Variability across ensembles; Balinese paired tuning/beating. |
| CC-11 | "Pelog", Wikipedia | Full text | https://en.wikipedia.org/wiki/Pelog | Low | 9-TET approximation; Surjodiningrat 1972 cited (original UNRETRIEVED). |
| CC-12 | "Gamelan", Wikipedia | Full text | https://en.wikipedia.org/wiki/Gamelan | Low | Context/ensemble overview. |
| CC-13 | "Manikay", Wikipedia | Full text | https://en.wikipedia.org/wiki/Manikay | Low | Yolŋu clan songs; songlines; genre names. |
| CC-14 | "Didgeridoo", Wikipedia | Full text | https://en.wikipedia.org/wiki/Didgeridoo | Low | Drone, circular breathing; bilma beat establishment. |
| CC-15 | "Clapstick", Wikipedia | Full text | https://en.wikipedia.org/wiki/Clapstick | Low | bilma/bimli naming; rhythm maintenance. |
| CC-16 | Madsen, "Singing into Being", UAF Circumpolar Music Series | Full text | https://www.uaf.edu/music/cms/singing-into-being.php | Medium | Mari Boine quote; suppression history. |
| CC-17 | Hämäläinen et al., "Sami yoik, Sami history, Sami health: a narrative review", Int J Circumpolar Health (PMC5912196) | Full text | https://pmc.ncbi.nlm.nih.gov/articles/PMC5912196/ | Medium (peer-reviewed) | Identity/resilience framing; "under-researched" caveat. |
| CC-18 | Te Ara (Flintoff), "Māori musical instruments – taonga puoro" | Full text | https://teara.govt.nz/en/maori-musical-instruments-taonga-puoro | Medium | Rangi/Papa families; revival. |
| CC-19 | Stanfield, "Powwow Music and its Polymetric Construction", MUSICultures 37, 2010 | Full PDF | https://journals.lib.unb.ca/index.php/MC/article/view/20228 | Medium–High (single but primary scholarship) | Drum primacy; notation history; AABCBC form context. |
| CC-20 | Hoefnagels, "Northern Style Powwow Music…", MUSICultures, 2004 | Abstract | https://journals.lib.unb.ca/index.php/MC/article/view/21605 | Low | Classification-for-teaching; Northern style. |
| CC-21 | "Clave (rhythm)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Clave_(rhythm) | Low | Son clave; tresillo definition. |
| CC-22 | "Tresillo (rhythm)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Tresillo_(rhythm) | Low | 3+3+2; habanera; cross-rhythm vs additive contrast (cites Agawu 2003, Peñalosa). |
| CC-23 | "Aksak (meter)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Aksak | Low–Medium | Cell table; Brăiloiu 1951; Turkish/Bulgarian usul names. |
| CC-24 | Britannica, "aksak" | Full text | https://www.britannica.com/art/aksak | Medium | 2+3 / 2+2+2+3; "Bulgarian rhythm" (Bartók). |
| CC-25 | "Huayno", Wikipedia | Full text | https://en.wikipedia.org/wiki/Huayno | Low | First-beat stress + two short beats; instruments. |
| CC-26 | "Siku (instrument)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Siku_(instrument) | Low | ira/arka interlocking; stereophonic sound. |
| CC-27 | "Ma (negative space)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Ma_(negative_space) | Low | Interval/silence semantics; "silence between the notes". |
| CC-28 | Britannica, "jo-ha-kyū" + "Japanese music: Structural ideals" excerpt | Topic stub text | https://www.britannica.com/art/jo-ha-kyu | Low–Medium | Tripartite pacing; Noh section placements. |
| CC-29 | Hannon & Trehub, "Tuning in to musical rhythms: Infants learn more readily than adults", PNAS 2005 | Full text (PMC1194930) | https://pmc.ncbi.nlm.nih.gov/articles/PMC1194930/ | Medium (peer-reviewed) | Sensitive period; 12-mo vs adults. |
| CC-30 | Hannon & Trehub, "Metrical Categories in Infancy and Adulthood" | Full PDF (CogSci 2003, eScholarship) + Psych Science 2005 abstract via OpenAlex | https://escholarship.org/content/qt6170j46c/qt6170j46c.pdf + https://doi.org/10.1111/j.0956-7976.2005.00779.x | Medium | 7/8 stimulus detail; Bulgarian/Macedonian adults; infant responsiveness. |
| CC-31 | Jacoby & McDermott, "Integer Ratio Priors on Musical Rhythm…", Current Biology 2017 | Abstract via PubMed E-utilities (PMID 28065607) | https://pubmed.ncbi.nlm.nih.gov/28065607 | Medium (abstract) | Full text UNRETRIEVED (publisher blocked). |
| CC-32 | Jacoby et al., "Cross-Cultural Work in Music Cognition…", Music Perception 37(3), 2020 | Full PDF | https://www.norijacoby.com/Jacoby_etal_20202_cross%20cultural%20work%20in%20music%20cognition.pdf | Medium (peer-reviewed position paper) | WEIRD sampling; ethics/methods/definition recommendations. |
| CC-33 | Mehr et al., "Universality and diversity in human song", Science 2019 | Full text (PMC7001657) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7001657/ | Medium (peer-reviewed) | 309/315 societies; within>across variation; context predictions. |
| CC-34 | Savage et al., "Statistical universals…", PNAS 2015 | Full text (PMC4517223) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4517223/ | Medium (peer-reviewed) | 304 recordings; no absolute universals; group coordination. |
| CC-35 | Polak et al., "Rhythmic Prototypes Across Cultures", Music Perception 2018 | Abstract via OpenAlex; plus MPI press summary [CC-35b] | https://doi.org/10.1525/mp.2018.36.1.1 ; https://www.aesthetics.mpg.de/en/newsroom/news/news-article/article/rhythm-diversity-different-cultures-prefer-different-beat-patterns-1.html | Medium (abstract + release) | Full text UNRETRIEVED (KTH/Anubis blocked). |
| CC-36 | Spiech et al., "4/4 and more, rhythmic complexity more strongly predicts groove in common meters", Communications Psychology (Nature) 2025 | Full PDF | https://www.nature.com/articles/s44271-025-00360-0.pdf | Medium (peer-reviewed) | Groove inverted-U only in 4/4; simpler rhythms groove in non-4/4. |
| CC-37 | Schreiber & Müller, "Music Tempo Estimation: Are We Done Yet?", TISMIR 2020 | Full text | https://transactions.ismir.net/articles/10.5334/tismir.43 | Medium (peer-reviewed) | OE metrics; ACC2 tolerance critique; dataset inventory; varying tempi. |
| CC-38 | Srinivasamurthy et al., "In Search of Automatic Rhythm Analysis Methods for Turkish and Indian Art Music" | Abstract via OpenAlex | https://doi.org/10.1080/09298215.2013.879902 | Medium (abstract) | "not adequate" for beat/meter/downbeat on these corpora. |
| CC-39 | Miguel et al., "From beat tracking to beat expectation: cognitive-based beat tracking for capturing pulse clarity through time", PLoS ONE 2020 | Full text (PMC7673539) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7673539/ | Medium (peer-reviewed) | Pulse-clarity operationalization. |
| CC-40 | TISMIR, "A Quantitative Model of Tension and Resolution in Turkish Makam Music" | Full text | https://transactions.ismir.net/articles/10.5334/tismir.353 | Medium (peer-reviewed) | Pitch variability; theory-practice gap; discretization limits. |
| CC-41 | Serra et al., "AI and Music at a Crossroads…", TISMIR | Full text | https://transactions.ismir.net/articles/10.5334/tismir.372 | Medium | Six priorities; provenance/transparency criteria. |
| CC-42 | Papaioannou, Benetos, Potamianos, "Cross-Cultural Music Similarity…", TISMIR | Full text | https://transactions.ismir.net/articles/10.5334/tismir.341 | Medium (peer-reviewed) | 9 traditions; 125 participants; 1,130 pairs; model-human divergence. |
| CC-43 | "Loudness", Wikipedia | Full text | https://en.wikipedia.org/wiki/Loudness | Low (tertiary; standard psychoacoustics content) | SPL vs loudness; power law; sone/phon. |
| CC-44 | "Equal-loudness contour", Wikipedia | Full text | https://en.wikipedia.org/wiki/Equal-loudness_contour | Low | Frequency dependence; Fletcher–Munson. |
| CC-45 | "LKFS" (LUFS), Wikipedia | Full text | https://en.wikipedia.org/wiki/LKFS | Low | K-weighted normalization standard. |
| CC-46 | Senn et al., "The Effect of Expert Performance Microtiming on Listeners' Experience of Groove…", Frontiers in Psychology 2016 | Full PDF | https://www.frontiersin.org/articles/10.3389/fpsyg.2016.01487/pdf | Medium (peer-reviewed) | Reviews negative/nuanced evidence for microtiming→groove. |
| CC-47 | Carroll et al., "The CARE Principles for Indigenous Data Governance", Data Science Journal 2020 | Full text | https://datascience.codata.org/articles/10.5334/dsj-2020-043/ | High (peer-reviewed; also corroborated by [CC-49] framing) | CARE quad; consultation→relationships shift. |
| CC-48 | Lewis et al. (eds.), "Indigenous Protocol and Artificial Intelligence Position Paper", 2020 | Landing + position-paper preview text | https://www.indigenous-ai.net/position-paper/ | Medium (partial) | Heterogeneous texts; relation-based design; no single unified statement. |
| CC-49 | UN, "Declaration on the Rights of Indigenous Peoples" (A/RES/61/295) | Full PDF | https://www.un.org/development/desa/indigenouspeoples/wp-content/uploads/sites/19/2018/11/UNDRIP_E_web.pdf | High (primary instrument; retrieval + [CC-47] linkage) | Arts 8, 11, 12, 13, 31 quoted from retrieved text. |
| CC-50 | "Laya (music)", Wikipedia | Full text (thin content) | https://en.wikipedia.org/wiki/Laya_(music) | Low | Not used for strong claims; laya specifics deferred. |
| CC-51 | "Pulse (music)", Wikipedia | Full text | https://en.wikipedia.org/wiki/Pulse_(music) | Low | Background only. |
| CC-52 | "Tempo rubato", Wikipedia | Search/snippet only — EXCLUDE | — | — | Listed for honesty: not fetched; no claims based on it. |

Internal (repo/cluster) references:

- [INT-1] `.cluster/synamp-fast-brain/CONTEXT.md` — verified repo facts: signal registry & gates; spot-check behaviours (right/half/double/tap; 3-based ratios; "no steady beat"); epoch learning scoping; declared-vs-produced fields.
- [INT-2] `docs/research/beat-timing-findings-2026-09-29.md` — two-track smoke results; phase-concentration ≈0.034 with trackable pulse; timing abstention guards; "method rejection ≠ independent musical truth".
- [INT-3] `docs/synamp/plans/BEAT-TIMING.md` — onset-attribution requirements; "do not repeat" list (incl. not calling rejected tracks arrhythmic).
- [INT-4] `docs/research/synamp-brain-dossier.html` — metric taxonomy ("BPM is the weakest signal"; octave errors 60/120/240); proxy field; dataset-bias design row; cross-cultural similarity variance (Papaioannou).

### Explicit UNRETRIEVED list (do not cite as evidence)

1. Clayton, *Time in Indian Music* (SOAS repository page found but not fetched content) — India analysis relies on [CC-6]/[CC-38] only.
2. Locke, *Drum Gahu* (book; only pointer via [CC-2]) — Akan/Ewe detail beyond [CC-1, CC-2] not verified.
3. Agawu 2006 full text (PDF fetch empty).
4. Fürniss 2006 full text (Anubis block).
5. Saraga paper text (emusicology.org Anubis block); Saraga README fetched but unread — no claims made.
6. Polak 2018 full text (KTH DiVA Anubis block; abstract used).
7. Jacoby & McDermott 2017 full text (cell.com Cloudflare block; abstract used).
8. Surjodiningrat 1972 original tuning measurements (via [CC-11] only).
9. Indian intonation MIR (tonic identification / pitch-tracking papers; UPF repository blocked).
10. "U-M CSEAS Spirit of Tuning" article (Cloudflare block).
11. NMA "Songlines" exhibition page (JS-only shell).
12. Direct experimental evidence for "note-density → perceived speed/tempo bias" (searches unsuccessful; claim kept candidate, §3.5).
13. AIATSIS materials (could not retrieve usable page this pass; do not cite AIATSIS as a source).
14. GlobalMood / "Missing Melodies" / music-AI fairness papers surfaced in search but not retrieved — excluded entirely from citations.

### Confidence summary for headline claims

- "Tempo octave errors are a real, named class with acceptance problems": **High** ([CC-37] + repo context [INT-4] + listening ambiguity documented in [CC-37]/[CC-6]-adjacent literature is single-source though; keep High with [CC-37]+[CC-38] as independent corroboration of "Tempo-family metrics are weak on non-Western material").
- "Enculturation shapes rhythm perception (development + cross-society)": **High** ([CC-29]+[CC-30] same lab lineage = caution; add [CC-35] independent lab → High for the meta-claim).
- "Rhythm priors are integer-ratio-anchored but culture-modulated": **High** ([CC-31]+[CC-35]).
- "Groove/meter interaction breaks the 4/4 optimum": **Medium** ([CC-36] single study; corroborating [CC-35] mechanism-level).
- "Gamelan tuning is non-12-TET and ensemble-specific": **Medium** ([CC-10]+[CC-11] are two pages but same publisher family; treat as one; upgrade in C2).
- "Loudness ≠ perceived intensity": **Medium–High** ([CC-43]+[CC-44]+[CC-45]).
- "Indian art music rhythm methods inadequate": **Medium** ([CC-38]; second source blocked).
- "Microtiming magnitude does not reliably predict groove": **Medium** ([CC-46] review of multiple studies).
- "CARE/UNDRIP as the governance frame": **High** ([CC-47]+[CC-49] explicitly interlinked).

---

*End of pack. Prepared under the ethics boundary: public published sources only; no sacred or restricted ceremonial knowledge was sought, reproduced, or incorporated; traditions named specifically; blocked items are marked UNRETRIEVED and excluded from claims.*
