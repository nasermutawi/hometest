// S2 part 2: the To-dos mic hears shopping too. "Cook the ragu tonight, and we need milk" saves the
// task, and "milk" comes back as forCart for the phone to put in the cart. Nothing said is lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.js';

const NAS = 'naser@example.com';
const SANDI = 'sandi@example.com';
const SLIM = { slim: true };

function household({ linked = true, items = [] } = {}) {
  const gas = createGas({ owner: NAS, start: '2026-11-22T10:00:00Z' });
  gas.as(NAS);
  gas.context.setup();
  gas.call(SANDI, 'joinHousehold', 'Sandi');
  if (linked) {
    const i = gas.rows('Settings').findIndex((r) => r.Setting === 'Groceries sheet');
    gas.sheet('Settings').getRange(i + 2, 2).setValue(`https://docs.google.com/spreadsheets/d/${gas.GROCERIES_ID}/edit#gid=0`);
  }
  gas.context.forgetShared_('settings');
  const key = gas.context.keyFor_(NAS, false);
  const api = (fn, ...args) => {
    const r = gas.api(key, fn, ...args);
    if (!r.ok) throw new Error(r.message);
    return r.result;
  };
  items.forEach((name) => { api('addToCart', { name }, 1, SLIM); });
  items.forEach((name, n) => { api('setCartQty', n + 1, 0, SLIM); });
  return { gas, api };
}

const said = (h, text) => {
  const r = h.api('capture', text, SLIM);
  return { tasks: r.tasks.map((t) => t.title), cart: r.forCart || [], notice: r.notice || '', reply: r };
};

test('a mixed recording: one task and one thing for the cart', () => {
  const h = household();
  const r = said(h, 'Cook the ragu tonight, and we need milk');
  assert.deepEqual(r.tasks, ['Cook the ragu']);
  assert.deepEqual(r.cart, ['milk']);
  assert.ok(r.reply.shopping && r.reply.shopping.linked, 'the reply carries the cart so the phone can add to it');
  assert.equal(r.reply.tasks[0].dueDate, '2026-11-22');
});

test('without a comma, "and we need" still starts the shopping', () => {
  const h = household();
  const r = said(h, 'cook the ragu tonight and we need milk and eggs');
  assert.deepEqual(r.tasks, ['Cook the ragu']);
  assert.deepEqual(r.cart, ['milk and eggs']);
});

test('only shopping: no task at all', () => {
  const h = household();
  assert.deepEqual(said(h, "We're out of eggs and toilet paper").cart, ['eggs and toilet paper']);
  const r = said(h, 'we need milk, eggs and two loaves of bread');
  assert.deepEqual(r.tasks, []);
  assert.deepEqual(r.cart, ['milk', 'eggs and two loaves of bread']);
  assert.deepEqual(said(h, 'Milk, eggs and bread.').cart, ['Milk, eggs and bread']);
  assert.deepEqual(said(h, 'add oats to the list').cart, ['oats']);
  assert.deepEqual(said(h, 'buy kitchen roll').cart, ['kitchen roll']);
});

test('tasks stay tasks', () => {
  const h = household();
  for (const text of [
    'we need to call the plumber',
    'pick up the dry cleaning tomorrow',
    'buy a present for Mum on Friday',
    'we need a plumber',
    'water the plants',
    'get the car washed',
    'I need to cook a ragu tonight, so I need to buy milk and then pick up the sauce',
  ]) {
    const r = said(h, text);
    assert.deepEqual(r.cart, [], text);
    assert.ok(r.tasks.length >= 1, text);
  }
});

test('names we already buy count even when they don\'t look like groceries', () => {
  const h = household({ items: ['Kleenex'] });
  assert.deepEqual(said(h, 'we need Kleenex').cart, ['Kleenex']);
  const r = said(h, 'we need batteries, and book the dentist');
  assert.deepEqual([r.tasks, r.cart], [['Book the dentist'], ['batteries']]);
  const both = said(h, 'call the bank, we need eggs, and book the dentist on Monday');
  assert.deepEqual([both.tasks, both.cart], [['Call the bank', 'Book the dentist'], ['eggs']]);
});

test('without the Groceries link it all stays a to-do, as before', () => {
  const h = household({ linked: false });
  const r = said(h, 'Cook the ragu tonight, and we need milk');
  assert.deepEqual(r.cart, []);
  assert.equal(r.reply.shopping, undefined);
  assert.equal(r.tasks.length, 1);
});

test('while Claude has the list, the shopping becomes a to-do and says why', () => {
  const h = household();
  h.api('addToCart', { name: 'Eggs' }, 1, SLIM);
  h.api('requestPrices', SLIM);
  const r = said(h, 'Cook the ragu tonight, and we need milk');
  assert.deepEqual(r.cart, []);
  assert.deepEqual(r.tasks, ['Cook the ragu', 'Buy milk']);
  assert.match(r.notice, /list is with Claude/);
});

const claudeSays = (plan) => ({ status: 200, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(plan) }] }) });

test('Claude: the prompt asks for "shopping", and an all-shopping reply saves no task', () => {
  const h = household();
  h.gas.context.PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', 'sk-test');
  h.gas.http.responder = () => claudeSays({ tasks: [{ title: 'Cook the ragu', due_date: '2026-11-22', due_time: '19:00', owner: null }], shopping: ['milk'] });
  const r = said(h, 'Cook the ragu tonight, and we need milk');
  assert.deepEqual(r.tasks, ['Cook the ragu']);
  assert.deepEqual(r.cart, ['milk']);
  const sent = JSON.parse(h.gas.http.calls[0].opts.payload);
  assert.match(sent.system, /"shopping": \["milk"\]/);
  assert.match(sent.system, /Nothing said may be dropped/);

  h.gas.http.responder = () => claudeSays({ tasks: [], shopping: ['eggs', 'two packs of blueberries'] });
  const only = said(h, "we're out of eggs, and two packs of blueberries");
  assert.deepEqual(only.tasks, []);
  assert.deepEqual(only.cart, ['eggs', 'two packs of blueberries']);
});

test('Claude: shopping with Shopping not linked turns into a to-do', () => {
  const h = household({ linked: false });
  h.gas.context.PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', 'sk-test');
  h.gas.http.responder = () => claudeSays({ tasks: [], shopping: ['milk'] });
  const r = said(h, 'we need milk');
  assert.deepEqual(r.tasks, ['Buy milk']);
  assert.deepEqual(r.cart, []);
});
