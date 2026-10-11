import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, couple } from './helpers.js';
import { deliverDueReminders } from '../src/reminders.js';

const HOUR = 3600_000;

test('reminders go to the owner at each offset and for each prep step', async () => {
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

  const rows = db.prepare('SELECT user_id, remind_at FROM reminders WHERE task_id = ? ORDER BY remind_at').all(task.id);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.user_id === sara.me.user.id));

  // Nothing is due yet.
  assert.equal(await deliverDueReminders(db, notifier, new Date()), 0);
  // 24h before: the day-before reminder fires.
  assert.equal(await deliverDueReminders(db, notifier, new Date(due - 24 * HOUR)), 1);
  assert.match(sent[0].body, /Boiler service" is due in 1 day/);
  // Prep step reminder and the 1h reminder; neither is re-sent later.
  assert.equal(await deliverDueReminders(db, notifier, new Date(due - HOUR)), 2);
  assert.equal(await deliverDueReminders(db, notifier, due), 0);
  assert.ok(sent.some((s) => /Prep for "Boiler service": Clear access/.test(s.body)));
});

test('unassigned tasks remind everyone; ticked prep steps stop reminding', async () => {
  const { app, db, notifier } = setup();
  const { naser } = await couple(app);
  const due = new Date(Date.now() + 48 * HOUR);
  const task = (await naser.agent.post('/api/tasks').send({
    title: 'Hedge trimming', due_at: due.toISOString(), reminder_offsets: [60],
    prep_steps: [{ title: 'Charge the trimmer', due_at: new Date(due - 24 * HOUR).toISOString() }],
  })).body;
  assert.equal(db.prepare('SELECT COUNT(DISTINCT user_id) n FROM reminders WHERE task_id = ?').get(task.id).n, 2);
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
  const rows = db.prepare('SELECT remind_at FROM reminders WHERE task_id = ?').all(task.id);
  assert.deepEqual(rows.map((r) => r.remind_at), [new Date(later - HOUR).toISOString()]);
});
