// Shopping, a Melody Duet: the catalogue and cart kept in the Home – Groceries sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.js';

const NAS = 'naser@example.com';
const SANDI = 'sandi@example.com';

// Sunday 22 Nov 2026, 10:00 in London.
function household({ linked = true } = {}) {
  const gas = createGas({ owner: NAS, start: '2026-11-22T10:00:00Z' });
  gas.as(NAS);
  gas.context.setup();
  gas.call(SANDI, 'joinHousehold', 'Sandi');
  if (linked) setSetting(gas, 'Groceries sheet', `https://docs.google.com/spreadsheets/d/${gas.GROCERIES_ID}/edit#gid=0`);
  gas.context.forgetShared_('settings');
  const keys = { nas: gas.context.keyFor_(NAS, false), sandi: gas.context.keyFor_(SANDI, false) };
  const api = (who, fn, ...args) => {
    const r = gas.api(keys[who], fn, ...args);
    if (!r.ok) throw new Error(r.message);
    return r.result;
  };
  return { gas, api };
}

function setSetting(gas, key, value) {
  const i = gas.rows('Settings').findIndex((r) => r.Setting === key);
  gas.sheet('Settings').getRange(i + 2, 2).setValue(value);
}

const SLIM = { slim: true };
const nameOf = (shop, line) => shop.items.find((i) => i.id === line.itemId).name;

test('without the Groceries link, Shopping says so and nothing opens another sheet', () => {
  const { gas, api } = household({ linked: false });
  assert.deepEqual(api('nas', 'getShopping'), { linked: false });
  assert.equal(gas.opened.length, 0);
  assert.throws(() => api('nas', 'addToCart', { name: 'Milk' }, 1, SLIM), /isn't linked to the Home – Groceries sheet yet/);
  // The To-do side doesn't touch the Groceries sheet at all.
  api('nas', 'getState');
  assert.equal(gas.opened.length, 0);
});

test('a link to a sheet the app cannot open gives a plain message', () => {
  const { gas, api } = household({ linked: false });
  setSetting(gas, 'Groceries sheet', 'https://docs.google.com/spreadsheets/d/1SomeoneElsesSheetIdXYZ1234/edit');
  gas.context.forgetShared_('settings');
  assert.throws(() => api('nas', 'getShopping'), /can't open the Home – Groceries sheet/);
});

test('first visit adds the Items and Requests tabs and the cart columns, keeping what is there', () => {
  const { gas, api } = household();
  const shop = api('nas', 'getShopping');
  assert.equal(shop.linked, true);
  assert.deepEqual(shop.cart, []);
  assert.deepEqual(gas.groceries.getSheets().map((s) => s.name),
    ['Read me', 'Order history', 'Item insights', 'Shopping list', 'Store rules', 'Favourites', 'Items', 'Requests']);
  assert.deepEqual(gas.gsheet('Shopping list').data[0],
    ['Item', 'Qty', 'Added by', 'Added on', '1st choice store', '2nd choice store', 'Notes', 'Status', 'Size', 'Brand', 'Item ID']);
});

test('typing a new thing adds it to the catalogue and the cart in one step, with its aisle and who added it', () => {
  const { gas, api } = household();
  const shop = api('sandi', 'addToCart', { name: 'Blueberries' }, 1, SLIM).shopping;
  assert.equal(shop.items.length, 1);
  assert.deepEqual(shop.items[0], { id: 1, name: 'Blueberries', size: '', brand: '', heart: false, aisle: 'Fruit and veg', addedBy: 'Sandi' });
  assert.deepEqual(shop.cart, [{ itemId: 1, qty: 1, addedBy: 'Sandi' }]);
  const row = gas.grows('Shopping list')[0];
  assert.equal(row.Item, 'Blueberries');
  assert.equal(row.Status, 'Needed');
  assert.equal(row['Added on'], '2026-11-22');
  assert.equal(row['Item ID'], 1);
  assert.equal(gas.grows('Items')[0].Aisle, 'Fruit and veg');
});

test('the same name again reuses the item and adds one more; plurals and case match', () => {
  const { api } = household();
  api('nas', 'addToCart', { name: 'Organic eggs' }, 1, SLIM);
  const shop = api('sandi', 'addToCart', { name: 'organic Egg' }, 1, SLIM).shopping;
  assert.equal(shop.items.length, 1);
  assert.deepEqual(shop.cart, [{ itemId: 1, qty: 2, addedBy: 'Naser' }]);
});

test('quantities go up and down; zero takes the line out but keeps the item', () => {
  const { gas, api } = household();
  api('nas', 'addToCart', { name: 'Laban' }, 1, SLIM);
  assert.equal(api('nas', 'setCartQty', 1, 3, SLIM).shopping.cart[0].qty, 3);
  assert.equal(gas.grows('Shopping list')[0].Qty, 3);
  const shop = api('nas', 'setCartQty', 1, 0, SLIM).shopping;
  assert.deepEqual(shop.cart, []);
  assert.equal(shop.items.length, 1, 'still in the catalogue for next time');
  assert.equal(gas.grows('Shopping list').length, 0);
  assert.throws(() => api('nas', 'setCartQty', 99, 1, SLIM), /isn't in the catalogue/);
});

test('editing an item: size, brand and heart; the cart line follows, and an empty brand means any', () => {
  const { gas, api } = household();
  api('sandi', 'addToCart', { name: 'Toilet paper' }, 1, SLIM);
  const shop = api('nas', 'saveItem', { id: 1, name: 'Toilet paper', size: '12 rolls', brand: 'Kleenex', heart: true }, SLIM).shopping;
  assert.deepEqual(shop.items[0], { id: 1, name: 'Toilet paper', size: '12 rolls', brand: 'Kleenex', heart: true, aisle: 'Household', addedBy: 'Sandi' });
  const line = gas.grows('Shopping list')[0];
  assert.equal(line.Size, '12 rolls');
  assert.equal(line.Brand, 'Kleenex');
  assert.equal(line['Added by'], 'Sandi', 'who added the line stays');
  assert.equal(gas.grows('Items')[0].Heart, 'Yes');
  assert.throws(() => api('nas', 'saveItem', { id: 1, name: '  ' }, SLIM), /needs a name/);
  // Only what's sent changes.
  assert.equal(api('nas', 'saveItem', { id: 1, heart: false }, SLIM).shopping.items[0].brand, 'Kleenex');
});

test('the aisle comes from the name, and "eggplant" is not eggs', () => {
  const { gas } = household();
  const aisle = gas.context.aisleFor_;
  assert.equal(aisle('Eggplant'), 'Fruit and veg');
  assert.equal(aisle('Egg whites'), 'Dairy and eggs');
  assert.equal(aisle('Chicken breast'), 'Meat and fish');
  assert.equal(aisle('Oat bowls'), 'Pantry');
  assert.equal(aisle('Rice'), 'Pantry');
  assert.equal(aisle('Kleenex toilet paper'), 'Household');
  assert.equal(aisle('Something odd'), 'Other');
});

test('rows typed straight into the Shopping list tab show up, matched to the catalogue or added to it', () => {
  const { gas, api } = household();
  api('nas', 'addToCart', { name: 'Blueberries' }, 1, SLIM);
  gas.gsheet('Shopping list').appendRow(['blueberries', '2', 'Sandi', '2026-11-21', '', '', '', 'Needed']);
  gas.gsheet('Shopping list').appendRow(['Dish soap', '', 'Sandi', '2026-11-21', '', '', '', '']);
  gas.gsheet('Shopping list').appendRow(['Old milk', '1', 'Naser', '2026-11-01', '', '', '', 'Ordered']);
  const shop = api('nas', 'getShopping');
  assert.deepEqual(shop.cart.map((l) => [nameOf(shop, l), l.qty]), [['Blueberries', 3], ['Dish soap', 1]]);
  assert.equal(shop.items.length, 2, 'ordered rows are not the cart');
  assert.equal(gas.grows('Shopping list').filter((r) => r['Item ID']).length, 3);
});

test("what Claude learned is shown, never typed: prices, usual store, and what's usually due by now", () => {
  const { gas, api } = household();
  const insights = gas.gsheet('Item insights');
  insights.appendRow(['Laban', '', 'Kibsons', 'Deliveroo Hop', '4.75', '1 L', '4.25', 'Deliveroo Hop', '9', '2026-11-12', '8', '']);
  insights.appendRow(['Egg whites', 'Dairy and eggs', 'Kibsons', '', '14', '500 ml', '', '', '4', '2026-11-01', '10', '']);
  insights.appendRow(['Oat bowls', '', 'Deliveroo Hop', '', '', '', '', '', '3', '2026-11-20', '14', '']);
  api('nas', 'addToCart', { name: 'Laban' }, 2, SLIM);
  const shop = api('nas', 'getShopping');
  assert.deepEqual(shop.items[0].learned, { usual: 'Kibsons', price: 4.75, cheapest: 4.25, cheapestAt: 'Deliveroo Hop', every: 8, last: '2026-11-12' });
  assert.deepEqual(shop.known, ['Egg whites', 'Oat bowls'], 'seen in orders, not added yet: the search offers them');
  // Laban is due too, but it's already in the cart; oat bowls were bought two days ago.
  assert.deepEqual(shop.due, [{ id: null, name: 'Egg whites' }]);
  // Adding a due thing by name makes it an item, in Claude's category.
  const after = api('sandi', 'addToCart', { name: 'Egg whites' }, 1, SLIM).shopping;
  assert.deepEqual(after.due, []);
  assert.equal(after.items.find((i) => i.name === 'Egg whites').aisle, 'Dairy and eggs');
});

test('Get prices parks one waiting request for Claude, and never orders anything', () => {
  const { gas, api } = household();
  assert.throws(() => api('nas', 'requestPrices', SLIM), /cart's empty/);
  api('sandi', 'addToCart', { name: 'Blueberries', size: '1.5 kg' }, 1, SLIM);
  api('sandi', 'addToCart', { name: 'Chicken breast', size: '1 kg', brand: 'Al Ain' }, 2, SLIM);
  setSettingIn(gas.gsheet('Settings') || gas.groceries.insertSheet('Settings'), 'baskets.runner', 'Sandi');
  const shop = api('nas', 'requestPrices', SLIM).shopping;
  assert.equal(shop.runner, 'Sandi');
  assert.deepEqual(shop.request, { id: 1, status: 'waiting', askedBy: 'Naser', askedOn: '2026-11-22 10:00', note: '' });
  assert.equal(gas.grows('Requests')[0].Items, 'Blueberries 1.5 kg ×1; Chicken breast 1 kg (Al Ain) ×2');
  // Asking again while one waits doesn't pile up requests: Claude reads the latest cart when it runs.
  api('sandi', 'requestPrices', SLIM);
  assert.equal(gas.grows('Requests').length, 1);
  // Once Claude has finished, a new ask is a new request.
  gas.gsheet('Requests').getRange(2, 2).setValue('ready');
  assert.equal(api('sandi', 'requestPrices', SLIM).shopping.request.id, 2);
  assert.equal(gas.outbox.length, 0);
});

test("whose Claude hunts for prices: the admin's by default, only the admin changes it, and it never swaps on its own", () => {
  const { gas, api } = household();
  // Nothing set yet: the admin (Naser, who deployed the app) runs the baskets while he tests.
  let shop = api('sandi', 'getShopping');
  assert.equal(shop.runner, 'Naser');
  assert.deepEqual(shop.runnerChoices, ['Naser', 'Sandi']);
  assert.equal(shop.canSetRunner, false, 'Sandi sees it but cannot change it');
  assert.equal(shop.admin, 'Naser');
  assert.equal(api('nas', 'getShopping').canSetRunner, true);
  assert.throws(() => api('sandi', 'setRunner', 'Sandi', SLIM), /Only Naser can change/);
  assert.equal(gas.gsheet('Settings'), null, 'a refused change writes nothing');

  // Naser switches it to Sandi: the Settings tab gets the key in A1 and her name in B1.
  shop = api('nas', 'setRunner', 'sandi', SLIM).shopping;
  assert.equal(shop.runner, 'Sandi');
  assert.deepEqual(gas.gsheet('Settings').data, [['baskets.runner', 'Sandi']]);
  // Sandi now sees her own Claude is on duty, still read-only.
  assert.equal(api('sandi', 'getShopping').runner, 'Sandi');
  // And back: the same row is updated, not a second one added.
  api('nas', 'setRunner', 'Naser', SLIM);
  assert.deepEqual(gas.gsheet('Settings').data, [['baskets.runner', 'Naser']]);
  assert.throws(() => api('nas', 'setRunner', 'Bob', SLIM), /Bob isn't in the household/);
});

test('the runner row typed by hand still works: other rows, short names and unknown names', () => {
  const { gas, api } = household();
  const sh = gas.groceries.insertSheet('Settings');
  sh.appendRow(['Setting', 'Value']);
  sh.appendRow(['baskets.after', '18:00']);
  sh.appendRow(['baskets.runner', 'Nas']);
  assert.equal(api('sandi', 'getShopping').runner, 'Naser', '"Nas" is Naser');
  sh.getRange(3, 2).setValue('Somebody');
  assert.equal(api('sandi', 'getShopping').runner, 'Somebody', 'an unknown name is shown as typed, never swapped for someone else');
  api('nas', 'setRunner', 'Sandi', SLIM);
  assert.deepEqual(gas.gsheet('Settings').data[2], ['baskets.runner', 'Sandi']);
  assert.equal(gas.gsheet('Settings').data.length, 3);
});

function setSettingIn(sh, key, value) {
  sh.appendRow([key, value]);
}

test('shopping calls need a member key, and the To-do state stays as it was', () => {
  const { gas, api } = household();
  assert.equal(gas.api('nope', 'getShopping').error, 'link');
  const state = api('nas', 'getState');
  assert.equal('shopping' in state, false, 'Shopping loads on its own, so To-dos stay quick');
});

test('a finished price run shows its baskets in the app: the pick first, its items, and only https cart links', () => {
  const { gas, api } = household();
  api('nas', 'addToCart', { name: 'Eggs', size: '12 pack', brand: 'Organic' }, 1, SLIM);
  api('nas', 'addToCart', { name: 'Blueberries', size: '1 kg' }, 1, SLIM);
  api('nas', 'requestPrices', SLIM);
  // Nothing to show while Claude hasn't finished, and the app never makes Claude's tabs itself.
  assert.deepEqual(api('nas', 'getShopping').baskets, []);
  assert.equal(gas.gsheet('Baskets'), null);

  // Claude's run writes the tabs (columns as the melody-shopping-run skill writes them).
  const baskets = gas.groceries.insertSheet('Baskets');
  baskets.appendRow(['Request ID', 'Option', 'Store', 'Items found', 'Missing', 'Subtotal (AED)', 'Delivery (AED)', 'Credit (AED)', 'Total (AED)', 'Pick', 'Filled', 'Why', 'Cart link', 'Checked on', 'Logged by']);
  baskets.appendRow([1, 'Kibsons', 'Kibsons', 2, '', '92.76', '8', '0', '100.76', '', 'No', 'Only store with a 12-pack.', 'https://www.kibsons.com/en/cart', '2026-11-22', 'Naser']);
  baskets.appendRow([1, 'Spinneys', 'Spinneys', 1, 'Eggs', '65.25', '0', '0', '65.25', '', 'No', 'No organic eggs.', 'javascript:alert(1)', '2026-11-22', 'Naser']);
  baskets.appendRow([1, 'Deliveroo HOP', 'Deliveroo Hop', 2, '', '70.72', '3.95', '7.07', '67.60', 'Yes', 'Yes', 'Cheapest after the 10% credit.', 'https://deliveroo.ae/en/menu/Dubai/hopmc/deliveroo-hop-motor-city', '2026-11-22', 'Naser']);
  const lines = gas.groceries.insertSheet('Basket lines');
  lines.appendRow(['Request ID', 'Store', 'Item', 'Qty', 'Product matched', 'Pack size', 'Price (AED)', 'Line total (AED)', 'Unit price', 'Status', 'Note', 'Checked on', 'Logged by']);
  lines.appendRow([1, 'Deliveroo Hop', 'Eggs', 1, 'Gardenz Organic Eggs 10', '10 eggs', '23.44', '23.44', '2.34 / egg', 'swapped', 'No 12-pack at HOP', '2026-11-22', 'Naser']);
  lines.appendRow([1, 'Deliveroo Hop', 'Blueberries', 1, 'Blueberries 500g', '500 g', '47.28', '47.28', '9.46 / 100 g', 'found', '', '2026-11-22', 'Naser']);
  lines.appendRow([1, 'Kibsons', 'Eggs', 1, 'Organic Eggs 12', '12 eggs', '55.86', '55.86', '4.66 / egg', 'found', '', '2026-11-22', 'Naser']);
  lines.appendRow([0, 'Deliveroo Hop', 'Milk', 1, 'An older run', '', '5', '5', '', 'found', '', '2026-11-20', 'Naser']);

  // Still running: nothing yet.
  gas.gsheet('Requests').getRange(2, 2).setValue('running');
  assert.deepEqual(api('nas', 'getShopping').baskets, []);

  gas.gsheet('Requests').getRange(2, 2).setValue('ready');
  const shop = api('sandi', 'getShopping');
  assert.deepEqual(shop.baskets.map((b) => b.option), ['Deliveroo HOP', 'Spinneys', 'Kibsons'], 'the pick first, then cheapest');
  const [pick, spinneys] = shop.baskets;
  assert.equal(pick.pick, true);
  assert.equal(pick.total, 67.6);
  assert.equal(pick.credit, 7.07);
  assert.equal(pick.filled, 'yes');
  assert.equal(pick.why, 'Cheapest after the 10% credit.');
  assert.deepEqual(pick.links, [{ store: 'Deliveroo Hop', url: 'https://deliveroo.ae/en/menu/Dubai/hopmc/deliveroo-hop-motor-city' }]);
  assert.deepEqual(pick.lines.map((l) => [l.item, l.product, l.status, l.total]),
    [['Eggs', 'Gardenz Organic Eggs 10', 'swapped', 23.44], ['Blueberries', 'Blueberries 500g', 'found', 47.28]]);
  assert.deepEqual(spinneys.missing, ['Eggs']);
  assert.deepEqual(spinneys.links, [], 'a link that is not https is dropped');
  assert.equal(gas.outbox.length, 0);
});

test('a split basket keeps one cart link per store', () => {
  const { gas, api } = household();
  api('nas', 'addToCart', { name: 'Eggs' }, 1, SLIM);
  api('nas', 'requestPrices', SLIM);
  const baskets = gas.groceries.insertSheet('Baskets');
  baskets.appendRow(['Request ID', 'Option', 'Store', 'Items found', 'Missing', 'Subtotal (AED)', 'Delivery (AED)', 'Credit (AED)', 'Total (AED)', 'Pick', 'Filled', 'Why', 'Cart link', 'Checked on', 'Logged by']);
  baskets.appendRow([1, 'Split: Kibsons + HOP', 'Kibsons + Deliveroo Hop', 6, '', '184.24', '11.95', '8.72', '187.47', 'Yes', 'Yes', 'Saves about AED 44.',
    'Kibsons: https://www.kibsons.com/en/cart ; HOP: https://deliveroo.ae/en/menu/Dubai/hopmc/deliveroo-hop-motor-city', '2026-11-22', 'Naser']);
  gas.gsheet('Requests').getRange(2, 2).setValue('ready');
  const [split] = api('nas', 'getShopping').baskets;
  assert.deepEqual(split.stores, ['Kibsons', 'Deliveroo Hop']);
  assert.deepEqual(split.links, [
    { store: 'Kibsons', url: 'https://www.kibsons.com/en/cart' },
    { store: 'HOP', url: 'https://deliveroo.ae/en/menu/Dubai/hopmc/deliveroo-hop-motor-city' },
  ]);
  assert.deepEqual(split.lines, [], 'no Basket lines tab yet is fine');
});
