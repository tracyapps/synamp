# synamp.app

The SynAmp website: home, roadmap, help centre, contact, early access, the app
tour and the design system. Plain HTML, CSS and a little JavaScript, built by
one small Node script with no dependencies.

```
site/
  src/                 the pages (plain HTML) and assets/ (CSS, JS, images)
    partials/          shared pieces: head, header, footer, the sign-up popup
  content/roadmap.md   the roadmap — the roadmap page, the homepage strip and
                       the early-access status card are all built from this
  api/                 the two form endpoints (early access, contact)
  build.mjs            builds everything into dist/
  vercel.json          how Vercel builds and serves it
  tests/               checks for the roadmap and the forms
```

## Work on it

```sh
cd site
node build.mjs --serve      # http://localhost:4321, rebuilds when you save
node --test tests/*.test.mjs
```

Pages are ordinary HTML. A shared piece is pulled in with a comment:

```html
<!-- include:header active="roadmap" over="gradient" -->
```

`active` underlines that item in the menu (`home`, `roadmap`, `app`, `help`,
`contact`). Links are written without `.html` (`/roadmap`, `/help`) — Vercel
serves them that way, and so does the local preview.

Locally the forms don't send anything; the terminal prints what would have
been sent.

## The roadmap updates itself

Edit `content/roadmap.md` — tick an item (`- [x]`), mark one as under way
(`- [~]`), or add a line to **Recently shipped**. Push to `main`, and Vercel
rebuilds the site. Each phase's badge (Done / In progress / Next / Planned) and
the counts work themselves out from the ticks. Write it for listeners, not
developers.

Vercel only rebuilds when something in `site/` changed (see `ignoreCommand` in
`vercel.json`), so app-only commits don't use up builds.

## Put it online (one time)

### 1. Vercel project

1. vercel.com → **Add New… → Project** → import **tracyapps/synamp**.
2. **Root Directory:** `site`. **Framework Preset:** Other. Leave the build
   settings alone — `vercel.json` sets them (build `node build.mjs`, output
   `dist`, nothing to install).
3. **Deploy.** You get a `*.vercel.app` address to check before the domain.
4. Settings → **Git** → Production Branch: `main`. Other branches get their
   own preview addresses automatically.

### 2. Make the forms send email (Resend)

The early-access and contact forms email each submission to you. Nothing is
stored on the site.

1. Make a free account at resend.com with the inbox you want submissions in.
2. Resend → **API Keys** → create one (sending access is enough).
3. Vercel project → Settings → **Environment Variables** (Production and
   Preview):

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | the key from step 2 |
   | `NOTIFY_EMAIL` | your inbox (the same address as your Resend account, for now) |

4. Redeploy (Deployments → ⋯ → Redeploy) so the functions pick them up.
5. Try both forms on the live site.

Until you verify a domain in Resend, emails come from `onboarding@resend.dev`
and can only go to your own Resend address — which is exactly what these
notification emails need. Pressing **Reply** answers the person directly.

Optional, later:

- **`RESEND_AUDIENCE_ID`** — make an Audience in Resend and add its ID; every
  early-access signup is also added there, so you can send the one "it's ready"
  email from Resend when the time comes.
- **Verify `synamp.app` in Resend** (it gives you a few DNS records), then set
  `MAIL_FROM` to e.g. `SynAmp <hello@synamp.app>`.
- **Receive mail at hello@synamp.app** — most registrars offer free email
  forwarding; point it at your inbox.

### 3. Point synamp.app at Vercel

1. Vercel project → Settings → **Domains** → add `synamp.app`, then
   `www.synamp.app` (let Vercel redirect `www` to the bare domain).
2. Vercel shows the DNS records to add. At your registrar, usually:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |

   Use whatever Vercel shows if it differs. Remove any old A/AAAA/CNAME records
   for `@` and `www` that point elsewhere.
3. Wait for Vercel to show **Valid Configuration** (minutes to an hour). The
   HTTPS certificate is automatic — `.app` domains only work over HTTPS, so the
   site won't load before that finishes.

## Notes

- Fonts come from Google Fonts. Everything else is served from the site.
- No analytics or cookies. Vercel Web Analytics (cookie-free) can be switched
  on in the dashboard if you ever want visitor counts.
- The hero's music is made live in the browser (Web Audio) — no audio files.
  The loops are written as step patterns at the top of
  `src/assets/visualizer.js`; change a pattern, save, and listen.
- `og.png` is the picture link previews use (Facebook, Messages, Slack). It's
  1200×630.
