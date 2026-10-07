# Verification manifest — SynAmp “Fast Learning Brain” delivery

Frozen tree: branch **`feat/fast-learning-brain`** @ commit **`66cbe4e8`** (base `b6ea5ce1`), working tree clean at capture.
Captured: 2026-10-07 (America/Chicago). Everything below is reproducible from the repository state named here.

## Accepted evidence (this folder)

| File | What it proves |
|---|---|
| `final-capture.log` | Fresh post-commit capture: HEAD hash; brain suite **218 tests · 216 pass · 1 fail · 1 skip**; `@synamp/brain` + `@synamp/web` type-checks **exit 0**; brain-lab **8 scenarios · 86 checks · 0 fail · 5 skip**; clean tree. |
| `brain-suite-full.log` | Full runner output for the same suite run (the one red is the pre-existing macOS case-fold test). |
| `baseline/` | Pre-slice baseline (149 tests · 147 pass · 1 fail · 1 skip) and the type-check captures it was measured against. |
| `final-lab/` | Canonical brain-lab evidence: `lab.json`, determinism run 1/2 diff, CWD-run, `hashes.txt` (35 module fingerprints, `shasum -c` clean), `EVIDENCE.md`. |
| `route-smoke/` | Route-level smokes on scratch servers: auth on/off, epoch readout, forget, proposals validation, resolve; response JSONs; web screenshots (Describe interpretation, The Brain “This session”). |
| `h2/` | Post-fix smoke variants (hide-display split, copy fixes) with fresh runs. |
| `report-cover.png`, `report-exec.png`, `report-ch1.png` | Rendered screenshots of the finished dossier (visual acceptance). |
| `C1…C4-*.md` + `review.md` | Independent reviews (code correctness, bias/ethics, music psychology, production readiness) with full findings/repro steps; merged conclusions at the top of `review.md`. |
| `checksums.txt` | sha256 of every delivered artifact. |

## Reproduce (from the repo root)

```sh
pnpm --filter @synamp/brain test            # 218/216/1/1 (the red is pre-existing macOS APFS case-fold)
pnpm --filter @synamp/brain type-check      # exit 0
pnpm --filter @synamp/web type-check        # exit 0
node --experimental-strip-types tools/brain-lab/lab.mts        # 8 scenarios · 86 checks · exit 0
# route smokes (self-contained scratch dirs, port 3911): replay scripts in verification/route-smoke/
```

## Environment notes (carried, not hidden)

- **Carried reds:** the librarian case-fold test (passes on Linux CI; macOS APFS cannot rename to a case-variant) and the `/dev/shm` cross-disk skip — both pre-existing on `main`, untouched by this slice. The root `pnpm type-check` chain stops in the pre-broken vendored `packages/webamp` (pre-existing).
- **Dev sandbox:** `apps/brain/data/` (gitignored) holds the owner’s earlier dev playlists from 2026-10-01 plus the contained residue of one screenshot smoke (bookkeeping events + a 3-track queue of `sample-*` ids, policy `epoch-v1`). Left in place deliberately; to reset the sandbox, stop the brain and delete `events.jsonl` and `session.json` there.
- Stale dev servers on `:5173`/`:3001` seen during work belonged to the owner’s environment; nothing here depends on them.

## Rollback

- **Code:** the slice is one commit — `git reset --hard b6ea5ce1` on the branch (or check out `main`) reverts everything.
- **Runtime:** settings `listening_policy: "legacy-v1"` restores the pre-slice derivation live (no migration — re-derive); `POST /api/v1/brain/forget {"scope":"epoch"}` clears session learning via an append-only marker; proposals decisions live in `dataDir/brain-proposals.json`.
