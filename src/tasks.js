// Task operations shared by the web API and the chat assistant (in-app and WhatsApp).
// Every change goes through here so recurrence, reminders and household
// notifications behave the same whichever way a task was changed.
import { transaction } from './db.js';
import { planReminders, CLAIM_HINT } from './reminders.js';
import { addInterval, formatWhen, describeRecurrence, shiftStep } from './time.js';

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function createTaskService({ db, notifier, logger = console }) {
  const members = (householdId) => db.prepare('SELECT id, name, email, phone FROM users WHERE household_id = ? ORDER BY id').all(householdId);
  const household = (id) => db.prepare('SELECT id, name, invite_code, timezone FROM households WHERE id = ?').get(id);
  const tzOf = (householdId) => household(householdId)?.timezone ?? 'UTC';

  function get(id, householdId) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND household_id = ?').get(id, householdId);
    if (!task) throw httpError(404, 'Task not found');
    return task;
  }

  function serialize(task) {
    return {
      ...task,
      reminder_offsets: JSON.parse(task.reminder_offsets),
      recurrence: task.recurrence_unit ? { unit: task.recurrence_unit, interval: task.recurrence_interval } : null,
      prep_steps: db.prepare('SELECT id, title, due_at, done FROM prep_steps WHERE task_id = ? ORDER BY position, id').all(task.id)
        .map((s) => ({ ...s, done: Boolean(s.done) })),
    };
  }

  function checkOwner(ownerId, householdId) {
    if (ownerId == null) return;
    if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND household_id = ?').get(ownerId, householdId)) {
      throw httpError(400, 'Owner must be a member of your household');
    }
  }

  function checkRecurrence(recurrence, dueAt) {
    if (recurrence && !dueAt) throw httpError(400, 'A repeating task needs a date to start from');
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

  function insertTask(householdId, actorId, data) {
    const id = Number(db.prepare(`
      INSERT INTO tasks (household_id, title, notes, category, due_at, owner_id, created_by, reminder_offsets,
                         recurrence_unit, recurrence_interval, source_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      householdId, data.title, data.notes ?? '', data.category ?? 'other', data.due_at ?? null, data.owner_id ?? null,
      actorId, JSON.stringify(data.reminder_offsets ?? [1440, 60]),
      data.recurrence?.unit ?? null, data.recurrence ? data.recurrence.interval : null, data.source_text ?? null,
    ).lastInsertRowid);
    saveSteps(id, data.prep_steps ?? []);
    planReminders(db, id);
    return id;
  }

  // Sends each other household member a message built for them. `build(member)`
  // returns { body, chatHint? } or null to skip that member.
  function tellOthers(actor, task, title, build) {
    for (const m of members(task.household_id)) {
      if (m.id === actor.id) continue;
      const msg = build(m);
      if (msg) {
        notifier.notify(m.id, { title, taskId: task.id, ...msg }).catch((err) => logger.error('Notify failed:', err));
      }
    }
  }

  function ownerPhrase(task, member, names) {
    if (!task.owner_id) return 'Nobody has taken it yet.';
    return task.owner_id === member.id ? "It's assigned to you." : `${names.get(task.owner_id)} is on it.`;
  }

  // Creates the next occurrence of a repeating task when it's completed.
  function spawnNext(task, actorId) {
    if (!task.recurrence_unit || !task.due_at || task.next_task_id) return null;
    const tz = tzOf(task.household_id);
    let nextDue = task.due_at;
    // Skip occurrences that are already in the past (e.g. done very late).
    for (let i = 0; i < 1000; i++) {
      nextDue = addInterval(nextDue, task.recurrence_unit, task.recurrence_interval, tz);
      if (new Date(nextDue) > new Date()) break;
    }
    const steps = db.prepare('SELECT title, due_at FROM prep_steps WHERE task_id = ? ORDER BY position, id').all(task.id)
      .map((s) => ({ title: s.title, due_at: shiftStep(s.due_at, task.due_at, nextDue, tz) }));
    const nextId = insertTask(task.household_id, actorId, {
      ...task,
      due_at: nextDue,
      reminder_offsets: JSON.parse(task.reminder_offsets),
      recurrence: { unit: task.recurrence_unit, interval: task.recurrence_interval },
      prep_steps: steps,
    });
    db.prepare('UPDATE tasks SET next_task_id = ? WHERE id = ?').run(nextId, task.id);
    return get(nextId, task.household_id);
  }

  function create(actor, data) {
    checkOwner(data.owner_id, actor.household_id);
    checkRecurrence(data.recurrence, data.due_at);
    const task = transaction(db, () => get(insertTask(actor.household_id, actor.id, data), actor.household_id));
    const tz = tzOf(task.household_id);
    const names = new Map(members(task.household_id).map((m) => [m.id, m.name]));
    const repeat = describeRecurrence(task.recurrence_unit, task.recurrence_interval);
    tellOthers(actor, task, `${actor.name} added a task`, (m) => ({
      body: `${actor.name} added "${task.title}"${task.due_at ? ` for ${formatWhen(task.due_at, tz)}` : ''}${repeat ? ` (repeats ${repeat})` : ''}. ${ownerPhrase(task, m, names)}`,
      chatHint: task.owner_id ? null : CLAIM_HINT,
    }));
    return task;
  }

  function update(actor, id, patch) {
    const before = get(id, actor.household_id);
    if ('owner_id' in patch) checkOwner(patch.owner_id, actor.household_id);
    const recurrenceAfter = 'recurrence' in patch ? patch.recurrence : (before.recurrence_unit ? {} : null);
    checkRecurrence(recurrenceAfter, 'due_at' in patch ? patch.due_at : before.due_at);

    let next = null;
    const task = transaction(db, () => {
      const fields = ['title', 'notes', 'category', 'due_at', 'owner_id', 'status'].filter((f) => f in patch);
      const sets = fields.map((f) => `${f} = ?`);
      const values = fields.map((f) => patch[f]);
      if (patch.reminder_offsets) { sets.push('reminder_offsets = ?'); values.push(JSON.stringify(patch.reminder_offsets)); }
      if ('recurrence' in patch) {
        sets.push('recurrence_unit = ?', 'recurrence_interval = ?');
        values.push(patch.recurrence?.unit ?? null, patch.recurrence ? patch.recurrence.interval : null);
      }
      if (patch.status && patch.status !== before.status) {
        sets.push('completed_at = ?');
        values.push(patch.status === 'done' ? new Date().toISOString() : null);
      }
      sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
      db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values, before.id);
      if (patch.prep_steps) saveSteps(before.id, patch.prep_steps);
      planReminders(db, before.id);
      const after = get(before.id, actor.household_id);
      if (after.status === 'done' && before.status !== 'done') next = spawnNext(after, actor.id);
      return get(before.id, actor.household_id);
    });

    announceChanges(actor, before, task, next);
    return { task, next };
  }

  function announceChanges(actor, before, task, next) {
    const tz = tzOf(task.household_id);
    const names = new Map(members(task.household_id).map((m) => [m.id, m.name]));
    const completed = task.status === 'done' && before.status !== 'done';
    const reopened = task.status === 'open' && before.status === 'done';
    const ownerChanged = task.owner_id !== before.owner_id;
    const moved = task.due_at !== before.due_at && task.status === 'open';
    if (!completed && !reopened && !ownerChanged && !moved) return;

    const title = completed ? `${actor.name} finished a task` : `${actor.name} updated a task`;
    tellOthers(actor, task, title, (m) => {
      const parts = [];
      if (completed) {
        parts.push(`${actor.name} finished "${task.title}".`);
        if (next) parts.push(`The next one is set for ${formatWhen(next.due_at, tz)}.`);
      }
      if (reopened) parts.push(`${actor.name} reopened "${task.title}".`);
      if (ownerChanged && !completed) {
        if (task.owner_id === m.id) parts.push(`${actor.name} assigned "${task.title}" to you.`);
        else if (task.owner_id === actor.id) parts.push(`${actor.name} is taking care of "${task.title}".`);
        else if (task.owner_id) parts.push(`"${task.title}" is now with ${names.get(task.owner_id)}.`);
        else parts.push(`${actor.name} unassigned "${task.title}". Nobody has it now.`);
      }
      if (moved) parts.push(`${actor.name} moved "${task.title}" to ${task.due_at ? formatWhen(task.due_at, tz) : 'no date'}.`);
      return { body: parts.join(' '), chatHint: !task.owner_id && task.status === 'open' ? CLAIM_HINT : null };
    });
  }

  function setStepDone(actor, stepId, done) {
    const step = db.prepare(`
      SELECT p.id, p.task_id FROM prep_steps p JOIN tasks t ON t.id = p.task_id
      WHERE p.id = ? AND t.household_id = ?`).get(stepId, actor.household_id);
    if (!step) throw httpError(404, 'Step not found');
    db.prepare('UPDATE prep_steps SET done = ? WHERE id = ?').run(Number(done), step.id);
    planReminders(db, step.task_id);
    return get(step.task_id, actor.household_id);
  }

  function remove(actor, id) {
    const task = get(id, actor.household_id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    tellOthers(actor, task, `${actor.name} deleted a task`, () => ({ body: `${actor.name} deleted "${task.title}".` }));
  }

  function list(householdId, status = 'all') {
    return db.prepare(`
      SELECT * FROM tasks WHERE household_id = ? AND (? = 'all' OR status = ?)
      ORDER BY status, due_at IS NULL, due_at, id`).all(householdId, status, status);
  }

  return { members, household, tzOf, get, serialize, create, update, setStepDone, remove, list };
}
