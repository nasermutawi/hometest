// Offline interpreter for chat messages, used without an API key or if Claude fails.
// Understands the short replies people send most: done, I'll take it, move to Friday,
// assign to Sara, add: <task>, what's due.
import { findDate, findTime, parseNow } from '../ai/rulesParser.js';

export const HELP_TEXT = 'You can say things like: "done", "I\'ll take it", "move it to Friday 10am", "give it to Sara", "add: bins out every Monday evening" or "what\'s due?"';

const STOP_WORDS = new Set(['the', 'a', 'an', 'to', 'it', 'is', 'and', 'for', 'of', 'on', 'in', 'at', 'done', 'move', 'this', 'that', 'with', 'task', 'please']);

function words(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// The open task whose title shares the most words with the message.
function matchTask(text, tasks) {
  const said = new Set(words(text));
  let best = null;
  let bestScore = 0;
  for (const t of tasks) {
    const score = words(t.title).filter((w) => said.has(w) || said.has(w.replace(/s$/, ''))).length;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best ? best.id : null;
}

export function interpretWithRules({ text, speaker, members, tasks, contextTaskId, now }) {
  const t = text.trim();
  const lower = t.toLowerCase();
  const plan = (operations, message = '') => ({ operations, message });
  const op = (type, extra = {}) => ({ type, task_id: null, due_date: null, due_time: null, owner: null, text: null, ...extra });

  if (/^(help|\?|hi|hello|hey)\b/.test(lower)) return plan([], HELP_TEXT);
  if (/^(list|tasks|todo|to do)\b|what'?s (due|on|coming|left|next)|what do (i|we) (have|need)/.test(lower)) return plan([op('list')]);

  const create = /^(?:add|new(?: task)?|create|remind (?:me|us) to)\s*[:-]?\s*(.+)$/i.exec(t);
  if (create) return plan([op('create', { text: /^remind/i.test(t) ? t : create[1] })]);

  const matched = matchTask(t, tasks);
  const taskId = matched !== null ? matched : contextTaskId;
  const needTask = (operation) => (taskId ? plan([{ ...operation, task_id: taskId }]) : plan([], 'Which task do you mean? Say part of its name, or reply to one of my reminders.'));

  if (/\b(not done|undo|reopen)\b/.test(lower)) return needTask(op('reopen'));
  if (/\b(done|finished|completed|did it|sorted|all set|taken care of)\b/.test(lower)) return needTask(op('complete'));
  if (/\bunassign\b|nobody'?s doing it|can'?t do it/.test(lower)) return needTask(op('unassign'));
  if (/\b(i'?ll (take|do|handle|sort|grab|deal with)\b|i will (take|do|handle)\b|mine\b|i'?m on it|on it\b|i('?ve)? got (it|this))/.test(lower)) {
    return needTask(op('assign', { owner: speaker }));
  }
  const assignTo = members.find((m) => new RegExp(`\\b(?:assign|give|pass|hand)\\b.*\\bto ${m.name.toLowerCase()}\\b|\\b${m.name.toLowerCase()} (?:will|can|is going to|should) (?:do|take|handle)`).test(lower));
  if (assignTo) return needTask(op('assign', { owner: assignTo.name }));

  const date = findDate(t, parseNow(now));
  const time = findTime(t);
  if ((date || time) && (/\b(move|reschedule|postpone|push|change|delay|make it|instead|to)\b/.test(lower) || t.split(/\s+/).length <= 4)) {
    return needTask(op('reschedule', { due_date: date, due_time: time }));
  }

  return plan([], `Sorry, I didn't catch that. ${HELP_TEXT}`);
}
