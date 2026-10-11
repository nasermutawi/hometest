import express from 'express';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transaction } from './db.js';
import {
  COOKIE_NAME, hashPassword, checkPassword, newInviteCode, createSession, destroySession,
  loadUser, requireUser, requireHousehold, sessionToken,
} from './auth.js';
import { CATEGORIES } from './ai/schema.js';
import { createTaskService, httpError } from './tasks.js';
import { createChatEngine } from './chat/engine.js';
import { interpretWithRules } from './chat/rulesInterpreter.js';
import { normalizePhone } from './channels/whatsapp.js';
import { isValidTimeZone, localNow, RECURRENCE_UNITS } from './time.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const RegisterBody = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  inviteCode: z.string().trim().optional(),
  timezone: z.string().optional(),
});
const LoginBody = z.object({ email: z.string().trim(), password: z.string() });

const PrepStepBody = z.object({
  id: z.number().int().optional(),
  title: z.string().trim().min(1).max(200),
  due_at: isoDate.nullable().optional(),
  done: z.boolean().optional(),
});
const taskFields = {
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000),
  category: z.enum(CATEGORIES),
  due_at: isoDate.nullable(),
  owner_id: z.number().int().nullable(),
  reminder_offsets: z.array(z.number().int().min(0).max(60 * 24 * 60)).max(10),
  recurrence: z.object({ unit: z.enum(RECURRENCE_UNITS), interval: z.number().int().min(1).max(60) }).nullable(),
  prep_steps: z.array(PrepStepBody).max(20),
  source_text: z.string().max(5000).nullable(),
};
const TaskBody = z.object({
  ...taskFields,
  notes: taskFields.notes.default(''),
  category: taskFields.category.default('other'),
  due_at: taskFields.due_at.default(null),
  owner_id: taskFields.owner_id.default(null),
  reminder_offsets: taskFields.reminder_offsets.default([1440, 60]),
  recurrence: taskFields.recurrence.default(null),
  prep_steps: taskFields.prep_steps.default([]),
  source_text: taskFields.source_text.default(null),
});
// No defaults here: a PATCH only touches the fields it sends.
const TaskPatch = z.object(taskFields).partial().extend({ status: z.enum(['open', 'done']).optional() });
const ParseBody = z.object({
  text: z.string().trim().min(1).max(2000),
  now: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'now must be local YYYY-MM-DDTHH:MM').optional(),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).max(10).default([]),
});

function validate(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw httpError(400, `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return result.data;
}

export function createApp({ db, parser, notifier, interpreter = interpretWithRules, whatsapp = null, logger = console }) {
  const app = express();
  // Keep the raw body so WhatsApp webhook signatures can be checked.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(loadUser(db));

  const tasks = createTaskService({ db, notifier, logger });
  const chat = createChatEngine({ db, tasks, parser, interpreter });
  const { members, household } = tasks;

  function setSessionCookie(res, userId) {
    const { token, maxAge } = createSession(db, userId);
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', maxAge, secure: process.env.NODE_ENV === 'production' });
    return token;
  }

  function createHousehold(name, timezone) {
    const tz = timezone && isValidTimeZone(timezone) ? timezone : 'UTC';
    const { lastInsertRowid } = db.prepare('INSERT INTO households (name, invite_code, timezone) VALUES (?, ?, ?)').run(name, newInviteCode(), tz);
    return Number(lastInsertRowid);
  }

  function findHouseholdByCode(code) {
    const h = db.prepare('SELECT id FROM households WHERE invite_code = ?').get(code.toUpperCase());
    if (!h) throw httpError(404, 'Invite code not found');
    return h.id;
  }

  const notifyQuietly = (userId, msg) => notifier.notify(userId, msg).catch((err) => logger.error(err));

  // ---- Auth & household -------------------------------------------------

  app.post('/api/auth/register', (req, res) => {
    const body = validate(RegisterBody, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    const userId = transaction(db, () => {
      const householdId = body.inviteCode ? findHouseholdByCode(body.inviteCode) : createHousehold(`${body.name}'s household`, body.timezone);
      return Number(db.prepare('INSERT INTO users (email, name, password_hash, household_id) VALUES (?, ?, ?, ?)')
        .run(body.email, body.name, hashPassword(body.password), householdId).lastInsertRowid);
    });
    const token = setSessionCookie(res, userId);
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    if (body.inviteCode) {
      for (const m of members(user.household_id)) {
        if (m.id !== userId) notifyQuietly(m.id, { title: 'New household member', body: `${body.name} joined your household.` });
      }
    }
    res.status(201).json({ token });
  });

  app.post('/api/auth/login', (req, res) => {
    const body = validate(LoginBody, req.body);
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(body.email);
    if (!user || !checkPassword(body.password, user.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    const token = setSessionCookie(res, user.id);
    res.json({ token });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = sessionToken(req);
    if (token) destroySession(db, token);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  app.get('/api/me', requireUser, (req, res) => {
    const h = req.user.household_id ? household(req.user.household_id) : null;
    const me = db.prepare('SELECT phone FROM users WHERE id = ?').get(req.user.id);
    res.json({
      user: { ...req.user, phone: me.phone },
      household: h,
      members: h ? members(h.id).map(({ phone, ...m }) => ({ ...m, whatsapp: Boolean(phone) })) : [],
      assistant: parser.engine,
      vapidPublicKey: notifier.vapidPublicKey,
      channels: notifier.channels,
      whatsappNumber: process.env.WHATSAPP_DISPLAY_NUMBER || null,
      categories: CATEGORIES,
    });
  });

  app.patch('/api/me', requireUser, (req, res) => {
    const { phone } = validate(z.object({ phone: z.string().max(30).nullable() }), req.body);
    const normalized = phone ? normalizePhone(phone) : null;
    if (phone && !normalized) throw httpError(400, 'Enter the number with its country code, e.g. +44 7700 900123');
    const taken = normalized && db.prepare('SELECT 1 FROM users WHERE phone = ? AND id != ?').get(normalized, req.user.id);
    if (taken) throw httpError(409, 'That number is already linked to another account');
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(normalized, req.user.id);
    res.json({ phone: normalized });
  });

  app.patch('/api/household', requireHousehold, (req, res) => {
    const body = validate(z.object({ name: z.string().trim().min(1).max(80).optional(), timezone: z.string().optional() }), req.body);
    if (body.timezone && !isValidTimeZone(body.timezone)) throw httpError(400, 'Unknown timezone');
    if (body.name) db.prepare('UPDATE households SET name = ? WHERE id = ?').run(body.name, req.user.household_id);
    if (body.timezone) db.prepare('UPDATE households SET timezone = ? WHERE id = ?').run(body.timezone, req.user.household_id);
    res.json(household(req.user.household_id));
  });

  // Moves the current user into another household (e.g. joining a partner's).
  app.post('/api/household/join', requireUser, (req, res) => {
    const { inviteCode } = validate(z.object({ inviteCode: z.string().trim().min(1) }), req.body);
    const householdId = findHouseholdByCode(inviteCode);
    transaction(db, () => {
      const old = req.user.household_id;
      db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(householdId, req.user.id);
      // Bring along tasks from a household the user leaves empty, so nothing is lost.
      if (old && old !== householdId && !db.prepare('SELECT 1 FROM users WHERE household_id = ?').get(old)) {
        db.prepare('UPDATE tasks SET household_id = ? WHERE household_id = ?').run(householdId, old);
        db.prepare('DELETE FROM households WHERE id = ?').run(old);
      }
    });
    for (const m of members(householdId)) {
      if (m.id !== req.user.id) notifyQuietly(m.id, { title: 'New household member', body: `${req.user.name} joined your household.` });
    }
    res.json(household(householdId));
  });

  // ---- Tasks ------------------------------------------------------------

  app.get('/api/tasks', requireHousehold, (req, res) => {
    res.json(tasks.list(req.user.household_id, req.query.status ?? 'all').map(tasks.serialize));
  });

  app.post('/api/tasks', requireHousehold, (req, res) => {
    const task = tasks.create(req.user, validate(TaskBody, req.body));
    res.status(201).json(tasks.serialize(task));
  });

  app.get('/api/tasks/:id', requireHousehold, (req, res) => {
    res.json(tasks.serialize(tasks.get(Number(req.params.id), req.user.household_id)));
  });

  app.patch('/api/tasks/:id', requireHousehold, (req, res) => {
    const { task, next } = tasks.update(req.user, Number(req.params.id), validate(TaskPatch, req.body));
    res.json({ ...tasks.serialize(task), next: next ? tasks.serialize(next) : null });
  });

  app.delete('/api/tasks/:id', requireHousehold, (req, res) => {
    tasks.remove(req.user, Number(req.params.id));
    res.json({ ok: true });
  });

  app.patch('/api/prep-steps/:id', requireHousehold, (req, res) => {
    const { done } = validate(z.object({ done: z.boolean() }), req.body);
    res.json(tasks.serialize(tasks.setStepDone(req.user, Number(req.params.id), done)));
  });

  // ---- Plain-language parsing and chat ----------------------------------

  app.post('/api/parse', requireHousehold, async (req, res) => {
    const body = validate(ParseBody, req.body);
    const people = members(req.user.household_id);
    const now = body.now ?? localNow(tasks.tzOf(req.user.household_id));
    const draft = await parser({ ...body, now, members: people, speaker: req.user.name });
    const owner = people.find((m) => m.name.toLowerCase() === draft.owner?.toLowerCase());
    res.json({ ...draft, owner_id: owner?.id ?? null });
  });

  app.get('/api/chat', requireHousehold, (req, res) => {
    const rows = db.prepare("SELECT id, direction, body, created_at FROM chat_messages WHERE user_id = ? AND channel = 'app' ORDER BY id DESC LIMIT 50")
      .all(req.user.id);
    res.json(rows.reverse());
  });

  app.post('/api/chat', requireHousehold, async (req, res) => {
    const { text } = validate(z.object({ text: z.string().trim().min(1).max(2000) }), req.body);
    const { reply, taskId } = await chat.handle({ user: req.user, text, channel: 'app' });
    chat.record(req.user, { channel: 'app', direction: 'out', body: reply, taskId });
    res.json({ reply, taskId });
  });

  if (whatsapp) app.use('/webhooks/whatsapp', whatsapp.router(chat));

  // ---- Notifications ----------------------------------------------------

  app.get('/api/notifications', requireUser, (req, res) => {
    res.json(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id)
      .map((n) => ({ ...n, read: Boolean(n.read) })));
  });

  app.post('/api/notifications/read', requireUser, (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  app.post('/api/push/subscribe', requireUser, (req, res) => {
    const sub = validate(z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).passthrough(), req.body);
    db.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, subscription) VALUES (?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription = excluded.subscription`)
      .run(sub.endpoint, req.user.id, JSON.stringify(sub));
    res.json({ ok: true });
  });

  app.post('/api/push/test', requireUser, async (req, res) => {
    await notifier.notify(req.user.id, { title: 'Test reminder', body: 'Notifications are working.' });
    res.json({ ok: true });
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // ---- Static front end & errors ----------------------------------------

  app.use(express.static(publicDir));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) logger.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}
