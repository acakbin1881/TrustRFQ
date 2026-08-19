// One-command click census: prepares keys, then runs the maker and taker
// drivers concurrently as child processes and prints the combined counts.
//
//   node tools/e2e/run-all.mjs [--pair xlm-xlm|xlm-usdc] [--settler maker|taker]
//
// Assumes the built app is already being served (npm run build && npm run
// preview -- --port 4173). Every run writes permanent rows to the live
// Supabase project and settles for real on Stellar Testnet.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib.mjs';

const arg = (name, dflt) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : dflt;
const pair = arg('--pair', 'xlm-xlm');
const settler = arg('--settler', 'maker');

const prep = spawnSync('node', [path.join(REPO_ROOT, 'tools', 'e2e', 'prepare-keys.mjs'), '--pair', pair],
  { stdio: 'inherit' });
if (prep.status !== 0) process.exit(1);

const runId = String(Date.now());
console.log(`\n[run-all] RUN_ID=${runId} pair=${pair} settler=${settler}\n`);

function driver(role) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(REPO_ROOT, 'tools', 'e2e', 'driver.mjs')], {
      env: { ...process.env, ROLE: role, RUN_ID: runId, PAIR: pair, SETTLER: settler },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => process.stdout.write(String(d).replace(/^/gm, `${role} | `)));
    child.stderr.on('data', (d) => process.stderr.write(String(d).replace(/^/gm, `${role} ! `)));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const [makerCode, takerCode] = await Promise.all([driver('maker'), driver('taker')]);

const out = path.join(REPO_ROOT, 'tools', 'e2e', 'out');
for (const role of ['maker', 'taker']) {
  try {
    const r = JSON.parse(readFileSync(path.join(out, `report-${role}-${runId}.json`), 'utf8'));
    console.log(`\n${role}: status=${r.status} clicks=${r.counts.uiClicks} prompts=${r.counts.walletPrompts}`,
      JSON.stringify(r.counts.promptsByType), r.settleTxHash ? `tx=${r.settleTxHash}` : '');
  } catch { console.log(`\n${role}: no report`); }
}
process.exit(makerCode || takerCode ? 1 : 0);
