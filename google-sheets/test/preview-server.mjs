// Local preview of the Sheets edition: serves Index.html with a stand-in for
// google.script.run backed by the in-memory Apps Script mock.
// Usage: node google-sheets/test/preview-server.mjs [port]   then open /?as=you@example.com
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createGas } from './gas-mock.js';

const port = Number(process.argv[2] || 3200);
const owner = 'naser@example.com';
const gas = createGas({ owner, start: new Date().toISOString() });
gas.as(owner);
gas.context.setup();
const html = readFileSync(new URL('../Index.html', import.meta.url), 'utf8');

const shim = `<script>
const AS = new URLSearchParams(location.search).get('as') || '${owner}';
window.google = { script: { get run() {
  let ok = () => {}, fail = () => {};
  const runner = new Proxy({}, { get(_, name) {
    if (name === 'withSuccessHandler') return (f) => { ok = f; return runner; };
    if (name === 'withFailureHandler') return (f) => { fail = f; return runner; };
    return (...args) => fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as: AS, fn: name, args }) })
      .then((r) => r.json()).then((r) => (r.error ? fail(new Error(r.error)) : ok(r.result)));
  } });
  return runner;
} } };
</script>`;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { as, fn, args } = JSON.parse(body);
      let out;
      try {
        out = { result: gas.call(as, fn, ...args) };
      } catch (err) {
        out = { error: err.message };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out ?? null));
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
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(html.replace('<head>', `<head>${shim}`));
}).listen(port, () => console.log(`Sheets preview on http://localhost:${port}/?as=${owner}`));
