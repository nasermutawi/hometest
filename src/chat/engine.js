// Turns a chat message from a household member into task changes and a reply.
// Used by the in-app chat and the WhatsApp webhook alike.
import { createClaudeInterpreter } from './claudeInterpreter.js';
import { interpretWithRules } from './rulesInterpreter.js';
import { formatWhen, localNow, localDateTime, localToIso, prepDueIso, describeRecurrence, shiftStep } from '../time.js';

export function createInterpreter({ apiKey = process.env.ANTHROPIC_API_KEY, logger = console } = {}) {
  const claude = apiKey ? createClaudeInterpreter({ apiKey }) : null;
  return async (input) => {
    if (claude) {
      try {
        return await claude(input);
      } catch (err) {
        logger.error('Claude chat interpretation failed, using rules fallback:', err.message);
      }
    }
    return interpretWithRules(input);
  };
}

export function createChatEngine({ db, tasks, parser, interpreter }) {
  // The task a message is about: the one a replied-to message was about, else the
  // last task the conversation touched in the past day.
  function contextTask(user, replyToExternalId) {
    if (replyToExternalId) {
      const row = db.prepare('SELECT task_id FROM chat_messages WHERE external_id = ? AND user_id = ?').get(replyToExternalId, user.id);
      if (row?.task_id) return row.task_id;
    }
    const since = new Date(Date.now() - 86400_000).toISOString();
    return db.prepare('SELECT task_id FROM chat_messages WHERE user_id = ? AND task_id IS NOT NULL AND created_at > ? ORDER BY id DESC LIMIT 1')
      .get(user.id, since)?.task_id ?? null;
  }

  function record(user, { channel, direction, body, taskId = null, externalId = null }) {
    db.prepare('INSERT INTO chat_messages (user_id, channel, direction, external_id, task_id, body) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, channel, direction, externalId, taskId, body);
  }

  function describe(task, tz, names) {
    const repeat = describeRecurrence(task.recurrence_unit, task.recurrence_interval);
    return `"${task.title}", ${task.due_at ? formatWhen(task.due_at, tz) : 'no date'}, ${task.owner_id ? names.get(task.owner_id) : 'unassigned'}${repeat ? `, repeats ${repeat}` : ''}`;
  }

  async function createFromText(actor, text, tz, members) {
    const draft = await parser({ text, now: localNow(tz), members, speaker: actor.name });
    const owner = members.find((m) => m.name.toLowerCase() === draft.owner?.toLowerCase());
    const dueAt = draft.due_date ? localToIso(draft.due_date, draft.due_time, tz) : null;
    return tasks.create(actor, {
      title: draft.title,
      notes: draft.notes,
      category: draft.category,
      due_at: dueAt,
      owner_id: owner?.id ?? null,
      reminder_offsets: draft.reminder_offsets_minutes?.length ? draft.reminder_offsets_minutes : [1440, 60],
      recurrence: dueAt ? draft.recurrence : null,
      prep_steps: draft.prep_steps.map((s) => ({ title: s.title, due_at: prepDueIso(dueAt, s.days_before, tz) })),
      source_text: text,
    });
  }

  async function apply(actor, op, ctx) {
    const { tz, members, names } = ctx;
    if (op.type === 'list') {
      const open = tasks.list(actor.household_id, 'open').slice(0, 12);
      return { line: open.length ? `Coming up:\n${open.map((t) => `• ${describe(t, tz, names)}`).join('\n')}` : 'Nothing on the list. Enjoy it!' };
    }
    if (op.type === 'create') {
      const task = await createFromText(actor, op.text || '', tz, members);
      const steps = tasks.serialize(task).prep_steps.map((s) => s.title);
      return {
        taskId: task.id,
        line: `Added ${describe(task, tz, names)}.${steps.length ? ` Prep: ${steps.join('; ')}.` : ''}${task.due_at ? '' : ' No date yet, reply with one to set it.'}`,
      };
    }

    const taskId = op.task_id ?? ctx.contextTaskId;
    let task;
    try {
      task = taskId ? tasks.get(taskId, actor.household_id) : null;
    } catch {
      task = null;
    }
    if (!task) return { line: 'Which task do you mean? Say part of its name, or reply to one of my messages about it.' };

    switch (op.type) {
      case 'complete': {
        const { next } = tasks.update(actor, task.id, { status: 'done' });
        return { taskId: next?.id ?? task.id, line: `Marked "${task.title}" as done.${next ? ` Next one: ${formatWhen(next.due_at, tz)}.` : ''}` };
      }
      case 'reopen':
        tasks.update(actor, task.id, { status: 'open' });
        return { taskId: task.id, line: `Reopened "${task.title}".` };
      case 'reschedule': {
        const current = task.due_at ? localDateTime(task.due_at, tz) : { date: localNow(tz).slice(0, 10), time: '09:00' };
        const dueAt = localToIso(op.due_date || current.date, op.due_time || current.time, tz);
        // Prep steps move with the task.
        const prep = tasks.serialize(task).prep_steps.map((s) => ({
          id: s.id, title: s.title, due_at: shiftStep(s.due_at, task.due_at, dueAt, tz) ?? prepDueIso(dueAt, 1, tz),
        }));
        const { task: updated } = tasks.update(actor, task.id, { due_at: dueAt, prep_steps: prep });
        return { taskId: task.id, line: `Moved "${task.title}" to ${formatWhen(updated.due_at, tz)}.` };
      }
      case 'assign': {
        const who = /^(me|i|myself)$/i.test(op.owner ?? '') ? actor : members.find((m) => m.name.toLowerCase() === (op.owner ?? '').toLowerCase());
        if (!who) return { line: `I don't know who "${op.owner}" is. Members: ${members.map((m) => m.name).join(', ')}.` };
        tasks.update(actor, task.id, { owner_id: who.id });
        const others = members.filter((m) => m.id !== actor.id).map((m) => m.name).join(' and ');
        return {
          taskId: task.id,
          line: who.id === actor.id
            ? `"${task.title}" is yours.${others ? ` I've let ${others} know.` : ''}`
            : `Assigned "${task.title}" to ${who.name}. I've let them know.`,
        };
      }
      case 'unassign':
        tasks.update(actor, task.id, { owner_id: null });
        return { taskId: task.id, line: `"${task.title}" is unassigned now.` };
      case 'rename':
        if (!op.text) return { line: 'What should the new title be?' };
        tasks.update(actor, task.id, { title: op.text });
        return { taskId: task.id, line: `Renamed "${task.title}" to "${op.text}".` };
      case 'add_note':
        if (!op.text) return { line: 'What should I add?' };
        tasks.update(actor, task.id, { notes: task.notes ? `${task.notes}\n${op.text}` : op.text });
        return { taskId: task.id, line: `Added that to the notes on "${task.title}".` };
      default:
        return { line: '' };
    }
  }

  // Returns { reply, taskId }. The caller delivers the reply and records it.
  async function handle({ user, text, channel, replyToExternalId = null, externalId = null }) {
    const contextTaskId = contextTask(user, replyToExternalId);
    record(user, { channel, direction: 'in', body: text, taskId: contextTaskId, externalId });

    const tz = tasks.tzOf(user.household_id);
    const members = tasks.members(user.household_id);
    const names = new Map(members.map((m) => [m.id, m.name]));
    const recent = tasks.list(user.household_id, 'all').filter((t) => t.status === 'open' || t.id === contextTaskId).slice(0, 60);
    const plan = await interpreter({
      text,
      speaker: user.name,
      members,
      tasks: recent.map((t) => ({
        id: t.id, title: t.title, status: t.status, owner: names.get(t.owner_id) ?? null,
        when: t.due_at ? formatWhen(t.due_at, tz) : 'no date', repeat: describeRecurrence(t.recurrence_unit, t.recurrence_interval),
      })),
      contextTaskId,
      now: localNow(tz),
    });

    const lines = [];
    let taskId = contextTaskId;
    for (const op of plan.operations) {
      try {
        const result = await apply(user, op, { tz, members, names, contextTaskId });
        if (result.line) lines.push(result.line);
        if (result.taskId) taskId = result.taskId;
      } catch (err) {
        lines.push(`Couldn't do that: ${err.message}`);
      }
    }
    if (plan.message) lines.push(plan.message);
    return { reply: lines.join('\n') || 'OK.', taskId };
  }

  return { handle, record };
}
