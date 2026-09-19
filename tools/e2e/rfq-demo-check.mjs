// Proof that the standalone RFQ demo deploy actually works — not that it
// merely returns 200.
//
// rfq-driver.mjs cannot do this job: its live lane clicks `open-section-menu`
// then `choose-rfq`, and the demo HAS no section menu (that is the point of
// the build). So this is a deliberately small, separate script that drives the
// ONE page the demo ships, through the real registry and the real maker, and
// settles a real Testnet swap from the deployed origin.
//
// What it asserts beyond "the page loaded":
//   - the desk's section nav is absent (one lane, not a hidden-tab desk)
//   - the RFQ panel is actually STYLED — computed max-width comes from
//     public/intent.css's [data-panel="rfq"] .rfq-panel rule, so a renamed or
//     dropped data-panel attribute (the silent-failure mode CLAUDE.md warns
//     about) fails here instead of shipping unstyled
//   - a quote row from the real registered maker appears
//   - accepting it settles on-chain, and the tx confirms on Horizon
//   - no CSP violation names the maker's own origin (dead/orphaned registry
//     entries being blocked is the accepted Phase 3 pattern and is reported,
//     not failed on)
//
// Usage (macOS — the caffeinate prefix is NOT optional):
//   caffeinate -i -s env BASE_URL=https://trustrfqdemo.vercel.app \
//     node tools/e2e/rfq-demo-check.mjs
//
// Why caffeinate: three runs of this script failed at the quote step with the
// panel reporting "No registered maker responded in time" while the SAME maker,
// asked directly by curl for the SAME taker, answered a valid signed quote in
// under a second. The tell was `net::ERR_NETWORK_IO_SUSPENDED` in the page
// console — this Mac idle-sleeps mid-run and suspends the browser's network.
// Under caffeinate the run settles on the first attempt. Suspect this before
// suspecting the maker whenever a long headless run dies on a network error.

import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { chromium } from 'playwright-core';
import { chromePath, Tally, click, fillField } from './lib.mjs';
import { initScriptFor, makeWalletHandler } from './freighter-mock.mjs';

const BASE_URL = process.env.BASE_URL || 'https://trustrfqdemo.vercel.app';
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const SELL_AMOUNT = process.env.SELL_AMOUNT || '1';
const MAKER_ORIGIN = process.env.MAKER_ORIGIN || 'https://trustrfq-maker-server.vercel.app';
const HEADED = !!process.env.HEADED;

const horizon = new Horizon.Server(HORIZON_URL);
const log = (m) => console.log(`[demo-check ${new Date().toISOString().slice(11, 19)}] ${m}`);
const fail = (m) => { console.error(`[demo-check] FAILED: ${m}`); process.exitCode = 1; };

async function friendbot(pub) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://friendbot.stellar.org?addr=${pub}`);
    if (r.ok) return;
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`friendbot failed for ${pub}`);
}

const takerKp = Keypair.random();
log(`taker ${takerKp.publicKey()}`);
log('funding taker via friendbot...');
await friendbot(takerKp.publicKey());

// Warm the maker's serverless function first, exactly as rfq-driver.mjs does
// (03-RESEARCH.md Pitfall 1): a cold Vercel function can outrun the panel's 3s
// fan-out timeout, and then NO row appears for reasons that have nothing to do
// with this deploy. Any POST boots the lambda; a deliberately invalid one comes
// back as a JSON-RPC error without signing anything.
const warmStart = Date.now();
await fetch(`${MAKER_ORIGIN}/api/rpc`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'getMakerSideOrder', params: {} }),
}).catch(() => {});
log(`maker warmed in ${Date.now() - warmStart}ms`);

const tally = new Tally();
const stepRef = { current: 'init' };
const consoleLines = [];
const cspViolations = [];

const browser = await chromium.launch({ executablePath: chromePath(), headless: !HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(initScriptFor(takerKp.publicKey()));
await context.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolations.push({ blockedURI: e.blockedURI, violatedDirective: e.violatedDirective });
  });
});
const handler = makeWalletHandler({ keypair: takerKp, tally, stepRef });
await context.exposeBinding('__e2eWallet', (_source, msg) => handler(msg));

const page = await context.newPage();
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
// Watch the maker leg specifically. "No registered maker responded in time" is
// the panel's ONE message for three different causes — request never sent,
// request failed at the network layer, or answered too slowly — and only the
// browser's own request events tell them apart.
const makerTraffic = { sent: 0, ok: 0, failed: [] };
page.on('request', (r) => { if (r.url().startsWith(MAKER_ORIGIN)) makerTraffic.sent++; });
page.on('response', (r) => { if (r.url().startsWith(MAKER_ORIGIN)) makerTraffic.ok++; });
page.on('requestfailed', (r) => {
  if (r.url().startsWith(MAKER_ORIGIN)) makerTraffic.failed.push(r.failure()?.errorText || 'unknown');
});

let txHash = null;
try {
  stepRef.current = 'goto';
  log(`opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // --- one lane, not a desk with tabs ---------------------------------------
  const navCount = await page.locator('.sheet, .sheet__btn, [data-panel="create"], [data-panel="incoming"], [data-panel="sent"]').count();
  if (navCount !== 0) fail(`found ${navCount} desk-nav/section element(s); the demo must ship the RFQ lane only`);
  else log('OK: no section nav, no other panels in the DOM');

  const heading = (await page.locator('.gate h1').textContent())?.trim();
  log(`gate heading: "${heading}"`);

  // --- connect ---------------------------------------------------------------
  stepRef.current = 'connect';
  await click(tally, page.locator('#connectBtn'), 'connect-button');
  await click(tally,
    page.locator('stellar-wallets-modal li').filter({ hasText: 'Freighter' }).first(),
    'modal-pick-freighter', { timeout: 10000 });
  await page.locator('#walletChip .wallet-chip__addr')
    .filter({ hasText: takerKp.publicKey().slice(0, 5) })
    .waitFor({ state: 'visible', timeout: 20000 });
  log('OK: wallet connected');

  // --- the panel is present AND styled ---------------------------------------
  const panel = page.locator('[data-panel="rfq"] .rfq-panel');
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  const maxWidth = await panel.evaluate((el) => getComputedStyle(el).maxWidth);
  if (maxWidth !== '560px') {
    fail(`[data-panel="rfq"] .rfq-panel computed max-width is "${maxWidth}", expected "560px" — intent.css's panel rules are not applying`);
  } else {
    log('OK: RFQ panel styled by [data-panel="rfq"] rules (max-width 560px)');
  }

  // --- quote ------------------------------------------------------------------
  stepRef.current = 'quote';
  // Wait for balances BEFORE asking for a quote. RfqPanel's D-08 step only
  // opens the buy-side trustline when `needsTrustline(balances, buyToken)` is
  // true, and a null (not-yet-fetched) balance map deliberately suppresses
  // that. Clicking Refresh first would skip the trustline entirely, the maker's
  // RECORDING simulation would hard-fail with "trustline entry is missing", and
  // no row could ever appear — which is exactly what a first run here did.
  await page.locator('.bal-strip__chip').first().waitFor({ state: 'visible', timeout: 30000 });
  log('OK: balances loaded (D-08 trustline check can now fire)');
  await fillField(tally, page.locator('#rfqAmount'), 'sell-amount', SELL_AMOUNT);
  await click(tally, page.locator('#rfqRefreshBtn'), 'refresh-quotes', { kind: 'ui-click-nav' });
  // The page opens the buy-side trustline in-flow first (D-08), so allow for
  // that wallet prompt + its ledger close before a row can appear.
  try {
    await page.locator('.rfq-row').first().waitFor({ state: 'visible', timeout: 90000 });
  } catch (e) {
    // Diagnose rather than just time out: the panel's own empty states say
    // WHICH half failed (no makers registered vs. no maker answered), and
    // RfqPanel console.debugs every validation rejection as JSON.
    const panelText = (await page.locator('.rfq-panel').innerText().catch(() => '(unreadable)')).replace(/\n+/g, ' | ');
    log(`panel state: ${panelText}`);
    log(`maker traffic: sent=${makerTraffic.sent} responded=${makerTraffic.ok} failed=[${makerTraffic.failed.join(', ')}]`);
    for (const line of consoleLines.filter((l) => l.toLowerCase().includes('rfq'))) log(`console: ${line}`);
    throw e;
  }
  const rows = await page.locator('.rfq-row').count();
  const receive = (await page.locator('.rfq-row .legbox__v').first().textContent())?.trim();
  log(`OK: ${rows} quote row(s); best row offers ${receive}`);

  // --- settle -----------------------------------------------------------------
  stepRef.current = 'settle';
  await click(tally, page.locator('#rfqAcceptBtn'), 'accept-quote');
  const link = page.locator('.settle a', { hasText: 'View transaction' });
  await link.waitFor({ state: 'visible', timeout: 120000 });
  const href = await link.getAttribute('href');
  txHash = href.split('/').pop();
  log(`OK: settled, tx ${txHash}`);

  const tx = await horizon.transactions().transaction(txHash).call();
  if (!tx.successful) fail(`Horizon reports tx ${txHash} unsuccessful`);
  else log(`OK: Horizon confirms tx successful (ledger ${tx.ledger})`);

  // --- CSP --------------------------------------------------------------------
  cspViolations.push(...(await page.evaluate(() => window.__cspViolations || [])));
  const makerBlocked = cspViolations.filter((v) => (v.blockedURI || '').startsWith(MAKER_ORIGIN));
  if (makerBlocked.length) fail(`the maker's own origin was CSP-blocked ${makerBlocked.length}x`);
  else log(`OK: maker origin never CSP-blocked (${cspViolations.length} violation(s), all other origins)`);
} catch (e) {
  fail(`step "${stepRef.current}": ${e.message}`);
  const shot = `tools/e2e/out/fail-demo-${Date.now()}.png`;
  await page.screenshot({ path: shot }).catch(() => {});
  console.error(`screenshot: ${shot}`);
  console.error(consoleLines.slice(-15).join('\n'));
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  demoUrl: BASE_URL,
  taker: takerKp.publicKey(),
  txHash,
  counts: tally.counts(),
  cspViolations: cspViolations.map((v) => v.blockedURI),
  result: process.exitCode ? 'FAILED' : 'PASSED',
}, null, 2));
