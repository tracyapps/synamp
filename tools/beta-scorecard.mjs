/** Offline aggregate reporting only; no telemetry, contact registry or network. */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const DAY = 86400000;
const fail = () => { throw new Error('Invalid private cohort record. Check the schema and dates in docs/beta/README.md; no input values are echoed.'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) fail();
  const number = Date.parse(value);
  if (!Number.isFinite(number) || new Date(number).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) fail();
  return number;
}
const ratio = (numerator, denominator) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
const fields = new Set(['id', 'eligible', 'consent_at', 'consent_version', 'attempt_at', 'completed_at', 'assisted', 'smart_playlist_at', 'ten_minutes_at', 'w4_active_at', 'w4_checked_at']);
export function scoreCohort(input, asOf) {
  const now = date(asOf);
  if (!object(input) || input.format !== 'synamp.beta-cohort/1' || !Array.isArray(input.households) || input.households.length > 1000 || Object.keys(input).some(key => !['format', 'households'].includes(key))) fail();
  const ids = new Set();
  let eligible = 0, installMature = 0, unassisted = 0, assisted = 0, assistanceUnknown = 0, completed = 0, mature = 0, activated = 0, late = 0, activationUnknown = 0, w4Mature = 0, retained = 0, inactive = 0, missing = 0;
  for (const row of input.households) {
    if (!object(row) || Object.keys(row).some(key => !fields.has(key)) || typeof row.id !== 'string' || !/^[a-z0-9_-]{8,64}$/.test(row.id) || ids.has(row.id) || typeof row.eligible !== 'boolean' || typeof row.consent_version !== 'string' || !row.consent_version.trim() || row.consent_version.length > 80 || ![true, false, null].includes(row.assisted)) fail();
    ids.add(row.id);
    const consent = date(row.consent_at), attempt = date(row.attempt_at);
    const times = {};
    for (const key of ['completed_at', 'smart_playlist_at', 'ten_minutes_at', 'w4_active_at', 'w4_checked_at']) {
      if (row[key] !== undefined && row[key] !== null) times[key] = date(row[key]);
    }
    if (consent > attempt || attempt > now || Object.values(times).some(time => time > now || time < attempt)) fail();
    const done = times.completed_at;
    if (done === undefined && Object.keys(times).length) fail();
    if (done !== undefined && Object.values(times).some(time => time < done)) fail();
    const first = times.smart_playlist_at, listened = times.ten_minutes_at;
    if (listened !== undefined && (first === undefined || listened < first)) fail();
    const activation = first !== undefined && listened !== undefined && listened <= done + 3 * DAY ? listened : undefined;
    if (times.w4_active_at !== undefined && (activation === undefined || times.w4_active_at < activation + 21 * DAY || times.w4_active_at >= activation + 28 * DAY)) fail();
    if (times.w4_checked_at !== undefined && (activation === undefined || times.w4_checked_at < activation + 28 * DAY)) fail();
    if (!row.eligible) continue;
    eligible++;
    if (done !== undefined) completed++;
    if (now >= attempt + 7 * DAY) {
      installMature++;
      if (done !== undefined && done <= attempt + 7 * DAY) {
        if (row.assisted === false) unassisted++;
        else if (row.assisted === true) assisted++;
        else assistanceUnknown++;
      }
    }
    if (done === undefined || now < done + 3 * DAY) continue;
    mature++;
    if (activation === undefined) {
      if (listened !== undefined) late++; else activationUnknown++;
      continue;
    }
    activated++;
    if (now < activation + 28 * DAY) continue;
    w4Mature++;
    if (times.w4_active_at !== undefined) retained++;
    else if (times.w4_checked_at !== undefined) inactive++;
    else missing++;
  }
  return {
    format: 'synamp.beta-scorecard/1', as_of: asOf, households: input.households.length, eligible_attempts: eligible,
    install: { unassisted: ratio(unassisted, installMature), assisted_in_window: assisted, assistance_unknown_in_window: assistanceUnknown, pending_window: eligible - installMature, completed_all_ages: completed },
    activation: { confirmed: ratio(activated, mature), late, unknown: activationUnknown, pending_window: completed - mature },
    w4: { confirmed: ratio(retained, w4Mature), respondents: ratio(retained, retained + inactive), inactive, missing, response_coverage: ratio(retained + inactive, w4Mature) },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || statSync(process.argv[2]).size > 1024 * 1024) fail();
    console.log(JSON.stringify(scoreCohort(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3]), null, 2));
  } catch { console.error('Cohort report refused. Check the private file, UTC as-of date and docs/beta/README.md. No input values are echoed.'); process.exitCode = 1; }
}
