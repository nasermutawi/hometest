// Local preview of the app (docs/index.html) against the in-memory Apps Script mock.
// Usage: node google-sheets/test/preview-server.mjs [port], then open /?as=naser@example.com
// (and, after adding Sara in Settings → People, /?as=sara@example.com in another window).
// Add &perf=1 for the performance panel, with switches for a slow or failing server.
// CODE_GS=path/to/Code.gs runs the preview against another copy of the server, e.g. an older one.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createGas } from './gas-mock.js';

const port = Number(process.argv[2] || 3200);
const owner = 'naser@example.com';
const gas = createGas({ owner, start: new Date().toISOString(), ...(process.env.CODE_GS ? { codePath: process.env.CODE_GS } : {}) });
gas.as(owner);
gas.context.setup();
// Shopping: link the stand-in Home – Groceries sheet, with a little of what Claude learns from orders.
// SHOP=off leaves it unlinked, to see the "needs its Sheet" message; BASKETS=demo adds a finished price run.
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
if (process.env.SHOP !== 'off') {
  const settings = gas.rows('Settings');
  gas.sheet('Settings').getRange(settings.findIndex((r) => r.Setting === 'Groceries sheet') + 2, 2).setValue(gas.GROCERIES_ID);
  [['Blueberries', '', 'Kibsons', 'Deliveroo Hop', '28', '1.5 kg', '24.50', 'Deliveroo Hop', '12', day(3), '7'],
    ['Laban', '', 'Kibsons', '', '4.75', '1 L', '4.25', 'Deliveroo Hop', '9', day(9), '8'],
    ['Egg whites', 'Dairy and eggs', 'Kibsons', '', '14', '500 ml', '', '', '4', day(12), '10'],
    ['Oat bowls', 'Pantry', 'Deliveroo Hop', 'Spinneys', '18', '', '', '', '5', day(15), '14']]
    .forEach((r) => gas.gsheet('Item insights').appendRow(r));
}
// BASKETS=demo: a finished price run (like the first real one, 23 Nov), to see the basket sheet.
if (process.env.SHOP !== 'off' && process.env.BASKETS === 'demo') {
  const key = gas.context.keyFor_(owner, false);
  [[{ name: 'Eggs', size: '12 pack', brand: 'Organic' }, 1], [{ name: 'Organic chicken breasts' }, 1], [{ name: 'Blueberries', size: '1 kg' }, 1]]
    .forEach(([item, qty]) => gas.api(key, 'addToCart', item, qty, { slim: true }));
  gas.api(key, 'requestPrices', { slim: true });
  gas.gsheet('Requests').getRange(2, 2).setValue('ready');
  const b = gas.groceries.insertSheet('Baskets');
  [['Request ID', 'Option', 'Store', 'Items found', 'Missing', 'Subtotal (AED)', 'Delivery (AED)', 'Credit (AED)', 'Total (AED)', 'Pick', 'Filled', 'Why', 'Cart link', 'Checked on', 'Logged by'],
    [1, 'Deliveroo HOP', 'Deliveroo Hop', 3, '', 183.67, 3.95, 18.37, 169.25, 'Yes', 'Yes', 'Cheapest: AED 28 less than Kibsons before credit. Organic eggs 2.34 / egg; free delivery with Plus, 3.95 service fee, 10% credit back over AED 80. Eggs are a 10-pack, not 12.', 'https://deliveroo.ae/en/menu/Dubai/hopmc/deliveroo-hop-motor-city', day(0), 'Naser'],
    [1, 'Kibsons', 'Kibsons', 3, '', 207.76, 8, 0, 215.76, '', 'No', 'Only store with an organic 12-pack (55.86), but chicken 78.10 and eggs cost more.', 'https://www.kibsons.com/en/cart', day(0), 'Naser'],
    [1, 'Spinneys', 'Spinneys', 2, 'Organic chicken breasts', 171.5, 0, 0, 171.5, '', 'No', 'No organic chicken breast; blueberries 13.05 / 100 g.', 'https://deliveroo.ae/en/menu/Dubai/marina-west/spinneys-marina', day(0), 'Naser']]
    .forEach((r) => b.appendRow(r));
  const l = gas.groceries.insertSheet('Basket lines');
  [['Request ID', 'Store', 'Item', 'Qty', 'Product matched', 'Pack size', 'Price (AED)', 'Line total (AED)', 'Unit price', 'Status', 'Note', 'Checked on', 'Logged by', 'Was (AED)'],
    [1, 'Deliveroo Hop', 'Eggs', 1, 'Gardenz Organic Eggs Pack of 10 Cage Free Grade AA', '10 eggs', 23.44, 23.44, '2.34 / egg', 'swapped', 'no organic 12-pack at HOP', day(0), 'Naser'],
    [1, 'Deliveroo Hop', 'Organic chicken breasts', 1, 'The Meat Avenue - Organic Chicken Breast 500g', '500 g', 63.75, 63.75, '12.75 / 100 g', 'found', '', day(0), 'Naser', 69],
    [1, 'Deliveroo Hop', 'Blueberries', 1, 'Blueberries 500g', '500 g', 47.28, 47.28, '9.46 / 100 g', 'found', '', day(0), 'Naser'],
    [1, 'Deliveroo Hop', 'Blueberries', 1, "Driscoll's Blueberries 500g", '500 g', 49.2, 49.2, '9.84 / 100 g', 'found', '', day(0), 'Naser'],
    [1, 'Kibsons', 'Eggs', 1, 'Organic Eggs (Ireland) 12 eggs', '12 eggs', 55.86, 55.86, '4.66 / egg', 'found', '', day(0), 'Naser'],
    [1, 'Spinneys', 'Organic chicken breasts', 1, '', '', '', '', '', 'not sold', 'only non-organic', day(0), 'Naser']]
    .forEach((r) => l.appendRow(r));
}
const page = () => readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8'); // re-read, so edits show on reload

// Stands in for the network: each window acts as the person named in ?as=.
const shim = `<script>
const AS = new URLSearchParams(location.search).get('as') || '${owner}';
window.householdApi = (fn, args) => fetch('/rpc', { method: 'POST', body: JSON.stringify({ as: AS, fn, args }) })
  .then((r) => r.json()).then((r) => { if (!r.ok) { const e = new Error(r.message); e.code = r.error; throw e; } return r.result; });
</script>`;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { as, fn, args } = JSON.parse(body);
      const key = gas.context.findMember_(as) ? gas.context.keyFor_(as, false) : 'unknown';
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(gas.api(key, fn, ...args)));
    });
    return;
  }
  if (req.url.startsWith('/tick')) {
    gas.context.runScheduledJobs();
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(gas.outbox.splice(0)));
    return;
  }
  // /status?s=running (or waiting, ready, failed…) moves the newest price request along, as Claude would.
  // Add &started=2026-11-24 18:02 or &note=… to set those columns too.
  if (req.url.startsWith('/status')) {
    const q = new URL(req.url, 'http://x').searchParams;
    const sh = gas.gsheet('Requests');
    const row = sh ? sh.data.length : 0;
    if (row > 1) {
      const head = sh.data[0];
      [['Status', q.get('s')], ['Started', q.get('started')], ['Note', q.get('note')], ['Asked on', q.get('asked')]]
        .forEach(([col, v]) => { if (v != null) sh.getRange(row, head.indexOf(col) + 1).setValue(v); });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(gas.grows('Requests')));
    return;
  }
  if (req.url.startsWith('/sheet')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ Tasks: gas.rows('Tasks'), Activity: gas.rows('Activity'), Items: gas.grows('Items'), 'Shopping list': gas.grows('Shopping list'), Requests: gas.grows('Requests') }, null, 1));
    return;
  }
  if (req.url.startsWith('/stores/')) {
    // Store logos, as GitHub Pages serves them next to the app.
    try { res.writeHead(200, { 'Content-Type': 'image/png' }).end(readFileSync(new URL(`../../docs/stores/${req.url.slice(8).replace(/[^\w.-]/g, '')}`, import.meta.url))); } catch (err) { res.writeHead(404).end(); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(page().replace('<head>', `<head>${shim}`));
}).listen(port, () => console.log(`App preview on http://localhost:${port}/?as=${owner}`));
