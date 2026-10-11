import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, couple } from './helpers.js';
import { addInterval, localToIso, prepDueIso, formatWhen, shiftStep } from '../src/time.js';

test('intervals keep the local wall-clock time across DST changes', () => {
  // 09:00 London on 20 Oct (BST, UTC+1) -> 27 Oct and 3 Nov are after the clocks go back (GMT).
  const start = localToIso('2026-10-20', '09:00', 'Europe/London');
  assert.equal(start, '2026-10-20T08:00:00.000Z');
  assert.equal(addInterval(start, 'week', 1, 'Europe/London'), '2026-10-27T09:00:00.000Z');
  assert.equal(formatWhen(addInterval(start, 'week', 2, 'Europe/London'), 'Europe/London'), 'Tue 3 Nov, 09:00');
});

test('monthly, quarterly and yearly steps clamp to the end of short months', () => {
  const tz = 'Asia/Kuwait';
  const jan31 = localToIso('2027-01-31', '18:00', tz);
  assert.equal(formatWhen(addInterval(jan31, 'month', 1, tz), tz), 'Sun, 28 Feb 2027, 18:00');
  assert.equal(formatWhen(addInterval(jan31, 'month', 3, tz), tz), 'Fri, 30 Apr 2027, 18:00');
  assert.equal(formatWhen(addInterval(localToIso('2028-02-29', '10:00', tz), 'year', 1, tz), tz), 'Wed, 28 Feb 2029, 10:00');
  assert.equal(formatWhen(addInterval(jan31, 'month', 6, tz), tz), 'Sat, 31 Jul 2027, 18:00');
});

test('prep "days before" lands at 6pm local, same-day prep two hours before', () => {
  const due = localToIso('2026-11-03', '10:00', 'Europe/London');
  assert.equal(formatWhen(prepDueIso(due, 1, 'Europe/London'), 'Europe/London'), 'Mon 2 Nov, 18:00');
  assert.equal(formatWhen(prepDueIso(due, 0, 'Europe/London'), 'Europe/London'), 'Tue 3 Nov, 08:00');
});

test('prep steps keep their local time when a task moves across a clock change', () => {
  const tz = 'Europe/London';
  const oldDue = localToIso('2026-11-03', '09:00', tz);
  const newDue = localToIso('2026-10-16', '10:00', tz);
  assert.equal(formatWhen(shiftStep(prepDueIso(oldDue, 1, tz), oldDue, newDue, tz), tz), 'Thu 15 Oct, 18:00');
  // Same-day prep keeps its exact lead time.
  assert.equal(formatWhen(shiftStep(prepDueIso(oldDue, 0, tz), oldDue, newDue, tz), tz), 'Fri 16 Oct, 08:00');
});

test('completing a repeating task creates the next one with its prep steps', async () => {
  const { app, sent } = setup();
  const { naser, sara } = await couple(app);
  await naser.agent.patch('/api/household').send({ timezone: 'Europe/London' });
  const due = new Date(Date.now() + 3 * 86400_000);
  const task = (await naser.agent.post('/api/tasks').send({
    title: 'Service the boiler',
    due_at: due.toISOString(),
    owner_id: sara.me.user.id,
    recurrence: { unit: 'year', interval: 1 },
    prep_steps: [{ title: 'Clear the cupboard', due_at: new Date(due - 86400_000).toISOString() }],
  }).expect(201)).body;
  assert.deepEqual(task.recurrence, { unit: 'year', interval: 1 });

  const done = (await sara.agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200)).body;
  assert.ok(done.next);
  const nextDue = new Date(done.next.due_at);
  assert.equal(nextDue.getUTCFullYear(), due.getUTCFullYear() + 1);
  assert.equal(done.next.owner_id, sara.me.user.id);
  assert.deepEqual(done.next.recurrence, { unit: 'year', interval: 1 });
  assert.equal(done.next.prep_steps[0].title, 'Clear the cupboard');
  assert.equal(done.next.prep_steps[0].done, false);
  assert.match(sent.at(-1).body, /Sara finished "Service the boiler"\. The next one is set for/);

  // Reopening and completing again doesn't create a duplicate.
  await sara.agent.patch(`/api/tasks/${task.id}`).send({ status: 'open' });
  const again = (await sara.agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' })).body;
  assert.equal(again.next, null);
  const open = (await naser.agent.get('/api/tasks?status=open')).body;
  assert.equal(open.filter((t) => t.title === 'Service the boiler').length, 1);
});

test('an overdue weekly task done late jumps to the next future date', async () => {
  const { app } = setup();
  const { naser } = await couple(app);
  const due = new Date(Date.now() - 15 * 86400_000);
  const task = (await naser.agent.post('/api/tasks').send({ title: 'Bins', due_at: due.toISOString(), recurrence: { unit: 'week', interval: 1 } })).body;
  const { next } = (await naser.agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' })).body;
  const nextDue = new Date(next.due_at);
  assert.ok(nextDue > new Date() && nextDue - Date.now() <= 7 * 86400_000);
});

test('a repeating task needs a date', async () => {
  const { app } = setup();
  const { naser } = await couple(app);
  await naser.agent.post('/api/tasks').send({ title: 'Bins', recurrence: { unit: 'week', interval: 1 } }).expect(400);
});
