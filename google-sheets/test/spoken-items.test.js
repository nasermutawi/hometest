// Shopping mic (S2): one recording becomes several cart lines. The splitter lives in
// docs/index.html between the <spoken-items> markers; this test loads that block on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
const block = html.match(/\/\/ <spoken-items>[\s\S]*?\/\/ <\/spoken-items>/);
assert.ok(block, 'the <spoken-items> block is in docs/index.html');
const splitSpoken = new Function(`${block[0]}\nreturn splitSpoken;`)();

const OURS = ['Eggs', 'Milk', 'Egg whites', 'Blueberries', 'Mac and cheese', 'Chicken breast', 'Bread', 'Oats', 'Toilet paper'];
const said = (text, known = OURS) => splitSpoken(text, known).map((i) => [i.name, i.qty, i.size]);

test('commas and "and" split, with quantities', () => {
  assert.deepEqual(said('eggs, milk and two packs of blueberries'), [['Eggs', 1, ''], ['Milk', 1, ''], ['Blueberries', 2, '']]);
  assert.deepEqual(said('Milk, eggs and two loaves of bread', []), [['Milk', 1, ''], ['Eggs', 1, ''], ['Bread', 2, '']]);
});

test('dictation without commas splits on names we know and on numbers', () => {
  assert.deepEqual(said('eggs milk and two packs of blueberries'), [['Eggs', 1, ''], ['Milk', 1, ''], ['Blueberries', 2, '']]);
  assert.deepEqual(said('eggs milk bread'), [['Eggs', 1, ''], ['Milk', 1, ''], ['Bread', 1, '']]);
  assert.deepEqual(said('um a loaf of bread then three cans of tuna'), [['Bread', 1, ''], ['Tuna', 3, '']]);
});

test('known names stay whole, even with "and" inside', () => {
  assert.deepEqual(said('egg whites and mac and cheese'), [['Egg whites', 1, ''], ['Mac and cheese', 1, '']]);
  assert.deepEqual(said('chicken breast'), [['Chicken breast', 1, '']]);
});

test('nothing said is lost: unknown words stay together', () => {
  assert.deepEqual(said('almond milk'), [['Almond milk', 1, '']]);
  assert.deepEqual(said('eggs milk bananas'), [['Eggs milk bananas', 1, '']]);
});

test('a match takes our spelling, so it lands on the same item', () => {
  assert.deepEqual(said('we need a blueberry'), [['Blueberries', 1, '']]);
  assert.deepEqual(said('Can you add toilet paper please.'), [['Toilet paper', 1, '']]);
});

test('sizes are read apart from how many', () => {
  assert.deepEqual(said('1.5 kilo blueberries'), [['Blueberries', 1, '1.5 kg']]);
  assert.deepEqual(said('two 1.5 kg packs of blueberries and oats'), [['Blueberries', 2, '1.5 kg'], ['Oats', 1, '']]);
  assert.deepEqual(said('a dozen eggs, chicken breast times two'), [['Eggs', 1, '12'], ['Chicken breast', 2, '']]);
});

test('the same thing twice is one line; filler and empty bits are dropped', () => {
  assert.deepEqual(said('milk and milk'), [['Milk', 2, '']]);
  assert.deepEqual(said('Get some oats.'), [['Oats', 1, '']]);
  assert.deepEqual(said('and, um, please'), []);
  assert.deepEqual(said(''), []);
});
