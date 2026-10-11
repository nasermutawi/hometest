import request from 'supertest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { parseWithRules } from '../src/ai/rulesParser.js';

const quietLogger = { error() {}, log() {} };

export function setup() {
  const db = openDb(':memory:');
  const sent = [];
  const notifier = {
    vapidPublicKey: 'test-key',
    channels: { push: true, email: false },
    async notify(userId, msg) {
      db.prepare('INSERT INTO notifications (user_id, task_id, title, body) VALUES (?, ?, ?, ?)').run(userId, msg.taskId ?? null, msg.title, msg.body);
      sent.push({ userId, ...msg });
    },
  };
  const parser = async (input) => ({ ...parseWithRules(input), engine: 'rules' });
  parser.engine = 'rules';
  const app = createApp({ db, parser, notifier, logger: quietLogger });
  return { db, app, sent, notifier };
}

// Registers a user and returns a supertest agent that keeps their session cookie.
export async function signUp(app, { name, email, password = 'password123', inviteCode } = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password, inviteCode });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const me = await agent.get('/api/me');
  return { agent, me: me.body };
}

// Two partners sharing one household.
export async function couple(app) {
  const naser = await signUp(app, { name: 'Naser', email: 'naser@example.com' });
  const sara = await signUp(app, { name: 'Sara', email: 'sara@example.com', inviteCode: naser.me.household.invite_code });
  return { naser, sara };
}
