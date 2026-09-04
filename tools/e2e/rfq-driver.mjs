// rfq-driver.mjs: headless RFQ TAKER driver, extending the click-census
// harness (tools/e2e/lib.mjs + freighter-mock.mjs) to the RFQ lane.
//
// Spawns tools/e2e/stub-maker.mjs as a real child process (a real JSON-RPC
// 2.0 HTTP server registered on the live Testnet registry, D-10), drives the
// built desk through connect -> open RFQ -> quote -> accept -> confirm via a
// mocked Freighter (same postMessage protocol as driver.mjs, no extension
// needed), and settles for real on Testnet (E2E-01). Writes a report
// including `counts.promptsByType` so the one-prompt property (TAKER-04) is
// measured, not asserted from memory.
//
//   node tools/e2e/rfq-driver.mjs
//
// Assumes the built app is already being served (npm run build && npm run
// preview -- --port 4173), matching tools/e2e/run-all.mjs's convention.

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { Horizon, Keypair, Networks, Operation, TransactionBuilder, Asset } from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';
import { CHROME, REPO_ROOT, Tally, click, fillField } from './lib.mjs';
import { initScriptFor, makeWalletHandler } from './freighter-mock.mjs';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/otc.html';
const SCRATCH = process.env.SCRATCH || path.join(REPO_ROOT, 'tools', 'e2e', 'out');
const REPORT = process.env.REPORT || path.join(SCRATCH, `report-rfq-${Date.now()}.json`);
const HEADED = !!process.env.HEADED;
const SELL_AMOUNT = process.env.SELL_AMOUNT || '1';
const TRUST_LIMIT = '100000000';

const horizon = new Horizon.Server(HORIZON_URL);
const log = (...a) => console.log(`[rfq-driver ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function friendbot(pub) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(pub)}`);
    if (res.ok) return;
    const body = await res.text();
    if (res.status === 400 && /already.?exist|op_already_exists/i.test(body)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`friendbot failed for ${pub}`);
}

/** Pre-open the taker's USDC trustline (D-08's changeTrust becomes a no-op
 *  in-browser this run, keeping the settled report at exactly one prompt). */
async function openTakerUsdcTrustline(takerKp) {
  const keys = JSON.parse(readFileSync('/Users/acakbin1881/Projects/TrustRFQ/demo-keys.json', 'utf8'));
  const issuerKp = Keypair.fromSecret(keys.issuer_secret);
  const USDC = new Asset('USDC', issuerKp.publicKey());
  const account = await horizon.loadAccount(takerKp.publicKey());
  if (account.balances.some((b) => b.asset_code === 'USDC' && b.asset_issuer === issuerKp.publicKey())) return;
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: NETWORK })
    .addOperation(Operation.changeTrust({ asset: USDC, limit: TRUST_LIMIT }))
    .setTimeout(60)
    .build();
  tx.sign(takerKp);
  await horizon.submitTransaction(tx);
}

function spawnStubMaker() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(REPO_ROOT, 'tools', 'e2e', 'stub-maker.mjs')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (d) => {
      out += String(d);
      process.stdout.write(`maker | ${d}`);
      const m = out.match(/STUB_MAKER_READY url=(\S+) pubkey=(\S+)/);
      if (m) {
        child.stdout.off('data', onData);
        resolve({ child, url: m[1], pubkey: m[2] });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.stderr.write(`maker ! ${d}`));
    child.on('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`stub-maker exited early with code ${code}`));
    });
    setTimeout(() => reject(new Error('stub-maker did not become ready within 90s')), 90000);
  });
}

async function stopStubMaker(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 15000);
  });
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });

  const takerKp = Keypair.random();
  log(`taker ${takerKp.publicKey()}`);
  log('funding taker via friendbot...');
  await friendbot(takerKp.publicKey());
  log('opening taker USDC trustline...');
  await openTakerUsdcTrustline(takerKp);

  log('starting stub maker...');
  const maker = await spawnStubMaker();
  log(`stub maker ready: ${maker.url} (${maker.pubkey})`);

  const tally = new Tally();
  const stepRef = { current: 'boot' };
  const step = (label) => { stepRef.current = label; };
  const consoleLines = [];
  let settleTxHash = null;

  const browser = await chromium.launch({ executablePath: CHROME, headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(initScriptFor(takerKp.publicKey()));
  const handler = makeWalletHandler({ keypair: takerKp, tally, stepRef });
  await context.exposeBinding('__e2eWallet', (_source, msg) => handler(msg));

  const page = await context.newPage();
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

  const startedAt = new Date().toISOString();
  const meta = () => ({
    role: 'taker', publicKey: takerKp.publicKey(), makerUrl: maker.url, makerPubkey: maker.pubkey,
    sellAmount: SELL_AMOUNT, baseUrl: BASE_URL, startedAt, finishedAt: new Date().toISOString(), settleTxHash,
  });

  const consolePath = path.join(SCRATCH, `console-rfq-${Date.now()}.log`);
  const hardCap = setTimeout(async () => {
    console.error('HARD CAP (10min) hit');
    writeFileSync(consolePath, consoleLines.join('\n'));
    tally.writeReport(REPORT, { ...meta(), status: 'failed', failedStep: stepRef.current, error: 'hard cap' });
    await stopStubMaker(maker.child);
    process.exit(1);
  }, 600000);
  hardCap.unref();

  try {
    step('goto');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    step('connect');
    await click(tally, page.locator('#connectBtn'), 'connect-button');
    await click(tally,
      page.locator('stellar-wallets-modal li').filter({ hasText: 'Freighter' }).first(),
      'modal-pick-freighter', { timeout: 10000 });
    await page.locator('#walletChip .wallet-chip__addr')
      .filter({ hasText: takerKp.publicKey().slice(0, 5) })
      .waitFor({ state: 'visible', timeout: 20000 });
    tally.record('milestone', 'connected');

    step('open-rfq-section');
    await click(tally, page.locator('.section-fab'), 'open-section-menu');
    await click(tally, page.locator('.sheet__option').filter({ hasText: 'RFQ' }), 'choose-rfq');
    await page.locator('div[data-panel="rfq"].is-active').waitFor({ state: 'visible', timeout: 20000 });

    // Defaults already are sellToken=XLM, buyToken=USDC (TOKENS[0]/[1]) — no
    // token clicks needed, mirroring driver.mjs's cross-asset zero-click case.
    step('fill-amount');
    await fillField(tally, page.locator('#rfqAmount'), 'fill-sell-amount', SELL_AMOUNT);

    step('refresh-quotes');
    await click(tally, page.locator('#rfqRefreshBtn'), 'refresh-quotes');
    await page.locator('.rfq-quotes .order').first().waitFor({ state: 'visible', timeout: 30000 });
    tally.record('milestone', 'quotes-received');

    step('accept-quote');
    await click(tally, page.locator('#rfqAcceptBtn'), 'accept-quote');
    // SUBMIT_TRANSACTION fires here (the ONE taker signTransaction prompt).

    step('wait-settled');
    const link = page.locator('.settle a', { hasText: 'View transaction' });
    await link.waitFor({ state: 'visible', timeout: 240000 });
    settleTxHash = ((await link.getAttribute('href')) ?? '').split('/tx/')[1] ?? null;
    tally.record('milestone', 'settled-observed');

    const body = tally.writeReport(REPORT, { ...meta(), status: 'ok', failedStep: null });
    writeFileSync(consolePath, consoleLines.join('\n'));
    console.log(`REPORT ${REPORT}`);
    console.log(JSON.stringify(body.counts));
    await browser.close();
    await stopStubMaker(maker.child);
    process.exit(0);
  } catch (err) {
    const shot = path.join(SCRATCH, `fail-rfq-${Date.now()}-${stepRef.current}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    writeFileSync(consolePath, consoleLines.join('\n'));
    tally.writeReport(REPORT, {
      ...meta(), status: 'failed', failedStep: stepRef.current, error: String(err?.message ?? err), screenshot: shot,
    });
    console.error(`FAILED at step "${stepRef.current}": ${err?.message ?? err}`);
    console.error(`screenshot: ${shot}`);
    console.error(`console log: ${consolePath}`);
    await browser.close().catch(() => {});
    await stopStubMaker(maker.child);
    process.exit(1);
  }
}

main();
