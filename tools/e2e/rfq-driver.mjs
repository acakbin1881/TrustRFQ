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
// After the happy path settles, twelve scenarios total: the happy path, one
// per D-12 failure knob (SLOW/MALFORMED/REFUSE/DRIFTED/WRONG_FEE), three
// discovery/ranking/expiry scenarios (02-03-PLAN.md Task 3): ZERO_MAKERS,
// MULTI_QUOTE, EXPIRY_DROP, and three trustline/retry scenarios
// (02-04-PLAN.md Task 3): RETRY_EQUAL, RETRY_WORSE, TRUSTLINE. Each D-12 knob is selected
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
// RETRY_EQUAL / RETRY_WORSE (02-04-PLAN.md Task 3, D-09) reuse the mode
// header mechanism with stub-maker.mjs's EXPIRED_ENTRY knob (optionally
// suffixed ":EQUAL"/":WORSE" for RE_QUOTE_PRICE). VERIFIED LIVE against the
// deployed rfq_swap (2026-09-09, see retry.ts's module header): an expired
// maker entry is rejected during settleQuote's ENFORCING-mode simulate —
// BEFORE the taker's wallet is ever prompted to sign anything. This means
// the plan's literal "two prompts for RETRY_EQUAL / one for RETRY_WORSE"
// text does not hold against the real system: the doomed first attempt
// costs ZERO signTransaction prompts in both cases. RETRY_EQUAL therefore
// asserts exactly ONE prompt (only the successful retry); RETRY_WORSE
// asserts exactly ZERO (no retry ever reaches signing). Documented as a
// deviation in 02-04-SUMMARY.md.
//
// TRUSTLINE (02-04-PLAN.md Task 3, D-08) needs a taker with NO pre-opened
// USDC trustline — the shared taker used by every other scenario in this
// run already has one open (required to keep the happy path at exactly one
// prompt), so TRUSTLINE spawns its OWN funded taker and browser context
// against the SAME running stub maker, and decodes each SUBMIT_TRANSACTION
// prompt's own operation type (changeTrust vs invokeHostFunction) to prove
// the ORDER, not just the count. VERIFIED LIVE (2026-09-11) that a maker
// cannot even PRODUCE a quote for a trustline-less taker (its own
// RECORDING-mode simulation of `swap` executes the real SAC transfer and
// hard-fails without a destination trustline) — src/ui/RfqPanel.tsx moves
// the D-08 changeTrust step to fire during REFRESH QUOTES instead of ACCEPT
// as originally planned, so this scenario's changeTrust prompt now lands
// during refresh-quotes-trustline and accept-quote-trustline produces only
// the swap prompt. See runTrustlineScenario's own header comment and
// 02-04-SUMMARY.md for the full root-cause writeup.
//
//   node tools/e2e/rfq-driver.mjs
//
// Assumes the built app is already being served (npm run build && npm run
// preview -- --port 4173), matching tools/e2e/run-all.mjs's convention.
//
// LIVE mode (03-02-PLAN.md Task 2, gated on REAL_MAKER_ADDRESS): the exact
// same file drives a REAL, remote maker instead of the local stub, and its
// defining property is SUBTRACTION relative to everything above — no child
// process (spawnStubMaker is replaced with resolveRealMaker, which learns
// the maker's url from a genuine on-chain get_maker read, never an env var
// or constant), no request interception of any kind (both route
// registrations in main() are skipped outright), and none of the D-12 /
// discovery / retry / trustline scenarios run (every one of them depends on
// a stub-maker knob or a route patch that simply does not exist here). What
// remains is the happy path only, against a real remote server over the
// public internet, and a CSP-violation capture
// (installCspCapture/cspViolations) that turns "the browser didn't complain"
// into a deterministic, read-back array rather than a console-string guess.
// A local vite preview serves no Content-Security-Policy header at all
// (vercel.json's headers are a Vercel-deploy-only config), so that array is
// trivially empty against localhost; the array only becomes meaningful once
// this same script runs against a deployed Vercel branch preview
// (03-02-PLAN.md Task 3), which is the ONLY environment that can prove the
// CSP-permits-this-origin claim end-to-end.
//
// LIVE_DIRECTIONS (comma-separated, default "xlm-usdc,usdc-xlm" as of
// 03-03-PLAN.md) drives every direction listed, sequentially, in ONE browser
// session against ONE funded taker. usdc-xlm needs its own funding
// (fundTakerUsdc, mirroring stub-maker.mjs's own USDC setup) since the
// taker is now the SELLER of USDC rather than only its buyer, and its own
// panel interaction (selectToken, driving the desk's real custom listbox —
// never Playwright's selectOption against the hidden native <select>,
// tabIndex -1, a path no person takes). Every attempt (including one that
// finds no row on the first try) is recorded in each direction result's
// `attempts` array — 03-RESEARCH.md Pitfall 1 flags Vercel cold starts
// against the taker's fixed 3s per-request fan-out timeout
// (src/data/rfqNetwork.ts) as a real risk, and the whole point of recording
// every attempt is that this run record can never be a hand-picked
// successful attempt (T-03-10). `npm run e2e:rfq:live` requires
// REAL_MAKER_ADDRESS and BASE_URL to be exported; the stub lane
// (`npm run e2e:rfq`) is completely unaffected — every route registration,
// scenario function and D-12 loop below stays byte-for-byte what it was
// before this mode existed, each simply skipped when LIVE_MODE is true.
//
// Between directions the page is RELOADED (never trusted to just re-render):
// a stale settled row from the prior direction must never be mistaken for
// this direction's own result. The reload costs a fresh connect + reopen of
// the RFQ section, both tallied like every other click.
//
// 02-05-PLAN.md Task 1: tools/e2e/run-all.mjs's --lane rfq/all spawns this
// file as a child process with RUN_ID and PAIR env vars, the same
// convention run-all.mjs's OTC driver() helper already uses, plus a
// deterministic REPORT path so the parent can read the report back after
// exit. Both env vars are optional — running this file directly (as above)
// falls back to Date.now() for RUN_ID and the pair stays the curated
// XLM/USDC pair (D-06) regardless of PAIR, since every scenario below is
// written against that specific pair's token addresses and rates. A
// top-level uncaughtException/unhandledRejection handler (below) ensures
// the stub maker is still ejected even if a truly uncaught error escapes
// the try/catch in main() — the third of the three exit paths (success,
// scenario failure, uncaught exception) T-02-25 requires.

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  Horizon, Keypair, Networks, Operation, TransactionBuilder, Asset, xdr, scValToNative,
  Account, Address, Contract, rpc,
} from '@stellar/stellar-sdk';
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
const RUN_ID = process.env.RUN_ID || String(Date.now());
const REPORT = process.env.REPORT || path.join(SCRATCH, `report-rfq-${RUN_ID}.json`);
const HEADED = !!process.env.HEADED;
const SELL_AMOUNT = process.env.SELL_AMOUNT || '1';
const TRUST_LIMIT = '100000000';

// LIVE mode (Task 2). Same fallback convention as tools/rfq-registry-live.mjs
// and tools/e2e/stub-maker.mjs.
const REAL_MAKER_ADDRESS = process.env.REAL_MAKER_ADDRESS || null;
const LIVE_MODE = !!REAL_MAKER_ADDRESS;
// D-09 (03-03-PLAN.md Task 1): both directions of the curated pair, by
// default, in this order.
const LIVE_DIRECTIONS = (process.env.LIVE_DIRECTIONS || 'xlm-usdc,usdc-xlm')
  .split(',').map((s) => s.trim()).filter(Boolean);
// The usdc-xlm direction's sell amount (in USDC) — kept as its own env var
// rather than reusing SELL_AMOUNT, since the two directions sell different
// assets at different natural scales.
const SELL_AMOUNT_USDC_XLM = process.env.SELL_AMOUNT_USDC_XLM || '5';
const RFQ_REGISTRY_ID = process.env.RFQ_REGISTRY_ID || 'CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G';
// Mirrored from src/data/rfqNetwork.ts: the free read-only-simulation trick
// — no signing, no fee, no network write. This is the ONLY source of the
// maker's URL in LIVE mode; see readRegisteredMaker below.
const ZERO_BALANCE_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const rpcServer = new rpc.Server(RPC_URL);

const horizon = new Horizon.Server(HORIZON_URL);
const log = (...a) => console.log(`[rfq-driver ${new Date().toISOString().slice(11, 19)}]`, ...a);

// Defense-in-depth ejection (02-05-PLAN.md Task 1, T-02-25): main()'s own
// try/catch already stops the stub maker on both the success path and any
// scenario failure it catches. This module-scope handler covers the THIRD
// exit path — a truly uncaught exception or unhandled rejection escaping
// that try/catch entirely (e.g. from an event-listener callback not awaited
// by anything) — so a leftover-staked, unreachable maker never lingers on
// the live registry regardless of how this process dies.
let activeStubMakerChild = null;
async function ejectAndExit(kind, err) {
  console.error(`[rfq-driver] ${kind}:`, err);
  if (activeStubMakerChild) {
    await stopStubMaker(activeStubMakerChild).catch(() => {});
    activeStubMakerChild = null;
  }
  process.exit(1);
}
process.on('uncaughtException', (err) => { ejectAndExit('UNCAUGHT EXCEPTION', err); });
process.on('unhandledRejection', (err) => { ejectAndExit('UNHANDLED REJECTION', err); });

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

/** The demo USDC SAC id, derived the same way src/core/canonical.ts's
 *  sacIdFor does (Asset.contractId), from the same issuer secret
 *  openTakerUsdcTrustline above already reads. LIVE mode uses this only to
 *  confirm the registry's on-chain get_maker read lists both tokens this
 *  driver's own xlm-usdc direction needs — never to guess a maker URL. */
function usdcSacId() {
  const keys = JSON.parse(readFileSync(path.join(REPO_ROOT, 'demo-keys.json'), 'utf8'));
  const issuerKp = Keypair.fromSecret(keys.issuer_secret);
  return new Asset('USDC', issuerKp.publicKey()).contractId(NETWORK);
}

/** The literal curated token value (src/core/tokens.ts's TOKENS[1].value),
 *  `USDC:<issuer>` — never the bare code — so a report/record reader can
 *  resolve exactly which on-chain asset moved without guessing an issuer. */
function usdcTokenValue() {
  const keys = JSON.parse(readFileSync(path.join(REPO_ROOT, 'demo-keys.json'), 'utf8'));
  const issuerKp = Keypair.fromSecret(keys.issuer_secret);
  return `USDC:${issuerKp.publicKey()}`;
}

/**
 * Task 1 (D-09): the usdc-xlm direction needs the taker to SELL USDC, so it
 * needs a USDC BALANCE, not only the trustline openTakerUsdcTrustline
 * already opens. Mirrors tools/e2e/stub-maker.mjs's own setup (lines
 * 559-574): a classic payment straight from the demo issuer.
 */
async function fundTakerUsdc(takerKp, amount) {
  const keys = JSON.parse(readFileSync(path.join(REPO_ROOT, 'demo-keys.json'), 'utf8'));
  const issuerKp = Keypair.fromSecret(keys.issuer_secret);
  const USDC = new Asset('USDC', issuerKp.publicKey());
  const issuerAccount = await horizon.loadAccount(issuerKp.publicKey());
  const tx = new TransactionBuilder(issuerAccount, { fee: '10000', networkPassphrase: NETWORK })
    .addOperation(Operation.payment({ destination: takerKp.publicKey(), asset: USDC, amount }))
    .setTimeout(60)
    .build();
  tx.sign(issuerKp);
  await horizon.submitTransaction(tx);
}

/**
 * Task 1 (D-09): the two LIVE directions of the curated pair. `sellCode`/
 * `buyCode` are the bare codes selectToken clicks by; `sellToken`/`buyToken`
 * are the literal TOKENS values (src/core/tokens.ts) carried into the
 * report/record so a reader can resolve the exact on-chain asset without
 * guessing.
 */
function directionDescriptor(direction) {
  const usdcValue = usdcTokenValue();
  if (direction === 'xlm-usdc') {
    return {
      direction, sellCode: 'XLM', buyCode: 'USDC',
      sellToken: 'XLM', buyToken: usdcValue,
      sellAmount: SELL_AMOUNT,
    };
  }
  if (direction === 'usdc-xlm') {
    return {
      direction, sellCode: 'USDC', buyCode: 'XLM',
      sellToken: usdcValue, buyToken: 'XLM',
      sellAmount: SELL_AMOUNT_USDC_XLM,
    };
  }
  throw new Error(`directionDescriptor: unsupported LIVE direction "${direction}" (only xlm-usdc/usdc-xlm exist)`);
}

/**
 * Task 1 (D-09): the desk's token pickers (src/ui/TokenSelect.tsx) are a
 * custom listbox, not a native <select> a person can operate — the real
 * <select> carrying `selectId` is rendered at tabIndex -1 behind the
 * visible `.tok__trigger` button. Locate the `.tok` wrapper owning that
 * hidden select, open it, then click the `.tok__opt` whose
 * `.tok__opt-code` text equals `tokenCode` exactly (never Playwright's
 * selectOption, which would target the hidden element directly — a path no
 * person takes).
 */
async function selectToken(page, tally, selectId, tokenCode) {
  const wrapper = page.locator('.tok').filter({ has: page.locator(`#${selectId}`) });
  await click(tally, wrapper.locator('.tok__trigger'), `select-${selectId}-open-${tokenCode.toLowerCase()}`);
  const opt = wrapper.locator('.tok__opt')
    .filter({ has: page.locator('.tok__opt-code', { hasText: new RegExp(`^${tokenCode}$`) }) });
  await click(tally, opt, `select-${selectId}-${tokenCode.toLowerCase()}`);
}

/**
 * LIVE mode (Task 2): mirrors src/data/rfqNetwork.ts's simulateRead exactly
 * — a TransactionBuilder on the zero-balance source account, one `get_maker`
 * call on RFQ_REGISTRY_ID with the maker's Address ScVal, simulateTransaction,
 * scValToNative on the retval. This is the ONLY source of the maker's URL in
 * LIVE mode: the driver must never accept a URL from an environment variable
 * or a constant, because the whole point of success criterion 1 is that
 * nothing in the flow knows the URL ahead of the registry.
 */
async function readRegisteredMaker(address) {
  const src = new Account(ZERO_BALANCE_SOURCE, '0');
  const contract = new Contract(RFQ_REGISTRY_ID);
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call('get_maker', new Address(address).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`readRegisteredMaker: get_maker simulation failed for ${address}: ${sim.error}`);
  }
  const entry = scValToNative(sim.result.retval);
  if (typeof entry?.url !== 'string' || !entry.url.startsWith('https://')) {
    throw new Error(`readRegisteredMaker: on-chain url is not an https:// URL: ${JSON.stringify(entry?.url)}`);
  }
  const tokens = Array.isArray(entry.tokens) ? entry.tokens : [];
  const nativeSac = Asset.native().contractId(NETWORK);
  const usdcSac = usdcSacId();
  if (!tokens.includes(nativeSac) || !tokens.includes(usdcSac)) {
    throw new Error(
      `readRegisteredMaker: registered tokens ${JSON.stringify(tokens)} do not cover both the native ` +
      `SAC (${nativeSac}) and the demo USDC SAC (${usdcSac})`,
    );
  }
  // JSON.stringify (Tally.writeReport) cannot serialize a BigInt, and
  // scValToNative decodes the contract's i128 `staked` field as one — caught
  // live (an UNHANDLED REJECTION crashed the process after a genuine
  // settlement). Stringify it here, at the read boundary, rather than at
  // every later call site that might touch this value.
  return { ...entry, staked: entry.staked.toString() };
}

/**
 * LIVE mode (Task 2): resolves the SAME shape spawnStubMaker resolves — url
 * and pubkey, plus a null child — so every existing url-consumption site
 * (the maker-url page.on counters, meta()'s makerUrl/makerPubkey fields)
 * keeps working unchanged. `child` is always null: there is no process to
 * eject.
 */
async function resolveRealMaker() {
  const registryEntry = await readRegisteredMaker(REAL_MAKER_ADDRESS);
  return { child: null, url: registryEntry.url, pubkey: REAL_MAKER_ADDRESS, registryEntry };
}

/**
 * LIVE mode (Task 2): a deterministic capture of every securitypolicyviolation
 * event the page fires, read back with page.evaluate at the end of the run —
 * this is real evidence the CSP genuinely permitted (or blocked) the
 * cross-origin POST to the maker, not a console-string match. Against a
 * local vite preview there is no Content-Security-Policy header at all
 * (vercel.json's headers apply only once deployed), so the array is
 * trivially empty there; the meaningful measurement is the Vercel
 * branch-preview run (03-02-PLAN.md Task 3).
 */
async function installCspCapture(context) {
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        documentURI: e.documentURI,
      });
    });
  });
}

/**
 * LIVE mode (Task 1 & 2): drives one direction end-to-end against the REAL,
 * deployed maker — no route interception, no stub knobs, the desk's own
 * Refresh quotes button as the only retry mechanism. `dir` is a
 * `directionDescriptor` result: this function no longer assumes XLM is the
 * sell side, it takes sellToken/buyToken/sellAmount straight off `dir` (the
 * caller is responsible for having already clicked the two token pickers
 * into the right pair via `selectToken`, if needed, before calling this).
 * Allows up to two attempts because 03-RESEARCH.md Pitfall 1 flags Vercel
 * cold starts against the taker's fixed 3s per-request fan-out timeout
 * (src/data/rfqNetwork.ts) as a real, not hypothetical, risk; every attempt
 * — including one that finds no row — is pushed into the returned
 * `attempts` array, so the run record can never be a hand-picked successful
 * attempt (T-03-10).
 */
async function runLiveDirection(page, tally, dir) {
  const { direction, sellToken, buyToken, sellAmount } = dir;
  const startedAt = Date.now();
  const attempts = [];

  await fillField(tally, page.locator('#rfqAmount'), `fill-sell-amount-live-${direction}`, sellAmount);

  const rowLocator = page.locator('.rfq-quotes .order.rfq-row');
  let rowCount = 0;
  for (let attemptIndex = 0; attemptIndex < 2 && rowCount === 0; attemptIndex++) {
    const attemptStart = Date.now();
    const label = attemptIndex === 0
      ? `refresh-quotes-live-${direction}`
      : `refresh-quotes-live-${direction}-retry`;
    await click(tally, page.locator('#rfqRefreshBtn'), label, { kind: 'ui-click-nav' });
    await Promise.race([
      rowLocator.first().waitFor({ state: 'visible', timeout: 20000 }),
      page.locator('.empty', { hasText: 'No quotes available' }).waitFor({ state: 'visible', timeout: 20000 }),
    ]).catch(() => {}); // a timeout here is itself evidence — recorded below as rowCount 0
    rowCount = await rowLocator.count();
    const indicatorText = await page.locator('.hint.rfq-indicator').innerText().catch(() => '');
    const makersFoundMatch = indicatorText.match(/(\d+)/);
    attempts.push({
      attemptIndex,
      elapsedMs: Date.now() - attemptStart,
      makersFound: makersFoundMatch ? parseInt(makersFoundMatch[1], 10) : null,
      rowCount,
    });
  }

  if (rowCount === 0) {
    throw new Error(`LIVE ${direction}: no quote row appeared after ${attempts.length} attempt(s)`);
  }

  const quotedReceiveAmount = (await rowLocator.first().locator('.legbox__v').innerText()).trim();

  await click(tally, page.locator('#rfqAcceptBtn'), `accept-quote-live-${direction}`);
  // SUBMIT_TRANSACTION fires here — the ONE taker signTransaction prompt.

  const link = page.locator('.settle a', { hasText: 'View transaction' });
  await link.waitFor({ state: 'visible', timeout: 240000 });
  const txHash = ((await link.getAttribute('href')) ?? '').split('/tx/')[1] ?? null;
  if (!txHash || !/^[0-9a-f]{64}$/.test(txHash)) {
    throw new Error(`LIVE ${direction}: no valid 64-hex tx hash, observed ${txHash}`);
  }

  const settleErrVisible = await page.locator('.settle__err').isVisible().catch(() => false);
  if (settleErrVisible) {
    const errText = await page.locator('.settle__err').innerText().catch(() => '(unreadable)');
    throw new Error(`LIVE ${direction}: settled but .settle__err is present ("${errText}") — SwapExecuted event not confirmed`);
  }

  return {
    direction, sellToken, buyToken, sellAmount,
    quotedReceiveAmount, txHash, attempts,
    settleEventError: settleErrVisible, // always false here — the throw above already stops a true one
    elapsedMs: Date.now() - startedAt,
  };
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

/**
 * Node-side poll for a NEW maker-url response having landed since `before`.
 * The counter this reads lives in Node (a `page.on('requestfinished', ...)`
 * listener in main()), not in the page, so `page.waitForFunction` cannot see
 * it — this is a plain setTimeout poll instead. See runRetryScenario's
 * header comment for why "any row visible" is not a safe proxy for "the
 * fresh fetch landed" once a prior scenario has already left a row on
 * screen.
 */
async function waitForNewMakerResponse(counter, before, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (counter.count <= before) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for a new maker response (count stuck at ${counter.count})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

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

/**
 * 02-04-PLAN.md Task 3, D-09: EXPIRED_ENTRY signs the accepted quote's own
 * maker entry with an already-past signature_expiration_ledger, so
 * settleQuote's ENFORCING-mode simulate rejects it with the host's own
 * "signature has expired" text — VERIFIED LIVE (2026-09-09, see this file's
 * header comment) to happen BEFORE the taker's wallet is ever prompted to
 * sign anything. `requote` ('EQUAL' | 'WORSE') selects the price
 * stub-maker.mjs's SECOND, genuinely valid quote applies relative to the
 * first, via the mode header's RE_QUOTE_PRICE suffix.
 */
async function runRetryScenario(page, tally, setMode, setLedgerPatch, responseCounter, requote) {
  const promptsBefore = tally.counts().walletPrompts;
  const modeLower = requote.toLowerCase();
  setMode(`EXPIRED_ENTRY:${requote}`);
  // The doomed first quote's signatureExpirationLedger is already in the
  // past by real Testnet time (stub-maker.mjs's `expired: true` branch) —
  // that is the whole point of EXPIRED_ENTRY. But src/core/rfq/validate.ts's
  // own `entry_expired` check (Plan 02-02, pre-existing, outside this
  // task's files) compares it against a REAL `getLatestLedger` read taken
  // at THIS SAME refresh, and rejects it before it ever becomes a
  // selectable row — verified live in this continuation session (console:
  // `"reason":"entry_expired"`), contradicting the plan's/retry.ts's
  // assumption that the failure surfaces only later, inside settleQuote's
  // ENFORCING-mode simulate. A short-but-nonzero TTL was already rejected
  // as the fix (racy against Testnet's ~5s ledger close, see retry.ts's
  // header). Instead: patch ONLY the desk's `getLatestLedger` RPC response
  // during THIS refresh to report a tiny, obviously-stale sequence number,
  // so validateQuote's client-side pre-check reads the entry as not-yet-
  // expired and lets the row render — while settleQuote's later ENFORCING
  // simulate validates the entry against the HOST's real on-chain ledger
  // state (never the client's self-reported number), so the genuine
  // expiration failure this scenario needs still fires there, unaffected.
  // Turned off again immediately after the row appears, before Accept, so
  // every ledger read from that point on (settleQuote's own two simulates,
  // and the retry's own fresh-quote re-fetch) is the real one. Documented
  // as a deviation in 02-04-SUMMARY.md.
  setLedgerPatch(true);
  try {
    const responsesBefore = responseCounter.count;
    await click(tally, page.locator('#rfqRefreshBtn'), `refresh-quotes-retry-${modeLower}`, { kind: 'ui-click-nav' });
    await waitForNewMakerResponse(responseCounter, responsesBefore); // see this function's header comment
    await page.locator('.rfq-quotes .order').first().waitFor({ state: 'visible', timeout: 20000 });
    setLedgerPatch(false);
    const priceBefore = await page.locator('.rfq-quotes .order').first().locator('.legbox__v').innerText();

    await click(tally, page.locator('#rfqAcceptBtn'), `accept-quote-retry-${modeLower}`);

    if (requote === 'EQUAL') {
      const link = page.locator('.settle a', { hasText: 'View transaction' });
      await link.waitFor({ state: 'visible', timeout: 60000 });
      const hash = ((await link.getAttribute('href')) ?? '').split('/tx/')[1] ?? null;
      const noteVisible = await page.locator('.rfq-panel .hint', { hasText: 'Quote refreshed at the same or better price' })
        .isVisible().catch(() => false);
      const promptsAfter = tally.counts().walletPrompts;
      const result = {
        mode: 'RETRY_EQUAL',
        label: 'RETRY_EQUAL — an expired entry auto-retries once at an equal price and settles',
        autoRetryNoteObserved: noteVisible,
        txHash: hash,
        walletPrompts: promptsAfter - promptsBefore,
      };
      if (!noteVisible) throw new Error('RETRY_EQUAL: the auto-retry note was not observed');
      if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`RETRY_EQUAL: no valid 64-hex tx hash, observed ${hash}`);
      // Verified live: the doomed first attempt fails during ENFORCING-mode
      // simulate, before any signTransaction prompt — only the successful
      // retry ever reaches signing. See this file's header comment.
      if (result.walletPrompts !== 1) {
        throw new Error(
          `RETRY_EQUAL: expected exactly 1 signTransaction prompt (verified live: the doomed first ` +
          `attempt fails before signing), observed ${result.walletPrompts}`,
        );
      }
      return result;
    }

    // WORSE: stop and re-confirm — the note appears, the row's displayed
    // price changes, and no wallet prompt is EVER opened (the doomed first
    // attempt also fails before signing, and a worse price never retries).
    const noteLocator = page.locator('.rfq-panel .hint', { hasText: 'Price changed — review the new quote before continuing.' });
    await noteLocator.waitFor({ state: 'visible', timeout: 20000 });
    const noteVisible = await noteLocator.isVisible().catch(() => false);
    const priceAfter = await page.locator('.rfq-quotes .order').first().locator('.legbox__v').innerText();
    const promptsAfter = tally.counts().walletPrompts;
    const result = {
      mode: 'RETRY_WORSE',
      label: 'RETRY_WORSE — an expired entry re-quotes at a worse price and stops for re-confirmation',
      reconfirmNoteObserved: noteVisible,
      priceChanged: priceBefore !== priceAfter,
      priceBefore, priceAfter,
      walletPrompts: promptsAfter - promptsBefore,
    };
    if (!noteVisible) throw new Error('RETRY_WORSE: the re-confirmation note was not observed');
    if (!result.priceChanged) throw new Error('RETRY_WORSE: the displayed price did not change');
    if (result.walletPrompts !== 0) {
      throw new Error(
        `RETRY_WORSE: expected zero signTransaction prompts (verified live: the doomed attempt fails ` +
        `before signing, and a worse price never auto-retries), observed ${result.walletPrompts}`,
      );
    }
    return result;
  } finally {
    setMode(null);
    setLedgerPatch(false); // safety net if a throw above skipped the normal early turn-off
  }
}

/**
 * RETRY_WORSE isolation (continuation-session deviation, 02-04-PLAN.md
 * Task 3): runs the WORSE half of the D-09 retry proof against a FRESH,
 * dedicated maker (its own Keypair.random(), its own registry stake) rather
 * than the primary maker RETRY_EQUAL just used, AND forces a proven-empty
 * row list immediately beforehand.
 *
 * Root cause, empirically pinned down live in this continuation session
 * across several failed hypotheses (each ruled out by direct evidence, not
 * assumption): the settlement error's own diagnostic text names an
 * "address" that is REPEATEDLY the PRIMARY maker's own key — EQUAL's own
 * already-successfully-SUBMITTED quote — never WORSE's dedicated maker's
 * key, even after (a) proving via a request-level probe that ZERO requests
 * reached the primary maker's port during the WORSE window, and (b) adding
 * a registry-response allowlist that cut discovery down to "1 maker found"
 * (WORSE's dedicated maker, confirmed by the UI's own count). Both of those
 * prove the NETWORK layer was clean. What they can't prove is that the
 * REACT STATE the Accept click actually reads was equally fresh: RfqPanel's
 * `accept()` captures `quote = visibleQuotes[selectedIndex] ?? visibleQuotes[0]`
 * synchronously the instant the click handler runs, and EQUAL's own
 * successfully-settled row is NEVER explicitly cleared from `quotes` state
 * between scenarios — only ever REPLACED by a later successful `setQuotes`.
 * A DOM `.rfq-quotes .order` element being "visible" proves a row exists,
 * never that THIS SPECIFIC re-render already landed before the click did;
 * a genuinely fresh row can satisfy that wait while the click still race-
 * captures the PRIOR render's closure. Resubmitting EQUAL's own
 * already-consumed entry is EXACTLY what "nonce already exists" correctly,
 * mundanely means — the mystery was never the host's behavior, it was this
 * harness momentarily accepting the wrong row. Reusing the ZERO_MAKERS
 * registry-empty patch (`setZeroMakersPatch`) as a forced INTERMEDIATE
 * clear pass — refresh once with discovery patched to return nothing,
 * wait for the proven-empty "No makers registered" state — removes ANY
 * possibility of a stale row surviving into the real WORSE fetch that
 * follows, by construction rather than by racing a wait against a render.
 *
 * The primary maker is ALSO temporarily made UNREACHABLE
 * (`setBlockPrimaryMaker`, aborting every request to its URL) and discovery
 * is ALSO allowlisted to WORSE's own maker only (`setUrlAllowlist`) for the
 * duration — defense in depth per the investigation above, even though the
 * clear pass is what actually closes the gap. The primary maker itself is
 * untouched (never ejected, never re-registered) so the TRUSTLINE scenario
 * right after this one still discovers it normally.
 */
async function runRetryWorseIsolatedScenario(page, tally, setBlockPrimaryMaker, setLedgerPatch, setUrlAllowlist, setZeroMakersPatch) {
  const makerWorse = await spawnStubMaker({ port: 4177, label: 'makerWorse' });
  const isMakerWorseUrl = (url) => url === makerWorse.url || url === `${makerWorse.url}/`;
  const makerWorseResponseCounter = { count: 0 };
  const onResponse = (req) => { if (isMakerWorseUrl(req.url())) makerWorseResponseCounter.count++; };
  page.on('requestfinished', onResponse);
  let currentWorseMode = null;
  const setWorseMode = (mode) => { currentWorseMode = mode; };
  await page.route(makerWorse.url, async (route) => {
    const headers = { ...route.request().headers() };
    if (currentWorseMode) headers[MODE_HEADER] = currentWorseMode;
    else delete headers[MODE_HEADER];
    await route.continue({ headers });
  });
  setBlockPrimaryMaker(true);
  // Belt-and-suspenders with setBlockPrimaryMaker: the allowlist guards the
  // REGISTRY READ (so a foreign/stale url is never even discovered), the
  // primary-maker block guards the FETCH (so even a discovered primary url
  // gets no answer). Neither alone was the actual bug (see header comment)
  // but both stay as defense in depth.
  setUrlAllowlist([makerWorse.url]);
  try {
    // Forced clear pass: prove `quotes` is genuinely empty before the real
    // fetch, so no prior scenario's row can possibly be what Accept reads.
    setZeroMakersPatch(true);
    await click(tally, page.locator('#rfqRefreshBtn'), 'refresh-quotes-retry-worse-clear', { kind: 'ui-click-nav' });
    await page.locator('.empty', { hasText: 'No makers registered' }).waitFor({ state: 'visible', timeout: 20000 });
    setZeroMakersPatch(false);
    return await runRetryScenario(page, tally, setWorseMode, setLedgerPatch, makerWorseResponseCounter, 'WORSE');
  } finally {
    setZeroMakersPatch(false); // safety net if a throw above skipped the normal early turn-off
    setUrlAllowlist(null);
    setBlockPrimaryMaker(false);
    page.off('requestfinished', onResponse);
    await stopStubMaker(makerWorse.child); // full-refund eject, same as maker2
  }
}

/**
 * 02-04-PLAN.md Task 3, D-08: a taker with NO pre-opened USDC trustline (the
 * shared taker used by every other scenario in this run already has one
 * open, needed to keep the happy path at exactly one prompt) drives its OWN
 * browser context + funded account against the SAME running stub maker.
 * Asserts the passive note is visible after pair selection (default
 * sellToken=XLM/buyToken=USDC needs no click, mirroring the happy path's own
 * zero-click default) and that the taker's WHOLE journey signs a trustline
 * transaction FIRST and a swap transaction SECOND — proven by decoding each
 * SUBMIT_TRANSACTION prompt's own operation type from its XDR, not merely
 * inferred from a count.
 *
 * Root-cause correction (continuation-session finding, VERIFIED LIVE
 * 2026-09-11 against the deployed rfq_swap, see src/ui/RfqPanel.tsx's
 * refreshQuotes header comment): the plan's original design put BOTH the
 * trustline and swap prompts inside the ACCEPT click, on the theory that a
 * quote could already exist before the trustline does. That is physically
 * impossible — a maker's signed quote comes from a RECORDING-mode
 * simulation of the real `swap` call, which actually executes the maker ->
 * taker SAC transfer, and that transfer hard-fails
 * ("trustline entry is missing for account", Error(Contract, #13)) when the
 * taker lacks the trustline. No maker can ever produce a quote for such a
 * taker, so there is nothing to click Accept on until the trustline exists.
 * The fix moves `ensureTrustline` to fire during REFRESH QUOTES instead
 * (still gated behind an explicit taker click, preserving D-08's "in-flow,
 * never a background prompt" principle) — so this scenario now expects the
 * changeTrust prompt during refresh-quotes-trustline and a single
 * invokeHostFunction (swap) prompt during accept-quote-trustline. The
 * end-to-end ORDER the plan cares about (trustline signed before swap) is
 * unchanged; only which click each prompt belongs to changed. Documented as
 * a deviation in 02-04-SUMMARY.md.
 */
async function runTrustlineScenario(browser, tally) {
  const takerKp2 = Keypair.random();
  log(`TRUSTLINE taker ${takerKp2.publicKey()}`);
  await friendbot(takerKp2.publicKey());
  // Deliberately NOT opening a USDC trustline for this taker — that absence
  // is the scenario.

  const promptsBefore = tally.counts().walletPrompts;
  const stepRef2 = { current: 'trustline-scenario' };
  const step2 = (label) => { stepRef2.current = label; };
  const promptSequence = [];

  const context2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context2.addInitScript(initScriptFor(takerKp2.publicKey()));
  const handler2 = makeWalletHandler({ keypair: takerKp2, tally, stepRef: stepRef2 });
  // Wraps (never modifies) freighter-mock.mjs's own handler: decodes each
  // SUBMIT_TRANSACTION's operation type purely as an observer, then
  // delegates to the real handler for signing — no change to that file.
  await context2.exposeBinding('__e2eWallet', (_source, msg) => {
    if (msg.type === 'SUBMIT_TRANSACTION') {
      let opType = 'unknown';
      try {
        opType = TransactionBuilder.fromXDR(msg.transactionXdr, NETWORK).operations[0]?.type ?? 'unknown';
      } catch {
        // leave as 'unknown' — the sequence assertion below will catch it
      }
      promptSequence.push(opType);
    }
    return handler2(msg);
  });
  const page2 = await context2.newPage();
  // Diagnostics-only (continuation-session addition): the outer failure
  // handler in main() always screenshots/consoles `page` (the FIRST
  // context), never `page2` — so a TRUSTLINE-specific failure produced no
  // visibility at all into what page2 actually saw. Captured independently
  // here and written out on error so a future failure is diagnosable
  // without re-running the whole suite.
  const consoleLines2 = [];
  page2.on('console', (m) => consoleLines2.push(`[${m.type()}] ${m.text()}`));
  page2.on('pageerror', (e) => consoleLines2.push(`[pageerror] ${e.message}`));

  try {
    step2('goto');
    await page2.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    step2('connect');
    await click(tally, page2.locator('#connectBtn'), 'connect-button-trustline');
    await click(tally,
      page2.locator('stellar-wallets-modal li').filter({ hasText: 'Freighter' }).first(),
      'modal-pick-freighter-trustline', { timeout: 10000 });
    await page2.locator('#walletChip .wallet-chip__addr')
      .filter({ hasText: takerKp2.publicKey().slice(0, 5) })
      .waitFor({ state: 'visible', timeout: 20000 });

    step2('open-rfq-section');
    await click(tally, page2.locator('.section-fab'), 'open-section-menu-trustline');
    await click(tally, page2.locator('.sheet__option').filter({ hasText: 'RFQ' }), 'choose-rfq-trustline');
    await page2.locator('div[data-panel="rfq"].is-active').waitFor({ state: 'visible', timeout: 20000 });

    // Defaults already are sellToken=XLM, buyToken=USDC — no token clicks
    // needed. The passive note is read off the already-fetched balances
    // (D-08, zero extra network cost); wait rather than snapshot instantly,
    // since the balance poll can lag slightly behind wallet connection.
    const noteLocator = page2.locator('.rfq-panel .hint', { hasText: "You'll need a trustline for" });
    await noteLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const noteVisible = await noteLocator.isVisible().catch(() => false);

    step2('fill-amount');
    await fillField(tally, page2.locator('#rfqAmount'), 'fill-sell-amount-trustline', SELL_AMOUNT);

    step2('refresh-quotes');
    // The changeTrust SUBMIT_TRANSACTION now fires HERE, inside refreshQuotes'
    // own D-08 front-step (src/ui/RfqPanel.tsx) — before the maker fan-out
    // even starts, since the maker cannot simulate a quote without the
    // trustline. Timeout is generous (60s, vs other scenarios' 20-30s) to
    // comfortably cover that extra on-chain round trip ahead of the fan-out.
    await click(tally, page2.locator('#rfqRefreshBtn'), 'refresh-quotes-trustline');
    await page2.locator('.rfq-quotes .order').first().waitFor({ state: 'visible', timeout: 60000 });

    step2('accept-quote');
    await click(tally, page2.locator('#rfqAcceptBtn'), 'accept-quote-trustline');
    // By now the trustline already exists (established above), so
    // settleQuote's own ensureTrustline front-step (src/core/rfq/settle.ts,
    // Task 2, unchanged) is a no-op — this click produces ONLY the swap
    // SUBMIT_TRANSACTION. Both prompts land in `promptSequence` in call
    // order via the exposeBinding wrapper above regardless of which click
    // triggered them.

    step2('wait-settled');
    const link = page2.locator('.settle a', { hasText: 'View transaction' });
    await link.waitFor({ state: 'visible', timeout: 240000 });

    const promptsAfter = tally.counts().walletPrompts;
    const result = {
      mode: 'TRUSTLINE',
      label: 'TRUSTLINE — no receiving trustline: passive note, then trustline prompt before swap prompt',
      noteVisibleBeforeAccept: noteVisible,
      promptSequence,
      walletPrompts: promptsAfter - promptsBefore,
    };
    if (!noteVisible) throw new Error('TRUSTLINE: the D-08 passive note was not visible after pair selection');
    if (promptSequence.length !== 2 || promptSequence[0] !== 'changeTrust' || promptSequence[1] !== 'invokeHostFunction') {
      throw new Error(`TRUSTLINE: expected prompt sequence [changeTrust, invokeHostFunction], observed ${JSON.stringify(promptSequence)}`);
    }
    return result;
  } catch (err) {
    const shot2 = path.join(SCRATCH, `fail-rfq-${Date.now()}-trustline-page2.png`);
    await page2.screenshot({ path: shot2, fullPage: true }).catch(() => {});
    writeFileSync(path.join(SCRATCH, `console-rfq-${Date.now()}-trustline-page2.log`), consoleLines2.join('\n'));
    console.error(`TRUSTLINE page2 screenshot: ${shot2}`);
    console.error(`TRUSTLINE page2 last step: ${stepRef2.current}`);
    throw err;
  } finally {
    await context2.close();
  }
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  log(`RUN_ID=${RUN_ID} report=${REPORT}`);

  const takerKp = Keypair.random();
  log(`taker ${takerKp.publicKey()}`);
  log('funding taker via friendbot...');
  await friendbot(takerKp.publicKey());
  log('opening taker USDC trustline...');
  await openTakerUsdcTrustline(takerKp);
  // Task 1 (D-09): usdc-xlm needs the taker to SELL USDC, so it needs a
  // BALANCE too, not only the trustline above. Headroom is generous (demo
  // USDC is minted freely by this same issuer) rather than tuned tight.
  if (LIVE_MODE && LIVE_DIRECTIONS.includes('usdc-xlm')) {
    log('funding taker with demo USDC (usdc-xlm direction)...');
    await fundTakerUsdc(takerKp, (Number(SELL_AMOUNT_USDC_XLM) + 20).toFixed(7));
  }

  // LIVE mode (Task 2): one env var swaps the local stub for the real,
  // deployed maker — resolveRealMaker() spawns no child process and learns
  // the maker's url ONLY from a genuine on-chain get_maker read.
  let maker;
  let warmupMs = null;
  if (LIVE_MODE) {
    log(`LIVE mode: resolving maker ${REAL_MAKER_ADDRESS} from the registry...`);
    maker = await resolveRealMaker();
    log(`live maker resolved: ${maker.url} (${maker.pubkey}), staked=${maker.registryEntry.staked}`);
    log('warming up the maker function (03-RESEARCH.md Pitfall 1: Vercel cold start vs the 3s fan-out timeout)...');
    const warmupStart = Date.now();
    try {
      await fetch(maker.url, { method: 'OPTIONS' });
    } catch (e) {
      log(`warm-up OPTIONS request failed (non-fatal, recorded as-is): ${e?.message ?? e}`);
    }
    warmupMs = Date.now() - warmupStart;
    log(`warmupMs=${warmupMs}`);
  } else {
    log('starting stub maker...');
    maker = await spawnStubMaker();
    activeStubMakerChild = maker.child; // arms the uncaughtException/unhandledRejection eject above
    log(`stub maker ready: ${maker.url} (${maker.pubkey})`);
  }

  const tally = new Tally();
  const stepRef = { current: 'boot' };
  const step = (label) => { stepRef.current = label; };
  const consoleLines = [];
  let settleTxHash = null;
  const directionResults = [];
  const cspViolations = [];

  const browser = await chromium.launch({ executablePath: CHROME, headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(initScriptFor(takerKp.publicKey()));
  const handler = makeWalletHandler({ keypair: takerKp, tally, stepRef });
  await context.exposeBinding('__e2eWallet', (_source, msg) => handler(msg));
  if (LIVE_MODE) await installCspCapture(context);

  const page = await context.newPage();
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

  // ZERO_MAKERS proof: count every outgoing browser request to the maker's
  // URL, so "the maker was never asked" is measured, not inferred from an
  // absent row alone.
  //
  // isMakerUrl (continuation-session fix): a bare-origin string like
  // "http://localhost:4174" is NOT what `req.url()` reports — the browser's
  // own URL normalization (matching `new URL('http://localhost:4174').href`
  // === "http://localhost:4174/") always adds the trailing slash, so a
  // strict `=== maker.url` comparison never matches ANYTHING and both
  // counters below were silently stuck at 0 for every request, always
  // — caught live in this continuation session: the NEW makerResponseCounter
  // this task adds never incremented even past a real, observed settlement,
  // which is what surfaced that the pre-existing (02-03) makerRequestCounter
  // had the exact same latent bug, invisible until now because ZERO_MAKERS
  // only ever asserted a "stays at 0" invariant — trivially true whether the
  // matching works or is silently broken. Fixed for both counters.
  const isMakerUrl = (url) => url === maker.url || url === `${maker.url}/`;
  const makerRequestCounter = { count: 0 };
  page.on('request', (req) => { if (isMakerUrl(req.url())) makerRequestCounter.count++; });
  // RETRY_EQUAL/RETRY_WORSE (Task 3, continuation-session deviation): a
  // 'request' event fires the instant the fetch is SENT, before the round
  // trip completes — not enough to know the app has actually processed a
  // fresh response. Both retry scenarios run back-to-back on the SAME page
  // with a PRIOR quote row still on screen (RETRY_EQUAL settles but never
  // clears `quotes`; nothing here resets `visibleQuotes`), so a naive
  // "any row visible" wait resolves against that stale row instantly and
  // Accept can fire on an already-consumed quote before the new fetch even
  // lands — caught live (RETRY_WORSE clicked Accept 24ms after its own
  // refresh click, too fast for a real round trip, and the stale settled
  // quote's replay then failed with a non-expiration error the retry guard
  // correctly refuses to retry, so the reconfirm note never appeared).
  // `requestfinished` fires once the response body is fully received,
  // giving runRetryScenario a real completion signal to poll for before
  // trusting anything in the DOM.
  const makerResponseCounter = { count: 0 };
  page.on('requestfinished', (req) => { if (isMakerUrl(req.url())) makerResponseCounter.count++; });

  // D-12 + EXPIRY_DROP (Task 3, mode SHORT_TTL): intercept the desk's own
  // outgoing request to the maker's URL and inject the mode header — the
  // desk's fetch call itself is never modified (no src/ change), only what
  // the browser actually sends over the wire.
  let currentD12Mode = null;
  const setD12Mode = (mode) => { currentD12Mode = mode; };
  // RETRY_WORSE isolation (continuation-session deviation, see
  // runRetryWorseIsolatedScenario's header comment): while active, every
  // request to the PRIMARY maker is aborted outright so it never answers a
  // fan-out — the isolated scenario needs the row to come from ONE fresh,
  // history-free maker only.
  let blockPrimaryMakerActive = false;
  const setBlockPrimaryMaker = (active) => { blockPrimaryMakerActive = active; };
  // LIVE mode registers NO request interception at all (Task 2): the
  // mode-header injection below is exactly the stub-shaped hole this phase
  // closes — a real taker never has a harness rewriting its own outgoing
  // headers.
  if (!LIVE_MODE) {
    await page.route(maker.url, async (route) => {
      if (blockPrimaryMakerActive) { await route.abort(); return; }
      const headers = { ...route.request().headers() };
      if (currentD12Mode) headers[MODE_HEADER] = currentD12Mode;
      else delete headers[MODE_HEADER];
      await route.continue({ headers });
    });
  }

  // ZERO_MAKERS (Task 3): patch ONLY get_urls_for_token simulateTransaction
  // responses to an empty vector — see the header comment for why a real
  // on-chain zero is unreachable for this pair. The real request still
  // round-trips over the network (route.fetch()); every other
  // simulateTransaction call passes straight through untouched.
  //
  // De-duplication (02-04-PLAN.md Task 3, continuation-session deviation):
  // when NOT zero-patching, the raw url vector is still de-duplicated by
  // exact string before it reaches the app. tools/e2e/stub-maker.mjs binds
  // the SAME fixed default ports every run (4174 for the primary maker,
  // 4175 for MULTI_QUOTE's second maker — see spawnStubMaker's `port`
  // param). A maker process that registers on-chain and then crashes
  // BEFORE reaching its SIGINT/SIGTERM eject handler (e.g. the port itself
  // being unavailable) leaves an un-ejectable registry entry behind — its
  // Keypair was `Keypair.random()`, held only in that process's memory,
  // never persisted (grep `writeFileSync` in stub-maker.mjs: only the D-12
  // capture path, never the keypair), so no later process can ever sign an
  // `eject` for it. Because the URL those orphaned entries registered is
  // the SAME default port THIS run's own live maker(s) reuse, they are not
  // dead in the way the pre-existing stray 127.0.0.1:4610 entry
  // (02-03-SUMMARY.md) is: a request to them actually reaches this run's
  // live process and returns a second, genuinely validly signed quote,
  // inflating every discovery-dependent scenario's row count by one row
  // per orphaned duplicate. De-duping the url vector by exact string
  // (never in src/ — a real production taker desk may reasonably want to
  // know a registry has two distinct maker addresses behind one endpoint;
  // this is a harness-only accommodation for lost-key test cruft) restores
  // the deterministic 1-url-per-live-maker shape every scenario already
  // assumed. Documented in 02-04-SUMMARY.md.
  let zeroMakersPatchActive = false;
  const setZeroMakersPatch = (active) => { zeroMakersPatchActive = active; };
  // RETRY_WORSE isolation (continuation-session deviation): a STRICTER tool
  // than dedup. This machine runs MULTIPLE git worktrees' e2e suites against
  // the SAME shared live Testnet registry contract, and tools/e2e/stub-maker.mjs
  // always binds the SAME fixed default ports (4174/4175) — so once THIS
  // run's own maker2 ejects (freeing port 4175), a *different, concurrently
  // running worktree's own* maker2-equivalent can claim that exact port
  // before this run's own discovery next reads it. Dedup alone cannot catch
  // this: the colliding url is a foreign, live, genuinely-registered
  // address, not a stale duplicate string. Caught live in this continuation
  // session: a "nonce already exists" failure whose address matched NEITHER
  // this run's primary maker NOR its dedicated makerWorse — a third,
  // unrecognised maker address answering from a reused port. When
  // non-empty, `urlAllowlist` drops every discovered url that is not
  // EXACTLY one this run itself spawned, eliminating any chance of
  // cross-worktree quote leakage regardless of its cause.
  let urlAllowlist = null;
  const setUrlAllowlist = (urls) => { urlAllowlist = urls; };
  // RETRY_EQUAL/RETRY_WORSE (Task 3, continuation-session deviation): while
  // active, `getLatestLedger` reports an obviously-stale (1) sequence to the
  // DESK ONLY, so validateQuote's client-side entry_expired pre-check reads
  // the already-past-expired doomed quote as not-yet-expired and lets it
  // become a row. This never touches `simulateTransaction`: settleQuote's
  // ENFORCING-mode call validates the same entry against the RPC node's own
  // real ledger state server-side, which this patch cannot see or alter, so
  // the genuine "signature has expired" host failure this scenario needs
  // still fires there unaffected. See runRetryScenario's header comment for
  // why this exists at all.
  let retryLedgerPatchActive = false;
  const setRetryLedgerPatch = (active) => { retryLedgerPatchActive = active; };
  // LIVE mode registers NO request interception at all (Task 2, see the
  // maker.url route above): the dedup and allow-list filters below would
  // themselves be a hardcoded-shaped hole in the flow, and the zero-makers
  // patch would be a fabricated discovery result — exactly what this phase
  // exists to remove.
  if (!LIVE_MODE) {
    await page.route(RPC_URL, async (route) => {
      let body;
      try { body = route.request().postDataJSON(); } catch { await route.continue(); return; }
      if (retryLedgerPatchActive && body?.method === 'getLatestLedger') {
        const response = await route.fetch();
        const json = await response.json();
        if (json?.result) json.result = { ...json.result, sequence: 1 };
        await route.fulfill({ response, json });
        return;
      }
      const txB64 = body?.method === 'simulateTransaction' ? body?.params?.transaction : null;
      if (!txB64 || !Buffer.from(txB64, 'base64').includes(GET_URLS_FN_BYTES)) { await route.continue(); return; }
      const response = await route.fetch();
      const json = await response.json();
      if (json?.result?.results?.[0]) {
        if (zeroMakersPatchActive) {
          json.result.results[0] = { ...json.result.results[0], xdr: EMPTY_STRING_VEC_XDR };
        } else {
          const rawXdr = json.result.results[0].xdr;
          const urls = scValToNative(xdr.ScVal.fromXDR(rawXdr, 'base64'));
          let filtered = Array.from(new Set(urls));
          if (urlAllowlist) {
            const allowed = new Set(urlAllowlist);
            filtered = filtered.filter((u) => allowed.has(u));
          }
          const filteredXdr = xdr.ScVal.scvVec(filtered.map((u) => xdr.ScVal.scvString(u))).toXDR('base64');
          json.result.results[0] = { ...json.result.results[0], xdr: filteredXdr };
        }
      }
      await route.fulfill({ response, json });
    });
  }

  const scenarioResults = [];
  const startedAt = new Date().toISOString();
  const meta = () => ({
    runId: RUN_ID, role: 'taker', publicKey: takerKp.publicKey(), makerUrl: maker.url, makerPubkey: maker.pubkey,
    sellAmount: SELL_AMOUNT, baseUrl: BASE_URL, startedAt, finishedAt: new Date().toISOString(), settleTxHash,
    scenarios: scenarioResults,
    mode: LIVE_MODE ? 'LIVE' : 'STUB',
    ...(LIVE_MODE ? {
      makerAddress: REAL_MAKER_ADDRESS,
      makerUrlOnChain: maker.url,
      registryEntry: maker.registryEntry,
      directions: directionResults,
      cspViolations,
      warmupMs,
    } : {}),
  });

  const consolePath = path.join(SCRATCH, `console-rfq-${Date.now()}.log`);
  const hardCap = setTimeout(async () => {
    console.error('HARD CAP (10min) hit');
    writeFileSync(consolePath, consoleLines.join('\n'));
    tally.writeReport(REPORT, { ...meta(), status: 'failed', failedStep: stepRef.current, error: 'hard cap' });
    if (activeStubMakerChild) { await stopStubMaker(activeStubMakerChild); activeStubMakerChild = null; }
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

    // LIVE mode (Task 1 & 2): the happy path only, against the real remote
    // maker, for every direction in LIVE_DIRECTIONS — none of the D-12 /
    // discovery / retry / trustline scenarios below run, since every one of
    // them depends on a stub-maker knob or a route patch LIVE mode never
    // installs.
    if (LIVE_MODE) {
      for (let i = 0; i < LIVE_DIRECTIONS.length; i++) {
        const direction = LIVE_DIRECTIONS[i];
        const dir = directionDescriptor(direction);
        step(`live-direction-${direction}`);

        if (i > 0) {
          // Task 1 (D-09): reset the panel state by reloading — a stale
          // settled row from the prior direction must never be mistaken for
          // this direction's own result. src/wallet/WalletContext.tsx
          // restores the connection straight off localStorage on mount
          // (verified live: #connectBtn stayed HIDDEN 34 straight polls after
          // a reload), so there is no fresh Connect click to make in the
          // normal case — wait for the wallet chip directly, and only fall
          // back to the connect+pick-Freighter sequence if the gate is ever
          // slow enough that #connectBtn is what actually renders first.
          await page.reload({ waitUntil: 'domcontentloaded' });
          const chip = page.locator('#walletChip .wallet-chip__addr')
            .filter({ hasText: takerKp.publicKey().slice(0, 5) });
          const connectBtn = page.locator('#connectBtn');
          await Promise.race([
            chip.waitFor({ state: 'visible', timeout: 15000 }),
            connectBtn.waitFor({ state: 'visible', timeout: 15000 }),
          ]).catch(() => {});
          if (await connectBtn.isVisible().catch(() => false)) {
            await click(tally, connectBtn, `connect-button-live-${direction}`);
            await click(tally,
              page.locator('stellar-wallets-modal li').filter({ hasText: 'Freighter' }).first(),
              `modal-pick-freighter-live-${direction}`, { timeout: 10000 });
          }
          await chip.waitFor({ state: 'visible', timeout: 20000 });
          await click(tally, page.locator('.section-fab'), `open-section-menu-live-${direction}`);
          await click(tally, page.locator('.sheet__option').filter({ hasText: 'RFQ' }), `choose-rfq-live-${direction}`);
          await page.locator('div[data-panel="rfq"].is-active').waitFor({ state: 'visible', timeout: 20000 });
        }

        // Ordering matters (RfqPanel.tsx's noPair guard): change BOTH
        // selects before touching amount/refresh. The default panel state is
        // already sellToken=XLM/buyToken=USDC, so xlm-usdc needs no clicks.
        const isDefaultPair = dir.sellCode === 'XLM' && dir.buyCode === 'USDC';
        if (!isDefaultPair) {
          await selectToken(page, tally, 'rfqBuyToken', dir.buyCode);
          await selectToken(page, tally, 'rfqSellToken', dir.sellCode);
        }

        const result = await runLiveDirection(page, tally, dir);
        directionResults.push(result);
        settleTxHash = result.txHash;
        cspViolations.push(...(await page.evaluate(() => window.__cspViolations || [])));
        log(`LIVE ${direction}: txHash=${result.txHash} attempts=${result.attempts.length} elapsedMs=${result.elapsedMs}`);
      }

      const body = tally.writeReport(REPORT, { ...meta(), status: 'ok', failedStep: null });
      writeFileSync(consolePath, consoleLines.join('\n'));
      console.log(`REPORT ${REPORT}`);
      console.log(JSON.stringify(body.counts));
      console.log(`LIVE directions=${directionResults.length} cspViolations=${cspViolations.length} warmupMs=${warmupMs}`);
      await browser.close();
      process.exit(0);
    }

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

    // 02-04-PLAN.md Task 3: trustline pre-flight and the D-09 price-guarded
    // retry, each measured against the deployed rfq_swap rather than
    // asserted from memory.
    step('retry-equal');
    const retryEqualResult = await runRetryScenario(page, tally, setD12Mode, setRetryLedgerPatch, makerResponseCounter, 'EQUAL');
    scenarioResults.push(retryEqualResult);
    log(`RETRY_EQUAL: autoRetryNoteObserved=${retryEqualResult.autoRetryNoteObserved} txHash=${retryEqualResult.txHash} walletPrompts=${retryEqualResult.walletPrompts}`);

    step('retry-worse');
    const retryWorseResult = await runRetryWorseIsolatedScenario(page, tally, setBlockPrimaryMaker, setRetryLedgerPatch, setUrlAllowlist, setZeroMakersPatch);
    scenarioResults.push(retryWorseResult);
    log(`RETRY_WORSE: reconfirmNoteObserved=${retryWorseResult.reconfirmNoteObserved} priceChanged=${retryWorseResult.priceChanged} walletPrompts=${retryWorseResult.walletPrompts}`);

    step('trustline');
    const trustlineResult = await runTrustlineScenario(browser, tally);
    scenarioResults.push(trustlineResult);
    log(`TRUSTLINE: noteVisibleBeforeAccept=${trustlineResult.noteVisibleBeforeAccept} promptSequence=${JSON.stringify(trustlineResult.promptSequence)}`);

    tally.record('milestone', 'task4-scenarios-complete');

    const body = tally.writeReport(REPORT, { ...meta(), status: 'ok', failedStep: null });
    writeFileSync(consolePath, consoleLines.join('\n'));
    console.log(`REPORT ${REPORT}`);
    console.log(JSON.stringify(body.counts));
    console.log(`SCENARIOS ${scenarioResults.length} (expected 12): ${scenarioResults.map((s) => s.mode).join(', ')}`);
    await browser.close();
    if (activeStubMakerChild) { await stopStubMaker(activeStubMakerChild); activeStubMakerChild = null; }
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
    if (activeStubMakerChild) { await stopStubMaker(activeStubMakerChild); activeStubMakerChild = null; }
    process.exit(1);
  }
}

main();
