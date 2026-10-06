# SynAmp — notes for coding agents

- The app: `apps/brain` (API + librarian), `apps/web` (web app), `services/analyzer` (Python, runs on the Mac). Docs and plans: `docs/synamp/`.
- The website: `site/` (synamp.app, deployed by Vercel from `main`). See `site/README.md`.
- **When a change ships something on the public roadmap, update `site/content/roadmap.md` in the same commit**: tick the item (`- [x]`), or mark it under way (`- [~]`), and add a line to "Recently shipped" (`- YYYY-MM-DD — what changed`). Write it for listeners, not developers. Pushing to `main` rebuilds the site.
- The owner wants plain language in anything user-facing, accessibility held to a high bar, and buttons in the app rather than commands.
