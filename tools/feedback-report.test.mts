import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeReport, deviceLines, fileNameFor, mailtoFor, subjectFor } from '../apps/web/src/feedback-report.ts';

const at = Date.UTC(2026, 9, 13, 14, 5);

test('the report starts with the tester’s own words, then only the details they ticked', () => {
  const text = composeReport({
    kind: 'problem', note: 'The playlist had a song with singing.\n', doing: 'Made “no words, rainy day”', expected: 'Only instrumentals',
    generatedAt: at, names: false,
    install: [{ title: 'This install', lines: ['Version: 0.2.0'] }],
    problems: { title: 'Recent problems SynAmp noticed', lines: ['None since the server last started.'] },
    device: ['Browser: Safari'],
  });
  const lines = text.split('\n');
  assert.equal(lines[0], 'SynAmp feedback: Something went wrong');
  assert.equal(lines[2], 'The playlist had a song with singing.');
  assert.match(text, /What I was doing:\nMade “no words, rainy day”\n\nWhat I expected instead:\nOnly instrumentals/);
  assert.match(text, /Details I chose to include \(made 2026-10-13 14:05 UTC; song and folder names left out\):/);
  assert.match(text, /This install\nVersion: 0\.2\.0\n\nRecent problems SynAmp noticed\nNone since the server last started\.\n\nThis device\nBrowser: Safari\n$/);

  const bare = composeReport({ kind: 'works', note: '  ', generatedAt: at });
  assert.match(bare, /^SynAmp feedback: It’s working\n\n\(No note written\.\)\n\n—+\nNo details included\.\n$/);
  assert.doesNotMatch(bare, /What I was doing/);
});

test('the subject says the kind and the start of the note', () => {
  assert.equal(subjectFor('idea', ''), 'SynAmp: An idea');
  assert.equal(subjectFor('problem', 'No sound\nafter I pressed play'), 'SynAmp: Something went wrong — No sound');
  const long = subjectFor('confusing', 'x'.repeat(100));
  assert.ok(long.endsWith('…'));
  assert.ok(long.length < 100);
});

test('a short report goes in the email whole; a long one asks for a paste from the clipboard', () => {
  const short = mailtoFor('feedback@synamp.app', 'SynAmp: An idea', 'Hello\nthere', 'Hello');
  assert.equal(short.shortened, false);
  assert.equal(short.href, 'mailto:feedback@synamp.app?subject=SynAmp%3A%20An%20idea&body=Hello%0Athere');

  const report = 'line of detail\n'.repeat(400);
  const long = mailtoFor('feedback@synamp.app', 'S', report, 'My note');
  assert.equal(long.shortened, true);
  assert.ok(long.href.length <= 1900);
  assert.match(decodeURIComponent(long.href.split('body=')[1]!), /^My note\n\nThe full report is on my clipboard — pasted below:/);

  const huge = mailtoFor('a@b.co', 'S', report, 'word '.repeat(2000));
  assert.ok(huge.href.length <= 1900, String(huge.href.length));
  assert.match(decodeURIComponent(huge.href.split('body=')[1]!), /^word word .*…\n\nThe full report is on my clipboard/s);
});

test('saved files are named by date', () => {
  assert.equal(fileNameFor(at), 'synamp-feedback-2026-10-13-14-05.txt');
});

test('device lines: what the browser says about itself, nothing more', () => {
  assert.deepEqual(deviceLines({
    userAgent: 'Mozilla/5.0 (iPhone)', language: 'en-US', viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844, pixelRatio: 3 }, online: true, connection: { type: 'cellular', saveData: true },
    reducedMotion: true, colourScheme: 'dark', screenName: 'Library',
  }), [
    'Browser: Mozilla/5.0 (iPhone)',
    'Window: 390 × 844 on a 390 × 844 screen (×3)',
    'Language: en-US',
    'Connection: cellular, data saver on',
    'Preferences: dark mode, reduce motion',
    'Came from: the Library screen',
  ]);
  assert.deepEqual(deviceLines({ userAgent: '', viewport: { width: 1, height: 2 }, online: false, reducedMotion: false }),
    ['Browser: unknown', 'Window: 1 × 2', 'Online: no', 'Preferences: none set']);
});
