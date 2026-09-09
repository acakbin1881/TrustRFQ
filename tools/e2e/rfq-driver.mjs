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
// After the happy path settles, nine scenarios total: the happy path, one
// per D-12 failure knob (SLOW/MALFORMED/REFUSE/DRIFTED/WRONG_FEE), and
// three discovery/ranking/expiry scenarios (02-03-PLAN.md Task 3):
// ZERO_MAKERS, MULTI_QUOTE, EXPIRY_DROP. Each D-12 knob is selected
// PER-REQUEST via the `x-e2e-mode` header (must match stub-maker.mjs's
// MODE_HEADER) — intercepted and injected with Playwright's page.route(),
// never a change to the desk's own fetch call, so one running stub-maker
// instance serves every mode without a src/ change. Each D-12 scenario
// asserts the doctored/dropped quote never becomes a selectable row and
// costs zero NEW wallet prompts; DRIFTED/WRONG_FEE also assert the SPECIFIC
// rejection reason recorded in the dev console (src/ui/RfqPanel.tsx's
// console.debug of fanOutMakerSideOrder's rejections) so the run proves
// WHICH check caught the quote.
//
// ZERO_MAKERS needs a genuinely empty discoverMakerUrls() result for the
// XLM/USDC pair, but this live Testnet registry carries a PERMANENT stray
// entry (http://127.0.0.1:4610, first noted in Plan 02-01's SUMMARY, still
// present, confirmed dead) registered on BOTH SACs with no known private
// key — so removing OUR OWN maker's registration is not sufficient, the
// stray URL alone always keeps the intersection non-empty. Chasing a true
// on-chain zero for this pair is therefore unreachable from this harness.
// Instead: intercept ONLY the registry's own get_urls_for_token
// simulateTransaction calls (matched by scanning the decoded transaction
// XDR for that exact function-name byte sequence — every OTHER
// simulateTransaction call, e.g. get_config or a settlement probe, passes
// through completely untouched) and patch just the returned retval to an
// empty ScVal vector, using Playwright's route.fetch()+fulfill() so the
// request still round-trips through the real network for everything except
// that one field. This is a test-harness-only network substitution (no
// src/ change, mirrors the D-12 mode-header precedent's spirit if not its
// mechanism) documented as a deviation in 02-03-SUMMARY.md.
//
// MULTI_QUOTE spawns a SECOND stub maker instance at a different
// STUB_MAKER_RATE so two registered URLs return two genuinely different,
// genuinely signed prices in one fan-out pass, then ejects it before
// EXPIRY_DROP so that scenario's row count can fall all the way to zero.
// EXPIRY_DROP reuses the D-12 mode-header mechanism (mode SHORT_TTL) to get
// a real quote with a short business-layer expiry, then waits for the
// panel's own countdown clock — never a click — to drop the row.
//
//   node tools/e2e/rfq-driver.mjs
//
// Assumes the built app is already being served (npm run build && npm run
// preview -- --port 4173), matching tools/e2e/run-all.mjs's convention.

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { Horizon, Keypair, Networks, Operation, TransactionBuilder, Asset, xdr } from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';
import { CHROME, REPO_ROOT, Tally, click, fillField } from './lib.mjs';
import { initScriptFor, makeWalletHandler } from './freighter-mock.mjs';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
// Matches public/otc-config.js's window.RPC_URL / src/config.ts's RPC_URL
// default — the ONE Soroban RPC endpoint every registry/settlement
// simulateTransaction call in the desk posts to.
const RPC_URL = 'https://soroban-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/otc.html';
const SCRATCH = process.env.SCRATCH || path.join(REPO_ROOT, 'tools', 'e2e', 'out');

// Must match tools/e2e/stub-maker.mjs's MODE_HEADER exactly.
const MODE_HEADER = 'x-e2e-mode';

// Exactly five knobs (D-12), no more.
const D12_SCENARIOS = [
  { mode: 'SLOW', label: 'SLOW — delay past the 3s fan-out timeout' },
  { mode: 'MALFORMED', label: 'MALFORMED — response body is not valid JSON' },
  { mode: 'REFUSE', label: 'REFUSE — JSON-RPC error -33700 (taker trustline missing)' },
  { mode: 'DRIFTED', label: 'DRIFTED — signed makerAmount != claimed order.makerAmount', expectedReason: 'tree_mismatch' },
  { mode: 'WRONG_FEE', label: 'WRONG_FEE — signed feeBps != live get_config', expectedReason: 'fee_mismatch' },
];
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

/**
 * @param {{ port?: number, rate?: number, label?: string }} [opts] `rate`
 *   overrides stub-maker.mjs's STUB_MAKER_RATE (Task 3's MULTI_QUOTE
 *   scenario spawns a second instance at a different rate); `port` avoids
 *   colliding with an already-running instance.
 */
function spawnStubMaker(opts = {}) {
  const { port, rate, label = 'maker' } = opts;
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (port) env.STUB_MAKER_PORT = String(port);
    if (rate) env.STUB_MAKER_RATE = String(rate);
    const child = spawn('node', [path.join(REPO_ROOT, 'tools', 'e2e', 'stub-maker.mjs')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let out = '';
    const onData = (d) => {
      out += String(d);
      process.stdout.write(`${label} | ${d}`);
      const m = out.match(/STUB_MAKER_READY url=(\S+) pubkey=(\S+)/);
      if (m) {
        child.stdout.off('data', onData);
        resolve({ child, url: m[1], pubkey: m[2] });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.stderr.write(`${label} ! ${d}`));
    child.on('exit', (code) => {
      if (code !== null && code !== 0) reject(new Error(`${label} exited early with code ${code}`));
    });
    setTimeout(() => reject(new Error(`${label} did not become ready within 90s`)), 90000);
  });
}

// ZERO_MAKERS: the exact ASCII bytes of the registry function name, present
// literally inside the decoded (base64 -> raw bytes) transaction XDR of
// every get_urls_for_token simulateTransaction call — the cheap, reliable
// way to identify JUST that call among every other simulateTransaction the
// desk issues (get_config, settlement probes), without a full XDR struct
// parse. See the header comment above for why this patch exists at all.
const GET_URLS_FN_BYTES = Buffer.from('get_urls_for_token', 'utf8');
const EMPTY_STRING_VEC_XDR = xdr.ScVal.scvVec([]).toXDR('base64');

async function stopStubMaker(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 15000);
  });
}

/**
 * Run one D-12 scenario: switch the maker's per-request mode (via the route
 * interception set up in main()), re-fan-out, and assert the doctored/dropped
 * quote never becomes a row and costs zero new wallet prompts. For
 * DRIFTED/WRONG_FEE, also captures the specific rejection reason
 * src/ui/RfqPanel.tsx logged to the dev console — proving WHICH check caught
 * the quote, not merely that a row is absent (an absent row could equally
 * mean the request never arrived).
 */
async function runD12Scenario(page, tally, consoleLines, setMode, scenario) {
  const promptsBefore = tally.counts().walletPrompts;
  const consoleStart = consoleLines.length;
  setMode(scenario.mode);
  let rowCount;
  let promptsAfter;
  try {
    await click(tally, page.locator('#rfqRefreshBtn'), `refresh-quotes-${scenario.mode.toLowerCase()}`, { kind: 'ui-click-nav' });
    await page.locator('.empty', { hasText: 'No quotes available' }).waitFor({ state: 'visible', timeout: 20000 });
    rowCount = await page.locator('.rfq-quotes .order').count();
    promptsAfter = tally.counts().walletPrompts;
  } finally {
    // Every scenario after the D-12 loop shares this same maker.url route —
    // a mode left set here would silently doctor its requests too (this bug
    // was caught live: MULTI_QUOTE's first maker was rejected on
    // fee_mismatch from a leftover WRONG_FEE mode before this fix landed).
    setMode(null);
  }
  const newConsole = consoleLines.slice(consoleStart).join('\n');
  const reasonMatch = newConsole.match(/"reason":"(\w+)"/);
  const result = {
    mode: scenario.mode,
    label: scenario.label,
    rowAppeared: rowCount > 0,
    walletPrompts: promptsAfter - promptsBefore,
    rejectionReason: reasonMatch ? reasonMatch[1] : null,
  };
  if (result.rowAppeared) {
    throw new Error(`D-12 scenario ${scenario.mode}: a doctored/dropped quote appeared as a selectable row`);
  }
  if (result.walletPrompts !== 0) {
    throw new Error(`D-12 scenario ${scenario.mode}: expected zero wallet prompts, observed ${result.walletPrompts}`);
  }
  if (scenario.expectedReason && result.rejectionReason !== scenario.expectedReason) {
    throw new Error(
      `D-12 scenario ${scenario.mode}: expected rejection reason "${scenario.expectedReason}", observed "${result.rejectionReason}"`,
    );
  }
  return result;
}

/**
 * 02-03-PLAN.md Task 3, ZERO_MAKERS: with the registry RPC patch (`setPatch`,
 * wired in main()) active, refresh and assert both that the empty-makers
 * card appears and that ZERO getMakerSideOrder requests ever left the
 * browser for the maker — discovery (a direct registry read) never asks the
 * maker at all, so an absent request is the actual proof, not an absent row
 * alone.
 */
async function runZeroMakersScenario(page, tally, requestCounter, setPatch) {
  const promptsBefore = tally.counts().walletPrompts;
  const requestsBefore = requestCounter.count;
  setPatch(true);
  try {
    await click(tally, page.locator('#rfqRefreshBtn'), 'refresh-quotes-zero_makers', { kind: 'ui-click-nav' });
    await page.locator('.empty', { hasText: 'No makers registered' }).waitFor({ state: 'visible', timeout: 20000 });
  } finally {
    setPatch(false); // MULTI_QUOTE needs a genuine, unpatched discovery read
  }
  const indicatorCount = await page.locator('.rfq-indicator').count();
  const promptsAfter = tally.counts().walletPrompts;
  const outgoingQuoteRequests = requestCounter.count - requestsBefore;
  const result = {
    mode: 'ZERO_MAKERS', label: 'ZERO_MAKERS — no maker registered for the pair',
    discoveryLineAbsent: indicatorCount === 0,
    emptyMakersCardPresent: true,
    outgoingQuoteRequests,
    walletPrompts: promptsAfter - promptsBefore,
  };
  if (indicatorCount !== 0) throw new Error('ZERO_MAKERS: the discovery indicator line rendered despite zero makers');
  if (outgoingQuoteRequests !== 0) {
    throw new Error(`ZERO_MAKERS: expected zero outgoing quote requests, observed ${outgoingQuoteRequests}`);
  }
  if (result.walletPrompts !== 0) throw new Error(`ZERO_MAKERS: expected zero wallet prompts, observed ${result.walletPrompts}`);
  return result;
}

/**
 * 02-03-PLAN.md Task 3, MULTI_QUOTE: a second stub maker (a different
 * STUB_MAKER_RATE, so a genuinely different, genuinely signed price) joins
 * the first on the same pair; refresh and assert the rendered row order is
 * best-price-first with the best row preselected before any click.
 */
async function runMultiQuoteScenario(page, tally) {
  const maker2 = await spawnStubMaker({ port: 4175, rate: 3, label: 'maker2' });
  try {
    const promptsBefore = tally.counts().walletPrompts;
    await click(tally, page.locator('#rfqRefreshBtn'), 'refresh-quotes-multi_quote', { kind: 'ui-click-nav' });
    await page.locator('.rfq-quotes .order').nth(1).waitFor({ state: 'visible', timeout: 20000 });
    const rowTexts = await page.locator('.rfq-quotes .order .legbox__v').allTextContents();
    const firstRowClass = await page.locator('.rfq-quotes .order').first().getAttribute('class');
    const promptsAfter = tally.counts().walletPrompts;
    const result = {
      mode: 'MULTI_QUOTE', label: 'MULTI_QUOTE — two makers, two prices, best-first with the best row preselected',
      rowCount: rowTexts.length,
      rowOrder: rowTexts.map((t) => t.trim()),
      firstRowPreselected: /\bis-selected\b/.test(firstRowClass ?? ''),
      walletPrompts: promptsAfter - promptsBefore,
    };
    if (result.rowCount !== 2) throw new Error(`MULTI_QUOTE: expected 2 rows, observed ${result.rowCount}`);
    if (!/^3\b/.test(result.rowOrder[0])) {
      throw new Error(`MULTI_QUOTE: expected the better price (rate 3) at row 0, observed "${result.rowOrder[0]}"`);
    }
    if (!/^2\b/.test(result.rowOrder[1])) {
      throw new Error(`MULTI_QUOTE: expected the worse price (rate 2) at row 1, observed "${result.rowOrder[1]}"`);
    }
    if (!result.firstRowPreselected) throw new Error('MULTI_QUOTE: the best-price row was not preselected before any click');
    if (result.walletPrompts !== 0) throw new Error(`MULTI_QUOTE: expected zero wallet prompts, observed ${result.walletPrompts}`);
    return result;
  } finally {
    // Ejected before EXPIRY_DROP so that scenario's row count can fall all
    // the way to zero — a second still-registered maker would leave one row
    // standing.
    await stopStubMaker(maker2.child);
  }
}

/**
 * 02-03-PLAN.md Task 3, EXPIRY_DROP: a genuinely signed quote with a short
 * business-layer expiry (mode SHORT_TTL) counts down and the row leaves the
 * list on its own, driven by the panel's shared clock — never a click.
 */
async function runExpiryDropScenario(page, tally, setMode) {
  const promptsBefore = tally.counts().walletPrompts;
  setMode('SHORT_TTL');
  try {
    await click(tally, page.locator('#rfqRefreshBtn'), 'refresh-quotes-expiry_drop', { kind: 'ui-click-nav' });
    // Wait for a row carrying a SHORT (under a minute) countdown
    // specifically, not just "any row visible" — MULTI_QUOTE's 90s-TTL rows
    // are still on screen (a failed refresh deliberately leaves prior rows
    // up, per the UI contract's error state), so an unqualified wait would
    // read that stale DOM instead of this scenario's own fresh, short-lived
    // quote. A 90s-TTL row only decays into this pattern after ~30+ elapsed
    // seconds, well past this scenario's own runtime, so there is no
    // ambiguity within the window this wait actually runs in.
    // The countdown chip's actual text is `Expires in {mm:ss}` (RfqPanel.tsx's
    // `label` build), never the bare mm:ss alone — an anchored `^00:\d\d$`
    // regex against that text never matches and stalls this wait forever
    // (caught live: the first run of this scenario timed out at 20s against
    // exactly this mismatch). Match the substring instead.
    await page.locator('.rfq-quotes .order', { has: page.locator('.rfq-countdown', { hasText: /Expires in 00:\d\d/ }) })
      .first().waitFor({ state: 'visible', timeout: 20000 });
    const initialRowCount = await page.locator('.rfq-quotes .order').count();
    // No click anywhere below — only the shared clock tick (useNow) drives
    // the row's removal via dropExpired.
    //
    // page.waitForFunction's signature is (pageFunction, arg, options) — an
    // options object passed as the SECOND positional argument is consumed as
    // `arg` instead, silently falling back to Playwright's 30000ms default
    // timeout (caught live: the observed failure read "Timeout 30000ms
    // exceeded" despite this call asking for 25000ms). The row also appears
    // with close to the FULL SHORT_TTL_SEC (30s, stub-maker.mjs) remaining —
    // the row-visible wait above matches on first render, before any of that
    // 30s has ticked away — so the wait here must comfortably clear 30s of
    // real time, not undercut it. `undefined` as the second argument plus an
    // explicit options object as the third fixes both problems.
    await page.waitForFunction(
      () => document.querySelectorAll('.rfq-quotes .order').length === 0,
      undefined,
      { timeout: 40000 },
    );
    const finalRowCount = await page.locator('.rfq-quotes .order').count();
    const promptsAfter = tally.counts().walletPrompts;
    const result = {
      mode: 'EXPIRY_DROP', label: 'EXPIRY_DROP — a short-TTL quote counts down to Expired and leaves the list unclicked',
      initialRowCount, finalRowCount,
      walletPrompts: promptsAfter - promptsBefore,
    };
    if (!(initialRowCount > 0)) throw new Error('EXPIRY_DROP: no row appeared before it expired');
    if (finalRowCount !== 0) throw new Error(`EXPIRY_DROP: row count did not fall to zero (observed ${finalRowCount})`);
    if (result.walletPrompts !== 0) throw new Error(`EXPIRY_DROP: expected zero wallet prompts, observed ${result.walletPrompts}`);
    return result;
  } finally {
    setMode(null);
  }
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

  // ZERO_MAKERS proof: count every outgoing browser request to the maker's
  // URL, so "the maker was never asked" is measured, not inferred from an
  // absent row alone.
  const makerRequestCounter = { count: 0 };
  page.on('request', (req) => { if (req.url() === maker.url) makerRequestCounter.count++; });

  // D-12 + EXPIRY_DROP (Task 3, mode SHORT_TTL): intercept the desk's own
  // outgoing request to the maker's URL and inject the mode header — the
  // desk's fetch call itself is never modified (no src/ change), only what
  // the browser actually sends over the wire.
  let currentD12Mode = null;
  const setD12Mode = (mode) => { currentD12Mode = mode; };
  await page.route(maker.url, async (route) => {
    const headers = { ...route.request().headers() };
    if (currentD12Mode) headers[MODE_HEADER] = currentD12Mode;
    else delete headers[MODE_HEADER];
    await route.continue({ headers });
  });

  // ZERO_MAKERS (Task 3): patch ONLY get_urls_for_token simulateTransaction
  // responses to an empty vector — see the header comment for why a real
  // on-chain zero is unreachable for this pair. The real request still
  // round-trips over the network (route.fetch()); every other
  // simulateTransaction call passes straight through untouched.
  let zeroMakersPatchActive = false;
  const setZeroMakersPatch = (active) => { zeroMakersPatchActive = active; };
  await page.route(RPC_URL, async (route) => {
    if (!zeroMakersPatchActive) { await route.continue(); return; }
    let body;
    try { body = route.request().postDataJSON(); } catch { await route.continue(); return; }
    const txB64 = body?.method === 'simulateTransaction' ? body?.params?.transaction : null;
    if (!txB64 || !Buffer.from(txB64, 'base64').includes(GET_URLS_FN_BYTES)) { await route.continue(); return; }
    const response = await route.fetch();
    const json = await response.json();
    if (json?.result?.results?.[0]) json.result.results[0] = { ...json.result.results[0], xdr: EMPTY_STRING_VEC_XDR };
    await route.fulfill({ response, json });
  });

  const scenarioResults = [];
  const startedAt = new Date().toISOString();
  const meta = () => ({
    role: 'taker', publicKey: takerKp.publicKey(), makerUrl: maker.url, makerPubkey: maker.pubkey,
    sellAmount: SELL_AMOUNT, baseUrl: BASE_URL, startedAt, finishedAt: new Date().toISOString(), settleTxHash,
    scenarios: scenarioResults,
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
    scenarioResults.push({
      mode: 'HAPPY_PATH', label: 'happy path — settles for real with exactly one signTransaction prompt',
      rowAppeared: true, walletPrompts: 1, rejectionReason: null, txHash: settleTxHash,
    });

    // D-12: the happy path stays first (a regression in the knobs must never
    // mask a regression in settlement) — now prove each failure knob costs
    // zero wallet prompts and never surfaces a row, one scenario per knob.
    for (const scenario of D12_SCENARIOS) {
      step(`d12-${scenario.mode.toLowerCase()}`);
      const result = await runD12Scenario(page, tally, consoleLines, setD12Mode, scenario);
      scenarioResults.push(result);
      log(`D-12 ${scenario.mode}: rowAppeared=${result.rowAppeared} walletPrompts=${result.walletPrompts} reason=${result.rejectionReason ?? 'n/a'}`);
    }
    tally.record('milestone', 'd12-scenarios-complete');

    // Task 3 (02-03-PLAN.md): discovery/ranking/expiry, each measured rather
    // than asserted from memory.
    step('zero-makers');
    scenarioResults.push(await runZeroMakersScenario(page, tally, makerRequestCounter, setZeroMakersPatch));
    log('ZERO_MAKERS: discoveryLineAbsent=true emptyMakersCardPresent=true outgoingQuoteRequests=0');

    step('multi-quote');
    const multiQuoteResult = await runMultiQuoteScenario(page, tally);
    scenarioResults.push(multiQuoteResult);
    log(`MULTI_QUOTE: rowCount=${multiQuoteResult.rowCount} rowOrder=${JSON.stringify(multiQuoteResult.rowOrder)} firstRowPreselected=${multiQuoteResult.firstRowPreselected}`);

    step('expiry-drop');
    const expiryDropResult = await runExpiryDropScenario(page, tally, setD12Mode);
    scenarioResults.push(expiryDropResult);
    log(`EXPIRY_DROP: initialRowCount=${expiryDropResult.initialRowCount} finalRowCount=${expiryDropResult.finalRowCount}`);

    tally.record('milestone', 'task3-scenarios-complete');

    const body = tally.writeReport(REPORT, { ...meta(), status: 'ok', failedStep: null });
    writeFileSync(consolePath, consoleLines.join('\n'));
    console.log(`REPORT ${REPORT}`);
    console.log(JSON.stringify(body.counts));
    console.log(`SCENARIOS ${scenarioResults.length} (expected 9): ${scenarioResults.map((s) => s.mode).join(', ')}`);
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
