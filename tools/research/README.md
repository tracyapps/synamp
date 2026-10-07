# Research library builder

`pnpm research:build` builds `docs/research/index.html` from `catalog.json`.
`pnpm research:check` rejects stale output. Both commands validate every local
catalog link and all 321 original archive hashes/byte counts before succeeding.
No packages or network are required. Output is deterministic and independent
of the working directory. The full archive appendix links every original file.

Keep current task status and errata in the catalog. Keep detailed implementation
contracts in their linked plans. Archive edits fail the integrity check; publish
corrections in maintained content instead. Public publication needs a separate
allowlist/export step and must not expose the entire private evidence archive.
