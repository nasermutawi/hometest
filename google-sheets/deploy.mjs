#!/usr/bin/env node
// Pushes Code.gs and Parser.gs to the live Apps Script project and redeploys the web app as a new
// version, so its address stays the same. Replaces the copy-paste + "Manage deployments" steps.
//
//   npm run gas:deploy -- "What changed"            push and redeploy
//   npm run gas:deploy -- "What changed" --dry-run  show what would change, push nothing
//
// Needs, once per computer: Node 22+, the Apps Script API switched on, `npx @google/clasp@3 login`,
// and google-sheets/.clasp-ids.json (see "Deploying with clasp" in google-sheets/README.md).
//
// Safety: it downloads the live project first and keeps its settings (time zone, web app access),
// only adding any permissions the new code needs. It refuses to run if the live project holds files
// the repo doesn't know about, because a push would delete them.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const idsPath = join(here, '.clasp-ids.json');
const CODE_FILES = ['Code.gs', 'Parser.gs'];
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const allowDelete = args.includes('--allow-delete');
const message = args.filter((a) => !a.startsWith('--')).join(' ').trim()
  || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
// CLASP_BIN lets the tests swap in a stand-in for clasp.
const claspCmd = process.env.CLASP_BIN ? [process.env.CLASP_BIN] : ['npx', '--yes', '@google/clasp@3'];

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
function clasp(cmdArgs, cwd) {
  const [bin, ...pre] = claspCmd;
  execFileSync(bin, [...pre, ...cmdArgs], { cwd, stdio: 'inherit' });
}

if (!existsSync(idsPath)) {
  fail('google-sheets/.clasp-ids.json is missing. Copy clasp-ids.example.json to .clasp-ids.json and fill in the Script ID and the web app\'s Deployment ID (google-sheets/README.md, "Deploying with clasp").');
}
const { scriptId, deploymentId } = JSON.parse(readFileSync(idsPath, 'utf8'));
if (!/^[\w-]{20,}$/.test(scriptId || '')) fail('scriptId in .clasp-ids.json looks wrong. Copy it from Apps Script → Project Settings → IDs.');
if (!/^AKfy[\w-]{20,}$/.test(deploymentId || '')) fail('deploymentId in .clasp-ids.json looks wrong. It starts with "AKfy": Apps Script → Deploy → Manage deployments → the web app → Deployment ID.');

const work = mkdtempSync(join(tmpdir(), 'melody-gas-'));
try {
  writeFileSync(join(work, '.clasp.json'), JSON.stringify({ scriptId, rootDir: '.' }, null, 2));

  console.log('↓ Downloading the live project to compare…');
  clasp(['pull'], work);
  const live = readdirSync(work).filter((f) => !f.startsWith('.'));
  if (!live.includes('appsscript.json')) fail('The live project came back without appsscript.json; stopping.');

  const known = new Set(CODE_FILES.map((f) => f.replace(/\.gs$/, '')));
  const liveCode = live.filter((f) => f !== 'appsscript.json');
  const extra = liveCode.filter((f) => !known.has(f.replace(/\.(gs|js)$/, '')));
  if (extra.length && !allowDelete) {
    fail(`The live project has files that aren't in the repo: ${extra.join(', ')}. A push would delete them. Move them into the repo first, or rerun with --allow-delete if they can go.`);
  }

  // Keep the live settings; only add permissions the repo's code needs.
  const liveManifest = JSON.parse(readFileSync(join(work, 'appsscript.json'), 'utf8'));
  const repoManifest = JSON.parse(readFileSync(join(here, 'appsscript.json'), 'utf8'));
  let newScopes = [];
  if (Array.isArray(liveManifest.oauthScopes)) {
    newScopes = (repoManifest.oauthScopes || []).filter((s) => !liveManifest.oauthScopes.includes(s));
    liveManifest.oauthScopes = [...liveManifest.oauthScopes, ...newScopes];
  }
  if (liveManifest.runtimeVersion !== 'V8') {
    console.log('! The live project wasn\'t on the V8 runtime; switching it to V8, which the code needs.');
    liveManifest.runtimeVersion = 'V8';
  }
  writeFileSync(join(work, 'appsscript.json'), `${JSON.stringify(liveManifest, null, 2)}\n`);

  for (const f of liveCode) rmSync(join(work, f));
  for (const f of CODE_FILES) copyFileSync(join(here, f), join(work, f));

  console.log(`\nWill push: ${CODE_FILES.join(', ')} + appsscript.json (live time zone "${liveManifest.timeZone}" kept)`);
  if (newScopes.length) console.log(`New permissions the code needs: ${newScopes.join(', ')}`);
  if (dryRun) {
    console.log('\nDry run: nothing was pushed.');
  } else {
    console.log('\n↑ Pushing the code…');
    clasp(['push', '--force'], work);
    console.log('\n⇢ Redeploying the web app as a new version (same address)…');
    clasp(['update-deployment', deploymentId, '--description', message], work);
    console.log('\n✔ The server is updated. The app picks it up on its next request.');
    console.log('  If this change added settings or permissions, open the script editor and run `setup` once.');
    if (newScopes.length) console.log('  It did add permissions: run `setup` now and approve them, or those features will fail.');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
