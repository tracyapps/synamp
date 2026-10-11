import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(await readFile(resolve(root, 'docs/business/roadmap-data.json'), 'utf8'));
const template = await readFile(resolve(root, 'tools/roadmap/business-template.html'), 'utf8');
const stamp = d => Date.parse(d + 'T00:00:00Z');
const validDate = d => Number.isFinite(stamp(d)) && new Date(stamp(d)).toISOString().slice(0, 10) === d;
if (!validDate(data.start) || !validDate(data.end) || stamp(data.start) >= stamp(data.end)) throw new Error('Invalid planning window');
for (const lane of data.lanes) {
  for (const task of lane.tasks) {
    if (!validDate(task.start) || !validDate(task.end) || stamp(task.start) < stamp(data.start) || stamp(task.end) > stamp(data.end) || stamp(task.start) > stamp(task.end)) throw new Error('Invalid task dates: ' + task.label);
  }
}
for (const g of [...data.gates, ...data.scenarios]) {
  if (!validDate(g.date) || stamp(g.date) < stamp(data.start) || stamp(g.date) > stamp(data.end)) throw new Error('Invalid gate/scenario: ' + g.id);
}
if (new Set(data.gates.map(g => g.id)).size !== data.gates.length) throw new Error('Duplicate gate ID');
if (template.split('__ROADMAP_JSON__').length !== 2) throw new Error('Expected one data placeholder');
const fragment = template.replace('__ROADMAP_JSON__', JSON.stringify(data).replaceAll('<', '\\u003c'));
const args = process.argv.slice(2);
const outputFlag = args.indexOf('--out');
const out = outputFlag >= 0 ? args[outputFlag + 1] : resolve(root, 'docs/business/roadmap.html');
if (!out || (args.length && (outputFlag !== 0 || args.length !== 2))) throw new Error('Usage: node tools/roadmap/build-business.mjs [--out path]');
const output = resolve(out);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, fragment);
console.log('Built business roadmap: ' + output);
