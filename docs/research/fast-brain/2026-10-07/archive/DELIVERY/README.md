# SynAmp — “The Fast Learning Brain” · delivery package

One read order: **open the report → skim the agent brief → verify with the logs → apply or revert the patch.**

| Item | What it is |
|---|---|
| `SynAmp-Fast-Brain-Report.html` | The dossier. Single self-contained file — double-click to open in any browser. Cover, contents, five chapters + appendix, inline figures, sources with retrieval honesty, colophon. |
| `SynAmp-Fast-Brain-Report.pdf` | The same dossier as print/PDF (rendered headless from the HTML). |
| `code/PATCH.diff` | The complete change set: `git diff b6ea5ce1..66cbe4e8` (50 files, +7,869/−26). |
| `code/new-files/` | Browsable snapshot of every new file (brain `intent/`, `learning/`, sequencing, tests, web panel, docs, brain-lab harness). |
| `agent-instructions/AGENT-BRIEF-FAST-BRAIN.md` | Handoff for the next Music Psychologist / DS&ML / implementer: conventions, parameter map, operations, and the bias/safety/ethics checklist. |
| `report-kit/` | Chapter sources (markdown), figure SVGs + manifest, and the render pipeline (`render/build.py`, template, screenshot/PDF scripts) — rebuild the report with one command. |
| `verification/` | Logs, screenshots, review conclusions (`review.md` + C1–C4), `checksums.txt`. Start with `verification/README.md`. |

**Status:** verified slice on branch `feat/fast-learning-brain` (single commit `66cbe4e8`). All magnitudes are candidate values pending real-listening tuning; fixtures are synthetic and are not evidence about real music.

**Rebuild the report** (after editing any chapter source in `report-kit/sources/`):

```sh
cd report-kit && python3 render/build.py --out ../SynAmp-Fast-Brain-Report.html --exec sources/W6-exec-summary.md
```

**Apply / revert the change set:**

```sh
cd ~/_dev/web-apps/SynAmp
git apply /path/to/code/PATCH.diff     # or: git merge feat/fast-learning-brain
git reset --hard b6ea5ce1              # revert (on the branch) if already applied
```
