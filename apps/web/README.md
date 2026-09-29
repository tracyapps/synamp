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

## Design tokens

`src/styles/tokens.css` holds the shared palette and type stack (one accent —
LCD amber — everything else is neutral). Keep it in sync with the roadmap
artifact's palette.
