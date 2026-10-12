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
  assert.equal(gas.rows('Settings').some((r) => r.Setting === 'Assistant key'), false, 'the old connector key is not kept');
  assert.deepEqual(gas.triggers.map((t) => t.handler).sort(), ['onSheetEdit', 'runScheduledJobs']);
  // Running it again doesn't duplicate anything.
  gas.context.setup();
  assert.equal(gas.rows('Members').length, 1);
  assert.equal(gas.triggers.length, 2);
  assert.equal(gas.rows('Settings').length, 5);
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

// ---- Claude in the app

const KEY = 'sk-ant-test-0123456789';
const claudeSays = (plan) => ({ status: 200, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
const withKey = (gas) => gas.context.PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', KEY);

test('without a key nothing goes to Claude and the simple rules answer', () => {
  const gas = household();
  assert.equal(gas.call(NASER, 'getState').assistant, 'rules');
  gas.call(NASER, 'saveTask', { title: 'Clear the gutters', dueDate: '2026-10-17', time: '10:00' });
  assert.match(gas.call(SARA, 'chat', "I'll take the gutters"), /is yours/);
  assert.equal(gas.http.calls.length, 0);
});

test('with a key, Claude\'s plan is applied; the key is only sent to Anthropic and never shown', () => {
  const gas = household();
  withKey(gas);
  gas.call(NASER, 'saveTask', { title: 'Clear the gutters', dueDate: '2026-10-17', time: '10:00' });
  gas.http.responder = () => claudeSays({ operations: [{ type: 'assign', task_id: 1, owner: 'Sara' }], message: '' });
  const reply = gas.call(NASER, 'chat', 'could Sara do the gutters please');
  assert.match(reply, /Assigned "Clear the gutters" to Sara/);
  assert.equal(gas.rows('Tasks')[0].Owner, 'Sara');

  const call = gas.http.calls[0];
  assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(call.opts.headers['x-api-key'], KEY);
  assert.equal(JSON.parse(call.opts.payload).model, 'claude-opus-5-5');
  assert.equal(gas.call(NASER, 'getState').assistant, 'claude');
  assert.equal(JSON.stringify(gas.call(NASER, 'getState')).includes(KEY), false);
  assert.equal(JSON.stringify(gas.rows('Settings')).includes(KEY), false);
  assert.equal(JSON.stringify(gas.rows('Activity')).includes(KEY), false);
});

test('Claude can create a task with its own details and prep steps, not just the rules', () => {
  const gas = household();
  withKey(gas);
  gas.http.responder = () => claudeSays({
    operations: [{ type: 'create', draft: {
      title: 'Electrician visit', due_date: '2026-10-16', due_time: '08:00', owner: 'Naser', repeats: 'Never',
      category: 'contractor', notes: 'Dave, 07700 900123', prep_steps: [{ title: 'Clear the hallway', days_before: 1 }],
      reminders_minutes_before: [1440],
    } }],
    message: 'Added it for Friday.',
  });
  const reply = gas.call(SARA, 'chat', 'book the electrician for Friday 8am, Dave is on 07700 900123, clear the hallway the day before');
  assert.match(reply, /Added "Electrician visit", Fri 16 Oct, 08:00, Naser/);
  assert.match(reply, /Added it for Friday\./);
  const row = gas.rows('Tasks')[0];
  assert.equal(row.Notes, 'Dave, 07700 900123');
  assert.equal(row['Prep steps'], '☐ Clear the hallway (1 day before)');
  assert.equal(row.Reminders, '1 day');
});

test('a Claude draft with no reminders gets the household default', () => {
  const gas = household();
  withKey(gas);
  gas.http.responder = () => claudeSays({ operations: [{ type: 'create', draft: { title: 'Bins out', due_date: '2026-10-12', due_time: '19:00', owner: '' } }], message: '' });
  gas.call(NASER, 'chat', 'bins out Monday evening');
  assert.equal(gas.rows('Tasks')[0].Reminders, '1 day, 1 hour');
});

test('if Claude is unavailable the rules answer, and the reply says so', () => {
  const gas = household();
  withKey(gas);
  gas.http.responder = () => ({ status: 500, body: 'oops' });
  const reply = gas.call(NASER, 'chat', 'add: put the bins out every Monday evening, Naser');
  assert.match(reply, /Added "Put the bins out"/);
  assert.match(reply, /Claude is unavailable right now, so I used the simple rules \(service returned 500\)/);
});

test('a reply without a plan falls back to the rules; unknown types and task ids are ignored', () => {
  const gas = household();
  gas.call(NASER, 'saveTask', { title: 'Clear the gutters', dueDate: '2026-10-17', time: '10:00' });
  withKey(gas);

  gas.http.responder = () => ({ status: 200, body: JSON.stringify({ content: [{ type: 'text', text: 'Sure thing!' }] }) });
  assert.match(gas.call(NASER, 'chat', 'the gutters are done'), /Marked "Clear the gutters" as done[\s\S]*Claude is unavailable/);

  gas.call(NASER, 'saveTask', { title: 'Mow the lawn', dueDate: '2026-10-18' });
  gas.http.responder = () => claudeSays({ operations: [{ type: 'delete_everything', task_id: 2 }, { type: 'complete', task_id: 999 }], message: '' });
  const reply = gas.call(NASER, 'chat', 'please sort everything');
  assert.match(reply, /I'm not sure which task you mean/);
  assert.doesNotMatch(reply, /Marked/, 'the current task was not acted on');
  assert.equal(gas.rows('Tasks').filter((r) => r.Done === true).length, 1, 'nothing extra was changed');
});

test('the recent conversation is sent with each message, so follow-ups make sense', () => {
  const gas = household();
  withKey(gas);
  gas.http.responder = () => claudeSays({ operations: [], message: 'Which day should it be?' });
  assert.equal(gas.call(NASER, 'chat', 'add a bin collection reminder'), 'Which day should it be?');
  gas.http.responder = () => claudeSays({ operations: [{ type: 'create', draft: { title: 'Bin collection', due_date: '2026-10-15' } }], message: '' });
  gas.call(NASER, 'chat', 'Thursday');
  const sent = JSON.parse(gas.http.calls[1].opts.payload).messages[0].content;
  assert.match(sent, /Assistant: Which day should it be\?/);
  assert.match(sent, /Person: add a bin collection reminder/);
  assert.match(sent, /Message from Naser:\nThursday/);
});

test('Parser.gs is up to date with the Node parsers', () => {
  const before = readFileSync(new URL('../Parser.gs', import.meta.url), 'utf8');
  execFileSync(process.execPath, ['--no-warnings', new URL('../build-parser.mjs', import.meta.url).pathname]);
  assert.equal(readFileSync(new URL('../Parser.gs', import.meta.url), 'utf8'), before, 'Run npm run build:sheets and commit Parser.gs');
});
