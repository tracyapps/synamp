# W5 — Chapter 5 appendix: Sources, parameters, glossary

Compiled by W5 (appendix writer) from A1 §6, A2 §6, A3 §3.7 + §6, B2 §3/§5, B4/B4b, B5 §3, C1, H1, H2, delivery-plan.
Date: 2026-10-06/07 (CDT). **No new retrieval was performed for this appendix; no sources were added.** All source IDs
([MP-n] / [CC-n] / [ML-n]) are kept exactly as their packs assigned them, because other report chapters cite them.

---

## Return format (required)

**Conclusion.** One merged sources appendix now covers all three research packs under their original IDs — [MP-1]–[MP-34]
(music psychology), [CC-1]–[CC-52] incl. [CC-35b] (cross-cultural & metric reliability), [ML-1]–[ML-23] (learning /
recommender ML) — each with retrieval mode, confidence tier as given, and the claim cluster it supports; a scripted
cross-check found **no exact duplicates** across the three families (each ID = one source; [CC-35b] is a companion press
summary kept inside the [CC-35] row). A separate, clearly-labelled subsection collects the union of **all unretrieved /
blocked items** from the three packs ("do not cite as evidence"). The parameter table (P1–P25) is annotated with the
B2 implementation constants ("implemented as") and the C1 review result per row; only P17 has a spec-vs-implementation
wording drift (code follows the P17 table/dispatch; A3 prose is the outlier), and the review states for P15/P21/P25 are
recorded, not smoothed. The glossary defines the 16 requested system terms in plain language. Reproduction commands
consolidate the full verification stack (brain suite, type-checks, brain-lab, route-smoke pointer, adversarial probes)
with expected outputs and carried reds.

**Evidence.** Read for this appendix: A1 §5–§6 (MP appendix + coverage check); A2 §6 (CC table, internal refs,
UNRETRIEVED list, confidence summary); A3 §3.7 (P1–P25), §3.8–3.9, §6 (ML appendix + honest gaps); B2 §2–§7
(implemented constants, deviations, gaps); B4 and B4b (harness commands, canonical lab capture, determinism);
B5 §2–§7 (route/response shapes, smoke transcripts, POLICY_VERSION audit); C1 §1–§10 (probe matrix, number-table
re-verification, failed-reproduction list, reproduction block); H1 (§1–§6: wave fix, final suite counts, lab caveat);
H2 (verification capture: test/type/build; route smokes); delivery-plan.md (W5 scope + acceptance map).
Cross-check performed here: URL / DOI / arXiv-ID extraction across the three packs — **no exact duplicates**;
author-overlap spot checks (Janata, Witek, Stupacher, Mehr, Hannon/Trehub, Jacoby, Juslin, Karageorghis) — all distinct works.

**Analysis.** The merge keeps three sub-tables (MP / CC / ML) rather than one flat table so the original ID ranges stay
scannable; tiers are reproduced *as the packs assigned them* (A1 tiers at claim-cluster level; A2/A3 per-entry). Conflicts
are listed, not smoothed — the A1 "Conflict" cluster items (background-music global effect, sad music, exposure inverted-U,
iso-principle, stress response, Mozart effect, groove) and A2's "same publisher family" cautions ([CC-10]/[CC-11],
[CC-29]/[CC-30]) are marked on the rows. For the parameter table, "implemented as" uses B2 §3 identifiers verbatim;
"gate/review note" uses C1's probe outcomes (C1 §3 "Numbers", §4 failed-reproduction list, §7 judgement calls). The
reproduction block was to be sourced from an H4 receipt; **no H4 receipt existed in the cluster at write time**
(2026-10-07 ~00:0x CDT — H-round files present: H1, H2, H3; the receipt was recovered afterwards, `H4-lab-sync.md`),
so it consolidates the exact commands from B4b §"Exact commands", B5 §3.2, C1 §10, H1 §4, H2 "Verification" and the
H4 re-sync. Counts are marked as the *latest captures*; the S5 delivery-manifest re-capture is the definitive set to
quote.

**Gaps and risks.** (1) S5's delivery-manifest re-capture is still to come — the suite count (218/216/1/1, H1) reproduced
fresh in the C4 production audit; earlier H2/C1 captures (212/210, 210/208 as tests landed) are superseded. (2) brain-lab
re-synced green in H4 (post-hotfix): canonical **8 scenarios · 86 checks · 0 fail · 0 pending · 5 skip** in
`evidence/final-lab/`, reproduced fresh in the C4 production audit; the pre-sync green and the mid-round transient
(H1 §5.5) are superseded. (3) MP tiers are cluster-level, not per-source (A1 convention) — marked
"—" where no tier is stated. (4) The unretrieved list is inherited, not resolved — paywalls/blocks still stand. (5) C1's
probe strings (p3) predate the F8 note rewording; re-runs may show cosmetic string fails (H1 §5.4). (6) Route smokes bind
scratch ports/dirs and must never touch real data (B5 §6 incident is the cautionary tale). (7) Counts in B4's canonical
capture (64 checks) and B6/roadmap ("Brain 205") are superseded; do not quote them.

**Suggested final-report placement.** This file **is** report Ch.5 (appendix). §5.1 → the report's Sources section
(citation base for Chs.1–3; UNRETRIEVED subsection printed verbatim as the honesty boundary). §5.2 → cross-referenced
from Ch.2 (the "fast learning brain" implementation table; B2 §8 explicitly recommends the annotated parameter table
for Ch.2). §5.3 → end-matter glossary. §5.4 → cross-referenced from Ch.4 (verification & handoff).

---

# Chapter 5 — Appendix

*Sources were retrieved by the A-round researchers on 2026-10-06; this appendix
only re-organises their records — it adds nothing and fetches nothing.*

**Contents**
- §5.1 Sources appendix (merged MP / CC / ML, original IDs preserved) — incl. §5.1.5 UNRETRIEVED / blocked
- §5.2 Parameter table P1–P25 — annotated with implementation + review outcomes
- §5.3 Glossary (16 terms, plain language)
- §5.4 Reproduction commands (full verification stack)

---

## 5.1 Sources appendix — merged [MP-n] / [CC-n] / [ML-n] (original IDs preserved)

Reading notes (apply to all three tables):

- **IDs**: [MP-1]–[MP-34] = music psychology (A1 §6); [CC-1]–[CC-52] = cross-cultural & metric reliability (A2 §6);
  [ML-1]–[ML-23] = learning science / recommender ML (A3 §6). Do not renumber — other chapters cite these IDs.
- **Retrieval mode** is reproduced as the packs stated it: full text / abstract / via API (Semantic Scholar, OpenAlex,
  Europe PMC, PubMed E-utilities) / snippet / tertiary (Wikipedia, Britannica, official docs). A1 gave locators
  (PMC/PubMed IDs, "full", "abstract") rather than URLs where noted; **no URLs were invented** for this merge.
- **Tiers** are as assigned by each pack: High = ≥2 independent retrieved sources agreeing; Medium = one authoritative
  retrieved source; Low = weak/tertiary single source; Conflict = sources disagree. A1 tiers at claim-cluster level,
  so MP rows show the cluster label for the claim the source supports ("—" = no individual tier stated by A1).
- **Dedup check (this merge)**: no exact duplicates across the three families (URL/DOI/arXiv cross-check);
  each ID maps to one entry. [CC-35b] is a companion press summary inside the [CC-35] row.
- **Conflicts are kept, not smoothed** — rows involved in a listed conflict carry a "Conflict #n" note (A1 §6 conflict
  list) or the A2 caution verbatim (e.g., "same publisher family — treat as one").

### 5.1.1 [MP-n] — Music psychology (A1 §6; retrievals 2026-10-06)

| ID | Source (authors, year — title — venue) | Retrieved as | Tier | Claim cluster it supports |
|---|---|---|---|---|
| MP-1 | Karageorghis & Priest (2012) — Music in the exercise domain: a review and synthesis (Part II) — Int. Review of Sport and Exercise Psychology 5(1), 67–84 | PMC3339577 (full) | High (exercise cluster) | Pre-task arousal/imagery; async band 125–140 bpm (40–90 % max HRR); stimulative >120 bpm percussive; sedative <80 bpm, 60–70 guidance; synchronous benefits. (Part I UNRETRIEVED.) |
| MP-2 | Terry, Karageorghis, Curran, Martin & Parsons-Smith (2020) — Effects of music in exercise and sport: a meta-analytic review — Psychological Bulletin 146(2), 91–117 | BURA green-OA PDF (full) | High (exercise) | Affect g=0.48; performance g=0.31; RPE g=0.22; VO₂ g=0.15; HR ns; tempo moderation. |
| MP-3 | Delleli, Ouergui, Ballmann, Messaoudi, Trabelsi, Ardigò & Chtourou (2023) — Pre-task music effects… systematic review with multilevel meta-analysis — Frontiers in Psychology 14:1293783 | PMC10701429 (full) | High (exercise) | Pre-task gains (time, power, fatigue, feeling); self-selected > pre-selected; wide prediction intervals. |
| MP-4 | Juslin & Västfjäll (2008) — Emotional responses to music: the need to consider underlying mechanisms — Behavioral and Brain Sciences 31, 559–575 | PubMed 18826699 (abstract) | Covered (abstract; no tier given) | Six-mechanism framework; emotions via non-music-specific mechanisms. |
| MP-5 | Juslin (2013) — From everyday emotions to aesthetic emotions — Physics of Life Reviews 10(3), 235–266 | PubMed 23769678 (abstract) | Covered (abstract) | BRECVEMA mechanisms; musical event = music × listener × context. |
| MP-6 | communicationtheory.org — Mood Management Theory (Zillmann) | secondary page | Low (tertiary secondary) | Media chosen to optimise mood; **Zillmann 1988 primary UNRETRIEVED**. |
| MP-7 | Heiderscheit & Madson (2015) — Use of the iso principle as a central method in mood management — Music Therapy Perspectives 33(1), 45–52 | **UNRETRIEVED** (metadata verified via search + Semantic Scholar) | — | Covered by [MP-8][MP-9]. |
| MP-8 | Starcke et al. (2021) — Emotion modulation through music after sadness induction — Int J Environ Res Public Health 18(23), 12486 | PMC8656869 (full) | Medium | Sad→happy sequence: highest positive / lowest negative affect; not all contrasts significant. |
| MP-9 | Cheung et al. (2025) — Individualized iso-principle playlist for de-escalating agitation (RCT feasibility) — Int J Geriatr Psychiatry 40(4), e70070 | PMC11949771 (full) | Conflict #4 | Feasible; **not more effective than control**; efficacy unconfirmed. |
| MP-10 | Witek, Clarke, Wallentin, Kringelbach & Vuust (2014) — Syncopation, body-movement and pleasure in groove music — PLOS ONE 9(4), e94446 | full | Medium; Conflict #7 | Inverted-U; medium syncopation max wanting/pleasure; dancers stronger; entropy poor. |
| MP-11 | Janata, Tomic & Haberman (2012) — Sensorimotor coupling in music and the psychology of the groove — J Exp Psychol Gen 141(1), 54–75 | **UNRETRIEVED** (closed; metadata via Semantic Scholar) | — | Groove foundational text. |
| MP-12 | Stupacher, Hove & Janata (2016) — Audio features underlying perceived groove and sensorimotor synchronization — Music Perception 33(5), 571–589 | **UNRETRIEVED** (closed; record via search) | — | Groove features. |
| MP-13 | Hine, Wakana & Nakauchi (2025) — How we remember music tempo: spontaneous motor tempo in recall and preference — Frontiers in Psychology 16:1631625 | PMC12549237 (full) | Medium | SMT predicts adjusted preferred tempo. |
| MP-14 | Stupacher, Witek, Vuoskoski & Vuust (2020) — Cultural familiarity and individual musical taste… social bonding when moving to music — Scientific Reports 10 (doi 10.1038/s41598-020-66529-1) | PMC7308378 (full) | Medium | Synchrony × enjoyment drives closeness; familiarity vs enjoyment dissociate. |
| MP-15 | Sloboda (1991) — Music structure and emotional response: some empirical findings — Psychology of Music 19(2), 110–120 | **UNRETRIEVED** (paywall; mirrors blocked) | — | Frisson/chills classic. |
| MP-16 | Blood & Zatorre (2001) — Intensely pleasurable responses to music correlate with activity in brain regions implicated in reward and emotion — PNAS 98(20), 11818–11823 | PMC58814 (full) | High (frisson) | Chills + autonomic changes; ventral striatum, midbrain, amygdala, OFC, VMPFC. |
| MP-17 | Sachs, Damasio & Habibi (2015) — The pleasures of sad music: a systematic review — Frontiers in Human Neuroscience 9:404 | full | Conflict #2 | Sadness pleasurable when non-threatening/aesthetic/benefit-producing. |
| MP-18 | Taruffi & Koelsch (2014) — The paradox of music-evoked sadness: an online survey — PLOS ONE 9(10), e110490 | full | Conflict #2 | 4 rewards; mood-congruent; nostalgia most frequent. |
| MP-19 | Garrido & Schubert (2015) — Moody melodies: do they cheer us up? — Psychology of Music 43(2), 244–261 | SAGE abstract page | Conflict #2 | Increased depression after self-selected sad music. |
| MP-20 | Perham & Currie (2014) — Does listening to preferred music improve reading comprehension performance? — Applied Cognitive Psychology 28(2), 279–284 | full PDF (mirror) | High (lyrics); Conflict #1 | Liked = disliked lyrical music, both worse than non-lyrical/quiet; ISE needs changing-state + seriation. |
| MP-21 | Souza & Barbosa (2023) — Should we turn off the music? Music with lyrics interferes with cognitive tasks — Journal of Cognition 6(1), 24 | PMC10162369 (full) | High (lyrics) | Lyrics d≈−0.3 verbal/visual memory + reading; arithmetic ns; instrumental neutral. |
| MP-22 | Kämpfe, Sedlmeier & Renkewitz (2011) — The impact of background music on adult listeners: a meta-analysis — Psychology of Music 39(4), 424–448 | ERIC EJ944201 (abstract) | High (lyrics) / Weak (chores); Conflict #1 | Global null; reading disturbed; small memory detriments; positive emotional reactions; tempo paces activity. |
| MP-23 | Husain, Thompson & Schellenberg (2002) — Effects of musical tempo and mode on arousal, mood, and spatial abilities — Music Perception 20(2), 151–171 | **UNRETRIEVED** (SAGE blocked) | — | Tempo→arousal, mode→mood (publisher record; framework in [MP-32]). |
| MP-24 | Pietschnig, Voracek & Formann (2010) — Mozart effect–Shmozart effect: a meta-analysis — Intelligence 38(3), 314–323 | **UNRETRIEVED** (ScienceDirect captcha) | — | Covered by [MP-25]. |
| MP-25 | Oberleiter & Pietschnig (2023) — Unfounded authority, underpowered studies… Mozart effect myth — Scientific Reports 13:3175 | full | Conflict #6 | No Mozart-specific benefit; publication bias; underpowered studies. |
| MP-26 | Cordi, Ackermann & Rasch (2019) — Effects of relaxing music on healthy sleep — Scientific Reports 9:9079 | full | Medium | Subjective sleep 3.69 vs 3.28 (p=.048); N1 reduced; small sample; suggestibility interaction. |
| MP-27 | Thoma, La Marca, Brönnimann, Finkel, Ehlert & Nater (2013) — The effect of music on the human stress response — PLOS ONE 8(8), e70156 | full | Conflict #5 | Faster sAA recovery; cortisol response highest in music (against hypothesis); HR/subjective ns. |
| MP-28 | Sedikides, Leunissen & Wildschut (2022) — The psychological benefits of music-evoked nostalgia — Psychology of Music 50(6), 2044–2062 | author PDF (full) | High (MEAM existence) / Medium (nostalgia) | Connectedness, self-esteem, optimism, meaning; buffers sadness; familiarity necessity open. |
| MP-29 | Janata (2009) — The neural architecture of music-evoked autobiographical memories — Cerebral Cortex 19(11), 2579–2594 | PMC2758676 (full) | High + **correction** | MPFC network for MEAMs; subjects selected for ≥30 % MEAM frequency — the "~30 %" headline is a selection threshold, not prevalence. |
| MP-30 | Madison & Schiölde (2017) — Repeated listening increases the liking for music regardless of its complexity — Frontiers in Neuroscience 11:147 | PMC5374342 (full) | Conflict #3 | Monotonic liking increase with repetition (no inverted-U); familiarity strongest predictor. |
| MP-31 | Li, Chen & Zhang (2019) — Effect of music tempo on long-distance driving — i-Perception 10(4) | full | Medium | Medium tempo best for fatigue/attention; slow worst; single-piece caveat. |
| MP-32 | Gigliotti et al. (2025) — The sonic energy of background music impacts cognitive performances — Cognitive Research: Principles and Implications (doi 10.1186/s41235-025-00676-9) | PMC12627320 (full) | — (framework) | Both low/high-arousing raise activation; high-arousing raises felt effort; verbal fluency unaffected. |
| MP-33 | Mas-Herrero, Zatorre, Rodriguez-Fornells & Marco-Pallarés (2014) — Dissociation between musical and monetary reward responses in specific musical anhedonia — Current Biology 24(6), 699–704 | abstract via Europe PMC | Medium–High | Subgroup with reduced musical pleasure, normal monetary reward (~3–5 % per secondary sources). |
| MP-34 | Juslin, Liljeström, Västfjäll, Barradas & Silva (2008) — An experience sampling study of emotional reactions to music — Emotion 8(5), 668–683 | abstract via Europe PMC | — | Music in 37 % of episodes; 64 % of music episodes affected feelings. |

### 5.1.2 [CC-n] — Cross-cultural & metric reliability (A2 §6; retrievals 2026-10-06)

| ID | Source (author/venue as given) | Retrieved as | URL (as given) | Tier | Claim cluster / caveat |
|---|---|---|---|---|---|
| CC-1 | Agawu — Structural Analysis or Cultural Analysis? … "Standard Pattern" of West African Rhythm — JAMS 59(1), 2006 | Abstract via OpenAlex API | https://doi.org/10.1525/jams.2006.59.1.1 | Medium (abstract) | Standard-pattern debate; full text UNRETRIEVED (PDF empty). |
| CC-2 | "Ewe music" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Ewe_music | Low (tertiary) | Pointer (Agawu 2003, Novotney 1998, Jones). |
| CC-3 | "Pygmy music" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Pygmy_music | Low (tertiary) | Aka/Baka/Mbuti distinction. |
| CC-4 | UNESCO ICH — Polyphonic singing of the Aka Pygmies (no. 00082) | Full text | https://ich.unesco.org/en/RL/polyphonic-singing-of-the-aka-pygmies-of-central-africa-00082 | Medium (official) | Inscribed 2008; oral transmission; improvisation. |
| CC-5 | Fürniss — Aka Polyphony, 2006 (chapter) | Abstract via OpenAlex | https://doi.org/10.1093/acprof:oso/9780195177893.003.0006 | Medium (abstract) | Full text UNRETRIEVED (HAL/Anubis blocked). |
| CC-6 | "Tala (music)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Tala_(music) | Low–Medium | Additive cycles, avartan, sam, vibhag; consistent with [CC-38]. |
| CC-7 | Saraga README (MTG) | Fetched (content not quoted) | https://raw.githubusercontent.com/MTG/saraga/master/README.md | — | **Not cited for claims** (not read in time); locatable resource. |
| CC-8 | "Kotekan" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Kotekan | Low | Vitale quote: interlocking illusion. |
| CC-9 | "Colotomy" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Colotomy | Low | Nested gong cycles. |
| CC-10 | "Slendro" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Slendro | Low | Ensemble variability; Balinese paired tuning/beating. |
| CC-11 | "Pelog" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Pelog | Low | 9-TET approximation; Surjodiningrat 1972 cited (original UNRETRIEVED). |
| CC-12 | "Gamelan" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Gamelan | Low | Ensemble context overview. |
| CC-13 | "Manikay" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Manikay | Low | Yolŋu clan songs; songlines. |
| CC-14 | "Didgeridoo" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Didgeridoo | Low | Drone; circular breathing; bilma beat. |
| CC-15 | "Clapstick" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Clapstick | Low | bilma/bimli naming; rhythm maintenance. |
| CC-16 | Madsen — Singing into Being — UAF Circumpolar Music Series | Full text | https://www.uaf.edu/music/cms/singing-into-being.php | Medium | Mari Boine quote; suppression history. |
| CC-17 | Hämäläinen et al. — Sami yoik, Sami history, Sami health: narrative review — Int J Circumpolar Health | Full text (PMC5912196) | https://pmc.ncbi.nlm.nih.gov/articles/PMC5912196/ | Medium (peer-reviewed) | Identity/resilience; "under-researched" caveat. |
| CC-18 | Te Ara (Flintoff) — Māori musical instruments – taonga puoro | Full text | https://teara.govt.nz/en/maori-musical-instruments-taonga-puoro | Medium | Rangi/Papa families; revival. |
| CC-19 | Stanfield — Powwow Music and its Polymetric Construction — MUSICultures 37, 2010 | Full PDF | https://journals.lib.unb.ca/index.php/MC/article/view/20228 | Medium–High (single but primary) | Drum primacy; notation history; AABCBC context. |
| CC-20 | Hoefnagels — Northern Style Powwow Music… — MUSICultures, 2004 | Abstract | https://journals.lib.unb.ca/index.php/MC/article/view/21605 | Low | Classification-for-teaching. |
| CC-21 | "Clave (rhythm)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Clave_(rhythm) | Low | Son clave; tresillo definition. |
| CC-22 | "Tresillo (rhythm)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Tresillo_(rhythm) | Low | 3+3+2; cross-rhythm vs additive (cites Agawu 2003, Peñalosa). |
| CC-23 | "Aksak (meter)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Aksak | Low–Medium | Cell table; Brăiloiu 1951; usul names. |
| CC-24 | Britannica — aksak | Full text | https://www.britannica.com/art/aksak | Medium | 2+3 / 2+2+2+3; "Bulgarian rhythm" (Bartók). |
| CC-25 | "Huayno" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Huayno | Low | First-beat stress + two short beats. |
| CC-26 | "Siku (instrument)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Siku_(instrument) | Low | ira/arka interlocking; stereophonic sound. |
| CC-27 | "Ma (negative space)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Ma_(negative_space) | Low | Interval/silence semantics. |
| CC-28 | Britannica — jo-ha-kyū / Japanese music structural ideals | Topic stub | https://www.britannica.com/art/jo-ha-kyu | Low–Medium | Tripartite pacing; Noh placements. |
| CC-29 | Hannon & Trehub — Tuning in to musical rhythms: infants learn more readily than adults — PNAS 2005 | Full text (PMC1194930) | https://pmc.ncbi.nlm.nih.gov/articles/PMC1194930/ | Medium (peer-reviewed) | Sensitive period; 12-mo vs adults. Same lab lineage as [CC-30] — caution. |
| CC-30 | Hannon & Trehub — Metrical Categories in Infancy and Adulthood | Full PDF (CogSci 2003) + Psych Science 2005 abstract via OpenAlex | https://escholarship.org/content/qt6170j46c/qt6170j46c.pdf + https://doi.org/10.1111/j.0956-7976.2005.00779.x | Medium | 7/8 stimulus detail; Bulgarian/Macedonian adults; infant responsiveness. |
| CC-31 | Jacoby & McDermott — Integer Ratio Priors on Musical Rhythm — Current Biology 2017 | Abstract via PubMed E-utilities (PMID 28065607) | https://pubmed.ncbi.nlm.nih.gov/28065607 | Medium (abstract) | Integer-ratio priors; experience-modulated. Full text UNRETRIEVED (publisher blocked). |
| CC-32 | Jacoby et al. — Cross-Cultural Work in Music Cognition — Music Perception 37(3), 2020 | Full PDF | https://www.norijacoby.com/Jacoby_etal_20202_cross%20cultural%20work%20in%20music%20cognition.pdf | Medium (position paper) | WEIRD sampling; ethics/methods/definition recommendations. |
| CC-33 | Mehr et al. — Universality and diversity in human song — Science 2019 | Full text (PMC7001657) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7001657/ | Medium (peer-reviewed) | 309/315 societies; within>across variation; context predictions. |
| CC-34 | Savage et al. — Statistical universals… — PNAS 2015 | Full text (PMC4517223) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4517223/ | Medium (peer-reviewed) | 304 recordings; no absolute universals; group coordination. |
| CC-35 | Polak et al. — Rhythmic Prototypes Across Cultures — Music Perception 2018 (**incl. companion [CC-35b] MPI press summary**) | Abstract via OpenAlex + press release | https://doi.org/10.1525/mp.2018.36.1.1 ; https://www.aesthetics.mpg.de/en/newsroom/news/news-article/article/rhythm-diversity-different-cultures-prefer-different-beat-patterns-1.html | Medium (abstract + release) | Full text UNRETRIEVED (KTH/Anubis blocked). |
| CC-36 | Spiech et al. — "4/4 and more…" rhythmic complexity predicts groove in common meters — Communications Psychology (Nature) 2025 | Full PDF | https://www.nature.com/articles/s44271-025-00360-0.pdf | Medium (peer-reviewed) | Groove inverted-U only in 4/4; simpler rhythms groove in non-4/4 (single study). |
| CC-37 | Schreiber & Müller — Music Tempo Estimation: Are We Done Yet? — TISMIR 2020 | Full text | https://transactions.ismir.net/articles/10.5334/tismir.43 | Medium (peer-reviewed) | OE metrics; ACC2 tolerance critique; varying tempi. |
| CC-38 | Srinivasamurthy et al. — In Search of Automatic Rhythm Analysis Methods for Turkish and Indian Art Music | Abstract via OpenAlex | https://doi.org/10.1080/09298215.2013.879902 | Medium (abstract) | "Not adequate" for beat/meter/downbeat on these corpora. |
| CC-39 | Miguel et al. — From beat tracking to beat expectation… — PLoS ONE 2020 | Full text (PMC7673539) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7673539/ | Medium (peer-reviewed) | Pulse-clarity operationalization. |
| CC-40 | TISMIR — A Quantitative Model of Tension and Resolution in Turkish Makam Music | Full text | https://transactions.ismir.net/articles/10.5334/tismir.353 | Medium (peer-reviewed) | Pitch variability; theory–practice gap. |
| CC-41 | Serra et al. — AI and Music at a Crossroads… — TISMIR | Full text | https://transactions.ismir.net/articles/10.5334/tismir.372 | Medium | Six priorities; provenance/transparency criteria. |
| CC-42 | Papaioannou, Benetos & Potamianos — Cross-Cultural Music Similarity… — TISMIR | Full text | https://transactions.ismir.net/articles/10.5334/tismir.341 | Medium (peer-reviewed) | 9 traditions; 1,130 pairs; model–human divergence. |
| CC-43 | "Loudness" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Loudness | Low (tertiary; standard content) | SPL vs loudness; sone/phon. |
| CC-44 | "Equal-loudness contour" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Equal-loudness_contour | Low | Frequency dependence; Fletcher–Munson. |
| CC-45 | "LKFS" (LUFS) — Wikipedia | Full text | https://en.wikipedia.org/wiki/LKFS | Low | K-weighted normalization standard. |
| CC-46 | Senn et al. — Expert Performance Microtiming on Listeners' Experience of Groove — Frontiers in Psychology 2016 | Full PDF | https://www.frontiersin.org/articles/10.3389/fpsyg.2016.01487/pdf | Medium (peer-reviewed) | Microtiming→groove evidence negative/nuanced. |
| CC-47 | Carroll et al. — The CARE Principles for Indigenous Data Governance — Data Science Journal 2020 | Full text | https://datascience.codata.org/articles/10.5334/dsj-2020-043/ | High (peer-reviewed) | CARE quad; consultation→relationships shift. |
| CC-48 | Lewis et al. (eds.) — Indigenous Protocol and Artificial Intelligence Position Paper, 2020 | Landing + preview text | https://www.indigenous-ai.net/position-paper/ | Medium (partial) | Heterogeneous texts; relation-based design. |
| CC-49 | UN — Declaration on the Rights of Indigenous Peoples (A/RES/61/295) | Full PDF | https://www.un.org/development/desa/indigenouspeoples/wp-content/uploads/sites/19/2018/11/UNDRIP_E_web.pdf | High (primary instrument) | Arts 8, 11, 12, 13, 31 quoted; linked with [CC-47]. |
| CC-50 | "Laya (music)" — Wikipedia | Full text (thin) | https://en.wikipedia.org/wiki/Laya_(music) | Low | Not used for strong claims. |
| CC-51 | "Pulse (music)" — Wikipedia | Full text | https://en.wikipedia.org/wiki/Pulse_(music) | Low | Background only. |
| CC-52 | "Tempo rubato" — Wikipedia | **Search/snippet only — EXCLUDE** | — | — | Listed for honesty: not fetched; no claims based on it. |

### 5.1.3 [ML-n] — Learning science / recommender ML (A3 §6; retrievals 2026-10-06)

| ID | Source (authors, year — title — venue) | Retrieved as | Tier | Claim cluster it supports |
|---|---|---|---|---|
| ML-1 | Manning, Raghavan & Schütze — Introduction to Information Retrieval, ch. 9 (Relevance feedback and query expansion) — full text: https://nlp.stanford.edu/IR-book/pdf/09expand.pdf | full text | Medium | Rocchio eq. 9.3; γ<β convention; "tracks an evolving information need". |
| ML-2 | Hidasi, Karatzoglou, Baltrunas & Tikk (ICLR 2016) — Session-based Recommendations with RNNs — arXiv:1511.06939 | abstract + official repos via search | Medium | GRU4Rec session lineage. |
| ML-3 | Brost, Mehrotra & Jehan (WWW 2019) — The Music Streaming Sessions Dataset — arXiv:1901.09851 | abstract page | Medium | 160 M sessions; uniform-random subset for counterfactual evaluation. |
| ML-4 | Garivier & Moulines (2008) — On UCB Policies for Non-Stationary Bandit Problems — arXiv:0805.3415 | abstract | Medium | Rewards constant over epochs, change at unknown instants; discounted/sliding-window UCB. |
| ML-5 | Li, Chu, Langford & Schapire (WWW 2010) — Contextual-Bandit Approach to Personalized News Article Recommendation — arXiv:1003.0146 | search snippet | Medium | LinUCB. |
| ML-6 | Russo et al. (2017) — A Tutorial on Thompson Sampling — arXiv:1707.02038 | search snippet | Medium | Thompson sampling. |
| ML-7 | Jannach, Lerche & Zanker (2018) — Recommending based on Implicit Feedback — Social Information Access chapter | full text: https://web-ainf.aau.at/pub/jannach/files/BookChapter_Social_Information_Access_2018.pdf | Medium; with [ML-23] ⇒ **High for "skip ≠ dislike"** | Verbatim: skips "can be context dependent and interpreting it as a general negative assessment of the previous track might be misleading". |
| ML-8 | Hu, Koren & Volinsky (ICDM 2008) — Collaborative Filtering for Implicit Feedback Datasets | text (chrisvolinsky.com PDF) | Medium | (sign, magnitude, confidence); "vastly varying confidence levels". |
| ML-9 | Chang, Zhang, Tang, Yin, Chang, Hasegawa-Johnson & Huang (WWW 2017) — Streaming Recommender Systems (sRec) | retrieved snippets (experts.illinois.edu; archives.iw3c2.org) | Medium/Low | Time-decay / half-time framing. |
| ML-10 | Carbonell & Goldstein (SIGIR 1998) — The Use of MMR, Diversity-Based Reranking — full text: cs.cmu.edu PDF | full text | Medium | λ=1 relevance / λ=0 diversity. |
| ML-11 | Song, Kim, Lee et al. — Learning from Noisy Labels with Deep Neural Networks: A Survey — arXiv:2007.08199 | snippet | Medium | Noisy-label learning. |
| ML-12 | Loni et al. (2021) — A Survey on Cold Start Problem in Recommender Systems — J. Big Data | snippet via references | Medium/Low | Cold start. |
| ML-13 | Ie et al. (2019) — RecSim — arXiv:1909.04847 | snippet | Medium | Simulation environments for sequential recommendation. |
| ML-14 | Radlinski & Craswell (WSDM 2013) — Optimized Interleaving for Online Retrieval Evaluation | snippets (Microsoft/dblp/ACM) | Medium/Low | Interleaving for online evaluation. |
| ML-15 | Gama, Žliobaitė, Bifet, Pechenizkiy & Bouchachia (2014) — A Survey on Concept Drift Adaptation — ACM CSUR | snippets + TU/e PDF | Medium/Low | Concept drift. |
| ML-16 | Gilotte, Calauzènes, Nedelec, Abraham & Dollé (2018) — Offline A/B Testing for Recommender Systems — arXiv:1801.07030 | abstract | Medium | Counterfactual estimators; bias–variance limits. |
| ML-17 | Bottou, Peters, Quiñonero-Candela et al. (JMLR 2013) — Counterfactual Reasoning and Learning Systems — arXiv:1209.2355 | abstract | Medium | Counterfactual caution. |
| ML-18 | Nguyen, Hui, Harper, Terveen & Konstan (WWW 2014) — Exploring the Filter Bubble — full text: archives.iw3c2.org PDF | full text | Medium | Individual-level narrowing measured. |
| ML-19 | Chen et al. (RecSys 2021) — Values of Exploration in Recommender Systems — ACM fullHtml, DOI 10.1145/3460231.3474236 | full text | Medium | Verbatim: lack of exploration → satiation, "reduced enjoyment of the content". |
| ML-20 | Montecchio, Roy & Pachet (2019) — The Skipping Behavior of Users of Music Streaming Services — arXiv:1903.06008 | abstract | Medium | Skip timing ↔ musical structure; stable under stationarity. |
| ML-21 | The universality of skipping behaviours on music streaming platforms — arXiv:2005.06987 | snippet only | Low | Skip profile as song-intrinsic. |
| ML-22 | Google Analytics Help — About Analytics sessions | snippet | Medium (official doc; convention only) | 30-minute inactivity sessionization default. |
| ML-23 | Li, Kuo, Sheng, Zhang & Wu (CHI 2025) — Beyond Explicit and Implicit: How Users Provide Feedback — arXiv:2502.09869 | abstract | Medium | Intentional implicit feedback drives diversity/relevance purposes. |

### 5.1.4 Internal (project) references — **not world-evidence**

| ID | Where | Role |
|---|---|---|
| [SynAmp-dossier] | docs/research/synamp-brain-dossier.html | Internal dossier (metric taxonomy; feedback magnitudes; drift/exploration guidance). Used only for internal consistency. |
| [SynAmp-CONTEXT] | .cluster/synamp-fast-brain/CONTEXT.md; plan schema read from apps/brain/src/query/plan.ts, signals.ts | Verified repo facts; registry gates; spot-check behaviours; scoping rules. |
| [INT-1] | .cluster/synamp-fast-brain/CONTEXT.md | Signal registry & gates; spot-check behaviours (right/half/double/tap; 3-based ratios; "no steady beat"); epoch scoping; declared-vs-produced. |
| [INT-2] | docs/research/beat-timing-findings-2026-09-29.md | Two-track smoke results; phase concentration ≈0.034 with trackable pulse; abstention guards; "method rejection ≠ independent musical truth". |
| [INT-3] | docs/synamp/plans/BEAT-TIMING.md | Onset-attribution requirements; "do not repeat" list (incl. not calling rejected tracks arrhythmic). |
| [INT-4] | docs/research/synamp-brain-dossier.html | "BPM is the weakest signal"; octave errors 60/120/240; proxy field; dataset-bias design row; cross-cultural similarity variance (Papaioannou). |
| [R-code] | apps/brain/src/session/{events,session,feedback}.ts; apps/brain/src/query/{evaluate,signals,plan}.ts; docs/synamp/plans/AGENT-ROADMAP.md (P3); dossier ch. 7 | Internal design source (read-only, retrieved 2026-10-06). |

### 5.1.5 UNRETRIEVED / blocked in this pass (do not cite as evidence)

*Union of the A1 / A2 / A3 unretrieved lists, as given by each pack. Nothing below was fetched; none of it may be cited
as evidence in the report. Shown here so the boundary of what the evidence actually covers stays visible.*

**From A1 (compiled from its §5/§6 annotations + return block; reasons as given):**

1. Karageorghis & Priest — review **Part I** — UNRETRIEVED (PMC hit was a different paper; Part II links its content).
2. [MP-7] Heiderscheit & Madson 2015 — UNRETRIEVED (publisher/blocks; record metadata verified via search + Semantic Scholar). Cluster covered by [MP-8][MP-9].
3. [MP-11] Janata, Tomic & Haberman 2012 — UNRETRIEVED (closed; metadata verified via Semantic Scholar API).
4. [MP-12] Stupacher, Hove & Janata 2016 — UNRETRIEVED (closed; record verified via search).
5. [MP-15] Sloboda 1991 — UNRETRIEVED (paywall; mirrors blocked).
6. [MP-23] Husain et al. 2002 — UNRETRIEVED (SAGE blocked).
7. [MP-24] Pietschnig et al. 2010 — UNRETRIEVED (ScienceDirect captcha). Cluster covered by [MP-25].
8. Zillmann 1988 (American Behavioral Scientist) — UNRETRIEVED (noted under [MP-6]; mood-management primary).
9. van Goethem & Sloboda 2011 — UNRETRIEVED (listed in A1 return-block gaps; no further detail given).
10. de la Mora Velasco 2023 — UNRETRIEVED here (dossier only; conflict #1).
11. Kiss & Linnell 2021 (mind-wandering suppression) — UNRETRIEVED (described in [SynAmp-dossier]; candidate).
12. ISE origins: Colle & Welsh 1976; Salamé & Baddeley 1982 — originals not retrieved (cited within [MP-20]).
13. Binaural-beats evidence: Ingendoh et al. 2023 vs Garcia-Argibay — UNRETRIEVED here (conflicting evidence; must not be implemented as science-backed).
14. Driving-simulator companion work — dossier only; UNVERIFIED here (A1 §1.7).
15. Coverage-check note (as given): "Mood management (Zillmann) — Gap (primary UNRETRIEVED; secondary only)".

**From A2 — explicit UNRETRIEVED list (verbatim):**

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

**From A3 — UNRETRIEVED / partially unretrieved (verbatim):**

> Rocchio (1971) original paper; Ide dec-hi original; WSDM-2019 challenge winning-solution details;
> Seshadri et al. RecSys'23 (contrastive skip learning — dossier citation only); "Why People Skip Music?" (2023) full
> text (snippets only); Xie et al. WWW'23 dwell reweighting full text (dossier names arXiv:2209.09000 — not
> independently retrieved); Spotify's "first 30 seconds" rule (dossier already labels unverified — do not use as a
> finding). The dossier's internal magnitudes/claims remain project-internal candidate values, not independently
> validated here.

---

## 5.2 Parameter table P1–P25 — A3 §3.7 spec, annotated with implementation (B2 §3) and review outcomes (C1)

Columns: **(#) parameter · default** → **implemented as** (B2 §3 names/constants, code) → **gate / review note** (C1 probe results; deviations and judgment calls worth knowing when reading Ch.2).

| # | Parameter · default (A3 §3.7) | Implemented as (B2 §3) | Gate / review note (C1 + B2 deviations) |
|---|---|---|---|
| P1 | `G_idle` idle gap = 30 min | `IDLE_GAP_MS = 30 * 60_000` (epochs.ts); mask, not decay | C1: 30:00 exact keeps / 30:01 splits (value 0); missing `session_id` = its own bucket (sandwich → 3 epochs). ✓ |
| P2 | Day boundary = local midnight | `resolveEpochs` day-boundary; injectable IANA timezone (default server local) | C1: midnight split with 60 s gap ✓; pin timezone for cross-restart day determinism (B2 §6.8). |
| P3 | `h_E` epoch half-life = 30 min | `EPOCH_HALF_LIFE_MS`; `0.5^(Δt/30min)` | C1: ratio exactly 0.25 at +60 min ✓ ("+60 min ≤ 0.25× fresh" asserted on derived values). |
| P4 | `G_live` active window = `G_idle` | `LIVE_WINDOW_MS`; `activeEpoch` | C1: expiry live at exactly +30:00, cleared at +30:00.001 with "no active session" note ✓. Deviation (B2 §5.2): epochs ending after `now` are never "active". |
| P5 | `W` bound = 0.15 | evaluate.ts `0.15·tanh(v/2)` (unchanged); one saturation | C1: flood 20 loves/skips → 0.15000 / −0.14925 / 0.15000, all parts finite; hard rules inviolable under maxed bonus. ✓ |
| P6 | tanh scale = 2 | same (`0.15·tanh(v/2)`) | C1: monotonicity + saturation spot-checks ✓; verified as composed through the real pipeline, not raw value. |
| P7 | love = +2.0 / c=1.0 | `EPOCH_EVIDENCE` + `PERSISTENT_EVIDENCE` (v1 parity) | C1: single-love bonus = **0.11424** (brief's "0.10–0.11" was approximate); part "you loved this" present. ✓ |
| P8 | thumb_up = +1.0 / c=0.9 | as above | C1: explicit-only parity with `deriveFeedback` (deep-equal adjust/removed) ✓. |
| P9 | thumb_down = −1.0 / c=0.9 | as above | Persists via L1 when reason ≠ `not_now`; `remove`+`reason=not_now` → epoch hide only (C1). ✓ |
| P10 | repeat = +1.0 / c=0.7 | `EPOCH_EVIDENCE` | L2 only; dies after epoch end ✓ (constant-table check). |
| P11 | full_play = +0.5 / c=0.5 | `EPOCH_EVIDENCE` | L2 only (constant-table check; low confidence = unintentional signal). |
| P12 | skip_early = −0.6 / c=0.5 | `EPOCH_EVIDENCE` | C1: k=1 → −0.2999, no hide; k=2 → hide + −0.5897 ✓. "Skip ≠ dislike" (High with [ML-7]+[ML-23]). |
| P13 | skip_late = −0.1 / c=0.2 | `EPOCH_EVIDENCE` | Never hides ✓ (constant-table check). |
| P14 | external_play = +0.25 / c=0.5 | `EPOCH_EVIDENCE` (v1 value kept) | L2 only; proposal at ≥5 epochs / ≥3 dates ✓ (P22 probe). Demotion decision noted in A3 gaps. |
| P15 | skip-hide count = 2 | Epoch-wide hide from `skip_early ×2` (B2 §5.6: v1's playlist-scoped rule removed from L1) | C1: full hide lifecycle ✓ incl. exact +30:00 expiry edge; hide survives re-resolve within epoch. Judgment flagged to C-round: epoch-wide vs playlist-scoped scope. |
| P16 | `not_now` = hide n=1, no L1 | derive reset/not_now semantics | C1: `not_now` hides at n=1; value 0 after the epoch; no persistent cell appears ✓; reset note present. |
| P17 | artist π=0.35 / cap=0.8 / min-ev ≥2 | `ARTIST_MIN_EVENTS=2`, `ARTIST_MIN_SUM=1.0`; cap ±0.8; `π·Σ` | C1 **F2 (wording drift)**: A3 §3.3(b) prose says "≥2 **distinct tracks**"; code + P17 table + dispatch say "≥2 **events**" — **code follows P17; A3 prose is the outlier** (fix the prose or accept; behaviour per table). C1: cap +0.8 exactly; single event ≤0.11; entity-only propagation (loves don't feed the artist term — state this in one line in Ch.2). |
| P18 | centroid gates n_K≥3, cov≥0.6, n_R≥2 | `FEATURE {min_keeps:3, min_rejects:2, coverage:0.6}`; plus axis needs ≥4 usable library values + nonzero 1.4826·MAD (B2 §5.11) | C1: coverage opens at exactly 60%, falls back at 40 % with exact note; n=2 kept ⇒ no axis + reliability note ✓. |
| P19 | β/γ = 0.5/0.15 | `FEATURE {beta:0.5, gamma:0.15}`; γ<β enforced | C1: γ<β enforced; total clipped to exactly 1.0 (sum-of-parts 2.35) ✓. |
| P20 | feature caps: axis ±0.5 / total ±1.0 | per-axis parts ≤0.5 by construction; total clip ±1.0; artist clip ±0.8 | C1: per-axis 0.47 ≤ 0.5; adversarial wide-spread set shrunk via 1/(1+s²) ✓. |
| P21 | neg proposal ≥3 epochs ∧ ≥2 dates | `PROPOSAL_THRESHOLDS` | C1: 2→none; 3/2 dates→exactly 1 with `{epochs:3,dates:2,dayparts:[morning,afternoon]}`; same-date→none ✓. Note: the `not_now_pattern` "≥2 dayparts" gate verified by code read + constants only (C1 §8.2); live epoch excluded from scan. |
| P22 | pos proposal ≥5 epochs ∧ ≥3 dates | `PROPOSAL_THRESHOLDS` (repeat 4/3, external 5/3) | C1: 5/3→proposal; 4→none ✓. |
| P23 | proposal scan window = 30 d | `PROPOSAL_SCAN_DAYS = 30` | C1: 35-day-old pattern → none ✓. |
| P24 | exploration OFF; if ON: 1 slot, seeded | `explorationEnabled` / `pickExplorationSlot` (derive never reads it) | C1: OFF byte-identical to no-budget; ON never alters the derived view; seeded slot deterministic ✓. |
| P25 | `scope_persistence` = `declared` | `PolicyOptions.scopePersistence` default `"declared"` | C1: both modes ✓. `global_only` magnitudes (±1.0 / c=0.9 / epoch half-life; labels "…(this session)") are a B2 §5.5 judgment call — one constant to change if review disagrees. |

**Reading the table (footnotes):**
- C1 re-derived ≥10 rows plus the full constant tables (`EPOCH_EVIDENCE`, `PERSISTENT_EVIDENCE`, `FEATURE`,
  `PROPOSAL_THRESHOLDS`); everything above "reproduced green" except the noted wording drift (F2) and the two judgment
  calls (P15 scope, P25 magnitudes) which are flagged, not smoothed. *(C1 §2 F5 also notes cosmetic label drift for the
  artist part: quote the implemented label "other tracks by <artist> this session", not A3's example wording.)*
- C1's one **major must-fix (F1, `wave` arc on odd measured counts → `undefined`/500) is outside the P-table** (it is in
  sequencing). It was fixed by H1 (interleave bound + guards; n=1/3/5 regression tests; resolve path re-probed OK).
  Post-fix C1 verdict expected: pass-with-notes.
- "L1 explicit cells survive a learning reset" (B2 §5.4) is implemented as documented and judged acceptable by C1 §7;
  if the report wants "forget" to also suppress pre-reset explicit cells, that is a one-spot change — say so explicitly.
- Counts in this table's sources: A3 §3.7 (spec), B2 §3 (implementation), C1 §3–§4 (review probes). All fixtures are
  synthetic; nothing here is evidence about real music.

---

## 5.3 Glossary (16 terms, plain language)

| Term | Plain-language meaning (as implemented here) |
|---|---|
| **plan** | The machine-readable description of what the user asked for: constraints + sequencing + declared relaxation rules; versioned schema (v2.0), validated, and hashed (the plan hash). Something the brain *can* enforce — vague asks produce questions, impossible asks are refused honestly. |
| **constraint (hard / soft)** | One requirement inside a plan (e.g., "bpm ≤ 120"). **Hard** = a guard that is never auto-relaxed (explicit exclusions must be hard). **Soft** = may only be relaxed through the plan's declared ladder (`drop_boost` / `widen_numeric`). |
| **unknown_policy** | What to do when a track's value for a constraint is unknown: `exclude` / `include` / `neutral`. Declared-but-no-producer fields use `neutral` + the inert note "no producer yet — inert on real data". |
| **near-miss** | The second, separately-labelled result tier: tracks that miss strict filtering within registered near-miss widths. Near-misses are shown, never receive learning bonuses, and never carry feedback reasons. |
| **tier** | Which bucket a track lands in after evaluation: **strict** (passes every constraint — the only place learning/scoring applies) vs **near-miss** (close misses, hand-labelled). Not to be confused with source-confidence tiers in §5.1. |
| **arc / sequencing** | The ordering step applied *after* evaluation to the strict tier only (a permutation — nothing added or dropped; unknowns keep their places). Arcs: `flat` / `build` / `peak` / `cooldown` / `wave`; notes appear in `sequencing_applied` (e.g., "arc build: ordered by measured pace/energy proxy…"). |
| **epoch** | The learning window: one listening session, split by session change, a 30-minute idle gap, or local midnight. Implicit learning **never crosses an epoch boundary** — a closed epoch contributes exactly nothing. Missing `session_id` events form their own bucket. |
| **daypart** | Coarse time-of-day label attached to an epoch (morning 05–12 / afternoon 12–17 / evening 17–22 / night 22–05, from the epoch start). A display/evidence convention only — no empirical basis claimed. |
| **hide (persistent vs session)** | A suppressed track. **Persistent remove** = playlist-scoped, lasts until restored (`hidden_by_you`). **Session hide** = epoch-wide, from `skip_early`×2 or `not_now`; clears when the session ends (or via "Forget this session"; `hidden_by_session`). Both leave the strict tier; the two counts are reported separately (no dead Restore buttons). |
| **proposal** | A cross-epoch suggestion — the *only* channel through which learning crosses epochs. Backed by evidence `{epochs, dates, dayparts}` and conservative thresholds; requires user confirmation before anything changes. Accepting appends a normal global thumb event (track subjects) or records the decision (artist subjects); never an automatic playback change. |
| **evidence weight** | How strongly one event counts: magnitude × confidence (e.g., love +2.0 @ c=1.0; repeat +1.0 @ c=0.7), then decayed by the epoch half-life. These are the numbers the learning is built from — all candidate values, tunable, versioned with the policy. |
| **reliability gate** | The filter deciding whether measured data is trustworthy enough to learn from: declared/missing fields are refused; `bpm` uses `tempo_confidence` (full ≥0.5, damped 0.35, unusable ≤0.2/missing); a centroid axis additionally needs ≥4 usable library values and a non-zero robust scale. Gated data produces honest notes, never zero-substitution. |
| **centroid** | The evidence "centre of mass" per feature axis (e.g., bpm) of the tracks you kept / skipped this session; candidates near the kept centroid get a small, bounded pull ("tempo ~126 BPM — you kept three such tracks"). Gated by minimum counts and coverage; per-axis pull capped. |
| **saturation bound** | The total feedback adjustment is squeezed through `0.15·tanh(v/2)` — **never more than ±0.15**, applied once, inside the strict tier only. It is a tiebreaker, never an override: hard constraints and explicit exclusions stay inviolable no matter how much evidence accumulates. |
| **policy version** | The label stamped on events and readouts for *which meaning of the numbers* produced them (`heuristic-v1` or `epoch-v1`). Any meaning change = new version + re-derive from the same immutable event log — never a migration. Rollback = switch `listening_policy` back (`legacy-v1`). |
| **spot-check correction** | The human-in-the-loop tempo fix: you verify right / half / double / tap, or "no steady beat" (3-based metre ratios recognised). Corrections are applied only while the measured BPM matches the checked one; this is the seed of a human-verified reliability tier. |

---

## 5.4 Reproduction commands — full verification stack

*Consolidated from B4b §"Exact commands", B5 §3.2, C1 §10, H1 §4, H2 "Verification" and the H4 re-sync (receipt
`H4-lab-sync.md`; canonical lab capture `evidence/final-lab/`). S5's delivery-manifest re-capture remains the definitive
set. Captures were taken on `feat/fast-learning-brain` @ base `b6ea5ce1` + the working tree; no commits at capture time,
no installs.*

```sh
CLUSTER=/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain
cd /Users/tapps/_dev/web-apps/SynAmp

# 1) Brain test suite — expect the ONE carried red (macOS librarian case-fold) + /dev/shm skip
pnpm --filter @synamp/brain test
#   capture (H1, 00:02 CDT): 218 tests · 216 pass · 1 fail · 1 skip · exit 1 by design — reproduced fresh post-hotfix
#   (earlier captures: H2 212/210, C1 210/208 — tests landed progressively; the S5 re-run is definitive)

# 2) Type-checks — both exit 0. Root `pnpm type-check` stops in vendored webamp (pre-broken, untouched): expect exit 1 there
pnpm --filter @synamp/brain type-check
pnpm --filter @synamp/web type-check
pnpm --filter @synamp/web build          # exit 0 ("✓ built in ~1s")

# 3) Verification harness (deterministic; re-run before quoting any numbers)
node --experimental-strip-types tools/brain-lab/lab.mts
#   expected: 8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 skip · exit 0
#   (last canonical green = H4 re-sync, post-hotfix — `evidence/final-lab/`; a mid-round transient came from concurrent evaluate.ts edits — S5 re-confirms)

# 4) Route smoke — self-contained scripts; scratch ports/dirs only; NEVER real data
bash $CLUSTER/evidence/b5/route-smoke-epoch.sh     # epoch mode + forget + legacy switch
bash $CLUSTER/evidence/b5/route-smoke-auth.sh      # PLAYLIST_API_TOKEN 401/200
bash $CLUSTER/evidence/b5/route-smoke-resolve.sh   # resolve == explain == evaluate; hide → re-derive
#   transcripts: $CLUSTER/evidence/b5/route-smoke-*.log · H2 variants: evidence/h2/smoke1-routes.mjs, smoke2-playlist-explain.mjs

# 5) Independent adversarial probes (C1; ~132 checks) — read-only wrt the repo
bash $CLUSTER/evidence/c1/runall.sh
#   C1-era results: p1 20/0 · p2 41/0 · p3 37/1 (the 1 = the wave defect, fixed by H1) · p4 33/0 · p5 now OK
#   *p3 re-runs may show cosmetic fails: its hard-coded note strings predate the F8 wording fix (H1 §5.4); behaviour is what counts
```

**Carried reds to expect (unchanged by this branch):** (1) macOS librarian case-fold test (`librarian.test.ts:149`) —
fails on default APFS case-insensitive filesystems, also red on `main`; (2) root `pnpm type-check` chain — 11 pre-existing
`packages/webamp` tsc errors; (3) `/dev/shm` cross-disk skip. Full accounting: C1 §5, B4 §A, H2.

**When quoting numbers in the report:** use the S5 delivery-manifest re-capture, reproducing the H4/C4 runs (brain
suite, type-checks, brain-lab JSON, route smoke transcripts, `evidence/final-lab/hashes.txt` for module hashes). Do
**not** quote B4's 64-check lab number, B6/roadmap's "Brain 205", or the stale `interpret.ts` hash `f260b260…` — all
superseded (C1 §6 F4).

---

*End of Ch.5 appendix. Sources: retrieved by A1/A2/A3 on 2026-10-06 (modes as stated per entry); this merge adds no
sources and performs no retrieval. Unretrieved items are listed in §5.1.5 and must not be cited as evidence.*
