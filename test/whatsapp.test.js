import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createNotifier, deliverDueReminders } from '../src/reminders.js';
import { createWhatsApp } from '../src/channels/whatsapp.js';
import { parseWithRules } from '../src/ai/rulesParser.js';
import { signUp } from './helpers.js';

const SECRET = 'app-secret';
const quiet = { error() {}, log() {} };

function setupWhatsApp({ templateName = 'household_update' } = {}) {
  const db = openDb(':memory:');
  const outbox = [];
  let n = 0;
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    outbox.push(body);
    return { ok: true, json: async () => ({ messages: [{ id: `wamid.out${++n}` }] }) };
  };
  const whatsapp = createWhatsApp(db, {
    token: 't', phoneNumberId: '123', verifyToken: 'verify-me', appSecret: SECRET, templateName, templateLang: 'en', apiVersion: 'v23.0',
  }, { fetchImpl, logger: quiet });
  const notifier = createNotifier(db, { whatsapp, logger: quiet });
  const parser = async (input) => ({ ...parseWithRules(input), engine: 'rules' });
  parser.engine = 'rules';
  const app = createApp({ db, parser, notifier, whatsapp, logger: quiet });
  return { db, app, outbox, notifier };
}

function inbound(app, { from, text, id, replyTo }) {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ from, id, type: 'text', text: { body: text }, ...(replyTo ? { context: { id: replyTo } } : {}) }] } }] }],
  });
  const sig = `sha256=${createHmac('sha256', SECRET).update(payload).digest('hex')}`;
  return request(app).post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sig).send(payload);
}

// Webhook processing continues after the 200 is sent.
const settle = () => new Promise((r) => setTimeout(r, 50));

async function household() {
  const env = setupWhatsApp();
  const naser = await signUp(env.app, { name: 'Naser', email: 'n@example.com' });
  const sara = await signUp(env.app, { name: 'Sara', email: 's@example.com', inviteCode: naser.me.household.invite_code });
  await naser.agent.patch('/api/me').send({ phone: '+44 7700 900001' });
  await sara.agent.patch('/api/me').send({ phone: '+44 7700 900002' });
  return { ...env, naser, sara };
}

test('webhook verification handshake', async () => {
  const { app } = setupWhatsApp();
  const ok = await request(app).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' });
  assert.equal(ok.text, '42');
  await request(app).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' }).expect(403);
});

test('rejects webhook posts with a bad signature', async () => {
  const { app } = setupWhatsApp();
  await request(app).post('/webhooks/whatsapp').set('X-Hub-Signature-256', 'sha256=bad').send({ entry: [] }).expect(401);
});

test('reminders reach both people; replying "I\'ll take it" claims it and tells the other', async () => {
  const { app, db, outbox, notifier, naser } = await household();
  const due = new Date(Date.now() + 48 * 3600_000);
  await naser.agent.post('/api/tasks').send({ title: 'Call the roofer', due_at: due.toISOString(), reminder_offsets: [60] });
  outbox.length = 0;

  await deliverDueReminders(db, notifier, new Date(due - 3600_000));
  assert.equal(outbox.length, 2);
  // Neither person has messaged in the last 24h, so the approved template is used.
  assert.ok(outbox.every((m) => m.type === 'template' && m.template.name === 'household_update'));
  const toSara = outbox.find((m) => m.to === '447700900002');
  assert.match(toSara.template.components[0].parameters[0].text, /Nobody has taken it yet\. Reply "I'll take it"/);
  const reminderId = db.prepare("SELECT external_id FROM chat_messages WHERE user_id = (SELECT id FROM users WHERE name = 'Sara') AND direction = 'out' ORDER BY id DESC").get().external_id;
  outbox.length = 0;

  await inbound(app, { from: '447700900002', text: "I'll take it", id: 'wamid.in1', replyTo: reminderId }).expect(200);
  await settle();
  const replyToSara = outbox.find((m) => m.to === '447700900002');
  const toNaser = outbox.find((m) => m.to === '447700900001');
  // Sara just wrote, so her reply is a normal text message.
  assert.equal(replyToSara.type, 'text');
  assert.match(replyToSara.text.body, /"Call the roofer" is yours\. I've let Naser know\./);
  assert.match(toNaser.template.components[0].parameters[0].text, /Sara is taking care of "Call the roofer"/);

  // Duplicate delivery of the same message is ignored.
  outbox.length = 0;
  await inbound(app, { from: '447700900002', text: "I'll take it", id: 'wamid.in1', replyTo: reminderId });
  await settle();
  assert.equal(outbox.length, 0);

  // A follow-up without quoting still refers to the same task.
  await inbound(app, { from: '447700900002', text: 'done', id: 'wamid.in2' });
  await settle();
  assert.match(outbox.find((m) => m.to === '447700900002').text.body, /Marked "Call the roofer" as done/);
  assert.equal((await naser.agent.get('/api/tasks?status=done')).body.length, 1);
});

test('unknown numbers are told to link their number', async () => {
  const { app, outbox } = await household();
  await inbound(app, { from: '15550001111', text: 'hi', id: 'wamid.x' });
  await settle();
  assert.match(outbox[0].text.body, /isn't linked to a household/);
});
