# A3 — Session-scoped fast learning for SynAmp playlists
### Data Science & ML design pack (algorithm research & design; round A, agent: data-science-machine-learning-sp)

Scope: design the epoch-scoped, deterministic, replayable learning layer that extends
`apps/brain/src/session/feedback.ts` (heuristic-v1) per CONTEXT.md, the dispatch plan
(`deriveAdaptive` seam in `apps/brain/src/learning/derive.ts`), and AGENT-ROADMAP P3.
All code references are read-only observations of branch `feat/fast-learning-brain` as of 2026-10-06.

---

## 0. Return format (conclusion / evidence / analysis / gaps and risks / placement)

**Conclusion.** One coherent architecture is recommended: the **Epoch Evidence Re-ranker
("epoch-v1")** — a deterministic, pure-function re-ranker that (a) resolves listening
*epochs* from the existing event log (session id + 30-minute idle-gap rule + midnight/day
boundary, with a daypart label as context), (b) learns **track- and artist-level** evidence
*only inside the active epoch* with a minutes-scale half-life, (c) adds a small,
reliability-weighted **keep/skip centroid term** over already-produced, well-measured audio
axes (Rocchio-shaped: γ < β), (d) hides repeat-skips within the epoch, and (e) funnels the
only cross-epoch persistence channels through **explicit signals** and **user-confirmed
proposals**. Everything is derived by replaying the append-only log; `now` is injectable;
all adjustments are saturated through the existing bound `0.15·tanh(v/2)`; every track gets
per-part reasons; no training infrastructure and no hidden mutable state are introduced.
Session-RNNs (GRU4Rec-style) and contextual bandits as *primary* rankers are rejected for
now; bandits remain an optional, default-OFF exploration layer. The single most consequential
change to the existing code: **implicit signals (full_play / repeat / skip patterns /
external_play) leave the persistent v1 cells and become epoch-scoped** — otherwise the
"must not leak across day/session/hour" requirement is violated by construction. That is a
meaning change, so it ships as a policy-version bump (`heuristic-v1` → `epoch-v1`); the event
log never changes, so rollback is switching the derivation function.

**Evidence.** All method claims below are anchored in retrieved sources (Appendix §6):
the Rocchio update rule and the γ<β convention were read in full from the IR textbook chapter
[ML-1]; the context-dependence of skips including the verbatim warning that interpreting a
skip "as a general negative assessment… might be misleading" from the Jannach implicit-feedback
chapter [ML-7]; non-stationary bandits framed as "rewards remain constant over epochs and
change at unknown time instants" [ML-4] (this is the exact machine-learning shape of the
user's requirement); (sign, magnitude, confidence) treatment of implicit feedback [ML-8];
skip-timing structure and its song-specific stability [ML-20]; MSSD scale (160M sessions) with
a uniformly-random sub-collection "for counterfactual evaluation" [ML-3]; exploration/satiation
and the filter-bubble literature [ML-19, ML-18]; counterfactual caution [ML-17, ML-16]; and the
30-minute inactivity convention for sessionization [ML-22]. The repo's own constraints
(POLICY_VERSION discipline, "null is never zero", bounded score_breakdown, strict-tier-only
application) come from `events.ts` / `feedback.ts` / `evaluate.ts` / AGENT-ROADMAP (retrieved).

**Analysis (what the design turns on).** "Learn fast, forget fast" is implementable *exactly*
only because epochs have declared boundaries: fast learning = bounded influence per event
(saturating tanh, one-event anchor reachability); fast forgetting = exponential decay with a
minutes-scale half-life **inside** an epoch and a **hard mask** (zero weight) **at** the epoch
boundary. The mask — not the decay — is what makes isolation a structural property, testable
as byte-equality of re-derivations (falsification tests in §4.3). Feature-level (Rocchio
centroid) learning is real but must stay gated and small: SynAmp's audio features co-vary
(energy ≈ tempo/onset/loudness movement) and most mood fields currently have no producer
(dossier ch. 7 identifiability problem; registry status read from the repo), so entity-level
evidence does the fast work and attribute evidence requires corroboration.

**Gaps and risks.** (1) All magnitudes are candidate values inherited from the dossier and
v1; nothing is tuned on real listening — fixtures are never evidence about real music.
(2) The strict reading of the user's "must not be influenced by feedback from a different
day" would epoch-scope even playlist-scoped explicit thumbs; we interpret explicit deliberate
signals as the sanctioned cross-epoch channel (per the dispatch plan) with a config switch for
the strict reading — flagged for the C-round review. (3) Feature-axis reliability beyond `bpm`
(tempo_confidence) has no producer today; the centroid term starts with honest-degradation
gates and grows with P4. (4) Proposal thresholds are untested guesses. (5) GRU4Rec's numbers
are from other domains/users and were not reproduced here; the rejection is a judgment on
data scale/opacity/determinism, not a refutation.

**Suggested final-report placement.** Report chapter "The fast learning brain": §1 (framing),
§2 (survey verdicts) compressed to a half-page + decision table, §3 (spec) as the chapter's
core with the parameter table reproduced; parameter table also into production notes;
§4.2–4.4 into "Verification & review methods"; §5 into "Risks, ethics, pitfalls" (jointly with
C2/C3); Appendix §6 feeds the report's sources appendix.

---

## 1. Problem framing

### 1.1 Requirements → formal properties

The user's condensed ask (CONTEXT.md): learn **fast** from actions/feedback so smart
playlists fine-tune within a few events; **never** let behaviour/feedback from another
day/session/hour influence learning; cross-epoch persistence only via explicit global signals
or corroborated patterns confirmed by the user; deterministic, explainable, replayable; pure
derivation from the append-only log; `now` injectable; bounded adjustments; per-track reasons;
single user; small data; testable with synthetic streams.

Formally, the design must deliver a function

```
adjust: (track_id, event log, library, config, now) → { value ∈ [−W, +W], parts[] }
```

(plus `hides` and `proposals`) such that:

- **P1 Localness (mask, not just decay).** Only events of the *active epoch* may change
  `adjust`. Change the log outside that epoch (any day/hour before), re-derive for the same
  `now`: byte-identical output.
- **P2 Boundedness.** |total bonus| ≤ W (0.15, existing `FEEDBACK_WEIGHT`); each part finite
  and separately bounded; the request's own score and all hard constraints stay dominant.
- **P3 Fast response.** A single deliberate act must be near-cap-reachable for its own track
  (one-shot anchor); repeated implicit patterns must reach their effect within a handful of
  events (e.g. hide on the 2nd early skip of the same track in one epoch).
- **P4 Fast forgetting.** Within an epoch, evidence weight decays with half-life on a
  minutes scale; at epoch end, weight is exactly zero (killed, not decayed).
- **P5 Explainability.** Every non-zero contribution carries `{label, value}` + optional
  reliability note; the mapping rule → sentence is total.
- **P6 Replayability.** Pure function of (sorted events, library, config, now); total order on
  events; no ambient time; same inputs → same bytes; policy changes = new `POLICY_VERSION`
  + re-derive; rollback = switch function.
- **P7 Honest degradation.** Missing measurement (null) contributes nothing and is never read
  as zero; an unavailable axis is reported, not silently treated as neutral evidence.

### 1.2 Epochs: definition, boundaries, daypart context

An **epoch** is the unit of "same listening context". Because the server session
(`SessionStore`) deliberately survives restarts and may span long idle periods, an epoch is a
*derived* interval over the log, not the raw `session_id`:

Sorted events `e1..en` (sort key `(ts, id)` — total, deterministic). A boundary exists between
`ei` and `ei+1` iff any of:

- **b1 session change:** both events carry `session_id` and they differ;
- **b2 idle gap:** `ts(i+1) − ts(i) > G_idle` (default **30 min**; convention from web-analytics
  sessionization, [ML-22]); "or even hour" is satisfied since 30 min < 1 h;
- **b3 day boundary:** `localDay(ts(i)) ≠ localDay(ts(i+1))` in the configured local timezone.

An epoch is a maximal run without boundaries. **Daypart context** `night[0–6) / morning[6–12) /
afternoon[12–17) / evening[17–24)` (local time of epoch start) is attached to the epoch for
display, reliability notes, and *proposal corroboration gating* (§3.4) — it does not itself
split epochs (that would over-fragment; gap rule already covers hour-scale).

**Active epoch at `now`:** the last epoch `Ep` with `now − Ep.end_ts ≤ G_live` where
`G_live = G_idle` (so "resume within the gap" behaves identically whether an event arrives or
`now` merely advances). If none: the adaptive view is **empty** — zero adjustments, hides
empty, one reliability note ("no active session — learning is paused"), and only the proposal
scanner (which reads closed epochs) can surface anything.

Why this shape: the requirement is exactly the non-stationary-reward setting — "distributions
of rewards remain constant over epochs and change at unknown time instants" — for which the
bandit literature uses sliding windows / discounting [ML-4]. SynAmp has a *declared* boundary
(session + gap + day), which is strictly easier: we reset exactly, so we do not need
sliding-window regret machinery, and the boundary is auditable to the user ("new session").

### 1.3 Signal inventory and what each event may mean

Available event fields (`events.ts`): `ts, track_id, session_id, playlist_id, plan_hash,
rank_shown, play_ms, duration_ms, reason, scope, scope_id, entry_id, source, policy_version,
detail`. Derived server-side classification (`session.ts`): early skip = `play_ms <
min(30 s, 25 %·duration)`, heard-through ≥ 80 %, `repeat` from going back to a completed
entry; interruptions, errors, seeks, previous and queue replacement are never preference.

| signal | kind | v1 (today, persistent) | proposed `epoch-v1` use |
|---|---|---|---|
| love | explicit | +2 global, 180 d | **L1** unchanged (one-shot anchor) |
| thumb_up | explicit | +1 scope (30 d playlist / 180 d global) | **L1** unchanged |
| thumb_down | explicit | −1 scope | **L1**; if `reason=not_now` → **L2 only** (hide + small epoch negative, no persistence) |
| remove / restore | explicit | playlist hide / undo | **L1** unchanged (remove persists; restore undoes) |
| full_play | implicit | +0.5 playlist, 30 d | **L2 only** (epoch, h≈30 min) — *moved* |
| repeat | implicit | +1.0 playlist, 30 d | **L2 only** — *moved* |
| skip_early | implicit | 2× in playlist → −0.6, 30 d | **L2 only**: small epoch negative; 2× → epoch hide — *moved* |
| skip_late | implicit | (unused) | **L2** weak negative (−0.1, low conf); never hide |
| external_play | implicit (other apps) | +0.25 global, 180 d | **L2 only** (weak, epoch) + **proposal source** — *moved* |
| now_playing, exposure, receipt, started | bookkeeping | never preference | boundary chaining only; never scored |
| interrupted, playback_error, seek | exclusions | never preference | **keep excluded** (user requirement) |
| reason codes | explicit annotation | stored, unused | `not_now`→epoch hide/no-persist; `wrong_energy`→epoch feature negative (energy axes); `wrong_vibe`→honest no-op + reliability note (no producer yet) |

The **L1/L2 split is the anti-leak core**: implicit behaviour never enters persistent cells;
only deliberate signals do; everything else either dies at epoch end or climbs to persistence
as a proposal requiring confirmation.

### 1.4 What "learn fast, forget fast" implies mathematically

- *Fast learn* ⇒ per-event influence must be reachable-by-few: weights sized so that a single
  strong explicit act (love, +2·1.0) maps near the cap (>70 % of W), and 2–3 implicit events
  produce a small but rank-relevant move — with **saturation** (`tanh`) so 20 events do not
  behave 20× as strongly (flood-resistance).
- *Forget fast* ⇒ a **hard-reset family**: weight outside the epoch = 0 exactly (mask), inside
  the epoch = `0.5^(Δt/h)` with `h` minutes-scale; the persistent layer keeps day-scale
  half-lives (30/180 d) only for signals the user deliberately re-declares each time.
- *No cross-context inference* ⇒ **no shared mutable state** (nothing to leak through);
  proposals are the only cross-epoch *learning* channel, and they change nothing until a new
  explicit event or plan edit exists; that edit then enters the log like any other event.
- *Small data* ⇒ methods must have variance ≤ signal: prefer deterministic bounded sums and
  shrinking gates over fitted parameters; default to doing nothing when evidence is thin
  ("abstain" is a first-class outcome, consistent with the repo's null-honesty).

---

## 2. Methods survey (citation → verdict)

### 2.1 Within-session adaptation: Rocchio relevance feedback; bounded attribute updates; kNN over features

**Rocchio relevance feedback** [ML-1, retrieved in full]: `q_m = α q₀ + β·(1/|Dr|)Σ_{d∈Dr} d −
γ·(1/|Dnr|)Σ_{d∈Dnr} d`; the text explicitly notes positive feedback "turns out to be much
more valuable than negative feedback… most IR systems set γ<β", with reasonable values
α=1, β=0.75, γ=0.15; and notes the system can **track an evolving information need** —
the property we want within an epoch. Verdict: adopt the *shape* (keep centroid + weaker
skip centroid, γ<β) at track/feature level; adapt weights to our venue because there is no
text query vector to mix with — the "query" side (α q₀) is provided by the plan's own scoring,
which we never override (bounded bonus only).

**Bounded attribute updates** — the idea of nudging a small number of interpretable
attributes per feedback event. Grounding: implicit-feedback confidence weighting [ML-8] and
the intention dimension (deliberate acts like "remove" deserve different treatment than
consumption events) [ML-23]. Verdict: apply only where a producer exists and evidence is
corroborated (≥2 reason-coded negatives, ≥3 keeps); everything else abstains.

**kNN over features / embedding preference models.** The dossier grades this "10s of events,
medium explainability, centroid skewed by outliers, dislikes weakly represented" (v2 territory;
candidate). Our registry today: reliable *produced* scalars exist (bpm + conf, loudness,
onset/percussiveness, spectral), but mood/valence/instrument fields have **no producer** — a
feature-space learner would be learning over proxies with a known identifiability problem
(co-varying energy features). Verdict: adopt a *small* reliability-weighted centroid over a
declared axis subset (below), not a full metric-space learner; revisit kNN/embedding models
when P4 producers and embeddings land and when ≥10⁴-event logs exist.

### 2.2 Session-based recommendation literature (GRU4Rec et al.)

GRU4Rec [ML-2] models short sessions with RNNs (an advance over MF when only short session
data exist) and spawned the session-rec line. MSSD [ML-3] shows the industrial shape: 160 M
sessions, ~3.7 M tracks, dedicated skip-prediction challenge. **Verdict: not now.** Reasons:
(i) our unit is one listener with tens–hundreds of events per epoch — deep sequence models
need orders of magnitude more signal and their single-user overfit risk is "very high"
(dossier table); (ii) opacity vs the explainability contract (every score needs a sentence);
(iii) non-determinism/training infra violate the repo's frozen constraints; (iv) the
*behaviour we need* (recent-event weighting, session isolation) is available in closed form
with decay + mask — no learned recurrence required. Conditions to revisit: ≥10⁴ clean events,
offline shadow evaluation, and only if bounded/explainable variants (e.g. distilled to a
decay model) can pass the same replay tests.

### 2.3 Recency weighting and half-lives

Streaming-recommender literature mainstreams time-decayed latent models ("time decay factor",
"half-time") [ML-9]; web analytics encodes session boundaries at 30 min inactivity [ML-22]
(official Google Analytics default; acknowledged convention, not a music-specific finding).
Non-stationary bandits treat window length / discount as the forgetting knob [ML-4]. **Verdict:**
- Epoch-internal: `w(Δt) = 0.5^(Δt/h_E)`, `h_E = 30 min` default (minutes-scale per
  requirement; half of a typical listening session), with alternatives 15/45/90 min in config.
- Persistent (explicit) layer: keep v1's 30 d / 180 d (dossier's candidate convention).
- The **mask** does the cross-epoch work; decay only shapes within-epoch recency.

### 2.4 Contextual bandits (LinUCB, Thompson sampling) and exploration for one user

LinUCB [ML-5] validated feature-sharing across 33 M Yahoo! events — the *mechanics* transfer
(sample over shared content features, not per-track arms), the statistical leverage does not.
Thompson sampling [ML-6] needs a reward model + maintained posteriors (state to replay).
Non-stationary variants (sliding-window / discounted UCB [ML-4]) match our boundary structure.
Exploration has a real value: without it, recommenders "concentrate on the known user interests
and create satiation effect, i.e. reduced enjoyment" [ML-19, retrieved]. **Verdict:**
bandits = optional **exploration layer**, default **OFF** (§3.5 justifies); if enabled:
deterministic seeded slot selection with explicit exposure policy, never a silent ranker;
posteriors are not maintained (only per-epoch observed stats), so nothing leaks by accident.

### 2.5 Sequential skip prediction (WSDM 2019 challenge lineage) — features and reward shaping

MSSD + challenge [ML-3]; skip timing correlates with musical structure and skip profiles are
song-intrinsic and stable under stationary conditions [ML-20, ML-21 (partial)]. **Verdict:**
(a) use as *reward shaping inputs*: skip-timing curves could later distinguish "intro dislike"
vs "end-of-track skip"; today's coarse classes (early/late/full) already encode most of that.
(b) **Caveat, load-bearing:** a skip is "context dependent" and interpreting it as a general
negative "might be misleading" [ML-7, verbatim]; deliberate vs incidental feedback must be
separated [ML-23]. Hence skip weight small, hide only on repetition, never persistent, never
global.

### 2.6 Learning under noisy labels (confidence weighting, calibration)

Implicit feedback = "positive and negative preference associated with vastly varying confidence
levels" [ML-8]. Noisy-label literature (survey [ML-11]) offers the taxonomy (noise
transition/robust losses/calibration) but its methods target large supervised datasets — out of
scope. **Verdict:** adopt the *principle*: every event carries (sign, magnitude, confidence);
reason codes raise explicit-negative confidence and route attribution; corroboration thresholds
implement "small-loss" logic deterministically; no learned calibration (nothing to calibrate on
n=1 yet).

### 2.7 MMR diversity

Carbonell & Goldstein [ML-10, full text retrieved]: MMR = incremental re-ranking combining
query relevance with minimal similarity to already-selected items; λ=1 → pure relevance, λ=0
→ max diversity; intermediate values combine. Already implemented in `evaluate.ts` (caps +
MMR). **Verdict:** keep at plan level; the epoch layer must not weaken it (bonus is applied
inside the strict tier; MMR/caps still operate after re-ranking — implementation note for B5:
apply bonus before selection, keep selection unchanged). Do not conflate exploration with
diversity: MMR diversifies the *shown set*, it does not explore new tastes.

### 2.8 Cold-start anchors

Cold start here is simply "no feedback yet" (no crowd) — content similarity + library priors
+ prompt intent are the priors [dossier ch.7; cold-start survey ML-12]. **Verdict:** the epoch
layer's cold-start state is abstention: zero adjustments until minimum evidence; explicit acts
are one-shot anchors (immediate full-strength effect for their own track); persist nothing
implicit; when producers land, seeds can come from P4 embeddings (later).

### 2.9 Recommended architecture and ranked alternatives

**Recommended: Epoch Evidence Re-ranker ("epoch-v1")** = epoch resolution + entity/artist
evidence (bounded, decayed) + gated reliability-weighted keep/skip centroids + epoch hides +
confirmation-gated proposals + single saturating composition with the explicit layer.

| rank | alternative | why not (now) / when |
|---|---|---|
| 1 | **Epoch Evidence Re-ranker (adopted)** | matches all seven properties; smallest surface that satisfies "fast + isolated + explainable". |
| 2 | Pure decay extension of v1 (shorter half-lives) | fails P1: decay ≠ reset; a 2-hour-old skip still moves today's ranking — the exact leak the user forbids. |
| 3 | Full Rocchio taste-vector per epoch as primary ranker | identifiability (co-varying features, no mood producers); centroid outliers; less explainable. Kept as the bounded secondary term. |
| 4 | GRU4Rec-style session RNN | data scale, opacity, determinism; revisit ≥10⁴ events as offline shadow only. |
| 5 | Contextual bandit ranker (LinUCB/TS) | single-user variance; needs exploration + state; LinUCB evidence is multi-user. Demoted to default-OFF exploration layer. |
| 6 | LLM taste summaries | explanation/cold-start aid only, never the scorer (dossier); over-interprets single events. |

---

## 3. Concrete spec (math, rules, parameters)

All formulas are pure functions of `(events sorted by (ts,id), library, config, now)`.
`canonical(track_id)` (existing alias mapping) is applied before any aggregation.

### 3.1 Epoch resolution (deterministic)

```
break_i ⇔ (sid_i ≠ ∅ ∧ sid_j ≠ ∅ ∧ sid_i ≠ sid_j)
        ∨ (t_j − t_i > G_idle)                      # j = i+1
        ∨ (localDay(t_i) ≠ localDay(t_j))
epochs = maximal runs; E = {id, t_start, t_end, session_ids, daypart, date}
epoch_id = "ep1:" + sha256hex(t_start, t_end, first_event_id)[0..15]     # stable, explainable
active(now): last E with now − t_end ≤ G_live, else ⊥ (empty view)
A = [e ∈ E : t_start ≤ t_e ≤ t_end]                 # the active evidence set
```

Chaining counts every event with a `ts` (including bookkeeping) — any event is activity.
`localDay` uses configured IANA timezone (America/Chicago default; injectable for tests).
Tie-break for identical `ts`: lexicographic `id`. Live window note: an epoch that ended ≤30
min ago is still "this moment" — same code path whether an event or `now` crosses the gap.

### 3.2 Evidence weights (epoch layer L2, per event)

| signal | magnitude m | confidence c | extra rule |
|---|---|---|---|
| full_play | +0.50 | 0.50 | — |
| repeat | +1.00 | 0.70 | — |
| skip_early | −0.60 | 0.50 | k-th same track in epoch: k≥2 → **hide** (no extra weight) |
| skip_late | −0.10 | 0.20 | never hides |
| external_play | +0.25 | 0.50 | proposal source (§3.4) |
| thumb_down `not_now` | −1.00 | 0.90 | **hide n=1**, no L1 persistence |
| (thumb_down/remove `wrong_energy/wrong_vibe`) | — | — | L1 persistence as usual + feeds negative feature set with c=0.9 |
| (love / thumb_up / generic thumb_down / remove) | — | — | **L2 does not score these** (L1's job; no double count) |

Magnitudes are the dossier's candidate values, kept where they exist (love +2 etc.) and
extended (−0.1 late skip) — all "candidate until tuned on real listening".

### 3.3 Update rules

**(a) Entity value.** For candidate track `t` (canonical id), epoch E, at time `now`:

```
v2_entity(t) = Σ_{e∈A, canon(e.track_id)=t} m_e · c_e · 0.5^((now − t_e)/h_E)        … (1)
```
with `h_E = 30 min`. Contributions are grouped by label for reasons: "heard it through this
session", "replayed this session", "skipped early this session", "played in your other apps
this session", "not now — hidden until this session ends".

**(b) Artist term.** With `π = 0.35` (propagation), cap 0.8, minimum-evidence gate
(≥2 distinct tracks with events, or |Σ| ≥ 1.0):

```
v2_artist(t) = clip( π · Σ_{x ≠ t : artist(x) = artist(t)} v2_entity_raw(x), −0.8, +0.8 )   … (2)
```
Label example: "two of this session's skips were by <artist>". Single-event artists move
negligibly by construction (π on one small value).

**(c) Reliability-weighted keep/skip centroids.** Declared axis subset `A*` = produced scalar
fields from the registry, recommended start `["bpm","lufs_integrated","crest_factor",
"onset_rate","percussiveness"]`. For axis `a`, standardize with robust library stats
(median/MAD, deterministic from the current library): `z = (x − med)/(1.4826·MAD)`.

Kept set `K` = tracks with L2 keep-events **or** explicit positives in E (love/thumb_up);
per-axis reliability of a track: `r = tempo_confidence` for bpm (human spot-checks write
confidence 1 by design), else 1.0 (placeholder until other producers expose reliability — gap).
Weighted centroid and spread: `m⁺_a = Σ r·w·z / Σ r·w`, `s⁺_a = √(Σ r·w·(z−m⁺)²/Σ r·w)`,
`w = c_e·decay(·)` per event; `s⁺` floored at 0.25 to avoid collapapse to a point.
Gate: `g⁺_a = 1{n_K ≥ 3} · min(1, coverage_a/0.6) · 1/(1 + s⁺_a²)`
(coverage = share of K tracks with axis measured). Negative side from **corroborated**
negatives only — tracks with hide-grade skips (k≥2), `not_now` thumb_downs, or explicit
negatives with reason codes — `g⁻_a = 1{n_R ≥ 2} · min(1, coverage_a/0.6) · 1/(1 + s⁻_a²)`.

```
k⁺_a(x) = exp(−½·((z_x − m⁺_a)/s⁺_a)²),   k⁻_a(x) analog
s_feat(x)  = Σ_a [ g⁺_a·β·k⁺_a(x) − g⁻_a·γ·k⁻_a(x) ],   β = 0.5, γ = 0.15            … (3)
s_feat clipped to [−1, +1]; per-axis contribution to [−0.5, +0.5].
```
γ<β follows the IR-book convention [ML-1]; β halved vs the textbook (0.75) because there is
no query-vector side to combine — a candidate value. Reasons name axes in human units:
"tempo ~126 BPM — you kept three such tracks this session"; "louder side of what you've been
skipping this session". Missing axis ⇒ term contributes 0 for that axis; if a gate fails due
to missing data, emit a reliability note ("BPM band not learned: only 2 of 5 kept tracks have
a tracked beat") — never a silent zero.

**(d) One-shot anchors (explicit).** Love/thumb/remove act immediately through **L1**
(existing decayed cells; single love ≈ 0.15·tanh(1.0) ≈ 0.114 → near-cap with one event).
Anchors also seed the keep/reject sets for (c) within the epoch. Remove is a one-shot hide.

**(e) Hide rules.**
- persistent hide: `remove` in playlist `p` (existing semantics; restore undoes).
- epoch hide (dies at epoch end, applied at every resolve while E is active):
  - same track `skip_early` count ≥ 2 in E → hide ("you skipped this twice this session");
  - `thumb_down` with `reason=not_now` → hide n=1;
  - remove always persists regardless of reason (deliberate destructive act; edge noted).
- Hides affect **future queue builds/resolves in this epoch only**; the current queue is a
  snapshot and is never reordered (P3 promise). Hidden count is displayed like v1's.

**(f) Composition with L1 — one saturating map, no double counting.**
`v1'(t,p)` = explicit-only persistent value (updated v1: love, thumbs [see §3.6 scope note],
remove-hide, no implicit cells). Total:

```
bonus(t,p) = W · tanh( (v1'(t,p) + v2_entity(t) + v2_artist(t) + s_feat(t)) / 2 ),  W = 0.15   … (4)
```
Backward-compatible when L2 empty: `W·tanh(v1''/2)` reduces to today's `feedbackBonus`.
Parts list = L1 parts + L2 parts + centroid parts; `score_breakdown = {base, feedback, parts}`.
Bounded: |bonus| ≤ 0.15 always; internal sums are finite (flood test in §4.3).

### 3.4 Cross-epoch proposals (the only cross-epoch learning channel)

A **proposal** is a suggestion object, never a score change. Two kinds of confirmation exist:
(a) **signal confirmation** → append an explicit event (e.g. global `thumb_down`) via the
normal feedback API, with `detail.proposal_id` for provenance; (b) **plan confirmation** →
user edits the playlist plan (closed schema; e.g. artist exclusion), which changes `plan_hash`
through the existing P2 flow. Nothing applies without one of these.

Generation (pure scan over closed epochs within `W_scan = 30 d`, using only events; a small
non-scoring "dismissed proposal ids" list may exist as an explicit user-facing artifact —
it never affects ranking):

| proposal | evidence threshold | suggested action |
|---|---|---|
| "this track keeps disappearing early here" | track hidden-by-skips in ≥3 epochs ∧ ≥2 distinct dates, same playlist context | plan edit (exclude track) or playlist thumb_down |
| "you keep skipping <artist> in <playlist>" | ≥2 distinct tracks by artist skipped (k≥2) in ≥3 epochs ∧ ≥2 dates | plan edit (exclude artist) |
| "you avoid this track whenever you say 'not now'" | `not_now` on same track in ≥3 epochs ∧ ≥2 dates ∧ ≥2 dayparts | global thumb_down |
| "(pos) other apps keep playing <artist>" | `external_play` in ≥5 epochs ∧ ≥3 dates | global thumb_up / follow |
| "(pos) you keep coming back to <track>" | `repeat` in ≥4 epochs ∧ ≥3 dates | plan edit (pin / boost) |

Rationale: proposal = the "corroborated patterns with user confirmation" branch; thresholds
are conservative, untested candidates (§4.3 tests their boundary behaviour: 2 epochs → no
proposal; 3 epochs across 2 days → exactly 1). Daypart is recorded on evidence and shown in
the sentence; same-day multi-epoch evidence alone cannot propose (mood ≠ habit).

### 3.5 Exploration budget — recommendation: **default OFF**

Justifications: (i) single user, thin data — exploration noise is indistinguishable from
mood, violating P3/P4's fidelity aim; (ii) the determinism promise: OFF keeps ranking fully
deterministic (byte-reproducible) and keeps exposure records honest (`policy:
deterministic_rank`; no invented propensity — a repo invariant); (iii) guardrail doctrine:
diversity/novelty are guardrails, not objectives, and a recommender that influences exposure
then "learns" from it "perpetuates the feedback loop" while lack of exploration causes
satiation [ML-19] — these pull in opposite directions and can only be balanced by the user,
not silently by the algorithm; (iv) MMR/caps already deliver set-level diversity.

If enabled later (settings flag, per-installation): 1 slot per queue max, selected from the
least-covered library region by a seeded PRNG (`seed = hash(epoch_id, resolve_counter)` for
replayability), recorded with `policy: "deterministic_rank+explore_slot"` in exposures;
coverage alarm (distinct artists / library regions over a rolling window) displayed as a
guardrail, never auto-optimized. Acceptance: OFF ⇒ byte-identical to no-budget; ON ⇒
reproducible given seed; both covered by tests.

### 3.6 Interaction with existing heuristic-v1 (compose; do not double-count)

Policy version bump `heuristic-v1` → **`epoch-v1`** (meaning changed ⇒ new version + re-derive;
events immutable). Deltas vs current `deriveFeedback`:

1. `skip_early` 2×-in-playlist rule: **removed from L1** → becomes L2 epoch hide + small
   epoch negative (repeat rule now epoch-scoped, satisfying the isolation requirement — the
   current rule persists for 30 d and is the clearest existing violation of the user's ask).
2. `full_play` and `repeat` playlist cells: **removed from L1** → L2.
3. `external_play`: **removed from L1** → L2 (+ proposal source). This is the strictest
   compliant reading; cost is small (weak signal).
4. `thumb_down/remove` with `reason=not_now`: excluded from L1, handled by L2 (hide, no
   persistence). Other reasons unchanged + attribute feed.
5. Everything else (love, generic thumbs, remove/restore, decays 30/180 d, `removed()`
   behaviour, `feedbackBonus` math) unchanged.
6. Single application point: equation (4). L1 and L2 never both score the same signal
   (disjoint sets by construction) and the saturation is applied once to the sum — this is
   what "compose, don't double count" means operationally.

**Scope interpretation (flagged).** The dispatch brief says "explicit **global** signals" as
the persistent channel. Strictest reading: playlist-scoped thumbs would also become ephemeral.
We interpret explicit *deliberate* gestures (love, any-scope thumbs, remove/restore) as user
statements, hence the sanctioned cross-epoch channel — `not_now` exists for users to declare
context-limited negatives. A config switch `scope_persistence: declared|global_only` (default
`declared`) implements the strict reading for review/adjudication by C1/C2. The tension is
named rather than hidden.

**Interface notes for B5.** `AdaptiveView.adjust(trackId)` is track-keyed and epoch-wide (no
playlist argument in the frozen seam — consistent: L2 reads "this moment", L1 keeps playlist
scopes). `evaluate.ts` gains an optional `adaptive` hook; bonus computed as
`W·tanh((feedbackValue + adaptiveValue)/2)`; when `adaptive` is absent the formula reduces to
today's exactly. Hides = union of `feedback.removed(playlistId)` (persistent) and
`adaptive.hides` (epoch). `counts.hidden_by_you` gains an epoch-hides sub-count in `warnings`.

### 3.7 Parameter table (value · rationale · testable acceptance)

| # | parameter | default | rationale | acceptance test (deterministic fixture) |
|---|---|---|---|---|
| P1 | `G_idle` idle gap | 30 min | web-analytics sessionization convention [ML-22]; < 1 h so "even hour" holds | 29:59 ⇒ same epoch; 30:01 ⇒ split |
| P2 | day boundary | local midnight ✓ | "different day" guarantee | event pair across 00:00 splits |
| P3 | `h_E` epoch half-life | 30 min | minutes-scale forgetting; ≈ half a typical session | weight at +60 min ≤ 0.25× fresh (assert on derived value) |
| P4 | `G_live` active window | = `G_idle` | resume-consistency | `now − end > 30′` ⇒ empty view, note emitted |
| P5 | `W` bound | 0.15 | existing `FEEDBACK_WEIGHT`; request dominates | flood test: 20 loves ⇒ |bonus| ≤ 0.15 |
| P6 | tanh scale | 2 | existing | monotonicity, saturation spot-checks |
| P7 | love | +2.0 / c=1.0 | dossier magnitude (one-shot anchor) | single love ⇒ bonus ≥ 0.10 and part "you loved this" |
| P8 | thumb_up | +1.0 / c=0.9 | dossier | scope honoured in L1 part |
| P9 | thumb_down | −1.0 / c=0.9 | dossier | persists via L1 when reason ≠ not_now |
| P10 | repeat | +1.0 / c=0.7 | dossier | L2 only; dies after epoch end |
| P11 | full_play | +0.5 / c=0.5 | dossier; low conf (unintentional) | L2 only |
| P12 | skip_early | −0.6 / c=0.5 | dossier; context-dependent [ML-7] | k=1: small negative, no hide; k=2: hidden |
| P13 | skip_late | −0.1 / c=0.2 | weak ("partial play ~0" dossier) | never hides |
| P14 | external_play | +0.25 / c=0.5 | v1 value kept | L2 only; proposal at ≥5 epochs/≥3 dates |
| P15 | skip-hide count | 2 | "repeat skip = not now"; single skip abstains | hide survives re-resolve in epoch; cleared after |
| P16 | not_now | hide n=1, no L1 | literal semantics; user-declared context limit | no persistent cell appears |
| P17 | artist π / cap / min-ev | 0.35 / 0.8 / ≥2 events | damped propagation; single-event artists ≈ inert | 1 event ⇒ |artist part| ≤ 0.11; 2 same-sign ⇒ visible |
| P18 | centroid gates | n_K ≥ 3, cov ≥ 0.6, n_R ≥ 2 | min evidence; small-data variance | n=2 kept ⇒ no axis, reliability note |
| P19 | β / γ | 0.5 / 0.15 | γ<β [ML-1]; β halved (no query side) | γ<β enforced; feature parts ≤ caps |
| P20 | feature caps | axis ±0.5, total ±1.0 | boundedness | adversarial wide-spread set ⇒ shrunk via 1/(1+s²) |
| P21 | proposal (neg) | ≥3 epochs ∧ ≥2 dates | corroboration; mood ≠ habit | 2 epochs ⇒ none; 3/2dates ⇒ exactly 1 |
| P22 | proposal (pos) | ≥5 epochs ∧ ≥3 dates | stricter (positives weaker) | boundary test |
| P23 | proposal scan window | 30 d | bounded compute/privacy | older epochs produce no proposal |
| P24 | exploration | OFF; if ON: 1 slot, seeded | §3.5 | OFF ⇒ byte-identical; ON ⇒ reproducible |
| P25 | scope_persistence | `declared` | §3.6 interpretation switch | `global_only` ⇒ playlist thumbs epoch-scoped |

Every row lands as a test in the B4 harness; C1 re-derives and tries to falsify (especially
P1–P6, P15–P16, P21).

### 3.8 Linear-time algorithm outline (one pass)

```
deriveAdaptive(events, {now, library, config, canonical}):
  1. sort events by (ts, id)                                  O(n log n)  (or reuse pre-sorted)
  2. single pass → epochs, active epoch, evidence set A       O(n)
  3. pass over A → per-track cells, per-artist cells,         O(n)
       per-axis accumulators for kept/rejected sets
  4. finalize centroids per axis (weighted sums; no sort     O(k·|A*|)
       needed for means/spreads); gates + reliability notes
  5. hide sets: skip counts ≥2, not_now list                  O(n)
  6. proposals: single pass over closed epochs ≤ 30 d         O(n + subjects)
  7. adjust(trackId): map lookups + O(|A*|) kernel evals      O(|A*|) per candidate
  memory: O(distinct tracks/artists in A + subjects)          — single user: tiny
```
No step reads the clock; no step mutates shared state; identical inputs → identical output
(bytes, reason order = fixed label order). Caching, if added, must be an explicit memo keyed
by (log length, config hash, now-bucket) and is optional.

### 3.9 Worked example (illustrative numbers, synthetic)

Session 19:00–19:40: love A (19:05); full_play B ×1, repeat B (19:10–19:20); skip_early C
×2 (19:12, 19:15); skip_early D ×2 (19:20, 19:23); full_play E (19:30).
At `now = 19:40`: `v2_entity(B) ≈ (0.25 + 0.7)·decay ≈ 0.85`; C and D hidden; `kept = {A,B,E}`
→ bpm axis gate open (3 keeps) → tracks near ~126 BPM receive `s_feat ≤ +0.5·β·k⁺`-scale
boost with reason "tempo ~126 BPM — you kept three such tracks this session". Total bonus for
a near-BPM candidate ≈ `0.15·tanh((0 + 0 + 0 + ~0.3)/2) ≈ 0.02` — a tiebreaker, never an
override; for B ≈ `0.15·tanh(0.85/2) ≈ 0.06`. One love alone for a track ≈ 0.114. At 20:20
(`now − end = 40 > 30`): empty view, zero adjustments; proposals may list C/D if the pattern
recurs across ≥3 epochs/≥2 days. *All numbers illustrative.*

---

## 4. Evaluation plan

### 4.1 Offline replay and counterfactual caution

Replay = re-derive all tiers from stored logs with a candidate policy; invariants (P1–P7) are
testable as pure-function properties and against synthetic streams (§4.2). **Caution:** static
offline fit answers "how well do rankings fit logged behaviour", not "would listening improve"
— offline evaluation "ignores the interventional nature of recommendations" [dossier; ML-17,
ML-16]. With exploration OFF our ranking is deterministic, so no propensity exists and IPS-class
estimators are *not available* — and we deliberately do not fabricate propensities (repo
invariant). Therefore: offline is used for invariants/bugs/sanity only; causal claims require
(a) live interleaving (two rankers mixed, credit by engaged tracks) or switchback by
session/day when a policy change is tried [ML-14, dossier], and (b) the user's own read-back.
Any online experiment records exposure honestly (policy string), and auto-rolls-back on skip/
remove spikes (dossier).

### 4.2 Simulation design (synthetic streams)

Deterministic generator (B4 harness): a latent "mood regime" θ over the declared axes; a
listener model that accepts a track if its axis distance < r(θ); regimes switch at epoch
boundaries and occasionally mid-epoch (mood swing). The simulator emits real event shapes
(started/skip_early/full_play/repeat/feedback) and noise (interruptions, errors, seeks,
duplicates, torn lines). Suites:

1. **Adaptation:** regime loves high-energy → learner lifts high-energy tracks within ≤2
   events; mid-epoch switch to low-energy → ranking flips within ≤2 events of the switch.
2. **Isolation (falsification, both directions):** implicit-only logs; L₁ = day-1; L₂ = L₁ +
   arbitrary day-2 events. Ranking derived for `now` in day 1 from L₂ must be byte-identical
   to L₁; and day-1 implicit events must not move day-2 rankings. (Explicit signals
   intentionally persist — asserted separately and documented.)
3. **Hour-scale:** 35-min gap splits (new epoch, zero carry); 20-min gap within session
   continues (evidence carries).
4. **Bounds/flood:** 20 loves, 20 skips, mixed → |bonus| ≤ 0.15; reason parts sum consistent.
5. **Hides:** 2nd skip hides within epoch; expires after epoch end; `not_now` hides n=1; not
   restored across epochs except via proposals.
6. **Determinism:** shuffle non-tied event insertion order → identical derivation; `now`
   perturbation inside one minute → identical (no wall clock reads).
7. **Proposals:** boundary cases (2 epochs → none; 3/2 days → one; date-spanning dayparts).
8. **Degradation:** missing axes → notes, no zero-substitution; non-Western tempo uncertainty
   (tempo_confidence low) → axis gates exclude, note emitted (ties to A2/C2).

### 4.3 Metrics (observed, not optimized) and explicit anti-metrics

Observed: **in-epoch early-skip rate** (skips per play within epoch), **completion rate**
(full_play share), **repeat rate** (positive engagement), and as an offline sanity only:
**profile hit-rate on held-out likes** — within an epoch, hold out explicit positives from its
second half; rank at mid-epoch from first-half evidence; fraction of held-out likes (and
their axis-neighbours, e.g. same bpm band) in the top quartile. This is circular-prone
(the map is validated by feedback the map elicited) — sanity signal only, never a claim.

**Anti-metrics (guardrails, thresholds alarm-only):** no engagement-maximisation target;
watch rather than optimize — library **coverage** (distinct artists/axes spans served over a
rolling window; alarm when it collapses, [ML-19, ML-18]); **narrowing alarm** (share of
resolved tracks from top-10 % most-served; [ML-18]); **distinct-tracks/week** trend while
epoch adjustments are active; hidden-count and restore usage (a spike in hides = overreaction
alarm). Diversity/novelty/coverage are never objectives; skipping fewer songs is not success
per se — the acceptance signal is the user's read-back ("this is right for now").

### 4.4 Acceptance test matrix (feeds C1's adversarial pass)

Byte-equality isolation (both directions, implicit-only) · bounds/flood · epoch expiry zero ·
determinism & replay (incl. `now` injection) · hide semantics + expiry · not_now no-persist ·
centroid gates (n, coverage, spread) with honest notes · proposal thresholds + confirmation
writes a normal event/plan edit · export/read-back endpoint shows every part · rollback: switch
policy_version to heuristic-v1 changes output only where implicit patterns existed (diff
report generated for review).

---

## 5. Failure modes & anti-patterns (and how the spec blocks them)

1. **Overreaction to single events.** Bounded `tanh`, small skip weight, hide only at k≥2,
   artist propagation damped & gated, proposals need ≥3 epochs. *Test:* single-event suite.
2. **Contamination across contexts (the cardinal sin here).** Hard epoch mask + disjoint
   L1/L2 signal sets + not_now handling + proposal confirmation gate. *Test:* §4.2.2.
3. **Reward hacking (incl. hiding as "improvement").** No metric-driven tuning loop at all;
   hides require repetition or explicit not_now; hidden counts exposed; no engagement target;
   coverage/narrowing alarms; all adjustments readable and reversible (restore / policy
   switch / forget endpoint).
4. **Explainability erosion.** Every part labelled; no embeddings/learned weights in v1 of the
   layer; refusal to attribute `wrong_vibe` until a producer exists is *displayed*, not
   guessed; reason-order fixed.
5. **Mood-data privacy.** The event log is the most sensitive artifact (local, user-owned);
   learning scans bounded windows (current epoch; ≤30 d for proposals); no telemetry; reason
   codes (not free text) on negatives; export/delete live with the log; document locally —
   cross-ref A2/C2 for the data-governance checklist.
6. **When NOT to adapt (keep the existing exclusions).** Interruptions, errors, seeks,
   previous-key, queue replacement, receipts/exposures = never preference (already enforced;
   keep). Additional abstentions: no active epoch; evidence below minimums; axis missing/
   unreliable; `ignore`-style user intents; anything the plan declares excluded (hard
   constraints untouched — bonus is strict-tier only).
7. **Collinearity mis-attribution (attribute learning).** Features co-vary; one negative
   cannot identify the culprit axis — so attribute moves need corroboration (≥2 reason-coded
   negatives or ≥3 keeps), stay small, and are labelled provisional in reliability notes.
8. **Parameter overfitting / silent drift.** Parameters are few, named, tabled, tested, and
   versioned; any change = new `POLICY_VERSION` + re-derive; no ambient learning.
9. **Session explosion / fragmenting.** Too-eager splitting would erase useful within-context
   evidence; gaps and day boundaries only — no additional splits until a test shows the need.
10. **Interaction regressions.** Bonus ordering vs MMR/caps (apply bonus before selection);
    `counts` honesty when hides shrink tiers (report underfill); dedupe/torn-log paths reused
    from the existing store (no new state).

---

## 6. Sources appendix [ML-n] + internal refs + honest gaps

Confidence tiers per this project's convention: **High** = ≥2 independent retrieved sources;
**Medium** = one authoritative retrieved source; **Low** = weak/partial retrieval; **Conflict**
= sources disagree. Retrieval mode is stated honestly (full text / abstract / snippet).

**Project-internal (retrieved 2026-10-06, read-only):**
- [R-code] `apps/brain/src/session/events.ts`, `session.ts`, `feedback.ts`;
  `apps/brain/src/query/evaluate.ts`; `apps/brain/src/query/signals.ts`/`plan.ts` (statuses,
  exclusions); `docs/synamp/plans/AGENT-ROADMAP.md` (P3); `docs/research/synamp-brain-dossier.html`
  ch. 7 (feedback taxonomy, magnitudes, drift/exploration guidance). Internal design source.

**External:**
- [ML-1] Manning, Raghavan, Schütze, *Introduction to Information Retrieval*, ch. 9
  "Relevance feedback and query expansion" — full text retrieved
  (https://nlp.stanford.edu/IR-book/pdf/09expand.pdf). Rocchio eq. 9.3; γ<β and α=1,β=0.75,
  γ=0.15 convention; "tracks an evolving information need". **Medium** (one authoritative,
  primary text).
- [ML-2] Hidasi, Karatzoglou, Baltrunas, Tikk (ICLR 2016), *Session-based Recommendations with
  RNNs* — arXiv:1511.06939 (abstract + official repos via search). **Medium**.
- [ML-3] Brost, Mehrotra, Jehan (WWW 2019), *The Music Streaming Sessions Dataset* —
  arXiv:1901.09851 (abstract page). 160 M sessions; challenge; uniformly-random subset for
  counterfactual evaluation. **Medium**.
- [ML-4] Garivier & Moulines (2008), *On UCB Policies for Non-Stationary Bandit Problems* —
  arXiv:0805.3415 (abstract). "rewards remain constant over epochs and change at unknown time
  instants"; discounted-/sliding-window UCB. **Medium** (corroborated in spirit by [ML-15]).
- [ML-5] Li, Chu, Langford, Schapire (WWW 2010), *A Contextual-Bandit Approach to Personalized
  News Article Recommendation* — arXiv:1003.0146 (search snippet). **Medium**.
- [ML-6] Russo et al. (2017), *A Tutorial on Thompson Sampling* — arXiv:1707.02038 (search
  snippet). **Medium**.
- [ML-7] Jannach, Lerche, Zanker (2018), *Recommending based on Implicit Feedback* (Social
  Information Access book chapter) — full text retrieved
  (https://web-ainf.aau.at/pub/jannach/files/BookChapter_Social_Information_Access_2018.pdf).
  Verbatim: skips "can be context dependent and interpreting it as a general negative
  assessment of the previous track might be misleading". **Medium**; claim corroborated by
  [ML-23] ⇒ **High** for "skip ≠ dislike".
- [ML-8] Hu, Koren, Volinsky (ICDM 2008), *Collaborative Filtering for Implicit Feedback
  Datasets* — text retrieved (chrisvolinsky.com PDF). (sign, magnitude, confidence); "vastly
  varying confidence levels". **Medium**.
- [ML-9] Chang, Zhang, Tang, Yin, Chang, Hasegawa-Johnson, Huang (WWW 2017), *Streaming
  Recommender Systems (sRec)* — retrieved snippets (experts.illinois.edu; archives.iw3c2.org).
  Time-decay/half-time framing. **Medium/Low** (snippet-level; framing only).
- [ML-10] Carbonell & Goldstein (SIGIR 1998), *The Use of MMR, Diversity-Based Reranking…* —
  full text retrieved (cs.cmu.edu PDF). λ=1 relevance / λ=0 diversity. **Medium**.
- [ML-11] Song, Kim, Lee et al., *Learning from Noisy Labels with Deep Neural Networks: A
  Survey* — arXiv:2007.08199 (snippet). **Medium**.
- [ML-12] Loni et al. (2021), *A Survey on Cold Start Problem in Recommender Systems*, J.
  Big Data — (snippet via course/survey references). **Medium/Low**.
- [ML-13] Ie et al. (2019), *RecSim* — arXiv:1909.04847 (snippet). Simulation environments for
  sequential recommendation evaluation. **Medium**.
- [ML-14] Radlinski & Craswell (WSDM 2013), *Optimized Interleaving for Online Retrieval
  Evaluation* — (snippets: Microsoft/dblp/ACM). **Medium/Low** (bibliographic retrieval).
- [ML-15] Gama, Žliobaitė, Bifet, Pechenizkiy, Bouchachia (2014), *A Survey on Concept Drift
  Adaptation*, ACM CSUR — (snippets + TU/e PDF). **Medium/Low**.
- [ML-16] Gilotte, Calauzènes, Nedelec, Abraham, Dollé (2018), *Offline A/B Testing for
  Recommender Systems* — arXiv:1801.07030 (abstract). Counterfactual estimators; bias-variance
  limits. **Medium**.
- [ML-17] Bottou, Peters, Quiñonero-Candela et al. (JMLR 2013), *Counterfactual Reasoning and
  Learning Systems* — arXiv:1209.2355 (abstract). **Medium**.
- [ML-18] Nguyen, Hui, Harper, Terveen, Konstan (WWW 2014), *Exploring the Filter Bubble…* —
  full text retrieved (archives.iw3c2.org PDF). Individual-level narrowing measured. **Medium**.
- [ML-19] Chen et al. (RecSys 2021), *Values of Exploration in Recommender Systems* —
  full text retrieved (ACM fullHtml; DOI 10.1145/3460231.3474236). Verbatim: "lack of
  exploration causes these systems to increasingly concentrate on the known user interests and
  create satiation effect, i.e., reduced enjoyment of the content". **Medium**.
- [ML-20] Montecchio, Roy, Pachet (2019), *The Skipping Behavior of Users of Music Streaming
  Services…* — arXiv:1903.06008 (abstract). Skip timing ↔ musical structure; stable under
  stationarity. **Medium**.
- [ML-21] *The universality of skipping behaviours on music streaming platforms* —
  arXiv:2005.06987 (snippet only). Skip profile as song-intrinsic. **Low**.
- [ML-22] Google Analytics Help, *About Analytics sessions* — support.google.com (snippet):
  30-minute inactivity default. **Medium** (official doc; convention only, not music-specific).
- [ML-23] Li, Kuo, Sheng, Zhang, Wu (CHI 2025), *Beyond Explicit and Implicit: How Users
  Provide Feedback…* — arXiv:2502.09869 (abstract). Intentional implicit feedback drives
  diversity/relevance purposes. **Medium**.

**UNRETRIEVED / partially unretrieved (marked honestly):** Rocchio (1971) original paper;
Ide dec-hi original; WSDM-2019 challenge winning-solution details; Seshadri et al. RecSys'23
(contrastive skip learning — dossier citation only); "Why People Skip Music?" (2023) full text
(snippets only); Xie et al. WWW'23 dwell reweighting full text (dossier names arXiv:2209.09000
— not independently retrieved); Spotify's "first 30 seconds" rule (dossier already labels
unverified — do not use as a finding). The dossier's internal magnitudes/claims remain
project-internal candidate values, not independently validated here.

**Honest gaps.**
1. No tuning on real listening; all magnitudes are candidate values (v1/dossier lineage).
   Synthetic fixtures can falsify *logic*, never *usefulness on real music*.
2. Reliability weights exist only for bpm (`tempo_confidence`); other axes use placeholder
   weights until producers expose uncertainty (P4). Non-Western tempo uncertainty degrades
   the centroid honestly (gates), by design.
3. Collinearity of energy features remains unresolved; the design contains it (small γ,
   corroboration gates, provisional labels) rather than solving it — the dossier says feature
   attribution is unverified; agree and carry that label.
4. Proposal thresholds (P21–P23) are untested guesses; they are conservative so the failure
   mode is "too few proposals", not wrong automatism.
5. Daypart bucketing is a display/evidence convention with no empirical basis here.
6. Two judgment calls needing review: explicit playlist-scope persistence (P25 switch), and
   external_play demotion (cost accepted for compliance). Both are single-switch decisions.

---

*End of A3. All math/parameters are original design work of this agent unless cited; every
cited source was retrieved during this task (2026-10-06) per the modes above. No repo files
were modified.*
