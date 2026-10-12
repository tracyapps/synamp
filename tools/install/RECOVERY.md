# Brain-state backup and restore rehearsal

This tool copies **offline Brain state only**, with a SHA-256 manifest and a
byte-verified restore into a **new** directory. It does not stop services,
replace active state, change Compose, or verify an installed NAS recovery.
Use a private backup location: state can contain credentials, lyrics and
personal listening history. Hashes detect accidental damage, not malicious
replacement of a backup and its manifest together. Keep an independent copy.

1. Stop every Brain process/container that can write this state. `--stopped`
   records your attestation; the tool cannot prove that services are stopped.
2. Use the directory containing `playlists.json`, `session.json` and
   `events.jsonl` (normally `DATA_DIR/brain`). All stored paths must be inside
   this directory. Separately configured external stores need their own backup.
3. Create the backup outside that tree. The output must not exist. No original
   file is modified. For example, with your own absolute paths:

```sh
node tools/install/brain-state.mjs backup \
  --source /absolute/stopped/brain \
  --out /absolute/private/backups/new-brain-backup --stopped
node tools/install/brain-state.mjs verify \
  --backup /absolute/private/backups/new-brain-backup
node tools/install/brain-state.mjs restore \
  --backup /absolute/private/backups/new-brain-backup \
  --out /absolute/private/rehearsal/new-brain-state
```

4. Test the restored state with the **matching code/build**, isolated from the
   original deployment. Check playlists, queue, listening history, favourites,
   corrections and settings. Keep external lookups, uploads and the librarian
   off for the rehearsal. The local integration test exercises real playlist,
   session, event and word-correction stores, including a torn final log line.
   It is not proof of actual NAS startup, persistent-volume ownership or audio.
5. Record source/candidate image identities, backup manifest hash, exact state
   coverage, restore checks and failures in the install attempt receipt. Only
   an owner-reviewed installed rehearsal can support switching production to
   that restored state. Keep the original state and previous image available.

The tool rejects symlinks, special files, overlapping paths, existing outputs,
changed copies, unsafe manifest paths and altered/missing/extra payload files.
It supports up to 100,000 regular files, 64 MiB per file and 8 GiB total. If
state exceeds that envelope, stop and plan storage maintenance/migration; never
truncate listening history to make the backup pass. Empty directories and
original ownership/modes are not preserved; output uses private directories
and files. No JSON schema repair or database migration is performed.

If a copy fails, its incomplete output is retained for inspection. Never use
it as live state. Choose a fresh output for the next attempt. Filesystem
snapshot/power-loss durability and a restoration across hardware are separate
checks; this tool does not claim `fsync` or multi-process snapshot consistency.

**This is not a complete SynAmp backup.** Music, music-share `.synamp` journals
and tag backups, the Mac analyzer SQLite database, Navidrome and Postgres state,
Compose settings/secrets and tested image identities have separate consistent
backup requirements. Do not copy a running SQLite/Postgres database as an
ordinary file backup, and do not assume code rollback rolls back data.

Run local safety and behavior checks with:

```sh
node --experimental-strip-types --test tools/install/brain-state*.test.mjs
```

## Startup refuses damaged user state

Words/tempo/mood corrections, favourites and app settings now treat only a
missing file as a first run. Unreadable JSON, a non-object root, an incompatible
format marker or an invalid collection container stops startup with a recovery
message. Existing unversioned objects and omitted optional containers remain
compatible. Record-level semantic validation is not claimed; other cached and
optional stores have their own loaders.

If startup reports this error, keep the service stopped. Preserve the original
file and its private backup; do not delete it to make startup succeed. Check
ownership/permissions first. For damaged bytes, restore a known-good offline
backup into a new directory, verify it, then rehearse with the matching build
as above before choosing the restored state. Do not paste state or credentials
into a public issue. A successful byte-copy backup of damaged JSON does not
repair that JSON. Unknown future formats need their matching software or an
explicit migration; changing the format string is not a migration.
