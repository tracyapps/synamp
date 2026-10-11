# Continuous playlist playback

Implemented locally October 11, 2026. Deployment and owner-library listening verification remain pending.

## Listener behavior

- Saved query playlists default to **Smart mix**. They start with the selected song and prepared next song, then keep selecting from the whole eligible library. The saved target size is a starting selection size, not a stopping point.
- Every collection offers **Standard playlist** (finite, existing order/shuffle/DJ behavior) or **Smart mix** (continuous). This is a saved playback preference, not a destructive conversion. Manual playlists keep their exact saved song list and play those songs first, then continue from library recommendations.
- The choice applies at the next press of Play. An active run keeps its chosen mode. Old smart sessions without a playback-mode field upgrade on their next session request; explicitly standard sessions stay finite.
- Loves steer newly selected music. Full plays, early skips, explicit negatives, playlist removals, and the existing learning policy guide continuation. The current and prepared next entry retain their IDs, so feedback does not disrupt audio already scheduled for a crossfade. Further automatic selections can change immediately.
- “More like this” and explicit Play next requests retain their priority. The adaptive refill does not discard them.
- Recently played recordings are avoided. When no fresh eligible songs remain, the least recently played eligible music cycles with a visible note. The current/last recording cannot immediately repeat, duplicate recordings are suppressed, and rejected/removed/broken songs do not fill a shortage.
- If no alternative playable song meets the rules, the player explains the shortage. Rules are never silently relaxed. Restore an alternative or change the rules to continue.

## Ownership and interfaces

| Surface | Files | Contract |
| --- | --- | --- |
| Saved choice | `apps/brain/src/playlists.ts`, `apps/web/src/Playlists.tsx` | `playback: standard / continuous`; absent means continuous for smart nodes, standard otherwise. `POST /api/v1/playlists/:id/playback` validates and saves the preference atomically. |
| Selection | `apps/brain/src/session/continuation.ts`, `query/evaluate.ts` | Evaluate the original hard/soft rules against the full library, without relaxation. Candidate eligibility is separate from the library supplying exemplar measurements. Sound guidance uses measured embeddings; missing analysis falls back to rules and existing feedback rather than an invented sound match. |
| Playback state | `apps/brain/src/session/session.ts` | Persist continuation source/hash, up to 50 starting seed IDs, event-log start offset, generated-entry flags, and status. Refill to three upcoming songs; preserve saved starting entries/explicit requests and prepared next. Keep the last 200 entries for Previous and recent-play suppression. |
| API coordination | `apps/brain/src/index.ts` | Queue, player reports, feedback, and session reads share one refill path. Feedback returns the updated session. Report/feedback/queue receipts retain their retry protection. |
| Audio/UI | `apps/web/src/Player.tsx` | Apply the server's actual next entry before a skip blend. Show Smart mix and shortage/cycling feedback beside the song. Web, visuals, and companion use the same server queue. |

Per-artist/album diversity caps govern each newly selected batch; finite global counts cannot govern an endless run. The repeat-avoidance window is the retained 200-entry history, not an ever-growing collection. Playback errors only suppress broken tracks for that run; they do not create dislikes. Forgetting the learning epoch clears implicit sound evidence while explicit preferences survive.

## Acceptance and verification

- Selector regressions cover immediate love guidance, strict constraints beyond a one-song target, recent-song cycling, missing files/analysis, duplicate recordings, removal/restore, and epoch reset.
- Session/store regressions cover restart persistence, stable current/next IDs, explicit-request protection, retries, 2,200 consecutive advances with bounded state, and finite standard playback.
- `node tools/player/check-actions.mjs /tmp/synamp-continuation-evidence/integrated` uses the actual Player, Playlists screen, Brain HTTP API, temporary persistent stores, and generated audio. It retains existing feedback/visuals checks and adds continuous natural endings, real skip/crossfade, immediate re-ranking, saved mode controls on desktop/mobile, finite fallback, and shortage/recovery.
- Fresh local results: 45 focused checks passed, including the 2,200-advance session; 23 browser scenarios passed with no page errors. Brain type checking, web production build, and `git diff --check` passed.
- The broader `pnpm --filter @synamp/brain test` run had 309 passing checks, one skipped check, and the pre-existing librarian capitalization failure (`Ani DiFranco` versus `Ani Difranco`). The final focused run also includes the subsequently added duplicate-recording, restore/reset, and legacy-session regressions.

Before release, listen with the owner's analyzed library for a workday and check recommendation quality, variety, natural crossfades, exclusion reasons, restoration, and restarting the Brain mid-mix. Generated-audio browser checks establish queue/control behavior, not real-library recommendation quality or installed companion runtime behavior.
