# SynAmp measurement and economics

Working definitions for the October 11–January 9 plan. Actual customer and
financial values are **unknown** until collected. This file resolves conflicting
definitions in the supplied workbook without modifying it.

## Count the funnel once

| Metric | Numerator and denominator | Observation and source |
|---|---|---|
| Qualified waitlist | Unique consenting contacts meeting the currently supported setup; also report total contacts | Record requirements and consent version; contact registry, not 'NAS' alone |
| Invite acceptance | Accepted invitations / delivered eligible invitations | Seven days after invite; missing answers reported |
| Independent install success | Completed unassisted installs / all eligible cold-install attempts | Seven days per attempt; failures and abandoned attempts remain; assisted recoveries separate |
| First sync | Installs with ≥100 tracks scanned / completed installs | Record timestamp and coverage; not the activation denominator |
| Primary activation | Completed installs that generated a supported smart playlist and played ≥10 minutes within 72h / completed installs aged ≥72h | Clock starts at install completion; analysis wait counts; manual check-in with dates |
| End-to-end first value | Eligible install attempts achieving activation / eligible attempts aged through the install and activation windows | Shows install failures excluded from the primary activation denominator |
| Sync-to-activation diagnostic | Activated synced installs / synced installs aged through 72h after install | Label separately; never use this higher rate as primary activation |
| Time to first value | Active setup minutes plus separately reported elapsed hours to first smart-playlist play | Stopwatch and actual timestamps; report median, p90 and n |
| Weekly-active household | One consenting installation with ≥10 minutes listening OR ≥1 meaningful Brain interaction in trailing seven days | Self-report for respondents only; two devices using one install count once |
| W4 retention | Activated users active at least once on days 22–28 / all activated users whose entire day-28 window is complete | Relative to activation, day 1 = activation day; show missing follow-up; no immature users in denominator |
| Blocker incidence | Unique cohort users affected by supported-path S1/S2 / eligible cohort users in that period | Count people, not tickets; report open S1/S2 separately |
| Paid conversion | Unique non-complimentary 30-day-active households that buy within 60 days of pricing exposure / eligible 30-day-active households exposed to the same offer | Track cohort, offer/version, exposure date and maturity; preliminary 4-week results labeled provisional |
| Offer take-up diagnostic | Buyers / activated eligible households explicitly shown a specific offer | Useful early; not the workbook's mature 60-day conversion metric |
| Referral/channel yield | Activated households attributed to the source / eligible source-attributed attempts | Ask 'how did you hear'; allow unknown and multiple exposures |
| Support load | Owner support minutes per active household-week and total hours per week | Include setup calls, triage and follow-ups; cap total at 5h/week |
| PMF survey | 'Very disappointed' responses / all survey responses | Do not add 'a little disappointed'; publish sample and response rate |

Manual participation is voluntary. Record `unknown`, never zero, for missing
reports. For W4 show confirmed retained / all matured, response coverage and
retained / respondents. Example: 6 retained of 10 matured, 2 nonresponses = 60%
confirmed and 75% among 8 respondents; neither establishes population retention.
The ≥50% operational gate uses confirmed retained / all matured, with unknowns
explicitly present. Do not extrapolate opt-in users to the full install base.

Downloads, Docker pulls, stars, clicks and testimonials do not count as unique
installed households. Website analytics cannot measure offline activation or
retention. Cookie-free does not imply no personal data or no tracking. Begin
with manual cohorts and server-side form success counts; decide any aggregate
site analytics after reviewing configuration, data flows and disclosure. Product
telemetry remains absent; a default-off instance ping is a separate future
design requiring explicit consent, minimization and deletion behavior.

## The private operating record

Keep tester contact and library details outside the public repo. One record per
household: random tester ID, wave/source, consent timestamps/version, supported
hardware/OS, size bucket/formats, attempt/completion/first-sync/activation dates,
assistance minutes, stage coverage, weekly active reply, response state, issue
IDs/severity, offer exposure/version, purchase/refund status and publication
permission. Avoid library titles, paths, IPs and listening history unless needed
for an explicitly volunteered report. Define retention/deletion periods before
collecting. The original Beta Tracker is a starting skeleton; add real dates
instead of a yes/no '≤72h' flag.

Every Monday, spend 30 minutes reviewing the funnel and time budget, then take
one action: repair first value, repair install, reduce support friction, or widen
the next five-person batch. Report activated/installed/attempted with counts,
mature W4, open blockers, support hours, actual sales/refunds and source. On a
Friday, close feedback loops and decide the next candidate release. No scheduled
automation or outgoing messages are created by this plan.

## One-time revenue and actual recurring revenue

The owner selected one-time purchase plus optional cloud later. Recommended
test offer: $39 launch and $49 standard for a clearly described Home convenience
and setup-support package; MIT source remains available. No Household tier is
offered while identity and multi-user behavior remain single-owner. Future cloud
pricing is undecided and cloud development is outside this quarter.

The workbook's `Metrics Ladder!C31` combines 'monthly recurring + one-time
amortized'. Replace that definition in future reporting. **One-time purchases
are sales, never MRR.** Report gross sales, refunds, transaction fees, net cash,
support cost and actual recurring service MRR as separate values. With no live
subscription product, recurring MRR is $0 even if one-time sales are healthy.

Illustrative math at a base fee of 5% + $0.50 per transaction:

| Price | Base net per sale | 10 sales net | 25 sales net | 50 sales net |
|---|---:|---:|---:|---:|
| $39 launch | $36.55 | $365.50 | $913.75 | $1,827.50 |
| $49 standard | $46.05 | $460.50 | $1,151.25 | $2,302.50 |

`base net = price × 0.95 − 0.50`. These are contribution receipts before taxes,
international/payout fees, refunds, disputes, hosting and owner support time.
Current primary pricing sources: [Polar](https://polar.sh/resources/pricing)
and [Paddle](https://www.paddle.com/pricing), checked October 11, 2026. Polar's
published extra international-card and payout fees mean its base rate is not
the total cost. Confirm the chosen provider's eligibility and terms before sale.

The report's $25k annual economic-cost example needs **543 $49 sales** or
**336 $79 sales**, rounding up after the same base fee. For $6k it needs 131/81;
for $15k 326/202; for $40k 869/537. These correct approximate rounded-down values
in `Pricing Math!B33:C36`. They do not establish an appropriate price or a $25k
budget. In fact, 20–25 hours/week at $100/hour is $104k–130k/year in owner time,
before cash costs. Full economic profitability requires a different analysis
from cash sustainability.

Illustrative optional cloud only: at $4.99/month, 101 subscribers produce at
least $500 gross MRR; 401 produce at least $2k; 2,005 produce at least $10k.
Annual $49 subscriptions normalize to $4.0833 MRR per active customer. Costs and
fees reduce contribution, not gross MRR. These are arithmetic examples, not
prices approved for a future service. Do not build cloud to satisfy a metric.

## Support changes the price decision

At $49, base net $46.05 less one hour of support valued at $50 leaves **−$3.95**
before other costs. At 30 minutes it leaves $21.05; at 15 minutes $33.55. At the
launch price, one hour leaves −$13.45. The reason to fund installation work is
commercial as well as humane: reduce effort per supported customer or bound the
included service. Lifetime support at a one-time price is not the current offer.

Run Costs' '$0 support below 100 households' describes no external cash payroll,
not no cost. Measure labor from the first tester. Similarly, NAS electricity is
shared baseline consumption, not necessarily incremental SynAmp cost; the
unmeasured 62.5-hour analysis and cloud speedup assumptions remain scenarios.
Compute dollars do not prove workload throughput, device compatibility or rights.

## Cash policy and expansion decisions

Use free existing tools where fit; do not assume a paid tier or new community
stack is required. The source's $500–2k lean cash range is a planning range, not
an approved spend. Prioritize provider/name/license review and reliable releases
over ads. Confirm commercial hosting eligibility before a paid offer:
[Vercel Hobby documentation](https://vercel.com/docs/plans/hobby).

At the January review, use actual net cash and owner hours per cohort. If quality
passes but conversion is weak, test packaging and the value explanation with
five activated users. Below 1% on a mature, sufficiently observed cohort is a
reason to investigate, not automatic proof that price is wrong. Above 4% in a
tiny cohort is not investor readiness. Fundraising thresholds in the source are
illustrative and not a commitment from investors.
