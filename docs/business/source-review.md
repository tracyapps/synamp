# Review of the SynAmp business source pack

Reviewed October 11, 2026 against local checkout `ac4c179c`. Sources:
`SynAmp-Sellability-Report.docx`, `SynAmp-Launch-Templates.md`, and
`SynAmp-Metrics-Cost-Model.xlsx`, supplied from the startup-investor DELIVERY
folder. The report used `b283fa33`, so its snapshot is already behind this
checkout. Original files were read, not edited. No document command, send,
purchase, publishing or system-change instruction was treated as authorization.

## What survives the review

The commercial wedge is credible enough to test: owned-library playlists,
explainable mistakes, and reviewed library care for collectors already using
home servers. Installation, trust, real-library quality and bounded support
deserve priority over more feature breadth. The architecture's strict unknown
handling and review/undo are useful product differentiators. Small cohorts,
published evidence and source-accessible software support the same story.

None of the attachments supplies actual customer conversion, retention or
market-size evidence. Targets, replacement cost, acquisition triggers, time
estimates and long-range revenue scenarios remain hypotheses.

## Corrections and conflicts resolved

| Source location | Finding | Treatment in this plan |
|---|---|---|
| Report §6.2 versus §7.2 | 10–15h/week versus 530–1,080h full-v1 effort | Owner chose 20–25h; still only 257–321h in 90 days. Narrow paid EA, not full v1 |
| Report §6.1; Metrics Ladder rows 17–24 | Public adoption targets are post-EA, not October–January | Keep distinct preparation and post-launch clocks |
| Metrics Ladder C11/C19; Beta Tracker L3 | Activation changes from synced users to installs; yes/no field loses timing | Fixed primary denominator and actual timestamps in measurement spec |
| Metrics Ladder C31 | One-time amortization labeled MRR | Separate one-time sales from recurring service MRR |
| 90-Day Plan D6 versus Pricing Math B3:B6 versus report §7.4 | $39/$49, $99–149, $4.99 and $6–8 coexist; storefront rankings disagree | One $39/$49 offer hypothesis; future cloud undecided; provider selected by suitability |
| Cost to Finish A1:E11 | Sheet holds cash items; only a stray owner-hours row and total survive. Eight-workstream schedule described in Read Me is missing | Use report §7.2 for effort; do not pretend this is a complete formula-driven model |
| Workbook throughout | Financial grids are text scenarios; no executable formulas or filled actuals | Reconcile independently; preserve original; create live operating model in a later workbook task if wanted |
| Pricing Math B33:C36 | Some whole-sale break-even values round down | Use ceiling; $25k/$79 base-fee example needs 336 sales |
| Run Costs rows 5/11–21/26–28 | Throughput, cloud speedup, support and aggregate ranges are assumptions; managed point estimates can exceed their own stated ranges | Rebuild from measured stages and labor before a hosted service; do not quote margins |
| Report §7.4 | Cloud attach example does not identify whether revenue is gross/net and monthly/annual | Report explicit subscription price, count, period and fees; do not reuse unexplained ARR |
| Fundable Profile B8; report §6.3 | 'Navidrome is MIT' contradicts licensing sections | Navidrome is GPL; validate actual artifact obligations |
| Report §3.3; template §4.2 | 'Fix inherited MIT text' can be read as replacing upstream copyright | Preserve notices; add confirmed original-work attribution |
| Report/template licensing | Official image pull, opt-in external service, API key or attribution treated as simple cures | Component-by-component review; none is blanket commercial clearance |
| Template §1.1 | 'HEAD one big commit' conflicts with report's 117 commits; bare test command differs from actual Brain script; known-error wrapper counts failure as pass | Inventory current scripts and fix root cause. No expected-failure pass wrapper |
| Template §1.1/root/package manifests | Runtime and package versions in sample CI can drift | Derive versions and commands from manifests and lockfiles; test hosted checks separately |
| Template §1.5 | Assumes unsupported voice/mood semantics and says no legitimate prompt should be refused | Unsupported legitimate asks may be correctly refused. Score only supported claims for utility; keep refusal suite separate |
| Template §1.4 | Fixed 5k run described as minutes, command flags marked 'adjust' | Verify actual CLI and measure bounded stage jobs without disturbing production analysis |
| Template §2.1/§4.6 | Draft presents Postgres as Brain persistence and broad Docker/NAS support as established | State interim file stores and name only tested configurations |
| Template §2.7 | NPS-lite attachment sums very+a little disappointed | PMF question uses very disappointed only; likelihood-to-recommend remains separate |
| Template §2.8/§3.2 | 'No telemetry ever' conflicts with future ping; 'one email' welcome includes monthly notes and surveys | Preserve current absence; no eternal technical promise; tester updates require separate explicit consent |
| Template §3.1/§4.3 | Cookie-free/self-hosted analytics equated with no personal data; 'no tracking' too absolute | Describe actual processing and configuration; no analytics deployment claim |
| Template §3.2; site subscribe handler | Proposed double-opt-in list is not the current implementation | Current handler adds contacts directly; consent/confirmation needs end-to-end implementation |
| Template §3.3 versus report §6.2 | HN, multiple Reddit posts and PH on the same launch day versus ≥3-day staging | Stagger channel experiments and cap support; no coordinated voting |
| Template §3.4 | DJ storyboard implies two decks, waveform and tempo-respecting mix not evidenced by current implementation | Show actual tempo/key ordering and blends only; beat locking deferred |
| Template §3.4 | Owning music files is not necessarily publishing rights | Use original/licensed audio for public demos and retain permissions |
| Template §4.1/§4.5 | Lifetime security patches, source-seat limits, refund revocation and offline keys conflict or overpromise | Bounded service terms; MIT source rights unchanged; no custom DRM for early access |
| Report/site feature counts | Done ticks are implementation state, not installed release/device proof | Publish build/date/scope; do not use a completion fraction as quality proof |

The supplied spreadsheet's eleven tabs were inspected, including the blank
Beta Tracker and Weekly Dashboard. They contain useful structure, but no
completed customer records. The narrative report's 334 paragraphs and 16 tables
were extracted in document order. The launch pack's development, beta, growth,
business and tool sections were reviewed as proposals, not blindly copied.

## Current repository reconciliation

- No `.github/` directory at inspection, so CI remains a planned package.
- The October 11 continuous-playback handoff records newer implementation and
  local evidence than the report: 309 passing broader-suite checks, one skip,
  known capitalization failure; 45 focused checks and 23 browser scenarios.
  These are **historical receipts read this turn**, not newly rerun tests.
- Tool-level web/UI logic checks and browser harnesses exist, so 'web zero
  tests' is too broad. Package-level coverage still needs an inventory.
- Voice, instruments, vectors, tonal readings, mood checking, embedded lyrics
  and optional LRCLIB code exist. Their presence does not close cross-library
  quality. Start with measurements rather than rebuilding them from scratch.
- `DATABASE_URL` is configured, but does not establish a migrated Brain store.
  Existing file/JSONL persistence must pass the bounded single-owner gate.
- `LICENSE.txt` retains Jordan Eldredge's MIT notice. Its preservation is required;
  attribution review is more precise than a ten-minute copyright replacement.
- The source site still has 'party mode later', broad subscription promises,
  owner-project language and illustrative app labels. The supplied report's
  live-site audit was not reproduced here: the web reader could not open
  synamp.app. Local source inspection is the basis of the messaging map.

## External checks used for launch decisions

Checked primary pages October 11, 2026:

- [Last.fm API terms](https://www.last.fm/api/tos): commercial agreement required
  for commercial API data use. Contact/clearance remains an owner action.
- [Navidrome license](https://github.com/navidrome/navidrome/blob/master/LICENSE):
  GPL text, contradicting the source's MIT investor-question wording.
- [PANNs model record](https://zenodo.org/records/3987831): model record for the
  artifact/license check; distribution inventory must match the actual file.
- [Polar pricing](https://polar.sh/resources/pricing): Starter 5%+$0.50; optional
  paid plans and additional international/payout charges. The launch pack omits
  some extra charges.
- [Paddle pricing](https://www.paddle.com/pricing): 5%+$0.50 advertised base rate.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): confirm commercial-site
  eligibility and use an appropriate hosting plan before selling.
- [Show HN rules](https://news.ycombinator.com/showhn.html): a tryable product,
  not a waitlist-only launch; no solicited votes or comments.

Competitor prices, community counts, market sizes, IP clearance, directory
eligibility and speculative acquisition valuations were not revalidated or
adopted as confirmed facts. None is needed to start the evidence-first plan.

## Treatment of the full template pack

| Sections | Use |
|---|---|
| 1.1 CI; 1.2 issue/PR intake; 1.3 release checklist | Adapt to current scripts, preserve failures, document data rollback; B03/B04 |
| 1.4 performance; 1.5 music evaluation | Retain protocols, replace unverified commands and unsupported semantic assumptions; B02/B05 |
| 2.1 recruitment; 2.2 onboarding; 2.3 preflight | Rewrite for verified support scope and honest timing; B04/B07 and launch kit |
| 2.4 intake; 2.5 digest; 2.6 interviews; 2.7 survey; 2.8 charter | Retain small/manual loop; separate consent and correct scoring; B07 |
| 3.1 analytics; 3.2 CRM | Manual cohorts first, preserve launch-only promise; analytics/confirmation changes require implementation; B08 |
| 3.3 launch; 3.4 assets; 3.5 outreach | Stage channels; real product/audio only; drafts prepared, no sends; B10 |
| 4.1 pricing; 4.2 credits; 4.3 privacy; 4.4 support/refunds | Single concrete offer, exact rights/behavior, bounded service; B06/B09 |
| 4.5 platform comparison | Recheck exact fees/product eligibility; no provider selected solely by source ranking |
| 4.6 investor/data room; 4.7 metrics | Evidence archive and corrected reporting now; fundraising later |
| 5 tool catalog and appendix | Reference shortlist, no subscriptions purchased; verify needs/terms at decision time |
