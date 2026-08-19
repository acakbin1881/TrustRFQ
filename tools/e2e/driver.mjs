// Click-census E2E driver: plays ONE role (maker or taker) through the full
// directed OTC flow in a real headless Chromium against the production bundle,
// tallying every UI click and every wallet prompt. See tools/e2e/README-free
// usage in run-all.mjs; typical invocation:
//
//   ROLE=maker RUN_ID=1721990000000 PAIR=xlm-xlm SETTLER=maker \
//     node tools/e2e/driver.mjs
//
// Cross-role coordination happens THROUGH THE APP: all shared state lives in
// Supabase, realtime pushes it into both UIs, and each driver just waits for
// its next actionable element. Either role can start first; deadlock is
// structurally impossible.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { Keypair } from '@stellar/stellar-sdk';
import { CHROME, Tally, cfgFromEnv, click, fillField, truncAddr, uniqueAmounts } from './lib.mjs';
import { initScriptFor, makeWalletHandler } from './freighter-mock.mjs';

const cfg = cfgFromEnv();
const keys = JSON.parse(readFileSync(cfg.keys, 'utf8'));
const me = keys[cfg.role];
const other = keys[cfg.role === 'maker' ? 'taker' : 'maker'];
const keypair = Keypair.fromSecret(me.secret);
const amounts = uniqueAmounts(cfg.runId);

const tally = new Tally();
const stepRef = { current: 'boot' };
const step = (label) => { stepRef.current = label; };
const consoleLines = [];
let settleTxHash = null;

// ---------------------------------------------------------------------------

async function connect(page) {
  step('connect');
  await click(tally, page.locator('#connectBtn'), 'connect-button');
  // The wallets-kit modal always renders, even with a single module; its
  // LitElement shadow root is open, so Playwright selectors pierce it.
  await click(tally,
    page.locator('stellar-wallets-modal li').filter({ hasText: 'Freighter' }).first(),
    'modal-pick-freighter', { timeout: 10000 });
  // REQUEST_ACCESS fires here (1 wallet prompt), then the silent
  // REQUEST_PUBLIC_KEY; connected once the topbar chip shows our address.
  await page.locator('#walletChip .wallet-chip__addr')
    .filter({ hasText: me.public.slice(0, 5) })
    .waitFor({ state: 'visible', timeout: 20000 });
  tally.record('milestone', 'connected');
}

/**
 * Find and expand THIS run's thread row in a panel. Rows carry no amounts, so
 * candidates (newest first, party matches) are expanded and verified against
 * the run-unique amount; a wrong candidate is collapsed again. Those harness
 * detours are tallied as ui-click-nav, not as census clicks: a human doing
 * their own single trade recognizes their row and expands once.
 */
async function expandOurThread(page, panel, timeoutMs) {
  const partyTrunc = cfg.role === 'maker' ? truncAddr(other.public) : truncAddr(other.public);
  const cards = page.locator(`div[data-panel="${panel}"] .thread-card`).filter({ hasText: partyTrunc });
  const deadline = Date.now() + timeoutMs;
  let expandTallied = false;
  for (;;) {
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const toggle = card.locator('.thread-card__toggle');
      // The first (newest) candidate is tallied as the census click; any
      // fallback probing is harness navigation.
      const kind = expandTallied ? 'ui-click-nav' : 'ui-click';
      await click(tally, toggle, 'expand-thread', { kind });
      expandTallied = true;
      try {
        await card.locator('.legbox__v').filter({ hasText: amounts.maker })
          .first().waitFor({ state: 'visible', timeout: 4000 });
        return card;
      } catch {
        await click(tally, toggle, 'collapse-wrong-thread', { kind: 'ui-click-nav' });
      }
    }
    if (Date.now() > deadline) throw new Error(`thread for run ${cfg.runId} not found in "${panel}"`);
    await page.waitForTimeout(1500);
  }
}

async function signOrderAndMaybeSettle(page, card) {
  step('sign-order');
  const signBtn = card.locator('.settle button', { hasText: 'Sign order' });
  await signBtn.waitFor({ state: 'visible', timeout: 240000 });
  // Prompts fire (Run 2 maker: changeTrust SUBMIT_TRANSACTION first, then
  // SUBMIT_AUTH_ENTRY; otherwise just the auth entry). The DB write re-renders
  // the strip and the button disappears.
  //
  // Retry loop, and it is a REAL user cost, not harness noise: signFillAuth
  // simulates the whole fill, so on a cross-asset order the taker's sign
  // FAILS (error toast, button stays) until the maker's changeTrust is
  // on-chain, i.e. until the maker has signed first. A human hits the same
  // wall and re-clicks; retries are tallied as sign-order-retry.
  for (let attempts = 1; ; attempts++) {
    await click(tally, signBtn, attempts === 1 ? 'sign-order' : 'sign-order-retry');
    try {
      await signBtn.waitFor({ state: 'hidden', timeout: 25000 });
      break;
    } catch {
      if (attempts >= 8) throw new Error(`Sign order never took effect (${attempts} attempts)`);
    }
  }
  tally.record('milestone', 'auth-signed');

  if (cfg.settler === cfg.role) {
    step('settle');
    const settleBtn = card.locator('.settle button', { hasText: 'Settle now' });
    await settleBtn.waitFor({ state: 'visible', timeout: 240000 });
    tally.record('milestone', 'both-auths-ready');
    await click(tally, settleBtn, 'settle-now');
  }

  step('wait-settled');
  const link = card.locator('.settle a', { hasText: 'View transaction' });
  await link.waitFor({ state: 'visible', timeout: 300000 });
  settleTxHash = ((await link.getAttribute('href')) ?? '').split('/tx/')[1] ?? null;
  tally.record('milestone', 'settled-observed');
}

async function makerSteps(page) {
  await connect(page);
  if (cfg.stopAfter === 'connect') return;

  // The compose form defaults to send=XLM, receive=USDC. So the cross-asset
  // run needs NO token clicks, and the XLM-XLM baseline needs two (open the
  // receive-leg listbox, pick XLM), exactly like a human.
  if (cfg.pair === 'xlm-xlm') {
    step('pick-receive-token');
    const tok = page.locator('.tok', { has: page.locator('#takerToken') });
    await click(tally, tok.locator('.tok__trigger'), 'receive-token-open');
    await click(tally, tok.locator('.tok__opt').filter({ hasText: 'XLM' }).first(), 'receive-token-pick-xlm');
  }

  step('compose');
  await fillField(tally, page.locator('#makerAmount'), 'fill-send-amount', amounts.maker);
  await fillField(tally, page.locator('#takerAmount'), 'fill-receive-amount', amounts.taker);
  await fillField(tally, page.locator('#takerAddress'), 'fill-counterparty', other.public);

  step('send-offer');
  await click(tally, page.locator('#sendBtn'), 'sign-and-send-order');
  // SUBMIT_BLOB fires (the RFQ maker signature); on success the app switches
  // itself to the Sent panel.
  await page.locator('div[data-panel="sent"].is-active').waitFor({ state: 'visible', timeout: 90000 });
  tally.record('milestone', 'offer-sent');

  step('open-thread');
  const card = await expandOurThread(page, 'sent', 60000);

  // The strip's "Sign order" button appearing is the "taker accepted" signal,
  // delivered by Supabase realtime; the wait is in signOrderAndMaybeSettle.
  await signOrderAndMaybeSettle(page, card);
}

async function takerSteps(page) {
  await connect(page);
  if (cfg.stopAfter === 'connect') return;

  step('nav-incoming');
  await click(tally, page.locator('.section-fab'), 'open-section-menu');
  await click(tally, page.locator('.sheet__option').filter({ hasText: 'Incoming' }), 'choose-incoming');

  step('find-offer');
  const card = await expandOurThread(page, 'incoming', 240000);

  step('accept');
  await click(tally, card.locator('.order__actions button', { hasText: 'Accept' }), 'accept-offer');
  // SUBMIT_BLOB fires (the taker accept signature); the expanded thread flips
  // to the settlement card in place.
  tally.record('milestone', 'offer-accepted');

  await signOrderAndMaybeSettle(page, card);
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(cfg.scratch, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: !cfg.headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(initScriptFor(me.public));
  const handler = makeWalletHandler({ keypair, tally, stepRef });
  await context.exposeBinding('__e2eWallet', (_source, msg) => handler(msg));

  const page = await context.newPage();
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

  const startedAt = new Date().toISOString();
  const meta = () => ({
    runId: cfg.runId, role: cfg.role, pair: cfg.pair, settler: cfg.settler,
    publicKey: me.public, counterparty: other.public,
    amounts, baseUrl: cfg.baseUrl, startedAt, finishedAt: new Date().toISOString(),
    settleTxHash,
  });

  const consolePath = path.join(cfg.scratch, `console-${cfg.role}-${cfg.runId}.log`);
  const hardCap = setTimeout(() => {
    console.error('HARD CAP (10min) hit');
    writeFileSync(consolePath, consoleLines.join('\n'));
    tally.writeReport(cfg.report, { ...meta(), status: 'failed', failedStep: stepRef.current, error: 'hard cap' });
    process.exit(1);
  }, 600000);
  hardCap.unref();

  try {
    await page.goto(cfg.baseUrl, { waitUntil: 'domcontentloaded' });
    await (cfg.role === 'maker' ? makerSteps(page) : takerSteps(page));
    const body = tally.writeReport(cfg.report, {
      ...meta(),
      status: cfg.stopAfter ? `ok-until-${cfg.stopAfter}` : 'ok',
      failedStep: null,
    });
    writeFileSync(consolePath, consoleLines.join('\n'));
    console.log(`REPORT ${cfg.report}`);
    console.log(JSON.stringify(body.counts));
    await browser.close();
    process.exit(0);
  } catch (err) {
    const shot = path.join(cfg.scratch, `fail-${cfg.role}-${cfg.runId}-${stepRef.current}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    writeFileSync(consolePath, consoleLines.join('\n'));
    tally.writeReport(cfg.report, {
      ...meta(), status: 'failed', failedStep: stepRef.current, error: String(err?.message ?? err),
      screenshot: shot,
    });
    console.error(`FAILED at step "${stepRef.current}": ${err?.message ?? err}`);
    console.error(`screenshot: ${shot}`);
    console.error(`console log: ${consolePath}`);
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
