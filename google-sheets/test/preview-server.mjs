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
  if (req.url.startsWith('/sheet')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ Tasks: gas.rows('Tasks'), Activity: gas.rows('Activity') }, null, 1));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(page().replace('<head>', `<head>${shim}`));
}).listen(port, () => console.log(`App preview on http://localhost:${port}/?as=${owner}`));
