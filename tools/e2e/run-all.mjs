// One-command E2E census: prepares keys, then runs the OTC maker/taker
// drivers and/or the RFQ taker driver as child processes and prints
// per-lane summaries.
//
//   node tools/e2e/run-all.mjs [--pair xlm-xlm|xlm-usdc] [--settler maker|taker] [--lane otc|rfq|all]
//
// --lane defaults to 'otc' so the existing invocation (npm run e2e:census)
// keeps its exact current behaviour unchanged: prepare OTC actors, run the
// maker and taker drivers concurrently, print their summary lines.
// --lane rfq spawns only tools/e2e/rfq-driver.mjs — it funds and manages
// its own taker actor and stub maker internally (D-10), settling against
// the curated XLM/USDC pair (D-06), so no OTC-style key prep runs for this
// lane. --lane all runs OTC first, so a regression in the long-standing
// lane is never masked by a new one, then RFQ.
//
// Assumes the built app is already being served (npm run build && npm run
// preview -- --port 4173). The OTC lane writes permanent rows to the live
// Supabase project; both lanes settle for real on Stellar Testnet.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib.mjs';

const arg = (name, dflt) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : dflt;
const pair = arg('--pair', 'xlm-xlm');
const settler = arg('--settler', 'maker');
const lane = arg('--lane', 'otc');
if (!['otc', 'rfq', 'all'].includes(lane)) {
  console.error(`[run-all] --lane must be otc|rfq|all, got "${lane}"`);
  process.exit(1);
}

const runId = String(Date.now());

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

async function runOtcLane() {
  const prep = spawnSync('node', [path.join(REPO_ROOT, 'tools', 'e2e', 'prepare-keys.mjs'), '--pair', pair],
    { stdio: 'inherit' });
  if (prep.status !== 0) return 1;

  console.log(`\n[run-all] RUN_ID=${runId} pair=${pair} settler=${settler}\n`);

  const [makerCode, takerCode] = await Promise.all([driver('maker'), driver('taker')]);

  const out = path.join(REPO_ROOT, 'tools', 'e2e', 'out');
  for (const role of ['maker', 'taker']) {
    try {
      const r = JSON.parse(readFileSync(path.join(out, `report-${role}-${runId}.json`), 'utf8'));
      console.log(`\n${role}: status=${r.status} clicks=${r.counts.uiClicks} prompts=${r.counts.walletPrompts}`,
        JSON.stringify(r.counts.promptsByType), r.settleTxHash ? `tx=${r.settleTxHash}` : '');
    } catch { console.log(`\n${role}: no report`); }
  }
  return makerCode || takerCode ? 1 : 0;
}

// The RFQ lane funds and manages its own taker actor and stub maker
// internally (tools/e2e/rfq-driver.mjs, D-10: register on the live registry
// with real stake, eject with a full refund on every exit path) — no
// OTC-style key prep runs for this lane. RUN_ID/PAIR are still threaded
// through as env vars, the same convention driver() above already uses, so
// the RFQ report correlates with this invocation and its path is
// predictable for the readback below; rfq-driver.mjs falls back to its own
// defaults (Date.now(), the curated XLM/USDC pair) when run standalone.
async function runRfqLane() {
  console.log(`\n[run-all] RFQ lane RUN_ID=${runId} (curated XLM/USDC pair, D-06)\n`);
  const reportPath = path.join(REPO_ROOT, 'tools', 'e2e', 'out', `report-rfq-${runId}.json`);

  const code = await new Promise((resolve) => {
    const child = spawn('node', [path.join(REPO_ROOT, 'tools', 'e2e', 'rfq-driver.mjs')], {
      env: { ...process.env, RUN_ID: runId, PAIR: pair, REPORT: reportPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => process.stdout.write(String(d).replace(/^/gm, 'rfq | ')));
    child.stderr.on('data', (d) => process.stderr.write(String(d).replace(/^/gm, 'rfq ! ')));
    child.on('exit', (c) => resolve(c ?? 1));
  });

  // The summary's headline value is the on-chain transaction hash (POS-D1:
  // the artefact that proves the protocol worked, not an interface metric).
  // The scenario roll-call is per-scenario detail for regression tracking,
  // never framed as a performance or usability figure.
  try {
    const r = JSON.parse(readFileSync(reportPath, 'utf8'));
    const scenarioNames = (r.scenarios ?? []).map((s) => s.mode).join(', ');
    console.log(`\nrfq: status=${r.status} tx=${r.settleTxHash ?? 'none'}`);
    console.log(`rfq: scenarios (${(r.scenarios ?? []).length}): ${scenarioNames}`);
  } catch { console.log('\nrfq: no report'); }
  return code;
}

let exitCode = 0;
if (lane === 'otc' || lane === 'all') exitCode = (await runOtcLane()) || exitCode;
if (lane === 'rfq' || lane === 'all') exitCode = (await runRfqLane()) || exitCode;
process.exit(exitCode);
