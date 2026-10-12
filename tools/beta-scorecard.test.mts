import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreCohort } from './beta-scorecard.mjs';
const row = (i = 0) => ({ id: `tester_${i}`, eligible: true, consent_version: 'scratch-v1', consent_at: '2026-09-01T00:00:00Z', attempt_at: '2026-09-01T00:00:00Z', completed_at: '2026-09-02T00:00:00Z', assisted: false, smart_playlist_at: '2026-09-02T01:00:00Z', ten_minutes_at: '2026-09-02T01:10:00Z' });
const report = (households: any[], asOf = '2026-10-12T00:00:00Z') => scoreCohort({ format: 'synamp.beta-cohort/1', households }, asOf);
test('W4 retains all ten matured households, including two missing replies', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...row(i), ...(i < 6 ? { w4_active_at: '2026-09-25T00:00:00Z' } : i < 8 ? { w4_checked_at: '2026-10-01T00:00:00Z' } : {}) }));
  const value = report(rows);
  assert.deepEqual(value.w4.confirmed, { numerator: 6, denominator: 10, rate: .6 });
  assert.deepEqual(value.w4.respondents, { numerator: 6, denominator: 8, rate: .75 });
  assert.equal(value.w4.missing, 2);
  assert.equal(value.w4.response_coverage.rate, .8);
});
test('failed and assisted attempts remain in the mature install denominator', () => {
  const rows = [row(0), { ...row(1), assisted: true }, { ...row(2), assisted: null }, { ...row(3), completed_at: null, smart_playlist_at: null, ten_minutes_at: null }, { ...row(4), eligible: false }];
  const value = report(rows);
  assert.deepEqual(value.install.unassisted, { numerator: 1, denominator: 4, rate: .25 });
  assert.equal(value.install.assisted_in_window, 1);
  assert.equal(value.install.assistance_unknown_in_window, 1);
  assert.equal(value.activation.confirmed.denominator, 3);
});
test('activation includes analysis wait, excludes late results, and waits the full 72h', () => {
  const late = { ...row(1), smart_playlist_at: '2026-09-06T00:00:00Z', ten_minutes_at: '2026-09-06T00:10:00Z' };
  const unknown = { ...row(2), ten_minutes_at: null };
  const value = report([row(), late, unknown]);
  assert.equal(value.activation.confirmed.rate, 1 / 3);
  assert.equal(value.activation.late, 1); assert.equal(value.activation.unknown, 1);
  assert.equal(report([row()], '2026-09-04T23:59:59Z').activation.confirmed.denominator, 0);
  assert.equal(report([row()], '2026-09-05T00:00:00Z').activation.confirmed.denominator, 1);
});
test('maturity and W4 activity boundaries are explicit and zero denominators stay unknown', () => {
  assert.equal(report([]).w4.confirmed.rate, null);
  assert.equal(report([row()], '2026-09-30T01:09:59Z').w4.confirmed.denominator, 0);
  assert.equal(report([row()], '2026-09-30T01:10:00Z').w4.confirmed.denominator, 1);
  assert.equal(report([row()], '2026-09-07T23:59:59Z').install.unassisted.denominator, 0);
  assert.equal(report([row()], '2026-09-08T00:00:00Z').install.unassisted.denominator, 1);
  assert.throws(() => report([{ ...row(), w4_active_at: '2026-09-30T01:10:00Z' }]));
});
test('duplicates, impossible dates, future data, contact fields and invalid ordering fail closed', () => {
  assert.throws(() => report([row(), row()]));
  for (const changes of [{ attempt_at: '2026-02-30T00:00:00Z' }, { consent_at: '2026-09-02T00:00:00Z' }, { completed_at: '2027-01-01T00:00:00Z' }, { email: 'private@example.test' }, { ten_minutes_at: '2026-09-02T00:30:00Z' }, { w4_checked_at: '2026-09-10T00:00:00Z' }, { assisted: 'no' }]) assert.throws(() => report([{ ...row(), ...changes }]));
  assert.ok(!JSON.stringify(report([row()])).includes('tester_0'));
});
