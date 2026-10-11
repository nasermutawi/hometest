import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, signUp, couple } from './helpers.js';

const inDays = (n) => new Date(Date.now() + n * 86400_000).toISOString();

test('partners share one household through an invite code', async () => {
  const { app } = setup();
  const { naser, sara } = await couple(app);
  assert.equal(sara.me.household.id, naser.me.household.id);
  assert.deepEqual(sara.me.members.map((m) => m.name), ['Naser', 'Sara']);
});

test('both partners can add tasks and see each other\'s', async () => {
  const { app } = setup();
  const { naser, sara } = await couple(app);
  await naser.agent.post('/api/tasks').send({ title: 'Call the plumber', due_at: inDays(2) }).expect(201);
  await sara.agent.post('/api/tasks').send({ title: 'Weekly shop', category: 'shopping' }).expect(201);
  const seenByNaser = (await naser.agent.get('/api/tasks').expect(200)).body.map((t) => t.title);
  const seenBySara = (await sara.agent.get('/api/tasks').expect(200)).body.map((t) => t.title);
  assert.deepEqual(seenByNaser.sort(), ['Call the plumber', 'Weekly shop']);
  assert.deepEqual(seenBySara.sort(), seenByNaser.sort());
});

test('other households cannot see or edit tasks', async () => {
  const { app } = setup();
  const { naser } = await couple(app);
  const stranger = await signUp(app, { name: 'Alex', email: 'alex@example.com' });
  const task = (await naser.agent.post('/api/tasks').send({ title: 'Private' })).body;
  assert.equal((await stranger.agent.get('/api/tasks')).body.length, 0);
  await stranger.agent.patch(`/api/tasks/${task.id}`).send({ title: 'Hacked' }).expect(404);
  await stranger.agent.delete(`/api/tasks/${task.id}`).expect(404);
  // Owners must be in the same household.
  await naser.agent.post('/api/tasks').send({ title: 'x', owner_id: stranger.me.user.id }).expect(400);
});

test('the partner hears about new tasks and assignments, worded for them', async () => {
  const { app, sent } = setup();
  const { naser, sara } = await couple(app);
  sent.length = 0;
  await naser.agent.post('/api/tasks').send({ title: 'Book MOT', owner_id: sara.me.user.id }).expect(201);
  const toSara = sent.filter((s) => s.userId === sara.me.user.id);
  assert.equal(toSara.length, 1);
  assert.match(toSara[0].body, /Naser added "Book MOT"\. It's assigned to you\./);
  // Naser made the change, so Naser isn't told about it.
  assert.equal(sent.filter((s) => s.userId === naser.me.user.id).length, 0);

  const task = (await naser.agent.post('/api/tasks').send({ title: 'Clear gutters' })).body;
  assert.match(sent.at(-1).body, /Nobody has taken it yet/);
  assert.match(sent.at(-1).chatHint, /I'll take it/);

  await sara.agent.patch(`/api/tasks/${task.id}`).send({ owner_id: sara.me.user.id }).expect(200);
  assert.equal(sent.at(-1).userId, naser.me.user.id);
  assert.match(sent.at(-1).body, /Sara is taking care of "Clear gutters"/);

  await sara.agent.patch(`/api/tasks/${task.id}`).send({ owner_id: naser.me.user.id }).expect(200);
  assert.match(sent.at(-1).body, /Sara assigned "Clear gutters" to you/);
});

test('prep steps are stored, editable and can be ticked off', async () => {
  const { app } = setup();
  const { naser, sara } = await couple(app);
  const task = (await naser.agent.post('/api/tasks').send({
    title: 'Electrician visit',
    due_at: inDays(5),
    prep_steps: [{ title: 'Clear the loft hatch', due_at: inDays(4) }, { title: 'Confirm time' }],
  })).body;
  assert.equal(task.prep_steps.length, 2);
  const ticked = (await sara.agent.patch(`/api/prep-steps/${task.prep_steps[0].id}`).send({ done: true }).expect(200)).body;
  assert.equal(ticked.prep_steps[0].done, true);
  // Editing keeps the done flag on existing steps and removes dropped ones.
  const edited = (await naser.agent.patch(`/api/tasks/${task.id}`).send({
    prep_steps: [{ id: task.prep_steps[0].id, title: 'Clear the loft hatch and landing' }],
  })).body;
  assert.deepEqual(edited.prep_steps.map((s) => [s.title, s.done]), [['Clear the loft hatch and landing', true]]);
});

test('completing a task notifies the partner and clears pending reminders', async () => {
  const { app, db } = setup();
  const { naser, sara } = await couple(app);
  const task = (await naser.agent.post('/api/tasks').send({ title: 'Pay council tax', due_at: inDays(3), owner_id: naser.me.user.id })).body;
  assert.ok(db.prepare('SELECT COUNT(*) n FROM task_reminders WHERE task_id = ?').get(task.id).n > 0);
  await naser.agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM task_reminders WHERE task_id = ? AND sent_at IS NULL').get(task.id).n, 0);
  assert.equal((await sara.agent.get('/api/notifications')).body[0].title, 'Naser finished a task');
});

test('plain-language parsing resolves the owner to a household member', async () => {
  const { app } = setup();
  const { naser } = await couple(app);
  const draft = (await naser.agent.post('/api/parse').send({
    text: 'Plumber coming Thursday at 10am to fix the leak, Sara to deal with it. Need to empty the cupboard under the sink before they arrive',
    now: '2026-10-11T09:00',
  }).expect(200)).body;
  assert.equal(draft.owner, 'Sara');
  assert.ok(draft.owner_id);
  assert.equal(draft.due_date, '2026-10-15');
  assert.equal(draft.due_time, '10:00');
  assert.ok(draft.prep_steps.some((s) => /cupboard/i.test(s.title)));
});

test('auth: rejects bad credentials, duplicate emails and anonymous access', async () => {
  const { app } = setup();
  await signUp(app, { name: 'Naser', email: 'naser@example.com' });
  await request(app).post('/api/auth/register').send({ name: 'X', email: 'NASER@example.com', password: 'password123' }).expect(409);
  await request(app).post('/api/auth/login').send({ email: 'naser@example.com', password: 'wrong' }).expect(401);
  await request(app).get('/api/tasks').expect(401);
  const { body } = await request(app).post('/api/auth/login').send({ email: 'naser@example.com', password: 'password123' }).expect(200);
  // Bearer tokens work too, for a future native client.
  await request(app).get('/api/tasks').set('Authorization', `Bearer ${body.token}`).expect(200);
  await request(app).post('/api/auth/register').send({ name: 'Y', email: 'y@example.com', password: 'short' }).expect(400);
});

test('phone numbers are normalised and unique', async () => {
  const { app } = setup();
  const { naser, sara } = await couple(app);
  assert.equal((await naser.agent.patch('/api/me').send({ phone: '+44 7700 900123' }).expect(200)).body.phone, '447700900123');
  await sara.agent.patch('/api/me').send({ phone: '0044 7700-900123' }).expect(409);
  await sara.agent.patch('/api/me').send({ phone: '123' }).expect(400);
  const me = (await sara.agent.get('/api/me')).body;
  assert.deepEqual(me.members.map((m) => m.whatsapp), [true, false]);
});

test('household timezone can be set and is validated', async () => {
  const { app } = setup();
  const { naser } = await couple(app);
  assert.equal((await naser.agent.patch('/api/household').send({ timezone: 'Asia/Kuwait' }).expect(200)).body.timezone, 'Asia/Kuwait');
  await naser.agent.patch('/api/household').send({ timezone: 'Mars/Olympus' }).expect(400);
});

test('joining with a code moves an existing user and their tasks', async () => {
  const { app } = setup();
  const naser = await signUp(app, { name: 'Naser', email: 'naser@example.com' });
  const sara = await signUp(app, { name: 'Sara', email: 'sara@example.com' });
  await sara.agent.post('/api/tasks').send({ title: 'Sara\'s early task' }).expect(201);
  await sara.agent.post('/api/household/join').send({ inviteCode: naser.me.household.invite_code.toLowerCase() }).expect(200);
  const titles = (await naser.agent.get('/api/tasks')).body.map((t) => t.title);
  assert.deepEqual(titles, ['Sara\'s early task']);
});
