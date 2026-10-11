import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, couple } from './helpers.js';

const say = async (who, text) => (await who.agent.post('/api/chat').send({ text }).expect(200)).body.reply;

async function withTask(fields = {}) {
  const env = setup();
  const people = await couple(env.app);
  await people.naser.agent.patch('/api/household').send({ timezone: 'Europe/London' });
  const task = (await people.naser.agent.post('/api/tasks').send({
    title: 'Clear the gutters', due_at: new Date(Date.now() + 3 * 86400_000).toISOString(), ...fields,
  })).body;
  return { ...env, ...people, task };
}

test('"I\'ll take it" claims the task under discussion and tells the partner', async () => {
  const { naser, sara, task, sent } = await withTask();
  await say(sara, "what's due?");
  // "the gutters" picks the task by name; the follow-up uses conversation context.
  assert.match(await say(sara, "I'll take the gutters"), /"Clear the gutters" is yours\. I've let Naser know\./);
  assert.equal((await naser.agent.get(`/api/tasks/${task.id}`)).body.owner_id, sara.me.user.id);
  assert.match(sent.at(-1).body, /Sara is taking care of "Clear the gutters"/);
  assert.match(await say(sara, 'done'), /Marked "Clear the gutters" as done/);
  assert.equal((await naser.agent.get(`/api/tasks/${task.id}`)).body.status, 'done');
});

test('reschedule keeps the time when only a day is given and moves prep with it', async () => {
  const { naser, task } = await withTask();
  const due = new Date(task.due_at);
  const withPrep = (await naser.agent.patch(`/api/tasks/${task.id}`).send({
    prep_steps: [{ title: 'Buy a ladder', due_at: new Date(due - 86400_000).toISOString() }],
  })).body;
  const reply = await say(naser, 'move the gutters to 2099-06-01');
  assert.match(reply, /Moved "Clear the gutters" to Mon, 1 Jun 2099/);
  const after = (await naser.agent.get(`/api/tasks/${task.id}`)).body;
  assert.equal(new Date(after.due_at).getUTCMinutes(), due.getUTCMinutes());
  assert.equal(new Date(after.due_at) - new Date(after.prep_steps[0].due_at), due - new Date(withPrep.prep_steps[0].due_at));
});

test('assign to a named member, and creating tasks from chat', async () => {
  const { naser, sara, task } = await withTask();
  assert.match(await say(naser, 'give the gutters to Sara'), /Assigned "Clear the gutters" to Sara/);
  assert.equal((await naser.agent.get(`/api/tasks/${task.id}`)).body.owner_id, sara.me.user.id);

  const reply = await say(naser, 'add: put the bins out every Monday evening, Naser');
  assert.match(reply, /Added "Put the bins out", Mon .*19:00, Naser, repeats weekly/);
  const bins = (await naser.agent.get('/api/tasks?status=open')).body.find((t) => t.title === 'Put the bins out');
  assert.deepEqual(bins.recurrence, { unit: 'week', interval: 1 });
});

test('unclear messages get help instead of guesses', async () => {
  const { naser } = await withTask();
  assert.match(await say(naser, 'banana'), /didn't catch that/);
  const history = (await naser.agent.get('/api/chat')).body;
  assert.deepEqual(history.map((m) => m.direction), ['in', 'out']);
});
