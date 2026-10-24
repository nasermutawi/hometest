import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWithRules } from '../src/ai/rulesParser.js';
import { TaskDraftSchema } from '../src/ai/schema.js';

const members = [{ name: 'Naser' }, { name: 'Sara' }];
// Sunday 11 October 2026
const parse = (text, history) => parseWithRules({ text, now: '2026-10-11T10:00', members, speaker: 'Naser', history });

test('output always matches the shared draft schema', () => {
  for (const text of ['Renew passport', 'Weekly shop tomorrow', 'Plumber Thursday 10am']) {
    assert.ok(TaskDraftSchema.safeParse(parse(text)).success, text);
  }
});

test('relative and absolute dates', () => {
  assert.equal(parse('bins out tomorrow').due_date, '2026-10-12');
  assert.equal(parse('call mum today').due_date, '2026-10-11');
  assert.equal(parse('vet on Saturday').due_date, '2026-10-17');
  assert.equal(parse('vet on Sunday').due_date, '2026-10-18');
  assert.equal(parse('renew insurance in 2 weeks').due_date, '2026-10-25');
  assert.equal(parse('boiler service on 3rd November').due_date, '2026-11-03');
  assert.equal(parse('tax return by Jan 31').due_date, '2027-01-31');
  assert.equal(parse('meeting 2026-12-01').due_date, '2026-12-01');
});

test('times', () => {
  assert.equal(parse('dentist tomorrow at 3:30pm').due_time, '15:30');
  assert.equal(parse('dentist tomorrow 9am').due_time, '09:00');
  assert.equal(parse('dentist tomorrow morning').due_time, '09:00');
  assert.equal(parse('dentist tomorrow').due_time, null);
});

test('owners: named member, "I" means the speaker, otherwise ask', () => {
  assert.equal(parse('Sara to call the bank tomorrow').owner, 'Sara');
  assert.equal(parse('I need to call the bank tomorrow').owner, 'Naser');
  const unknown = parse('call the bank tomorrow');
  assert.equal(unknown.owner, null);
  assert.match(unknown.questions[0], /Who should own this/);
});

test('prep steps come only from what was said', () => {
  const draft = parse('Electrician coming Friday at 8am, make sure we clear the hallway first');
  assert.equal(draft.category, 'contractor');
  const titles = draft.prep_steps.map((s) => s.title);
  assert.ok(titles.includes('Clear the hallway'), titles.join('|'));
  assert.ok(!titles.includes('Confirm the appointment with the contractor'), 'no steps that were not said');
  assert.equal(draft.title, 'Electrician coming');
});

test('follow-up answers fill the gaps and stop the questions', () => {
  const first = parse('Renew the car insurance');
  assert.equal(first.questions.length, 2);
  const second = parse('Renew the car insurance', [
    { question: first.questions[0], answer: 'next Friday' },
    { question: first.questions[1], answer: 'Sara' },
  ]);
  assert.equal(second.due_date, '2026-10-16');
  assert.equal(second.owner, 'Sara');
  assert.deepEqual(second.questions, []);
});
