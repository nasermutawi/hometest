// Reminder planning and delivery. Reminder moments are stored per task whenever it
// changes; a timer delivers due ones to every household member, worded for each
// person ("you're on it" / "Sara is on it" / "nobody has taken it yet").
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { getSetting, setSetting } from './db.js';
import { formatWhen } from './time.js';

export const CLAIM_HINT = 'Reply "I\'ll take it" to claim it.';

function describeOffset(min) {
  if (min % 10080 === 0) return `${min / 10080} week${min === 10080 ? '' : 's'}`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? '' : 's'}`;
  return `${min} minutes`;
}

// Rebuilds the unsent reminders for one task. Called after every change to it.
export function planReminders(db, taskId, now = new Date()) {
  db.prepare('DELETE FROM task_reminders WHERE task_id = ? AND sent_at IS NULL').run(taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task || task.status !== 'open') return;

  const sent = new Set(db.prepare('SELECT prep_step_id, remind_at FROM task_reminders WHERE task_id = ? AND sent_at IS NOT NULL')
    .all(taskId).map((r) => `${r.prep_step_id}|${r.remind_at}`));
  const insert = db.prepare('INSERT INTO task_reminders (task_id, prep_step_id, remind_at, offset_minutes) VALUES (?, ?, ?, ?)');
  const add = (prepId, at, offset) => {
    const iso = at.toISOString();
    if (at > now && !sent.has(`${prepId}|${iso}`)) insert.run(taskId, prepId, iso, offset);
  };

  if (task.due_at) {
    const due = new Date(task.due_at);
    for (const offset of JSON.parse(task.reminder_offsets || '[]')) add(null, new Date(due - offset * 60_000), offset);
  }
  for (const step of db.prepare('SELECT * FROM prep_steps WHERE task_id = ? AND done = 0 AND due_at IS NOT NULL').all(taskId)) {
    add(step.id, new Date(step.due_at), null);
  }
}

// The reminder text for one household member.
export function reminderMessage({ task, step, offset, member, ownerName, tz }) {
  const when = formatWhen(task.due_at, tz);
  const what = step
    ? `Prep for "${task.title}" (${when}): ${step.title}.`
    : offset === 0 ? `"${task.title}" is due now.` : `"${task.title}" is due in ${describeOffset(offset)} (${when}).`;
  if (!task.owner_id) return { body: `${what} Nobody has taken it yet.`, chatHint: CLAIM_HINT };
  if (task.owner_id === member.id) return { body: `${what} You're on it.` };
  return { body: `${what} ${ownerName} is on it.` };
}

export function createNotifier(db, { logger = console, publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000', whatsapp = null } = {}) {
  // VAPID keys are generated once and stored so push subscriptions survive restarts.
  let vapid = JSON.parse(getSetting(db, 'vapid') || 'null');
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys();
    setSetting(db, 'vapid', JSON.stringify(vapid));
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

  const mailer = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  const mailFrom = process.env.MAIL_FROM || 'Household <no-reply@example.com>';

  async function notify(userId, { title, body, taskId = null, chatHint = null }) {
    db.prepare('INSERT INTO notifications (user_id, task_id, title, body) VALUES (?, ?, ?, ?)').run(userId, taskId, title, body);
    const user = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(userId);

    const subs = db.prepare('SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = ?').all(userId);
    const payload = JSON.stringify({ title, body, url: taskId ? `/#task-${taskId}` : '/' });
    const jobs = subs.map(async (s) => {
      try {
        await webpush.sendNotification(JSON.parse(s.subscription), payload);
      } catch (err) {
        // 404/410 mean the browser revoked the subscription.
        if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
        else logger.error('Push failed:', err.message);
      }
    });

    if (mailer) {
      jobs.push(mailer.sendMail({ from: mailFrom, to: user.email, subject: title, text: `${body}\n\n${publicUrl}` })
        .catch((err) => logger.error('Email failed:', err.message)));
    }

    if (whatsapp && user.phone) {
      const text = chatHint ? `${body}\n${chatHint}` : body;
      jobs.push(whatsapp.sendToUser(userId, text, { taskId }).catch((err) => logger.error('WhatsApp failed:', err.message)));
    }
    await Promise.all(jobs);
  }

  return {
    notify,
    vapidPublicKey: vapid.publicKey,
    channels: { push: true, email: Boolean(mailer), whatsapp: Boolean(whatsapp) },
  };
}

// Delivers every reminder that has come due. Returns how many reminder moments fired.
export async function deliverDueReminders(db, notifier, now = new Date()) {
  const due = db.prepare(`
    SELECT r.id, r.task_id, r.prep_step_id, r.offset_minutes
    FROM task_reminders r
    JOIN tasks t ON t.id = r.task_id
    LEFT JOIN prep_steps p ON p.id = r.prep_step_id
    WHERE r.sent_at IS NULL AND r.remind_at <= ? AND t.status = 'open' AND (p.id IS NULL OR p.done = 0)
    ORDER BY r.remind_at`).all(now.toISOString());
  const markSent = db.prepare('UPDATE task_reminders SET sent_at = ? WHERE id = ?');
  for (const r of due) {
    markSent.run(now.toISOString(), r.id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(r.task_id);
    const step = r.prep_step_id ? db.prepare('SELECT * FROM prep_steps WHERE id = ?').get(r.prep_step_id) : null;
    const tz = db.prepare('SELECT timezone FROM households WHERE id = ?').get(task.household_id).timezone;
    const members = db.prepare('SELECT id, name FROM users WHERE household_id = ?').all(task.household_id);
    const ownerName = members.find((m) => m.id === task.owner_id)?.name;
    for (const member of members) {
      const msg = reminderMessage({ task, step, offset: r.offset_minutes, member, ownerName, tz });
      await notifier.notify(member.id, { title: 'Reminder', taskId: task.id, ...msg });
    }
  }
  return due.length;
}

export function startReminderLoop(db, notifier, { intervalMs = 30_000, logger = console } = {}) {
  const tick = () => deliverDueReminders(db, notifier).catch((err) => logger.error('Reminder loop error:', err));
  tick();
  return setInterval(tick, intervalMs);
}
