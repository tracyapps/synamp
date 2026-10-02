# @synamp/web

The SynAmp web front-end — library browsing, the playlist tree, queue, and later
the DJ and party views.

## Run it

```bash
pnpm install
pnpm --filter @synamp/brain dev     # terminal 1 — API on :3001
pnpm --filter @synamp/web dev       # terminal 2 — UI on :5173
```

Vite proxies `/api` and `/health` to the brain, so the browser stays same-origin.

## Playlist workshop

The first Phase 2 slice lets you create nested folders, manual playlists, and
live roll-ups. Tracks are entered by Subsonic ID until library search is wired
up. Select any node to inspect its resolved tracks. The view shows at most 200
rows for now; virtualized rendering comes with the full library browser.

## Smart playlists ("Describe what you want to hear")

Type a request such as *“I need to focus. no words, no piano, nothing too
slow/relaxing.”* and press **Preview**. The panel shows, in order:

1. **What I understood** — each phrase and the exact rule it became, plus any
   assumptions (“focus” is a proxy bundle) and asks it can't do yet.
2. **Matches** — tracks that pass every rule, each with a “Why it's here”
   disclosure built from measured values, and counts of what each rule excluded.
3. **Near misses** — a separate, collapsed tier of tracks that break exactly one
   rule narrowly or for lack of data. They are never mixed into the matches.

**Save as smart playlist** stores the rules, not the tracks; opening it later
re-evaluates against the current library. Parsing is a rule-based stand-in for
the planned local LLM and the bundled library is synthetic — see
`apps/brain/README.md`. Styles live in `src/styles/describe.css`.

## Design tokens

`src/styles/tokens.css` holds the shared palette and type stack (one accent —
LCD amber — everything else is neutral). Keep it in sync with the roadmap
artifact's palette.
