import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, couple } from './helpers.js';
import { deliverDueReminders } from '../src/reminders.js';

const HOUR = 3600_000;

test('every member gets each reminder, worded for whether it is theirs', async () => {
  const { app, db, notifier, sent } = setup();
  const { naser, sara } = await couple(app);
  const due = new Date(Date.now() + 48 * HOUR);
  const task = (await naser.agent.post('/api/tasks').send({
    title: 'Boiler service',
    due_at: due.toISOString(),
    owner_id: sara.me.user.id,
    reminder_offsets: [1440, 60],
    prep_steps: [{ title: 'Clear access to the boiler', due_at: new Date(due - 12 * HOUR).toISOString() }],
  })).body;
  sent.length = 0;

  assert.equal(db.prepare('SELECT COUNT(*) n FROM task_reminders WHERE task_id = ?').get(task.id).n, 3);
  assert.equal(await deliverDueReminders(db, notifier, new Date()), 0);

  // 24h before: one reminder moment, delivered to both people.
  assert.equal(await deliverDueReminders(db, notifier, new Date(due - 24 * HOUR)), 1);
  const toSara = sent.find((s) => s.userId === sara.me.user.id);
  const toNaser = sent.find((s) => s.userId === naser.me.user.id);
  assert.match(toSara.body, /"Boiler service" is due in 1 day .*You're on it\./);
  assert.match(toNaser.body, /"Boiler service" is due in 1 day .*Sara is on it\./);

  // Prep step and the 1h reminder; nothing is re-sent afterwards.
  assert.equal(await deliverDueReminders(db, notifier, new Date(due - HOUR)), 2);
  assert.equal(await deliverDueReminders(db, notifier, due), 0);
  assert.ok(sent.some((s) => /Prep for "Boiler service" .*Clear access/.test(s.body)));
  assert.equal(sent.length, 6);
});

test('unassigned reminders invite someone to claim the task', async () => {
  const { app, db, notifier, sent } = setup();
  const { naser } = await couple(app);
  const due = new Date(Date.now() + 48 * HOUR);
  await naser.agent.post('/api/tasks').send({ title: 'Hedge trimming', due_at: due.toISOString(), reminder_offsets: [60] });
  sent.length = 0;
  await deliverDueReminders(db, notifier, new Date(due - HOUR));
  assert.equal(sent.length, 2);
  assert.ok(sent.every((s) => /Nobody has taken it yet/.test(s.body) && /I'll take it/.test(s.chatHint)));
});

test('ticked prep steps stop reminding', async () => {
  const { app, db, notifier } = setup();
  const { naser } = await couple(app);
  const due = new Date(Date.now() + 48 * HOUR);
  const task = (await naser.agent.post('/api/tasks').send({
    title: 'Hedge trimming', due_at: due.toISOString(), reminder_offsets: [],
    prep_steps: [{ title: 'Charge the trimmer', due_at: new Date(due - 24 * HOUR).toISOString() }],
  })).body;
  await naser.agent.patch(`/api/prep-steps/${task.prep_steps[0].id}`).send({ done: true });
  assert.equal(await deliverDueReminders(db, notifier, new Date(due - 2 * HOUR)), 0);
});

test('rescheduling replaces pending reminders', async () => {
  const { app, db } = setup();
  const { naser } = await couple(app);
  const task = (await naser.agent.post('/api/tasks').send({
    title: 'Dentist', due_at: new Date(Date.now() + 48 * HOUR).toISOString(), owner_id: naser.me.user.id, reminder_offsets: [60],
  })).body;
  const later = new Date(Date.now() + 96 * HOUR);
  await naser.agent.patch(`/api/tasks/${task.id}`).send({ due_at: later.toISOString() });
  const rows = db.prepare('SELECT remind_at FROM task_reminders WHERE task_id = ?').all(task.id);
  assert.deepEqual(rows.map((r) => r.remind_at), [new Date(later - HOUR).toISOString()]);
  // A PATCH only changes what it sends.
  const after = (await naser.agent.get(`/api/tasks/${task.id}`)).body;
  assert.equal(after.owner_id, naser.me.user.id);
  assert.deepEqual(after.reminder_offsets, [60]);
});
