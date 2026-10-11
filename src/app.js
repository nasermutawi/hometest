import express from 'express';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transaction } from './db.js';
import {
  COOKIE_NAME, hashPassword, checkPassword, newInviteCode, createSession, destroySession,
  loadUser, requireUser, requireHousehold, sessionToken,
} from './auth.js';
import { planReminders } from './reminders.js';
import { CATEGORIES } from './ai/schema.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const RegisterBody = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  inviteCode: z.string().trim().optional(),
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
  prep_steps: taskFields.prep_steps.default([]),
  source_text: taskFields.source_text.default(null),
});
// No defaults here: a PATCH only touches the fields it sends.
const TaskPatch = z.object(taskFields).partial().extend({ status: z.enum(['open', 'done']).optional() });
const ParseBody = z.object({
  text: z.string().trim().min(1).max(2000),
  now: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'now must be local YYYY-MM-DDTHH:MM'),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).max(10).default([]),
});

function validate(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const err = new Error(`${issue.path.join('.') || 'body'}: ${issue.message}`);
    err.status = 400;
    throw err;
  }
  return result.data;
}

export function createApp({ db, parser, notifier, logger = console }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser(db));

  const members = (householdId) => db.prepare('SELECT id, name, email FROM users WHERE household_id = ? ORDER BY id').all(householdId);
  const household = (id) => db.prepare('SELECT id, name, invite_code FROM households WHERE id = ?').get(id);

  function setSessionCookie(res, userId) {
    const { token, maxAge } = createSession(db, userId);
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', maxAge, secure: process.env.NODE_ENV === 'production' });
    return token;
  }

  function createHousehold(name) {
    const { lastInsertRowid } = db.prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)').run(name, newInviteCode());
    return Number(lastInsertRowid);
  }

  function findHouseholdByCode(code) {
    const h = db.prepare('SELECT id FROM households WHERE invite_code = ?').get(code.toUpperCase());
    if (!h) throw Object.assign(new Error('Invite code not found'), { status: 404 });
    return h.id;
  }

  // ---- Auth & household -------------------------------------------------

  app.post('/api/auth/register', (req, res) => {
    const body = validate(RegisterBody, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    const userId = transaction(db, () => {
      const householdId = body.inviteCode ? findHouseholdByCode(body.inviteCode) : createHousehold(`${body.name}'s household`);
      return Number(db.prepare('INSERT INTO users (email, name, password_hash, household_id) VALUES (?, ?, ?, ?)')
        .run(body.email, body.name, hashPassword(body.password), householdId).lastInsertRowid);
    });
    const token = setSessionCookie(res, userId);
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
    res.json({
      user: req.user,
      household: h,
      members: h ? members(h.id) : [],
      assistant: parser.engine,
      vapidPublicKey: notifier.vapidPublicKey,
      channels: notifier.channels,
      categories: CATEGORIES,
    });
  });

  app.patch('/api/household', requireHousehold, (req, res) => {
    const { name } = validate(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    db.prepare('UPDATE households SET name = ? WHERE id = ?').run(name, req.user.household_id);
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
      if (m.id !== req.user.id) notifier.notify(m.id, { title: 'New household member', body: `${req.user.name} joined your household` }).catch((err) => logger.error(err));
    }
    res.json(household(householdId));
  });

  // ---- Tasks ------------------------------------------------------------

  function taskRow(id, householdId) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND household_id = ?').get(id, householdId);
    if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
    return task;
  }

  function serialize(task) {
    return {
      ...task,
      reminder_offsets: JSON.parse(task.reminder_offsets),
      prep_steps: db.prepare('SELECT id, title, due_at, done FROM prep_steps WHERE task_id = ? ORDER BY position, id').all(task.id)
        .map((s) => ({ ...s, done: Boolean(s.done) })),
    };
  }

  function checkOwner(ownerId, householdId) {
    if (ownerId == null) return;
    if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND household_id = ?').get(ownerId, householdId)) {
      throw Object.assign(new Error('Owner must be a member of your household'), { status: 400 });
    }
  }

  function saveSteps(taskId, steps) {
    const existing = new Set(db.prepare('SELECT id FROM prep_steps WHERE task_id = ?').all(taskId).map((r) => r.id));
    const keep = new Set();
    steps.forEach((s, position) => {
      if (s.id && existing.has(s.id)) {
        keep.add(s.id);
        db.prepare('UPDATE prep_steps SET title = ?, due_at = ?, done = COALESCE(?, done), position = ? WHERE id = ?')
          .run(s.title, s.due_at ?? null, s.done == null ? null : Number(s.done), position, s.id);
      } else {
        db.prepare('INSERT INTO prep_steps (task_id, title, due_at, done, position) VALUES (?, ?, ?, ?, ?)')
          .run(taskId, s.title, s.due_at ?? null, Number(s.done ?? false), position);
      }
    });
    for (const id of existing) if (!keep.has(id)) db.prepare('DELETE FROM prep_steps WHERE id = ?').run(id);
  }

  function announceAssignment(task, actor) {
    if (task.owner_id && task.owner_id !== actor.id) {
      notifier.notify(task.owner_id, { title: `${actor.name} assigned you a task`, body: task.title, taskId: task.id })
        .catch((err) => logger.error(err));
    }
  }

  app.get('/api/tasks', requireHousehold, (req, res) => {
    const status = req.query.status ?? 'all';
    const rows = db.prepare(`
      SELECT * FROM tasks WHERE household_id = ? AND (? = 'all' OR status = ?)
      ORDER BY status, due_at IS NULL, due_at, id`).all(req.user.household_id, status, status);
    res.json(rows.map(serialize));
  });

  app.post('/api/tasks', requireHousehold, (req, res) => {
    const body = validate(TaskBody, req.body);
    checkOwner(body.owner_id, req.user.household_id);
    const task = transaction(db, () => {
      const id = Number(db.prepare(`
        INSERT INTO tasks (household_id, title, notes, category, due_at, owner_id, created_by, reminder_offsets, source_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.household_id, body.title, body.notes, body.category, body.due_at, body.owner_id,
        req.user.id, JSON.stringify(body.reminder_offsets), body.source_text,
      ).lastInsertRowid);
      saveSteps(id, body.prep_steps);
      planReminders(db, id);
      return taskRow(id, req.user.household_id);
    });
    announceAssignment(task, req.user);
    res.status(201).json(serialize(task));
  });

  app.get('/api/tasks/:id', requireHousehold, (req, res) => {
    res.json(serialize(taskRow(Number(req.params.id), req.user.household_id)));
  });

  app.patch('/api/tasks/:id', requireHousehold, (req, res) => {
    const before = taskRow(Number(req.params.id), req.user.household_id);
    const body = validate(TaskPatch, req.body);
    if ('owner_id' in body) checkOwner(body.owner_id, req.user.household_id);
    const task = transaction(db, () => {
      const fields = ['title', 'notes', 'category', 'due_at', 'owner_id', 'status'].filter((f) => f in body);
      const sets = fields.map((f) => `${f} = ?`);
      const values = fields.map((f) => body[f]);
      if (body.reminder_offsets) { sets.push('reminder_offsets = ?'); values.push(JSON.stringify(body.reminder_offsets)); }
      if (body.status) { sets.push('completed_at = ?'); values.push(body.status === 'done' ? new Date().toISOString() : null); }
      sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
      db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values, before.id);
      if (body.prep_steps) saveSteps(before.id, body.prep_steps);
      planReminders(db, before.id);
      return taskRow(before.id, req.user.household_id);
    });
    if (task.owner_id !== before.owner_id) announceAssignment(task, req.user);
    if (body.status === 'done' && before.status !== 'done') {
      for (const m of members(req.user.household_id)) {
        if (m.id !== req.user.id) {
          notifier.notify(m.id, { title: `${req.user.name} finished a task`, body: task.title, taskId: task.id }).catch((err) => logger.error(err));
        }
      }
    }
    res.json(serialize(task));
  });

  app.delete('/api/tasks/:id', requireHousehold, (req, res) => {
    const task = taskRow(Number(req.params.id), req.user.household_id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    res.json({ ok: true });
  });

  app.patch('/api/prep-steps/:id', requireHousehold, (req, res) => {
    const { done } = validate(z.object({ done: z.boolean() }), req.body);
    const step = db.prepare(`
      SELECT p.id, p.task_id FROM prep_steps p JOIN tasks t ON t.id = p.task_id
      WHERE p.id = ? AND t.household_id = ?`).get(Number(req.params.id), req.user.household_id);
    if (!step) return res.status(404).json({ error: 'Step not found' });
    db.prepare('UPDATE prep_steps SET done = ? WHERE id = ?').run(Number(done), step.id);
    planReminders(db, step.task_id);
    res.json(serialize(taskRow(step.task_id, req.user.household_id)));
  });

  // ---- Plain-language parsing -------------------------------------------

  app.post('/api/parse', requireHousehold, async (req, res, next) => {
    try {
      const body = validate(ParseBody, req.body);
      const people = members(req.user.household_id);
      const draft = await parser({ ...body, members: people, speaker: req.user.name });
      const owner = people.find((m) => m.name.toLowerCase() === draft.owner?.toLowerCase());
      res.json({ ...draft, owner_id: owner?.id ?? null });
    } catch (err) {
      next(err);
    }
  });

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
    await notifier.notify(req.user.id, { title: 'Test reminder', body: 'Notifications are working on this device.' });
    res.json({ ok: true });
  });

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
