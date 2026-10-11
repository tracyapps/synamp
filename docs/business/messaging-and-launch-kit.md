# SynAmp messaging and launch kit

Working copy, October 11, 2026. Direction approved by the owner: one-time
purchase, with optional cloud services later. Pricing, service terms and public
claims below remain proposals until their evidence and offer are approved.
This is the source for the next copy sweep; it does not change the live site.

## The shared message

**Headline:** Rediscover the music you own.

**One sentence:** SynAmp helps you find what to play in your own music library,
see why songs were picked, and review changes before tidying your files.

**Audience:** People who collect music and already run a NAS or home server,
especially Navidrome/Subsonic users with large collections. First release:
one library owner, a named supported server setup, and a Mac for analysis.

**Commercial promise:** Run SynAmp on your own hardware without a subscription.
Buy the convenience and setup-support package once. Optional hosted services
may be offered separately later.

**Privacy:** Your audio analysis runs on your hardware. SynAmp does not send
product-usage telemetry to its developer. Optional metadata, lyrics, radio and
scrobbling services have their own external requests; explain what is sent
before enabling them. Email signup and support are separate data flows.

**Trust:** SynAmp proposes library-care changes for you to review. Approved
batches have undo with stated limits. Keep a backup before making changes.
It shows missing measurements and shortages instead of quietly weakening a rule.

Lead with discovery and care, then explain 'the Brain'. Avoid making 'AI' the
entire product category. Prefer 'works alongside Navidrome' over a replacement
claim until integration/setup supports an existing installation.

## Claims and release conditions

| Claim | Safe treatment now | What would allow a stronger claim |
|---|---|---|
| Real 46k-song library | 'Built and used on the founder’s collection of about 46,000 songs', labeled founder experience | Current dated census and real-build capture; never imply all tracks are analyzed or all testers have this scale |
| Natural-language playlists | Explainable requests using measured/tagged fields; show unsupported asks | Ten-library report passes supported-scope quality gate |
| Mood/instruments/no words | Coverage-dependent; mood calibration remains experimental | Producer and human-rated field evidence, including false negatives |
| Continuous smart playback | Present as beta; no claim of ideal variety | Workday listening, restart and cohort-return evidence |
| Undo | Reviewed library-care batches, within documented file-state/backup limits | Specific verified formats and recovery cases; never 'every possible change always reversible' |
| 100k songs | 'Benchmarked with a synthetic 100,000-song catalog' | Actual named-hardware field test for broader performance claim |
| DJ | Orders by tempo/key and blends | Real-device audio evidence; beat locking needs separate implementation |
| Native apps and remote playback | Compatible protocol; name tested apps/devices only | B05 actual Navidrome, cellular, locked-screen and control receipts |
| Open source | SynAmp source MIT; third-party components keep their licenses | Audited distribution inventory and published notices |
| Cloud | Future optional service, unavailable today | Separate scoped product and unit-economics/privacy readiness |

Never publish 'no data ever leaves', 'any Docker host works', 'perfect moods',
'beat-matched DJ', 'Postgres-backed Brain', 'lifetime security patches', or a new
test count unless the exact assertion has current evidence.

## Complete surface map for the next implementation

| Surface | Proposed copy or change | Dependency |
|---|---|---|
| `README.md` opening | 'SynAmp helps you rediscover and care for the music you own. It adds explainable playlists and reviewed library tools to a self-hosted collection, with playback through the web app and supported Subsonic clients.' Follow with current beta/setup limits | B01 |
| README stack/storage/license section | Separate configured Postgres from current Brain file stores; remove 'later party'; identify active DSP/model stack rather than suggesting validation-only Essentia is shipped | B01/B06 |
| Home title and description | 'SynAmp — rediscover the music you own'; description names self-hosted playlists, reviewed care and Mac analysis | B08 |
| Home hero lede | 'Describe what you want to hear from your own collection. See why each song fits, correct the picks, and tidy your library with changes you review first.' | B02 supported claims |
| Home audience strip | 'For collectors with a NAS or home server. First supported setup pairs your server with a Mac for analysis.' Add supported requirements link | B04 |
| Home primary CTA before G4 | 'Tell me when it’s ready' with 'One email when it’s ready to install. Nothing else.' | Preserve existing launch-only consent |
| Separate tester CTA | 'Help test SynAmp' with 'Small supported groups. Setup, two weeks of listening, and honest feedback.' | Separate opt-in implemented through API/contact metadata; slots actually available |
| Home founder proof | 'Built and used on a collection of about 46,000 songs.' Link dated current-build demonstration, clearly separate from browser demo | B01/B02 capture |
| Brain feature card | 'Ask for music in your own words and see why each song was picked. What SynAmp can match grows as your library is analyzed. Missing measurements stay visible.' | B02 |
| Device/party feature card | 'Play through the web app and supported Subsonic players. Party tools let guests request songs while you control the queue. Mac menu-bar controls are still being tested.' | Device claims bounded to B05 |
| Library-care feature card | 'Review suggested names and song details before applying a batch. Undo supported changes if you need to go back.' | B05 format/undo limits |
| DJ feature card | 'Line songs up by tempo and key, with crossfades you can adjust. Beat-locked mixing is future work.' | B05 |
| `/coming-soon` and signup dialog | 'SynAmp is in a small testing program. It is not a general release yet. Leave your email for one message when the supported install is ready.' Name Mac/server requirements | B07/B08 |
| Shared signup fields | Keep launch notification as the default purpose. Optional 'I’d like an invitation to test and tester check-ins' unchecked. Progress emails, if introduced, get their own unchecked consent | B08 end-to-end implementation |
| Signup API/notifications/list segments | Carry consent purpose/version/date and source consistently; do not move launch-only contacts into a digest audience. Do not claim double opt-in before implementation | B08 |
| `/thanks` | 'You’re on the launch list. One email when SynAmp is ready.' Primary link 'See what’s next'; show tester status only if actually persisted | B08 |
| `/help` funding FAQ | 'Self-hosting SynAmp does not require a subscription. The source is available under MIT. I’m testing a one-time convenience and support offer. Optional hosted services may come later; they would be separate.' | Offer remains a test until B09 |
| `/help` privacy guide | Replace exhaustive 'only things on internet' list with actual reviewed outbound-service inventory and links to exact controls | B01/B06/B08 |
| `/contact` | 'Questions about setup or testing? Include your build and what happened. Please remove tokens and personal paths. I’m the developer and I handle support myself.' Publish a response window only when staffed | B07 |
| Footer | 'SynAmp — independently built, with source available.' Add privacy/credits links when those pages exist | B06/B08 |
| `/app-preview` | Keep 'A design, not the running app'. Align labels/buttons to current generated loop catalog; remove inert controls from keyboard navigation. Add a separate real-build link | B08 |
| `/roadmap` and content source | Keep phase checks tied to implementation. Add listener-facing install/update/trust readiness outcomes as planned, with no public launch date and no internal revenue numbers | B04/B08; do not tick readiness as done |
| Proposed `/testing` | Who can test, current supported hardware, effort, known limits, privacy and private feedback route; no automatic entitlement promise | B07 |
| Proposed `/download` | Exact build, supported setup, active/background timing, quickstart, backup, upgrade/rollback and known issues | G4 |
| Proposed `/receipts` | Dated/build-specific quality and install reports with sample sizes, assistance level and failures | B02/B04 consented aggregates |
| Proposed `/pricing` and checkout | One Home offer; exact included deliverables, support window, price, refund path and future-cloud separation. Source remains available; no hidden renewals | B06/B09 approved terms |
| Proposed `/privacy` and `/credits`; app About | Actual data flows, contact/deletion route, model/component notices and running build identity | B06/B08 |
| Launch posts, emails, creator pitch and one-pager | Same audience, evidence limits, supported setup and commercial promise; no speculative valuation or MRR from one-time sales | G4/G5 |

The current generator includes seven browser loops; do not apply the report's
three-loop examples as if exhaustive. Read names and BPM from
`site/src/assets/visualizer.js`. Neuro-Funk is 100 BPM; Dendrite Dance is not in
the current catalog.

## Recruitment draft for a supported five-person batch

Use only when G1 passes and support places are available. Outreach is not sent
by this planning task.

> I’m looking for five people who already keep a music library on a home server
> to test SynAmp. It helps you find music in your own collection, explains its
> playlist picks, and lets you review library-care changes before applying them.
>
> This is a supported beta, not a finished installer. The current test setup is
> [verified server requirements] plus [verified Mac requirements]. Analysis runs
> on your Mac and can take substantial background time. I’d ask you to set it up,
> listen normally for two weeks, and tell me where it feels wrong or confusing.
>
> The source is available under MIT. There is no product-usage telemetry sent
> to me; I’ll only have the feedback you choose to share. File changes are
> optional. We’ll start with a trial copy or a verified backup.
>
> Setup and current limits: [quickstart]. If that fits, reply and I’ll send the
> testing details. You can leave whenever you like.

## Onboarding draft

Subject: Your SynAmp test build and first listening session

> Thanks for testing SynAmp. Here is your build: [version and link]. Start with
> [supported quickstart], which lists the hardware, backup and setup steps.
>
> First, get a small part of your library playing. Full analysis can continue
> afterward. The checklist separates hands-on setup from waiting. If you get
> stuck, stop there and tell me the step; please don’t spend an evening guessing.
>
> For the first session, try [supported request], listen for ten minutes, and
> tell me whether the picks fit. The 'why' view shows what was measured and what
> is missing. You do not need to try file changes to test playlists.
>
> If you choose to try Organise, use the backup step and a small batch first.
> Review it, apply it, and try Undo once. Supported formats and undo limits are
> listed in [known issues].
>
> Reply privately with anything broken or confusing. Include your build, the
> approximate time and what you expected. Remove tokens and personal paths
> from logs. Public issues are optional: [issue link].
>
> I’ll send testing check-ins because you opted into this program. I’ll ask
> separately before recording an interview, quoting you or publishing a capture.
> [Actual support hours and response expectation]. You can stop at any time.

## Weekly tester message and interview

Subject: SynAmp testing — [one concrete change]

> This week [verified change] fixes [reported problem]. Your next build is
> [version/link]; update instructions are [link]. Known issues: [short list].
>
> One question: did you use SynAmp to listen this week? If yes, what did you
> ask it for, and did you want to keep listening? If you couldn’t use it, the
> reason helps just as much. No need to send your library or listening history.

Interview five users after roughly two weeks: ask about the last time they
looked for music, what they used before, the first confusing moment, a wrong
playlist pick, trust before/after Undo, what they would miss, and what the actual
Home offer would replace. Show the real offer only after discussing their job.
Ask permission before recording. End with likelihood to recommend (0–10),
'very/a little/not disappointed if it disappeared', and one improvement.
Do not defend the product during the interview.

## Paid offer draft

**Home — $39 launch / $49 standard, proposed test.** A tested installation package,
documented updates and rollback, and 30 days of setup help on the supported
configuration. Best-effort weekday support within a published capacity. Exact
contents and maintenance period must be settled before this copy goes live.

DIY source remains available under MIT. Payment buys convenience and the stated
service, not permission to use MIT code. No recurring charge for this purchase.
Optional future hosted services would have their own price and choice. Do not
offer a second 'Household' tier or promise accounts/multiple listeners today.

Proposed refund language for approval: 'If the supported install doesn’t work
for you, contact [working support address]. We offer a refund within 14 days of
purchase under [published terms].' Review applicable consumer rights and
provider mechanics before adoption; do not claim a refund has happened until it
has. A refund does not revoke the user's MIT source rights.

## One promised launch email

Only to launch-consenting contacts, once G4 passes; link destination must be live.

Subject: SynAmp early access is ready for the supported setup

> I promised one email when SynAmp was ready to install. This is that email.
>
> Early access is open for [verified supported setup]. SynAmp helps you find
> what to play in your own collection and review changes before tidying it.
> Here is the actual build in use: [short demo].
>
> Start here: [download and quickstart]. You’ll need [server] and [Mac]. Active
> setup took [measured range, n] in our tests; full analysis takes longer in the
> background. Current limits and known issues are [link].
>
> The source is available under MIT. If you want the installation and setup-help
> package, it is [approved one-time price and terms]. Running SynAmp does not
> require a subscription. Optional hosted services may come separately later.
>
> What testing showed: [dated counts and limits, not a generic success claim].
> Questions or a rough first session? Reply to [working support route].
>
> This completes the launch notification you requested. [Unsubscribe or delete
> contact link]. Progress notes are a separate opt-in: [link, only if implemented].

## Community draft after the broader-launch gate

Title: Show HN: SynAmp — explainable playlists and reviewed care for your own music

> I’m the developer of SynAmp. I built it for a large collection of music on my
> home server: finding what to play, understanding the picks, and tidying files
> without handing over control.
>
> Try it: [no-signup source/download path and supported quickstart]. It works
> with [tested Navidrome/Subsonic setup]. Analysis currently needs [verified Mac
> requirements]. The source is MIT; the optional [approved package] costs
> [one-time price].
>
> Here is the real build: [demo]. Here is what [n] independent installs and
> [n] real-library tests showed, including failures: [receipts].
>
> What’s rough: [three actual limits]. Cloud hosting and beat-locked DJ mixing
> are not included. I’d especially like feedback on [one supported workflow].

For Navidrome communities, lead with the companion role and library discovery.
For music-collector communities, lead with reviewed care and listening. For
homelab communities, state the server/Mac split and install evidence. Check live
rules before posting. Stage submissions ≥3 days apart; no vote requests or
coordinated comments. Product Hunt is optional after support proves manageable.

Creator pitch, when separately authorized: 'I make SynAmp, which helps home
music collectors find what to play and review library-care changes. [One specific
reason it fits your audience]. Actual build: [demo]. Supported install and
limitations: [link]. Happy to provide a walkthrough if useful.' No mass sends.

## Demo and publication checklist

- Clip A, 45–60s: a real supported request, real collection, why a track matched,
  a correction and a visible shortage if applicable. State build and coverage.
- Clip B, 30–45s: a trial-library change preview, approval, file readback and
  Undo. State supported format and backup requirement.
- Overview, 60–90s: audience, those two jobs, setup requirement and next step.
  Party/DJ is an optional later clip after actual device/audio proof.
- Use original or licensed audio and consented/sanitized visuals. Owning a
  recording is not publishing permission. Keep music titles and private paths
  out of public footage unless explicitly approved.
- Label real build, illustrative mock and generated browser demo distinctly.
  Include captions, keyboard/focus checks, responsive review and reduced motion.
- Before publication, every factual sentence must have evidence or a clear
  future/experimental label. Pricing promises match checkout and support terms.

## Investor and partner narrative for later use

'SynAmp is testing a self-hosted music-discovery and library-care product for
collectors. Its early differentiation is explained results and reviewed file
changes. The source remains available; revenue experiments sell installation
convenience and support. Optional hosted services are future work. Current
evidence is [actual installs, mature retention, paid customers and source], with
[limits].'

Use this only after filling actual evidence. A partner one-pager can add a
supported-device demo and a bounded pilot proposal. Do not import the source's
speculative acquirer valuation, paid conversion, MRR, equity ask or market size
into external messaging as if established.
