# SynAmp 90-day business and development roadmap

October 11, 2026–January 9, 2027. Owner capacity: 20–25 hours per week across
development, support and business work. Commercial direction: one-time purchase
with optional cloud services considered later.

> **Plan change, October 13, 2026:** the owner chose a simple install before
> testing with real people, and a 2027 launch. Dates below are replaced by
> [plan-2027-simple-install.md](plan-2027-simple-install.md); gates, the quality
> bar and the "no date moves a gate" rule still apply.

## Schedule check (October 12)

Building is **ahead**; proving it with real people has **not started** and is
now the critical path. By this plan's own retention rule, **Nov 24 is out of
reach**, **Dec 1 is at risk** (needs testers installing from Oct 19–25) and
**Dec 15 is realistic** if recruiting starts by Oct 26. Details, gate by gate:
[status-2026-10-12.md](status-2026-10-12.md). Update it at each Monday review.

## The outcome

By January 9, establish that people beyond the founder can install SynAmp, get
a useful playlist from their own music, return four weeks later, and pay for a
clear convenience and support offer. Pair that evidence with a repeatable
release process and one acquisition channel tested twice.

**The working paid early-access date is December 1. November 24 is the stretch
date if all gates pass.** Expand publicity in December only after a controlled
release. A public v1, a hosted service and investment readiness are separate
milestones. Faster code delivery cannot make a four-week cohort mature sooner.

Positioning: **Rediscover the music you own.** SynAmp adds explainable playlists
and reviewed library care to a self-hosted collection. Lead with the listening
job and trust, then explain the technology.

## What changes in the development order

1. Measure current real-library usefulness before adding more intelligence.
2. Start a narrow installation spike in week one, alongside quality work. The
   source report defers this until month two, despite identifying it as the
   longest dependency. Early discovery of install problems is worth the time.
3. Make the first useful result possible on a small, explicitly selected part
   of a library. Full analysis continues in the background. Do not require days
   of full-library analysis before first playback, and do not quietly substitute
   unmeasured songs into a strict playlist.
4. Make versioned installation, restore, upgrade and rollback reliable before
   packaging a paid convenience offer.
5. Run small cohorts while that work proceeds. Expand on evidence and support
   capacity, rather than on the calendar.
6. Capture real demonstrations from those same acceptance runs. Quality work
   supplies marketing evidence instead of generating a second production job.

The existing Phase 1 listening goal stays central. Current continuous smart
playback becomes a retention experiment, not a reason to add another feature.
See [the October 11 playback handoff](../synamp/plans/CONTINUOUS-PLAYBACK.md).

## The parallel schedule

Dates are review targets. Each row joins a business outcome to the development
needed to make it credible. IDs refer to the [execution backlog](execution-backlog.md).

| Window | Business and customer work | Development and verification | Decision |
|---|---|---|---|
| Oct 11–18 | Lock the collector/NAS audience, offer hypothesis and baseline metrics; prepare five tester places; inventory legal dependencies | B01 scope and evidence; B02 real-library prompt baseline; B03 CI inventory and root-cause work; B04 install spike; B06 rights inventory | G0: a small-library listening path works; unsupported claims removed from drafts; legal owners assigned |
| Oct 19–25 | First five supported testers; time setup and first playlist; record two real clips | B02 repair the weakest supported requests; B04 guided setup on one supported hardware combination; B05 snapshot/restore rehearsal; B07 intake and check-ins | G1: safe enough for supervised trials, at least five eligible attempts recorded; expand to ten only if capacity permits |
| Oct 26–Nov 8 | Complete a ten-person Wave 1; interview five people who struggled; test the $39 launch/$49 standard offer without taking payment | B03 required checks; B04 preflight, analysis progress and recovery; B02 readout of unknowns and shortages; B08 consent and messaging preparation | G2: at least ten completed installs aged 72h, activation ≥60%, affected users with blockers <20%; otherwise pause expansion |
| Nov 9–17 | Wave 2 in batches of five; collect evidence from ten real libraries including at least five non-friends; compare first and second recruitment batches | B04 at least ten cold-install attempts; version visibility and upgrade/rollback; B05 real-client/mobile/restart checks; B02 quality report | G3: ≥85% install success (at least 9/10), activation ≥60%, blockers <15%, zero open release-blocking S1/S2; demonstrate supported combinations |
| Nov 18–24 | Read the earliest mature W4 cohort; finalize offer, storefront suitability, purchase/refund terms and proof assets | B06 distribution/sales clearance; B09 sandbox payment/refund; reproducible release candidate and restore evidence | G4: full paid-release gate. Nov 24 invite-only paid EA is possible if it passes; otherwise continue toward Dec 1 |
| Nov 25–Dec 1 | Maintain support over the US holiday; working target: limited paid EA Dec 1, with invitations capped at available support | Freeze feature scope; resolve blockers; publishable quickstart, known issues, credits and build-specific quality report | Release only when G4 passes. If any gate is open, use Dec 15 or January; do not compensate with publicity |
| Dec 2–15 | Two small community moments at least three days apart; compare qualified installs and activation by source; target ten paid customers | B10 support fixes and reliable updates; support knowledge base; monitor reported failures and installation time | G5: evidence of manageable support and a second converting channel batch before broad promotion |
| Dec 16–Jan 9 | Follow up on mature cohorts, price objections and refunds; compile a bottom-up market memo and next-quarter decision | Durability work driven by observed failures; benchmark regression checks; stabilize the first paid release | G6: continue, narrow the offer, or pause expansion using the January scorecard |

Calendar note: the first users activated October 25 finish W4 (days 22–28) on
November 21. Users activated November 8 finish on December 5. If the early cohort
arrives late, the retention gate moves with it. November 24 is close to US
Thanksgiving on November 26: it is suitable only for a small supported release,
not a high-attention launch. Broad moments can target December 8–10, December
15–17, or January 5–7, subject to readiness and availability. Channel timing is
an experiment, not a universal best-time claim.

**Retention cutoff for acceleration:** November 24 requires at least ten users
activated by October 27 so their full W4 windows finish by November 23. December
1 requires ten activated by November 3, finishing by November 30. Gate reviews
can happen before their target dates: if G2 passes early, bring the next
five-person batch forward rather than waiting until November 9. At only 60%
activation, ten completed installs produce six activated users, so the mature
cohort target requires more early installs. If these cutoffs are missed, the
corresponding release target is no longer feasible under G4, even if the code
is ready. Do not relax the retention gate to preserve a date.

## Gates that replace date pressure

| Gate | Evidence required | If it fails |
|---|---|---|
| G0 Scope and baseline | Supported hardware named; first playback demonstrated; current quality/throughput measured; paths and outbound services inventoried | Reduce the initial supported scope and repair the first-listen path |
| G1 Supervised beta safety | Separate trial library or verified backup; writes optional; small apply/undo rehearsal; private feedback path; exact build recorded | Keep trials supervised and read-only until safety is demonstrated |
| G2 Wave 1 activation | ≥10 completed installs with a full 72h observation window; ≥6 activated; blocker incidence <20%; install failures retained in the funnel | Below 40% activation: two-week activation sprint and five new trials. At 40–59%: diagnose and retest; no automatic expansion |
| G3 Stranger install | ≥10 consecutive eligible cold attempts using public instructions, ≥85% succeed without live rescue; at least five non-friends; all attempts counted | If <70%, freeze recruitment. At 70–84%, fix install/docs and rerun a new batch; record assisted recovery separately |
| G4 Paid EA | G2/G3; quality gate below; ten real libraries reviewed; earliest mature W4 ≥50% with n≥10; no open S1/S2 blocking supported paths; distribution and sale checklist cleared; tested backup/restore, upgrade/rollback and purchase/refund; support time reserved | Free supported beta can continue. No paid release or blanket claims of readiness. If fewer than ten W4 users are mature, wait for the cohort rather than implying retention |
| G5 Broader launch | Stable release in actual use for ≥7 days; no S1; reported support fits ≤5h/week; two small channel batches evaluated; try-without-signup path available | Keep direct invitations, improve docs and narrow claims |
| G6 January review | Activation ≥60%, mature W4 ≥50%, ≥10 non-complimentary paid customers, refunds reported with n, repeated channel evidence and support ≤5h/week | Diagnose the weak stage; test the librarian-led offer if listening value remains weak; reconsider scope before price cuts |

**Quality gate, proposed for this supported scope:** freeze twelve requests,
including strict exclusions, similarity, corrections, unsupported requests and
continuous listening. Publish strict requested/returned counts, unknown coverage,
and the distinction between algorithm compliance and human judgment. Across ten
libraries, each with two raters, ≥80% of supported prompt/library pairs should
return a useful result (at least three tracks or the full eligible set when it
contains fewer) and receive ≥4/5 for fit. Log every applicable pair and all misses;
do not remove hard examples. No result may violate a known hard-rule condition in
the evaluation. Measure both code-level rule compliance and audible false
negatives such as missed vocals. Appropriate refusal is a pass for unsupported
requests, but it is not a successful supported playlist. Mood or voice-character
claims stay out of the paid promise until their own results qualify.

These are owner-selected operating thresholds, not market-standard benchmarks.
Nine successes in ten attempts clears an operational gate; it is still a tiny
sample. Publish n, hardware and assistance level with any percentage.

## Capacity and how acceleration works

Ninety days is 12.86 weeks, giving **257–321 owner-hours** at the chosen capacity.
The original full-v1 estimate of **530–1,080 hours** cannot fit: it would require
41–84 hours per week. AI assistance can help implementation; it cannot remove
rights clearance, independent installs, support or elapsed listening time.

This narrower plan budgets **252 hours**, including **32 hours of contingency**:

| Work | Hours | Budget discipline |
|---|---:|---|
| Real-library quality and CI | 34 | Improve supported requests; defer unproven producers |
| Guided install, releases and upgrade path | 48 | One supported combination first; no native NAS package |
| Safety, recovery and device verification | 20 | Copies/test libraries; keep production analyzer undisturbed |
| Tester support, interviews and follow-up | 60 | 15 concurrently active maximum; five-person intake batches |
| Messaging, clips and channel experiments | 26 | Two core clips + one overview; reuse verification captures |
| Measurement, offer tests and checkout | 20 | Manual cohorts first; use a hosted storefront; avoid custom DRM |
| Rights review and owner administration | 12 | Outside counsel/provider response time is additional and uncertain |
| Contingency | 32 | Do not spend this on features |
| Total | 252 | Planning estimate, not a quote |

Budget **128 hours of that total before paid EA**, including 16 hours of
contingency, and 124 hours after it. December 1 allows 7.29 weeks: about 18
hours/week for the pre-release budget, leaving room for variance at 20–25 hours.
November 24 allows 6.29 weeks: about 20.4 hours/week, making it plausible near the
upper end of capacity. These estimates assume existing code can be stabilized
without a major storage or security redesign. Re-estimate every Monday.

Use at most three active workstreams: (1) listening quality, (2) install and
release safety, (3) customers and messaging. These share the owner's time;
parallel lanes do not imply extra people. The critical path is:

`safe baseline → first users → independent installs + quality repairs → mature W4 + rights → paid candidate → controlled release → repeatable acquisition`.

## The January 9 scorecard

| Outcome | Committed learning target | Stretch outcome |
|---|---|---|
| Demand | 100 qualified waitlist members; source and eligibility known | 250+ qualified; 500 total |
| Tester evidence | 25–40 cumulative testers, ≤15 active at once; ten real-library evaluations | 50 cumulative if support remains ≤5h/week |
| Installation | ≥85% independent success on named supported combinations; ≥10 attempts | ≥90% on ≥20 attempts; second supported combination |
| First value | ≥60% install-to-activation within 72h; active setup median ≤30 min, elapsed wait also reported | ≥70%; median active setup ≤15 min |
| Return | W4 ≥50% among at least ten mature activated users | ≥55% with ≥20 mature users |
| Revenue | ≥10 paying customers, excluding gifts and tester rewards; exact delivery and support terms | 25–50 paying customers |
| Growth | One source recruited in two separate batches that each produced ≥3 activated installs | Two sources repeat; ≥5 permissioned quotes |
| Reliability | No open S1, no supported-path release-blocking S2; support ≤5h/week | Measured reduction in install/support minutes across releases |

These are revised owner-plan targets, not a promise to hit the source's entire
metrics ladder. **The source's 500 installs / 150 weekly-active households are
targets for 90 days after public EA**, not January 9. A December 1 launch puts
that checkpoint on March 1, 2027; November 24 puts it on February 22. Track the
source's 2–8% paid conversion over its full observation window. Ten early buyers
are evidence of demand, not proof of a stable conversion rate.

## Scope beyond this launch

Preserve the wider roadmap, but move these off the paid-EA critical path:
Postgres/pgvector migration, all-household identity, hosted cloud/relay, Linux and
Windows analyzers, signed companion distribution if the web/browser workflow is
sufficient, native phone apps, beat-locked DJ transitions, microtiming claims,
Galaxy expansion, advanced mood/lyric embeddings, broad NAS packaging, Discord
and Product Hunt. Any deferral becomes a release blocker if observed safety,
durability or the supported promise requires it.

Postgres is not permission to neglect durability: single-writer enforcement,
bounded storage, tested backup/restore and restart recovery must pass first. If
they do not, perform the necessary storage work and slip the date. Optional
cloud remains a future hypothesis requiring accounts, isolation, quotas,
metering, abuse controls, privacy terms and measured unit economics.

Fundraising and acquisition stay in the longer-range strategy. Use the quarter
to collect customer evidence, a bottom-up market memo and a measured channel.
Replacement cost, GitHub stars and a speculative buyer list are not valuation
or product-market fit.
