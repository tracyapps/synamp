import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupBrainState, restoreBrainState } from './brain-state.mjs';
import { PlaylistStore } from '../../apps/brain/src/playlists.ts';
import { EventLog } from '../../apps/brain/src/session/events.ts';
import { recordFeedback } from '../../apps/brain/src/session/feedback.ts';
import { SessionStore } from '../../apps/brain/src/session/session.ts';
import { WordChecks } from '../../apps/brain/src/library/wordchecks.ts';

test('real playlist, listening history, queue and owner correction survive offline restore/restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'synamp-restore-rehearsal-'));
  try {
    const source = join(root, 'brain'), backup = join(root, 'backup'), restored = join(root, 'restored'); mkdirSync(source);
    const tracks = [{ id: 'a', title: 'Song A' }, { id: 'b', title: 'Song B' }];
    const playlists = new PlaylistStore(join(source, 'playlists.json'));
    const playlist = playlists.create({ type: 'playlist', name: 'Keep this playlist' });
    playlists.addTracks(playlist.id, tracks);
    const log = new EventLog(join(source, 'events.jsonl'));
    const session = new SessionStore(join(source, 'session.json'), log);
    const queued = session.replaceQueue('queue-before-backup', tracks, { playlist_id: playlist.id });
    session.report('start-before-backup', { type: 'start', entry_id: queued.queue[0].entry_id });
    recordFeedback(log, { event_id: 'saved-love', signal: 'love', track_id: 'a' });
    const words = new WordChecks(join(source, 'wordchecks.json'));
    words.record({ ...tracks[0], signals: { vocal_fraction: .02 } }, 'has_words');
    // An already-torn final append remains byte-preserved; EventLog owns recovery.
    appendFileSync(join(source, 'events.jsonl'), '{"unfinished":');
    const sourceBytes = readFileSync(join(source, 'events.jsonl'));
    backupBrainState({ source, out: backup, stopped: true });
    restoreBrainState({ backup, out: restored });
    const recoveredLog = new EventLog(join(restored, 'events.jsonl'));
    const recoveredSession = new SessionStore(join(restored, 'session.json'), recoveredLog);
    assert.deepEqual(new PlaylistStore(join(restored, 'playlists.json')).list(), playlists.list());
    assert.deepEqual(recoveredSession.get(), session.get());
    assert.equal(new WordChecks(join(restored, 'wordchecks.json')).get('a').words, 'has_words');
    assert.equal(recoveredLog.all().filter(e => e.id === 'saved-love').length, 1);
    recordFeedback(recoveredLog, { event_id: 'love-after-restart', signal: 'love', track_id: 'b' });
    assert.equal(new EventLog(join(restored, 'events.jsonl')).all().filter(e => e.signal === 'love').length, 2);
    assert.deepEqual(readFileSync(join(source, 'events.jsonl')), sourceBytes, 'source state remains untouched');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
