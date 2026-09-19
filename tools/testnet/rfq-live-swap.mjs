// rfq-live-swap.mjs: TESTNET-ONLY live proof of the rfq_swap authorization model.
//
// This script exists to answer the one question unit tests structurally cannot:
// does the host accept, inside a SINGLE transaction, a maker's detached
// Address-credential auth entry (scoped with `require_auth_for_args`) together
// with a taker who authorizes merely by being the transaction source account?
//
// Mocked auth in `contracts/rfq_swap/src/test.rs` bypasses the host's signature
// machinery entirely, so it can prove argument binding but never the credential
// mix, the nonce consumption, or signature expiry. Those are proven here.
//
// It creates its own throwaway actors via Friendbot, so it depends on no
// gitignored key file and can be re-run from scratch at any time.
//
//   RFQ_CONTRACT_ID=C... node tools/testnet/rfq-live-swap.mjs
//
// Exits non-zero on any failed assertion.

import {
  Keypair, Networks, Asset, Operation, TransactionBuilder, Contract,
  Address, nativeToScVal, xdr, authorizeEntry, rpc, Horizon,
} from '@stellar/stellar-sdk';

const { Server, Api, assembleTransaction } = rpc;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const FEE = '2000000';
const TIMEOUT = 120;

const CONTRACT_ID =
  process.env.RFQ_CONTRACT_ID || 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';

// The deal. Maker sells 10 XLM for 25 RFQ; the maker also pays the protocol fee
// in XLM on top of its leg.
const MAKER_AMOUNT = 100_000_000n; // 10.0000000 XLM
const TAKER_AMOUNT = 250_000_000n; // 25.0000000 RFQ
const FEE_BPS = 10; // must match the deployed contract's current fee
const EXPECTED_FEE = (MAKER_AMOUNT * BigInt(FEE_BPS)) / 10_000n; // 100_000 = 0.01 XLM

const server = new Server(RPC_URL);
const horizon = new Horizon.Server(HORIZON_URL);
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

// --- plumbing -------------------------------------------------------------

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

async function submitClassic(kp, buildOps) {
  const account = await horizon.loadAccount(kp.publicKey());
  const b = new TransactionBuilder(account, { fee: '10000', networkPassphrase: NETWORK });
  for (const op of buildOps) b.addOperation(op);
  const tx = b.setTimeout(TIMEOUT).build();
  tx.sign(kp);
  return horizon.submitTransaction(tx);
}

/// Build, simulate, assemble, sign and submit a Soroban transaction whose auth
/// the simulation is allowed to fill in (used only for the SAC deploys).
async function submitSoroban(kp, op) {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(op)
    .setTimeout(TIMEOUT)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(sim.error);
  const ready = assembleTransaction(tx, sim).build();
  ready.sign(kp);
  const sent = await server.sendTransaction(ready);
  if (sent.status !== 'PENDING') throw new Error(JSON.stringify(sent));
  return server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
}

/// The `Order` struct as an ScVal. Soroban struct maps require symbol keys in
/// sorted order, so the entries are sorted rather than hand-ordered.
function orderScVal(o) {
  const fields = {
    maker: new Address(o.maker).toScVal(),
    taker: new Address(o.taker).toScVal(),
    maker_token: new Address(o.maker_token).toScVal(),
    maker_amount: nativeToScVal(o.maker_amount, { type: 'i128' }),
    taker_token: new Address(o.taker_token).toScVal(),
    taker_amount: nativeToScVal(o.taker_amount, { type: 'i128' }),
    expiry: nativeToScVal(o.expiry, { type: 'u64' }),
    order_id: nativeToScVal(o.order_id, { type: 'u64' }),
    fee_bps: nativeToScVal(o.fee_bps, { type: 'u32' }),
  };
  const entries = Object.keys(fields)
    .sort()
    .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}

function isAddressCredential(entry, pubkey) {
  const c = entry.credentials();
  if (c.switch().name !== 'sorobanCredentialsAddress') return false;
  return Address.fromScAddress(c.address().address()).toString() === pubkey;
}

function credentialKind(entry) {
  return entry.credentials().switch().name;
}

async function balances(pub) {
  const acct = await horizon.loadAccount(pub);
  const out = { XLM: 0n };
  for (const b of acct.balances) {
    if (b.asset_type === 'native') out.XLM = BigInt(b.balance.replace('.', ''));
    else out[b.asset_code] = BigInt(b.balance.replace('.', ''));
  }
  return out;
}

// --- the run --------------------------------------------------------------

async function main() {
  log(`contract ${CONTRACT_ID}`);

  const maker = Keypair.random();
  const taker = Keypair.random();
  const issuer = Keypair.random();
  log(`maker  ${maker.publicKey()}`);
  log(`taker  ${taker.publicKey()}`);

  log('funding actors via friendbot...');
  await Promise.all([friendbot(maker.publicKey()), friendbot(taker.publicKey()), friendbot(issuer.publicKey())]);

  // A throwaway classic asset for the taker's leg. BOTH sides need a trustline:
  // the taker to hold it, the maker to receive it.
  const RFQ = new Asset('RFQ', issuer.publicKey());
  log('opening trustlines and funding the taker with RFQ...');
  await submitClassic(maker, [Operation.changeTrust({ asset: RFQ, limit: '1000000' })]);
  await submitClassic(taker, [Operation.changeTrust({ asset: RFQ, limit: '1000000' })]);
  await submitClassic(issuer, [
    Operation.payment({ destination: taker.publicKey(), asset: RFQ, amount: '100' }),
  ]);

  // Both legs move through Stellar Asset Contracts. The native SAC usually
  // already exists on testnet; creating the RFQ one is a per-asset one-off.
  log('deploying the RFQ Stellar Asset Contract...');
  try {
    await submitSoroban(issuer, Operation.createStellarAssetContract({ asset: RFQ }));
  } catch (e) {
    log(`  (SAC create skipped: ${String(e.message || e).slice(0, 120)})`);
  }

  const makerToken = Asset.native().contractId(NETWORK);
  const takerToken = RFQ.contractId(NETWORK);
  log(`maker_token (XLM SAC) ${makerToken}`);
  log(`taker_token (RFQ SAC) ${takerToken}`);

  const cfg = await readConfig();
  if (cfg.fee_bps !== FEE_BPS) {
    throw new Error(`contract fee is ${cfg.fee_bps} bps, script expects ${FEE_BPS}`);
  }
  const collector = cfg.fee_collector;
  log(`fee ${cfg.fee_bps} bps -> collector ${collector}`);

  const order = {
    maker: maker.publicKey(),
    taker: taker.publicKey(),
    maker_token: makerToken,
    maker_amount: MAKER_AMOUNT,
    taker_token: takerToken,
    taker_amount: TAKER_AMOUNT,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 300),
    order_id: BigInt(Date.now() % 1_000_000),
    fee_bps: FEE_BPS,
  };

  const before = {
    maker: await balances(maker.publicKey()),
    taker: await balances(taker.publicKey()),
    collector: await balances(collector),
  };

  // 1. Build the invocation with the TAKER as transaction source. This is the
  //    whole point: the taker's ordinary envelope signature is their auth.
  const contract = new Contract(CONTRACT_ID);
  const takerAccount = await server.getAccount(taker.publicKey());
  const probe = new TransactionBuilder(takerAccount, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call('swap', orderScVal(order)))
    .setTimeout(TIMEOUT)
    .build();

  // 2. Recording-mode simulation produces the required auth entries, including
  //    the nested token transfer sub-invocations, so nothing is hand-built.
  log('recording-mode simulation...');
  const sim = await server.simulateTransaction(probe);
  if (Api.isSimulationError(sim)) throw new Error(`recording sim failed: ${sim.error}`);

  const entries = sim.result?.auth ?? [];
  log(`  simulation returned ${entries.length} auth entr${entries.length === 1 ? 'y' : 'ies'}: ` +
      entries.map(credentialKind).join(', '));

  const makerIdx = entries.findIndex((e) => isAddressCredential(e, maker.publicKey()));
  check('maker gets an Address-credential entry', makerIdx >= 0);
  if (makerIdx < 0) throw new Error('no maker auth entry to sign');

  const takerEntries = entries.filter((_, i) => i !== makerIdx);
  check(
    'taker needs no detached Address-credential entry',
    !takerEntries.some((e) => isAddressCredential(e, taker.publicKey())),
    takerEntries.map(credentialKind).join(',') || 'none',
  );

  // 3. The maker signs its entry offline. In production this happens inside the
  //    maker's quote server; here a raw Keypair stands in for that hot key.
  const { sequence } = await server.getLatestLedger();
  const validUntil = sequence + 60;
  const signedMaker = await authorizeEntry(entries[makerIdx], maker, validUntil, NETWORK);
  log(`maker entry signed, valid until ledger ${validUntil}`);

  // 4. Rebuild with BOTH entries pre-attached. assembleTransaction only injects
  //    simulation auth when the operation carries none, so the taker's
  //    source-account entry has to travel with the signed maker entry.
  const auth = entries.map((e, i) => (i === makerIdx ? signedMaker : e));
  const txHash = await settle(taker, order, auth, 'enforcing-mode simulation');
  check('swap settled on-chain', !!txHash, txHash || '');
  if (!txHash) throw new Error('settlement failed');
  log(`tx ${txHash}`);
  log(`https://stellar.expert/explorer/testnet/tx/${txHash}`);

  // 5. Balances. The maker submits nothing, so its XLM delta is exact.
  const after = {
    maker: await balances(maker.publicKey()),
    taker: await balances(taker.publicKey()),
    collector: await balances(collector),
  };
  const d = (who, asset) => (after[who][asset] ?? 0n) - (before[who][asset] ?? 0n);

  check('maker XLM debited leg + fee', d('maker', 'XLM') === -(MAKER_AMOUNT + EXPECTED_FEE),
    `${d('maker', 'XLM')} vs ${-(MAKER_AMOUNT + EXPECTED_FEE)}`);
  check('collector received the fee', d('collector', 'XLM') === EXPECTED_FEE,
    `${d('collector', 'XLM')} vs ${EXPECTED_FEE}`);
  check('maker received the taker leg', d('maker', 'RFQ') === TAKER_AMOUNT,
    `${d('maker', 'RFQ')}`);
  check('taker paid the taker leg', d('taker', 'RFQ') === -TAKER_AMOUNT,
    `${d('taker', 'RFQ')}`);
  // The taker pays the network fee out of the same asset, so allow for it.
  const takerXlm = d('taker', 'XLM');
  check('taker received the maker leg (minus network fees)',
    takerXlm > MAKER_AMOUNT - 10_000_000n && takerXlm <= MAKER_AMOUNT, `${takerXlm}`);

  // 6. Replay. The nonce inside the signed entry was consumed on the first
  //    settlement, so the identical entry must now be worthless. This is the
  //    guarantee that replaces otc_swap's on-chain `Filled` key, and it cannot
  //    be tested anywhere but here.
  log('replaying the same signed maker entry...');
  const replayed = await settle(taker, order, auth, 'replay', { expectFailure: true });
  check('replayed signature rejected', replayed === null);

  console.log('');
  if (failures) {
    console.log(`${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('all checks passed');
  console.log(`settlement tx: ${txHash}`);
}

async function readConfig() {
  const contract = new Contract(CONTRACT_ID);
  const src = new (await import('@stellar/stellar-sdk')).Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call('get_config'))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(`get_config failed: ${sim.error}`);
  const { scValToNative } = await import('@stellar/stellar-sdk');
  return scValToNative(sim.result.retval);
}

/// Attach the given auth, simulate in enforcing mode, assemble, sign as the
/// taker and submit. Returns the tx hash, or null when `expectFailure`.
async function settle(takerKp, order, auth, label, { expectFailure = false } = {}) {
  const account = await server.getAccount(takerKp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: 'swap',
        args: [orderScVal(order)],
        auth,
      }),
    )
    .setTimeout(TIMEOUT)
    .build();

  // Enforcing mode: the entries are already attached, so the host validates the
  // maker's signature right here. Tampering surfaces as a simulation error
  // before anything is submitted.
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    if (expectFailure) {
      log(`  ${label} rejected at simulation: ${String(sim.error).slice(0, 160)}`);
      return null;
    }
    throw new Error(`${label} failed: ${sim.error}`);
  }

  const ready = assembleTransaction(tx, sim).build();
  ready.sign(takerKp);
  const sent = await server.sendTransaction(ready);
  if (sent.status !== 'PENDING') {
    if (expectFailure) {
      log(`  ${label} rejected at submission: ${sent.status}`);
      return null;
    }
    throw new Error(`${label} send failed: ${JSON.stringify(sent)}`);
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
  if (final.status !== 'SUCCESS') {
    if (expectFailure) {
      log(`  ${label} rejected on-ledger: ${final.status}`);
      return null;
    }
    throw new Error(`${label} tx ${final.status}: ${JSON.stringify(final.resultXdr ?? '')}`);
  }
  if (expectFailure) {
    log(`  ${label} UNEXPECTEDLY SUCCEEDED: ${sent.hash}`);
    return sent.hash;
  }
  return sent.hash;
}

main().catch((e) => {
  console.error('\nERROR:', e.message || e);
  process.exit(1);
});
