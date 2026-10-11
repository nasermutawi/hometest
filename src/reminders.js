// Reminder planning and delivery. Reminders are materialised as rows whenever a task
// changes; a timer delivers the due ones through every configured channel.
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { getSetting, setSetting } from './db.js';

function recipients(db, task) {
  if (task.owner_id) return [task.owner_id];
  // Unassigned tasks remind the whole household.
  return db.prepare('SELECT id FROM users WHERE household_id = ?').all(task.household_id).map((r) => r.id);
}

function describeOffset(min) {
  if (min % 10080 === 0) return `${min / 10080} week${min === 10080 ? '' : 's'}`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? '' : 's'}`;
  return `${min} minutes`;
}

// Rebuilds the unsent reminders for one task. Called after every create/update.
export function planReminders(db, taskId, now = new Date()) {
  db.prepare('DELETE FROM reminders WHERE task_id = ? AND sent_at IS NULL').run(taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task || task.status !== 'open') return;

  const people = recipients(db, task);
  const insert = db.prepare('INSERT INTO reminders (task_id, prep_step_id, user_id, remind_at, message) VALUES (?, ?, ?, ?, ?)');
  const alreadySent = new Set(db.prepare('SELECT user_id, prep_step_id, remind_at FROM reminders WHERE task_id = ? AND sent_at IS NOT NULL')
    .all(taskId).map((r) => `${r.user_id}|${r.prep_step_id}|${r.remind_at}`));
  const add = (prepId, at, message) => {
    if (at <= now) return;
    const iso = at.toISOString();
    for (const uid of people) {
      if (!alreadySent.has(`${uid}|${prepId}|${iso}`)) insert.run(taskId, prepId, uid, iso, message);
    }
  };

  if (task.due_at) {
    const due = new Date(task.due_at);
    for (const offset of JSON.parse(task.reminder_offsets || '[]')) {
      add(null, new Date(due.getTime() - offset * 60_000), `"${task.title}" is due in ${describeOffset(offset)}`);
    }
  }
  const steps = db.prepare('SELECT * FROM prep_steps WHERE task_id = ? AND done = 0').all(taskId);
  for (const step of steps) {
    if (!step.due_at) continue;
    add(step.id, new Date(step.due_at), `Prep for "${task.title}": ${step.title}`);
  }
}

export function createNotifier(db, { logger = console, publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000' } = {}) {
  // VAPID keys are generated once and stored so push subscriptions survive restarts.
  let vapid = JSON.parse(getSetting(db, 'vapid') || 'null');
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys();
    setSetting(db, 'vapid', JSON.stringify(vapid));
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

  const mailer = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  const mailFrom = process.env.MAIL_FROM || 'Household <no-reply@example.com>';

  async function notify(userId, { title, body, taskId = null }) {
    db.prepare('INSERT INTO notifications (user_id, task_id, title, body) VALUES (?, ?, ?, ?)').run(userId, taskId, title, body);

    const subs = db.prepare('SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = ?').all(userId);
    const payload = JSON.stringify({ title, body, url: taskId ? `/#task-${taskId}` : '/' });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(JSON.parse(s.subscription), payload);
      } catch (err) {
        // 404/410 mean the browser revoked the subscription.
        if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
        else logger.error('Push failed:', err.message);
      }
    }));

    if (mailer) {
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      try {
        await mailer.sendMail({ from: mailFrom, to: user.email, subject: title, text: `${body}\n\n${publicUrl}` });
      } catch (err) {
        logger.error('Email failed:', err.message);
      }
    }
  }

  return { notify, vapidPublicKey: vapid.publicKey, channels: { push: true, email: Boolean(mailer) } };
}

// Delivers every reminder that has come due. Returns how many were sent.
export async function deliverDueReminders(db, notifier, now = new Date()) {
  const due = db.prepare(`
    SELECT r.id, r.user_id, r.task_id, r.message, t.title
    FROM reminders r
    JOIN tasks t ON t.id = r.task_id
    LEFT JOIN prep_steps p ON p.id = r.prep_step_id
    WHERE r.sent_at IS NULL AND r.remind_at <= ? AND t.status = 'open' AND (p.id IS NULL OR p.done = 0)
    ORDER BY r.remind_at`).all(now.toISOString());
  const markSent = db.prepare('UPDATE reminders SET sent_at = ? WHERE id = ?');
  for (const r of due) {
    markSent.run(now.toISOString(), r.id);
    await notifier.notify(r.user_id, { title: 'Reminder', body: r.message, taskId: r.task_id });
  }
  return due.length;
}

export function startReminderLoop(db, notifier, { intervalMs = 30_000, logger = console } = {}) {
  const tick = () => deliverDueReminders(db, notifier).catch((err) => logger.error('Reminder loop error:', err));
  tick();
  return setInterval(tick, intervalMs);
}
