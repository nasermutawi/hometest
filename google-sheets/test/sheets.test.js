import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createGas } from './gas-mock.js';

const NASER = 'naser@example.com';
const SARA = 'sara@example.com';
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// Sunday 11 Oct 2026, 10:00 London time.
function household() {
  const gas = createGas({ owner: NASER, start: '2026-10-11T09:00:00Z' });
  gas.as(NASER);
  gas.context.setup();
  gas.call(SARA, 'joinHousehold', 'Sara');
  gas.context.runScheduledJobs(); // sends Naser the "Sara joined" email
  assert.match(gas.outbox[0].body, /Sara joined the household/);
  gas.outbox.length = 0;
  return gas;
}

test('setup builds the tabs, adds the owner as a member and installs the timers', () => {
  const gas = createGas({ owner: NASER });
  gas.as(NASER);
  gas.context.setup();
  assert.deepEqual(gas.spreadsheet.getSheets().map((s) => s.name), ['Tasks', 'Members', 'Settings', 'Activity']);
  assert.deepEqual(gas.rows('Members')[0], {
    Name: 'Naser', Email: NASER, 'Email reminders': 'Yes', 'Email updates': 'Yes', 'Morning summary': 'No', 'Calendar invites': 'Yes',
  });
  assert.equal(gas.rows('Settings').find((r) => r.Setting === 'Assistant key').Value.length, 32);
  assert.deepEqual(gas.triggers.map((t) => t.handler).sort(), ['onSheetEdit', 'runScheduledJobs']);
  // Running it again doesn't duplicate anything.
  gas.context.setup();
  assert.equal(gas.rows('Members').length, 1);
  assert.equal(gas.triggers.length, 2);
  assert.equal(gas.rows('Settings').length, 6);
});

test('a second person joins from the app; people without sheet access are told why', () => {
  const gas = createGas({ owner: NASER });
  gas.as(NASER);
  gas.context.setup();
  const before = gas.call(SARA, 'getState');
  assert.equal(before.me, null);
  const after = gas.call(SARA, 'joinHousehold', 'Sara');
  assert.equal(after.me.name, 'Sara');
  assert.deepEqual(after.members.map((m) => m.name), ['Naser', 'Sara']);
  assert.throws(() => gas.call('other@example.com', 'joinHousehold', 'Sara'), /already in the household/);

  gas.deny('stranger@example.com');
  assert.equal(gas.call('stranger@example.com', 'getState').error, 'access');
});

test('plain-language entry becomes a readable row in the sheet', () => {
  const gas = household();
  const draft = gas.call(NASER, 'parseText', 'Plumber coming Thursday at 10am to fix the kitchen leak, Sara to handle it. We need to empty the cupboard under the sink before they arrive');
  assert.equal(draft.dueDate, '2026-10-15');
  assert.equal(draft.owner, 'Sara');
  const state = gas.call(NASER, 'saveTask', draft);
  const row = gas.rows('Tasks')[0];
  assert.equal(row.ID, 1);
  assert.equal(row.Task, 'Plumber coming to fix the kitchen leak');
  assert.equal(gas.localDate(row['Due date']), '2026-10-15');
  assert.equal(row.Time, '10:00');
  assert.equal(row.Owner, 'Sara');
  assert.equal(row.Done, false);
  assert.equal(row.Reminders, '1 day, 1 hour');
  assert.match(row['Prep steps'], /^☐ Empty the cupboard under the sink \(same day\)\n☐ Confirm the appointment with the contractor \(1 day before\)/);
  const task = state.tasks[0];
  assert.equal(task.when, 'Thu 15 Oct, 10:00');
  assert.equal(task.prep[1].when, 'Wed 14 Oct, 18:00');
  assert.equal(gas.rows('Activity')[1].What, 'added');
});

test('ticking a repeating task done (in the app) schedules the next one', () => {
  const gas = household();
  gas.call(NASER, 'saveTask', { title: 'Service the boiler', dueDate: '2026-11-03', time: '09:00', owner: 'Sara', repeats: 'Yearly', prep: [{ title: 'Clear the cupboard', daysBefore: 1 }] });
  const state = gas.call(SARA, 'setTaskDone', 1, true);
  assert.equal(state.next.dueDate, '2027-11-03');
  assert.equal(state.next.owner, 'Sara');
  assert.equal(state.next.prep[0].done, false);
  const rows = gas.rows('Tasks');
  assert.equal(rows[0].Done, true);
  assert.equal(rows[0]['Next ID'], 2);
  assert.match(gas.rows('Activity').at(-1).Details, /next one is set for Wed 3 Nov 2027, 09:00/);
  // Unticking and re-ticking doesn't create a duplicate.
  gas.call(SARA, 'setTaskDone', 1, false);
  gas.call(SARA, 'setTaskDone', 1, true);
  assert.equal(gas.rows('Tasks').length, 2);
});

test('monthly repeats clamp to the end of short months', () => {
  const gas = household();
  gas.call(NASER, 'saveTask', { title: 'Pay the cleaner', dueDate: '2026-10-31', repeats: 'Monthly' });
  assert.equal(gas.call(NASER, 'setTaskDone', 1, true).next.dueDate, '2026-11-30');
});

test('rows typed straight into the sheet get an ID; ticking Done in the sheet works too', () => {
  const gas = household();
  gas.edit(SARA, 'Tasks', 2, 'Task', 'Mow the lawn');
  let row = gas.rows('Tasks')[0];
  assert.equal(row.ID, 1);
  assert.equal(row['Created by'], 'Sara');
  assert.equal(row.Reminders, '1 day, 1 hour');

  gas.edit(SARA, 'Tasks', 2, 'Owner', 'Naser');
  assert.equal(gas.rows('Activity').at(-1).What, 'assigned');

  gas.edit(SARA, 'Tasks', 2, 'Repeats', 'Weekly');
  gas.edit(SARA, 'Tasks', 2, 'Due date', new Date('2026-10-17T00:00:00+01:00'));
  gas.edit(SARA, 'Tasks', 2, 'Done', true);
  row = gas.rows('Tasks')[0];
  assert.ok(row.Completed);
  assert.equal(gas.localDate(gas.rows('Tasks')[1]['Due date']), '2026-10-24');
  assert.equal(gas.rows('Activity').at(-1).Who, 'Sara');
});

test('emails: reminders reach both people worded for them; updates skip whoever made the change', () => {
  const gas = household();
  gas.call(NASER, 'saveTask', { title: 'Clear the gutters', dueDate: '2026-10-12', time: '10:00', owner: '', reminders: [60] });
  gas.context.runScheduledJobs();
  // Sara hears that Naser added it; Naser doesn't get his own update.
  assert.deepEqual(gas.outbox.map((m) => m.to), [SARA]);
  assert.match(gas.outbox[0].body, /Naser added "Clear the gutters" for Mon 12 Oct, 10:00\. Nobody has taken it yet\./);
  gas.outbox.length = 0;

  gas.call(SARA, 'chat', "I'll take the gutters");
  gas.context.runScheduledJobs();
  assert.deepEqual(gas.outbox.map((m) => m.to), [NASER]);
  assert.match(gas.outbox[0].body, /Sara is taking care of "Clear the gutters"/);
  gas.outbox.length = 0;

  // Monday 09:00 London = one hour before.
  gas.clock.now = new Date('2026-10-12T08:01:00Z').getTime();
  gas.context.runScheduledJobs();
  const toSara = gas.outbox.find((m) => m.to === SARA);
  const toNaser = gas.outbox.find((m) => m.to === NASER);
  assert.match(toSara.subject, /^Reminder: "Clear the gutters" is due in 1 hour/);
  assert.match(toSara.body, /You're on it\./);
  assert.match(toNaser.body, /Sara is on it\./);
  gas.outbox.length = 0;
  gas.advance(5 * 60_000);
  gas.context.runScheduledJobs();
  assert.equal(gas.outbox.length, 0, 'reminders are not repeated');
});

test('preferences turn emails off per person, and the morning summary goes out once', () => {
  const gas = household();
  gas.call(SARA, 'savePreferences', { emailReminders: false, emailUpdates: false, morningSummary: true, calendarInvites: true });
  assert.equal(gas.rows('Members')[1]['Morning summary'], 'Yes');
  gas.call(NASER, 'saveTask', { title: 'Bins out', dueDate: '2026-10-12', time: '19:00', owner: 'Sara', reminders: [60] });
  gas.context.runScheduledJobs();
  assert.equal(gas.outbox.length, 0);

  gas.clock.now = new Date('2026-10-12T06:02:00Z').getTime(); // 07:02 London
  gas.context.runScheduledJobs();
  assert.equal(gas.outbox.length, 1);
  assert.equal(gas.outbox[0].to, SARA);
  assert.match(gas.outbox[0].body, /Today and tomorrow\n• Bins out \(Mon 12 Oct, 19:00\)\. You're on it\./);
  gas.advance(10 * 60_000);
  gas.context.runScheduledJobs();
  assert.equal(gas.outbox.length, 1);
});

test('calendar sync: events with alerts and invites, removed when done or deleted', () => {
  const gas = household();
  gas.call(NASER, 'saveTask', { title: 'Dentist', dueDate: '2026-10-20', time: '15:30', owner: 'Sara', reminders: [1440, 60] });
  gas.call(NASER, 'saveTask', { title: 'Renew passport', dueDate: '2026-11-01', time: '' });
  gas.context.runScheduledJobs();
  const [dentist, passport] = [...gas.events.values()];
  assert.equal(dentist.title, 'Dentist (Sara)');
  assert.equal(dentist.options.guests, SARA);
  assert.deepEqual(dentist.reminders, [1440, 60]);
  assert.equal(passport.allDay, true);

  gas.call(SARA, 'setTaskDone', 1, true);
  gas.call(NASER, 'deleteTask', 2);
  gas.advance(5 * 60_000);
  gas.context.runScheduledJobs();
  assert.equal(gas.events.size, 0);
});

test('chat assistant handles the everyday commands', () => {
  const gas = household();
  gas.call(NASER, 'saveTask', { title: 'Clear the gutters', dueDate: '2026-10-17', time: '10:00' });
  assert.match(gas.call(SARA, 'chat', "I'll take the gutters"), /"Clear the gutters" is yours\. I'll let Naser know\./);
  assert.match(gas.call(SARA, 'chat', 'move it to Sunday 11am'), /Moved "Clear the gutters" to Sun 18 Oct, 11:00/);
  assert.match(gas.call(SARA, 'chat', 'done'), /Marked "Clear the gutters" as done/);
  assert.match(gas.call(NASER, 'chat', 'add: put the bins out every Monday evening, Naser'), /Added "Put the bins out", Mon 12 Oct, 19:00, Naser, repeats weekly/);
  assert.match(gas.call(NASER, 'chat', "what's due?"), /Coming up:\n• "Put the bins out"/);
  assert.match(gas.call(NASER, 'chat', 'banana'), /didn't catch that/);
});

test('Claude connector (MCP): handshake, tools and key check', () => {
  const gas = household();
  const key = gas.rows('Settings').find((r) => r.Setting === 'Assistant key').Value;
  const rpc = (body, k = key) => {
    const out = gas.context.doPost({ parameter: { key: k }, postData: { contents: JSON.stringify(body) } }).getContent();
    return out ? JSON.parse(out) : null;
  };

  const init = rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } } });
  assert.equal(init.result.serverInfo.name, 'household-sheet');
  assert.equal(rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.deepEqual(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.map((t) => t.name),
    ['get_household', 'list_tasks', 'add_task', 'update_task', 'delete_task']);

  const call = (name, args) => rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }).result;
  assert.deepEqual(JSON.parse(call('get_household', {}).content[0].text).members, ['Naser', 'Sara']);

  const added = JSON.parse(call('add_task', {
    title: 'Electrician visit', due_date: '2026-10-16', due_time: '08:00', owner: 'Naser', requested_by: 'Sara',
    prep_steps: [{ title: 'Clear the hallway', days_before: 1 }],
  }).content[0].text).added;
  assert.equal(added.when, 'Fri 16 Oct, 08:00');
  assert.equal(gas.rows('Activity').at(-1).Who, 'Sara');

  const done = JSON.parse(call('update_task', { id: added.id, done: true }).content[0].text);
  assert.equal(done.updated.done, true);
  assert.equal(JSON.parse(call('list_tasks', {}).content[0].text).length, 0);

  const bad = call('update_task', { id: 99, title: 'x' });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /no longer exists/);

  assert.match(rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, 'wrong').error.message, /wrong key/);
});

test('Parser.gs is up to date with the Node parsers', () => {
  const before = readFileSync(new URL('../Parser.gs', import.meta.url), 'utf8');
  execFileSync(process.execPath, ['--no-warnings', new URL('../build-parser.mjs', import.meta.url).pathname]);
  assert.equal(readFileSync(new URL('../Parser.gs', import.meta.url), 'utf8'), before, 'Run npm run build:sheets and commit Parser.gs');
});
