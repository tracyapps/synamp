/**
 * C2 probe — hide reversibility + scope_persistence semantics, direct on
 * deriveEpochPolicy (read-only against repo). Run:
 *   node --experimental-strip-types probe-hides.mts
 */
const REPO = "/Users/tapps/_dev/web-apps/SynAmp";
const { deriveEpochPolicy } = await import(`${REPO}/apps/brain/src/learning/derive.ts`);

const TZ = "America/Chicago";
const t0 = Date.parse("2026-10-06T20:00:00Z"); // 3pm CDT
const min = (n: number) => n * 60_000;

function ev(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `e${Math.random().toString(36).slice(2, 10)}`,
    ts: t0,
    signal: "started",
    track_id: "",
    scope: "none",
    source: "player",
    policy_version: "epoch-v1",
    ...partial,
  };
}

const log: Array<Record<string, unknown>> = [
  ev({ id: "s1", ts: t0 + 0, signal: "started", session_id: "ses-1" }),
  ev({ id: "k1", ts: t0 + min(1), signal: "skip_early", track_id: "A", scope: "session", session_id: "ses-1", playlist_id: "P", play_ms: 5000, duration_ms: 200000 }),
  ev({ id: "k2", ts: t0 + min(2), signal: "skip_early", track_id: "A", scope: "session", session_id: "ses-1", playlist_id: "P", play_ms: 4000, duration_ms: 200000 }),
  // user 'removes' another track from playlist P (persistent), then restores it
  ev({ id: "r1", ts: t0 + min(3), signal: "remove", track_id: "B", scope: "playlist", scope_id: "P", playlist_id: "P", session_id: "ses-1" }),
];

{
  const now = t0 + min(5);
  const v = deriveEpochPolicy(log, { now, timezone: TZ, scopePersistence: "declared" });
  console.log("BEFORE restore — epochHides:", [...v.epochHides()], "removed(P):", [...v.removed("P")]);
  console.log("  adjust(A):", JSON.stringify(v.adjust("A", "P")));
}

// Restore A (the skip-hidden track) with a playlist-scoped restore, exactly as the web button posts it.
log.push(ev({ id: "res1", ts: t0 + min(4), signal: "restore", track_id: "A", scope: "playlist", scope_id: "P", playlist_id: "P", session_id: "ses-1" }));
// Restore B (persistent remove) too
log.push(ev({ id: "res2", ts: t0 + min(4.5), signal: "restore", track_id: "B", scope: "playlist", scope_id: "P", playlist_id: "P", session_id: "ses-1" }));

{
  const now = t0 + min(6);
  const v = deriveEpochPolicy(log, { now, timezone: TZ, scopePersistence: "declared" });
  console.log("AFTER restore(A, playlist-scoped) + restore(B):");
  console.log("  epochHides:", [...v.epochHides()], "(A still hidden if 'A' appears — restore does not clear skip-hides)");
  console.log("  removed(P):", [...v.removed("P")], "(B cleared — restore works for persistent removes)");
  console.log("  adjust(A):", JSON.stringify(v.adjust("A", "P")));
}

console.log("\n--- 'not now' hide + restore ---");
const log2: Array<Record<string, unknown>> = [
  ev({ id: "s2", ts: t0, signal: "started", session_id: "ses-2" }),
  ev({ id: "nn1", ts: t0 + min(1), signal: "thumb_down", track_id: "C", scope: "playlist", scope_id: "P", playlist_id: "P", session_id: "ses-2", reason: "not_now" }),
  ev({ id: "nn2", ts: t0 + min(2), signal: "restore", track_id: "C", scope: "playlist", scope_id: "P", playlist_id: "P", session_id: "ses-2" }),
];
{
  const now = t0 + min(4);
  const v = deriveEpochPolicy(log2, { now, timezone: TZ });
  console.log("epochHides after not_now + restore:", [...v.epochHides()], "(C still hidden if present)");
}

console.log("\n--- scope_persistence: declared vs global_only (next day) ---");
const log3: Array<Record<string, unknown>> = [
  ev({ id: "u1", ts: t0 + min(1), signal: "thumb_up", track_id: "D", scope: "playlist", scope_id: "P", playlist_id: "P", session_id: "ses-3" }),
];
{
  const nextDay = t0 + 24 * 3600_000;
  for (const mode of ["declared", "global_only"] as const) {
    const v = deriveEpochPolicy(log3, { now: nextDay, timezone: TZ, scopePersistence: mode });
    console.log(`${mode}: adjust(D, P) = ${JSON.stringify(v.adjust("D", "P"))} | epoch = ${v.epoch ? "live" : "null"}`);
  }
}
