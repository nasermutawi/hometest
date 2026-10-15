// Counts how often each app call touches the spreadsheet, against the in-memory mock.
// Every read or write is a round trip to Google's servers in real Apps Script (roughly
// 50–300 ms each), so the counts are what decide how long a call takes on a phone.
// Usage: node google-sheets/test/measure.mjs [path/to/Code.gs]
import { createGas } from './gas-mock.js';

const NASER = 'naser@example.com';
const codePath = process.argv[2];
const gas = createGas({ owner: NASER, start: '2026-10-11T09:00:00Z', ...(codePath ? { codePath } : {}) });
gas.as(NASER);
gas.context.setup();
gas.call('sara@example.com', 'joinHousehold', 'Sara');
const key = gas.context.keyFor_(NASER, false);
const ok = (r) => { if (!r.ok) throw new Error(`${r.error}: ${r.message}`); return r.result; };
for (let i = 0; i < 40; i++) {
  ok(gas.api(key, 'saveTask', { title: `Task ${i}`, dueDate: '2026-10-20', time: '09:00', owner: 'Shared', prep: [{ title: 'Step', daysBefore: 1 }] }));
}
const ids = gas.rows('Tasks').map((r) => r.ID);
const SLIM = { slim: true };

const calls = [
  ['getState', () => ['getState']],
  ['setTaskDone', (i) => ['setTaskDone', ids[i], true, SLIM]],
  ['saveTask', (i) => ['saveTask', { id: ids[i], title: `Renamed ${i}`, dueDate: '2026-10-21', time: '10:00', owner: 'Sara' }, SLIM]],
  ['setPrepDone', (i) => ['setPrepDone', ids[i], 0, true, SLIM]],
  ['deleteTask', (i) => ['deleteTask', ids[30 + i], SLIM]],
];

const out = [];
for (const [name, args] of calls) {
  const runs = 5;
  let reads = 0;
  let writes = 0;
  let bytes = 0;
  let ms = 0;
  for (let i = 0; i < runs; i++) {
    const [fn, ...a] = args(i);
    const before = { ...gas.stats };
    const t0 = performance.now();
    const res = gas.api(key, fn, ...a);
    ms += performance.now() - t0;
    ok(res);
    reads += gas.stats.reads - before.reads;
    writes += gas.stats.writes - before.writes;
    bytes += JSON.stringify(res).length;
  }
  out.push({ call: name, 'sheet reads': reads / runs, 'sheet writes': writes / runs, 'reply size (bytes)': Math.round(bytes / runs), 'mock ms': +(ms / runs).toFixed(2) });
}
console.table(out);
