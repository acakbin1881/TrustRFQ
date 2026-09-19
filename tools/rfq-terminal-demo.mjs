// rfq-terminal-demo.mjs: the whole RFQ lane, in one terminal command, with no
// wallet, no browser and no key file.
//
// It is the developer-facing twin of the web demo. Every step is a real network
// call against deployed Testnet contracts and a real always-on maker server:
//
//   1. read rfq_swap's live config (fee, paused)
//   2. discover makers for the pair through rfq_registry alone — there is no
//      hardcoded maker URL anywhere in this file
//   3. create a throwaway taker (Friendbot) and open its USDC trustline
//   4. fan out `getMakerSideOrder` over the Stellar RFQ v1 wire protocol
//   5. validate the quote against the CONTRACT's own config, not the maker's word
//   6. prove tamper-resistance: replay the maker's signature under a changed
//      amount and watch the host reject it BEFORE anything settles
//   7. settle for real: one transaction, taker signs once, maker never submits
//   8. prove replay-resistance: the same signed entry a second time is rejected
//
// Usage:
//   node tools/rfq-terminal-demo.mjs                 # throwaway taker, sells 10 XLM
//   SELL_AMOUNT=25 node tools/rfq-terminal-demo.mjs  # different size
//   TAKER_SECRET=S... node tools/rfq-terminal-demo.mjs   # use your own funded account
//
// Exits non-zero if any assertion fails.

import {
  Address, Asset, BASE_FEE, Contract, Horizon, Keypair, Networks, Operation,
  TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr,
} from '@stellar/stellar-sdk';

const { Server, Api, assembleTransaction } = rpc;

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;

const SWAP_ID = process.env.RFQ_SWAP_CONTRACT_ID || 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';
const REGISTRY_ID = process.env.RFQ_REGISTRY_ID || 'CBEFE7JY3PT5XF6CT3BMWF5RGPNUBGHKWPUDD3KLFZBLXFE3RPIDRLL3';
// The demo USDC issuer. Testnet only: this is OUR issuer, not Circle's.
const USDC_ISSUER = process.env.USDC_ISSUER || 'GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26';
const SELL_AMOUNT = process.env.SELL_AMOUNT || '10';
const QUOTE_TIMEOUT_MS = Number(process.env.QUOTE_TIMEOUT_MS || 5000);

const server = new Server(RPC_URL);
const horizon = new Horizon.Server(HORIZON_URL);

let failures = 0;
const step = (n, title) => console.log(`\n─── ${n}  ${title}\n`);
const say = (...a) => console.log('   ', ...a);
function check(label, ok, detail = '') {
  console.log(`    ${ok ? '✓' : '✗'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}
const atomic = (s) => BigInt(Math.round(Number(s) * 1e7));
const human = (n) => (Number(n) / 1e7).toFixed(7);

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

/** Free read-only simulation with an unfunded source: no signing, no fee. */
async function simulateRead(contractId, fn, args) {
  const src = new (await import('@stellar/stellar-sdk')).Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

/** The contract's `Order` struct: symbol keys, sorted. */
function orderScVal(o) {
  const fields = {
    maker: new Address(o.maker).toScVal(),
    taker: new Address(o.taker).toScVal(),
    maker_token: new Address(o.makerToken).toScVal(),
    maker_amount: nativeToScVal(atomic(o.makerAmount), { type: 'i128' }),
    taker_token: new Address(o.takerToken).toScVal(),
    taker_amount: nativeToScVal(atomic(o.takerAmount), { type: 'i128' }),
    expiry: nativeToScVal(BigInt(o.expiry), { type: 'u64' }),
    order_id: nativeToScVal(BigInt(o.orderId), { type: 'u64' }),
    fee_bps: nativeToScVal(o.feeBps, { type: 'u32' }),
  };
  const entries = Object.keys(fields).sort()
    .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}

const swapOp = (order, auth) => Operation.invokeContractFunction({
  contract: SWAP_ID, function: 'swap', args: [orderScVal(order)], auth,
});

function isMakerEntry(entry, makerAddr) {
  try {
    const c = entry.credentials();
    return c.switch().name === 'sorobanCredentialsAddress'
      && Address.fromScAddress(c.address().address()).toString() === makerAddr;
  } catch { return false; }
}

/**
 * Recording-mode probe -> substitute the maker's pre-signed entry -> ENFORCING
 * simulate. The enforcing pass is where the host validates the maker's
 * signature, so a tampered order dies here, before submission.
 */
async function buildSettlement(takerPub, order, authEntryB64) {
  const probeAcct = await server.getAccount(takerPub);
  const probe = new TransactionBuilder(probeAcct, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(swapOp(order)).setTimeout(180).build();
  const probeSim = await server.simulateTransaction(probe);
  if (Api.isSimulationError(probeSim)) throw new Error(probeSim.error);

  const entries = probeSim.result?.auth ?? [];
  const idx = entries.findIndex((e) => isMakerEntry(e, order.maker));
  if (idx < 0) throw new Error('simulation produced no maker authorization entry');
  const signed = xdr.SorobanAuthorizationEntry.fromXDR(authEntryB64, 'base64');
  const auth = entries.map((e, i) => (i === idx ? signed : e));

  const acct = await server.getAccount(takerPub);
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(swapOp(order, auth)).setTimeout(180).build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(sim.error);
  return assembleTransaction(tx, sim).build();
}

async function balances(pub) {
  const acct = await horizon.loadAccount(pub);
  const out = { XLM: 0n, USDC: 0n };
  for (const b of acct.balances) {
    if (b.asset_type === 'native') out.XLM = BigInt(b.balance.replace('.', ''));
    else if (b.asset_code === 'USDC') out.USDC = BigInt(b.balance.replace('.', ''));
  }
  return out;
}

async function main() {
  console.log('\nTrustRFQ — RFQ lane, end to end, from the terminal');
  console.log('Stellar Testnet · no wallet, no browser, no key file\n');
  say(`rfq_swap      ${SWAP_ID}`);
  say(`rfq_registry  ${REGISTRY_ID}`);

  // 1 ---------------------------------------------------------------------
  step('1/8', 'The settlement contract states its own terms');
  const cfg = await simulateRead(SWAP_ID, 'get_config', []);
  say(`fee_bps ${cfg.fee_bps}   paused ${cfg.paused}   fee_collector ${cfg.fee_collector}`);
  check('contract is not paused', cfg.paused === false);
  check('fee is at or under the 30 bps protocol cap', cfg.fee_bps <= 30, `${cfg.fee_bps} bps`);

  // 2 ---------------------------------------------------------------------
  step('2/8', 'Maker discovery, on-chain only');
  const xlmSac = Asset.native().contractId(NETWORK);
  const usdc = new Asset('USDC', USDC_ISSUER);
  const usdcSac = usdc.contractId(NETWORK);
  say(`XLM  SAC ${xlmSac}`);
  say(`USDC SAC ${usdcSac}`);
  const [sellUrls, buyUrls] = await Promise.all([
    simulateRead(REGISTRY_ID, 'get_urls_for_token', [new Address(xlmSac).toScVal()]),
    simulateRead(REGISTRY_ID, 'get_urls_for_token', [new Address(usdcSac).toScVal()]),
  ]);
  const buySet = new Set(buyUrls);
  const urls = [...new Set(sellUrls.filter((u) => buySet.has(u)))];
  say(`${urls.length} registered maker endpoint(s) quote this pair:`);
  for (const u of urls) say(`  - ${u}`);
  check('at least one maker is registered for XLM/USDC', urls.length > 0);
  say('nothing above is hardcoded: both lists came from rfq_registry.get_urls_for_token');

  // 3 ---------------------------------------------------------------------
  step('3/8', 'A throwaway taker');
  const taker = process.env.TAKER_SECRET ? Keypair.fromSecret(process.env.TAKER_SECRET) : Keypair.random();
  say(`taker ${taker.publicKey()}`);
  if (!process.env.TAKER_SECRET) {
    say('funding via Friendbot...');
    await friendbot(taker.publicKey());
    say('opening the USDC trustline (the asset the taker is about to be paid in)...');
    const acct = await horizon.loadAccount(taker.publicKey());
    const tx = new TransactionBuilder(acct, { fee: '10000', networkPassphrase: NETWORK })
      .addOperation(Operation.changeTrust({ asset: usdc, limit: '1000000' }))
      .setTimeout(60).build();
    tx.sign(taker);
    await horizon.submitTransaction(tx);
  }
  const before = { taker: await balances(taker.publicKey()) };
  say(`taker holds ${human(before.taker.XLM)} XLM, ${human(before.taker.USDC)} USDC`);

  // 4 ---------------------------------------------------------------------
  step('4/8', `Ask every discovered maker for a firm quote on ${SELL_AMOUNT} XLM`);
  const params = {
    // The wire field carries the FULL passphrase, which is what the desk sends
    // (src/ui/RfqPanel.tsx) and what the maker validates against.
    network: NETWORK,
    swapContract: SWAP_ID,
    makerToken: usdcSac,
    takerToken: xlmSac,
    takerAmount: SELL_AMOUNT,
    takerWallet: taker.publicKey(),
    minExpiry: Math.floor(Date.now() / 1000) + 60,
  };
  const quotes = [];
  let dropped = 0;
  await Promise.all(urls.map(async (url) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMakerSideOrder', params }),
        signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
      });
      const body = await res.json();
      const ms = Date.now() - t0;
      if (body.error) { dropped++; say(`  ${url}\n      declined: ${body.error.code} ${body.error.message.split('\n')[0]}  (${ms} ms)`); return; }
      say(`  ${url}\n      quoted ${body.result.order.makerAmount} USDC  (${ms} ms)`);
      quotes.push(body.result);
    } catch (e) {
      dropped++;
      say(`  ${url}\n      no answer: ${String(e.message || e).slice(0, 60)}  (${Date.now() - t0} ms)`);
    }
  }));
  if (dropped) {
    say(`${dropped} endpoint(s) dropped, not retried: registration is permissionless, so a registry`);
    say('can hold entries whose server is gone. A quote that does not arrive in time is simply not a quote.');
  }
  console.log();
  check('at least one maker returned a signed quote', quotes.length > 0);
  if (!quotes.length) throw new Error('no quotes');
  quotes.sort((a, b) => Number(atomic(b.order.makerAmount) - atomic(a.order.makerAmount)));
  const best = quotes[0];
  const order = best.order;
  console.log();
  say(`best price: ${order.takerAmount} XLM -> ${order.makerAmount} USDC  from ${order.maker}`);
  say(`valid for ${order.expiry - Math.floor(Date.now() / 1000)}s, order_id ${order.orderId}`);

  // 5 ---------------------------------------------------------------------
  step('5/8', 'Validate the quote against the contract, not the maker');
  check('quote is bound to THIS taker', order.taker === taker.publicKey());
  check('quote is bound to THIS settlement contract', best.swapContract === SWAP_ID);
  check('quote is bound to THIS network', best.network === NETWORK);
  check('quoted fee equals the contract\'s live fee', order.feeBps === cfg.fee_bps, `${order.feeBps} bps`);
  check('quote has not expired', order.expiry > Math.floor(Date.now() / 1000));
  check('maker sent a detached signed authorization entry', typeof best.authEntry === 'string' && best.authEntry.length > 100);
  say(`authEntry is ${best.authEntry.length} base64 chars of SorobanAuthorizationEntry`);

  // 6 ---------------------------------------------------------------------
  step('6/8', 'Tamper test: reuse that signature under a better price for us');
  const tampered = { ...order, takerAmount: String(Number(order.takerAmount) / 10) };
  say(`same signature, but pay ${tampered.takerAmount} XLM instead of ${order.takerAmount} XLM`);
  let tamperRejected = false, tamperErr = '';
  try {
    await buildSettlement(taker.publicKey(), tampered, best.authEntry);
  } catch (e) { tamperRejected = true; tamperErr = String(e.message || e).split('\n')[0].slice(0, 110); }
  check('the host rejected the tampered order', tamperRejected, tamperErr);
  say('every economic term is inside require_auth_for_args, so one changed digit invalidates the signature');

  // 7 ---------------------------------------------------------------------
  step('7/8', 'Settle for real: ONE transaction, the taker signs once');
  const makerBefore = await balances(order.maker);
  const collectorBefore = await balances(cfg.fee_collector);
  const ready = await buildSettlement(taker.publicKey(), order, best.authEntry);
  ready.sign(taker);
  const sent = await server.sendTransaction(ready);
  if (sent.status === 'ERROR') throw new Error(`submit rejected: ${JSON.stringify(sent.errorResult)}`);
  const res = await server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1500 });
  check('transaction succeeded on-chain', res.status === 'SUCCESS', res.status);
  say(`tx ${sent.hash}`);
  say(`   https://stellar.expert/explorer/testnet/tx/${sent.hash}`);

  const after = { taker: await balances(taker.publicKey()) };
  const makerAfter = await balances(order.maker);
  const collectorAfter = await balances(cfg.fee_collector);
  const quotedUsdc = atomic(order.makerAmount);
  const soldXlm = atomic(order.takerAmount);
  const fee = (quotedUsdc * BigInt(order.feeBps)) / 10000n;
  console.log();
  say(`taker USDC      +${human(after.taker.USDC - before.taker.USDC)}   (quoted ${order.makerAmount})`);
  say(`maker USDC      ${human(makerAfter.USDC - makerBefore.USDC)}   (quote + ${human(fee)} fee)`);
  say(`collector USDC  +${human(collectorAfter.USDC - collectorBefore.USDC)}`);
  say(`taker XLM       ${human(after.taker.XLM - before.taker.XLM)}   (${order.takerAmount} sold + network fee)`);
  say(`maker XLM       +${human(makerAfter.XLM - makerBefore.XLM)}`);
  console.log();
  check('taker received EXACTLY the quoted amount', after.taker.USDC - before.taker.USDC === quotedUsdc);
  check('maker paid the quote plus the protocol fee', makerBefore.USDC - makerAfter.USDC === quotedUsdc + fee);
  check('fee collector received exactly the 10 bps fee', collectorAfter.USDC - collectorBefore.USDC === fee);
  check('maker received exactly the sold XLM', makerAfter.XLM - makerBefore.XLM === soldXlm);
  say('no slippage, no price impact, no pool: the quoted price IS the settled price');

  // 8 ---------------------------------------------------------------------
  step('8/8', 'Replay test: submit the very same signed quote again');
  let replayRejected = false, replayErr = '';
  try {
    await buildSettlement(taker.publicKey(), order, best.authEntry);
  } catch (e) { replayRejected = true; replayErr = String(e.message || e).split('\n')[0].slice(0, 110); }
  check('the host rejected the replay', replayRejected, replayErr);
  say('the auth entry carries a host nonce, consumed by the first settlement');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error('\nFAILED:', e.message || e); process.exit(1); });
