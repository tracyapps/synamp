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

## Phase 0 scope

This is a shell, not the library UI. It renders a header and probes the brain so
the wiring is proven before real features land.

## Design tokens

`src/styles/tokens.css` holds the shared palette and type stack (one accent —
LCD amber — everything else is neutral). Keep it in sync with the roadmap
artifact's palette.
