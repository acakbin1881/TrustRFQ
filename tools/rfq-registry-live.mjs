// rfq-registry-live.mjs: TESTNET-ONLY live proof of the rfq_registry stake/
// discovery model.
//
// This script exists to answer what unit tests structurally cannot: does the
// register -> discover -> eject cycle move exact native-XLM balance deltas
// against the real host, including the `eject` refund leg where the contract
// itself (not a G-account) is the `from` of the SAC transfer (RESEARCH.md
// Assumption A1). Mocked auth in contracts/rfq_registry/src/test.rs bypasses
// the host's real storage-rent and signature machinery entirely, so it can
// prove argument binding and the arithmetic but never a live SAC balance.
// That is proven here.
//
// NOT covered here: a live TTL-bump-on-write proof (D-12). Testnet's
// `minPersistentTTL` config (120_960 ledgers, read via a STATE_ARCHIVAL
// ConfigSetting ledger entry this session) already exceeds this contract's
// `PERSISTENT_TTL_THRESHOLD` (17_280) on every fresh write, so `bump_maker`'s
// `extend_ttl` call is a correct no-op immediately after creation -- it only
// fires once an entry's remaining TTL has actually decayed near the
// threshold, which live Testnet cannot be made to do inside one script run.
// See the plan SUMMARY for the full finding; this is not a contract bug and
// matches `rfq_swap`'s existing `bump_instance` (same threshold constant).
//
// It creates its own throwaway maker actor via Friendbot, so it depends on no
// gitignored key file and can be re-run from scratch at any time.
//
//   RFQ_REGISTRY_ID=C... node tools/rfq-registry-live.mjs
//
// Exits non-zero on any failed assertion.

import {
  Keypair, Networks, Contract, Address, TransactionBuilder, Account, rpc, Horizon, xdr,
} from '@stellar/stellar-sdk';

const { Server, Api, assembleTransaction, Durability } = rpc;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const FEE = '2000000';
const TIMEOUT = 120;

const RFQ_REGISTRY_ID =
  process.env.RFQ_REGISTRY_ID || 'CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6';

// Must match the deployed instance's D-01 deploy parameters.
const BASE_COST = 1_000_000_000n; // 100 XLM
const PER_TOKEN_COST = 100_000_000n; // 10 XLM

const server = new Server(RPC_URL);
const horizon = new Horizon.Server(HORIZON_URL);
const registry = new Contract(RFQ_REGISTRY_ID);
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

// --- plumbing ---------------------------------------------------------------

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

/// Build, simulate, assemble, sign and submit a Soroban transaction whose auth
/// the simulation is allowed to fill in (every call in this script is a plain
/// G-account source-account call, so recording-mode auth suffices).
async function invoke(kp, fnName, args, { expectFailure = false } = {}) {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(registry.call(fnName, ...args))
    .setTimeout(TIMEOUT)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    if (expectFailure) {
      log(`  ${fnName} rejected at simulation: ${String(sim.error).slice(0, 160)}`);
      return { hash: null, feeCharged: 0n, result: null };
    }
    throw new Error(`${fnName} failed: ${sim.error}`);
  }

  const ready = assembleTransaction(tx, sim).build();
  ready.sign(kp);
  const sent = await server.sendTransaction(ready);
  if (sent.status !== 'PENDING') {
    if (expectFailure) return { hash: null, feeCharged: 0n, result: null };
    throw new Error(`${fnName} send failed: ${JSON.stringify(sent)}`);
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
  if (final.status !== 'SUCCESS') {
    if (expectFailure) return { hash: null, feeCharged: 0n, result: null };
    throw new Error(`${fnName} tx ${final.status}: ${JSON.stringify(final.resultXdr ?? '')}`);
  }
  const { scValToNative } = await import('@stellar/stellar-sdk');
  const retval = final.returnValue ? scValToNative(final.returnValue) : undefined;
  const feeCharged = BigInt(final.resultXdr?.feeCharged?.() ?? sim.minResourceFee ?? 0);
  return { hash: sent.hash, feeCharged, result: retval };
}

/// Zero-balance-source-account trick: any read-only simulation (`get_maker`,
/// `get_config`, or the native SAC's `balance`) needs no funded account.
async function simulateRead(contract, fnName, scValArgs) {
  const src = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call(fnName, ...scValArgs))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) return { error: sim.error };
  const { scValToNative } = await import('@stellar/stellar-sdk');
  return { value: scValToNative(sim.result.retval) };
}

async function balances(pub) {
  const acct = await horizon.loadAccount(pub);
  const out = { XLM: 0n };
  for (const b of acct.balances) {
    if (b.asset_type === 'native') out.XLM = BigInt(Math.round(parseFloat(b.balance) * 1e7));
  }
  return out;
}

let _nativeSac;
async function nativeSacContract() {
  if (_nativeSac) return _nativeSac;
  const { Asset } = await import('@stellar/stellar-sdk');
  _nativeSac = new Contract(Asset.native().contractId(NETWORK));
  return _nativeSac;
}

/// Read the contract's own native-XLM SAC balance. The contract has no
/// Horizon account, so its balance is read via a fee-free `balance` call on
/// the native SAC rather than `balances()` above (which is Horizon-only).
async function contractXlmBalance(contractAddr) {
  const nativeSac = await nativeSacContract();
  const r = await simulateRead(nativeSac, 'balance', [new Address(contractAddr).toScVal()]);
  if (r.error) throw new Error(`native SAC balance read failed: ${r.error}`);
  return BigInt(r.value);
}

/// The exact XDR a `soroban_sdk` single-value enum variant (`DataKey::Maker
/// (Address)`) encodes to: an ScVec of [Symbol(variant name), the value].
/// Confirmed by reading a live entry against the deployed instance this
/// session (RESEARCH.md Assumption A3 -- no longer an assumption).
function makerKeyScVal(maker) {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Maker'), new Address(maker).toScVal()]);
}

/// D-12: read `liveUntilLedgerSeq` for the maker's persistent entry.
async function makerLiveUntil(maker) {
  const entry = await server.getContractData(RFQ_REGISTRY_ID, makerKeyScVal(maker), Durability.Persistent);
  return entry.liveUntilLedgerSeq;
}

// --- the run ------------------------------------------------------------

async function main() {
  log(`registry ${RFQ_REGISTRY_ID}`);

  const cfg = await simulateRead(registry, 'get_config', []);
  if (cfg.error) throw new Error(`get_config failed: ${cfg.error}`);
  const { base_cost, per_token_cost } = cfg.value;
  if (BigInt(base_cost) !== BASE_COST || BigInt(per_token_cost) !== PER_TOKEN_COST) {
    throw new Error(
      `deployed instance has base_cost=${base_cost} per_token_cost=${per_token_cost}, ` +
      `script expects ${BASE_COST}/${PER_TOKEN_COST} -- wrong RFQ_REGISTRY_ID?`
    );
  }
  log(`config OK: base_cost=${base_cost} per_token_cost=${per_token_cost}`);

  const maker = Keypair.random();
  log(`maker ${maker.publicKey()}`);
  log('funding maker via friendbot...');
  await friendbot(maker.publicKey());

  const makerBefore = await balances(maker.publicKey());
  const contractBefore = await contractXlmBalance(RFQ_REGISTRY_ID);
  log(`maker XLM before: ${makerBefore.XLM}, contract XLM before: ${contractBefore}`);

  let totalFees = 0n;
  const { nativeToScVal } = await import('@stellar/stellar-sdk');

  // 1. First set_url: stakes base_cost, creates MakerConfig.
  const urlScVal1 = nativeToScVal('https://maker.trustrfq-demo.example/live-check', { type: 'string' });
  const r1 = await invoke(maker, 'set_url', [new Address(maker.publicKey()).toScVal(), urlScVal1]);
  if (!r1.hash) throw new Error('set_url (register) failed');
  totalFees += r1.feeCharged;
  log(`set_url (register) tx ${r1.hash}`);

  const contractAfterRegister = await contractXlmBalance(RFQ_REGISTRY_ID);
  check(
    'contract XLM rose by exactly base_cost',
    contractAfterRegister - contractBefore === BASE_COST,
    `${contractAfterRegister - contractBefore} vs ${BASE_COST}`,
  );

  const makerAfterRegister = await balances(maker.publicKey());
  check(
    'maker XLM fell by base_cost + fees so far',
    makerBefore.XLM - makerAfterRegister.XLM === BASE_COST + totalFees,
    `${makerBefore.XLM - makerAfterRegister.XLM} vs ${BASE_COST + totalFees}`,
  );

  // 2. D-12: on the very write that creates a persistent entry, Testnet's own
  // STATE_ARCHIVAL config floors its `liveUntilLedgerSeq` at the network's
  // `minPersistentTTL` (120_960 ledgers this session), regardless of the
  // contract's own `extend_ttl(threshold, extend_to)` request. This contract's
  // `PERSISTENT_TTL_THRESHOLD` (17_280) is already smaller than that floor, so
  // `bump_maker`'s call is a correct, harmless no-op on creation -- there is
  // no "remaining TTL below threshold" to act on. What this DOES prove live:
  // the entry survives with real, host-enforced, rent-bearing TTL rather than
  // an ad hoc or zero lifetime, i.e. `bump_maker` executed without erroring
  // and the entry is genuinely persistent storage. Proving `extend_to` actually
  // firing (the >17_280-remaining-TTL branch) requires an entry that has
  // decayed near the threshold first, which live Testnet cannot be made to do
  // inside one script run -- see the file header note and the plan SUMMARY.
  const MIN_PERSISTENT_TTL = 120_960;
  const seqAtRegister = (await server.getLatestLedger()).sequence;
  const liveUntilAtRegister = await makerLiveUntil(maker.publicKey());
  const ttlDelta = liveUntilAtRegister - seqAtRegister;
  check(
    'fresh write persists the entry at the network-floor TTL (D-12)',
    ttlDelta >= MIN_PERSISTENT_TTL - 10 && ttlDelta <= MIN_PERSISTENT_TTL + 10,
    `liveUntil=${liveUntilAtRegister} currentSeq=${seqAtRegister} delta=${ttlDelta} (expected ~${MIN_PERSISTENT_TTL})`,
  );

  // 3. get_maker: read back exactly what was sent.
  const gm1 = await simulateRead(registry, 'get_maker', [new Address(maker.publicKey()).toScVal()]);
  if (gm1.error) throw new Error(`get_maker failed after registration: ${gm1.error}`);
  check('get_maker returns the url that was sent',
    gm1.value.url === 'https://maker.trustrfq-demo.example/live-check', gm1.value.url);
  check('get_maker reports staked == base_cost', BigInt(gm1.value.staked) === BASE_COST, gm1.value.staked);
  check('get_maker reports empty tokens', Array.isArray(gm1.value.tokens) && gm1.value.tokens.length === 0);
  check('get_maker reports empty protocols', Array.isArray(gm1.value.protocols) && gm1.value.protocols.length === 0);

  // 4. Second set_url: D-06, in-place update, zero additional stake.
  const urlScVal2 = nativeToScVal('https://maker.trustrfq-demo.example/live-check-v2', { type: 'string' });
  const r2 = await invoke(maker, 'set_url', [new Address(maker.publicKey()).toScVal(), urlScVal2]);
  if (!r2.hash) throw new Error('set_url (update) failed');
  totalFees += r2.feeCharged;
  log(`set_url (update) tx ${r2.hash}`);

  const contractAfterUpdate = await contractXlmBalance(RFQ_REGISTRY_ID);
  check('contract XLM unchanged on url update (D-06)', contractAfterUpdate === contractAfterRegister,
    `${contractAfterUpdate} vs ${contractAfterRegister}`);

  const gm2 = await simulateRead(registry, 'get_maker', [new Address(maker.publicKey()).toScVal()]);
  check('get_maker now returns the updated url',
    gm2.value.url === 'https://maker.trustrfq-demo.example/live-check-v2', gm2.value.url);

  // 5. eject: full refund, entry removed.
  const r3 = await invoke(maker, 'eject', [new Address(maker.publicKey()).toScVal()]);
  if (!r3.hash) throw new Error('eject failed');
  totalFees += r3.feeCharged;
  log(`eject tx ${r3.hash}`);

  const contractAfterEject = await contractXlmBalance(RFQ_REGISTRY_ID);
  check('contract XLM returned to exactly its pre-registration value',
    contractAfterEject === contractBefore, `${contractAfterEject} vs ${contractBefore}`);

  const makerAfterEject = await balances(maker.publicKey());
  check('maker net XLM loss is exactly the sum of feeCharged (full stake refunded)',
    makerBefore.XLM - makerAfterEject.XLM === totalFees,
    `${makerBefore.XLM - makerAfterEject.XLM} vs total fees ${totalFees}`);

  // 6. get_maker again: must error, not return a stale config.
  const gm3 = await simulateRead(registry, 'get_maker', [new Address(maker.publicKey()).toScVal()]);
  check('get_maker errors after eject rather than returning a config', !!gm3.error,
    gm3.error ? String(gm3.error).slice(0, 80) : 'returned a value');

  console.log('');
  if (failures) {
    console.log(`${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('all checks passed');
  console.log(`register tx: ${r1.hash}`);
  console.log(`update tx:   ${r2.hash}`);
  console.log(`eject tx:    ${r3.hash}`);
}

main().catch((e) => {
  console.error('\nERROR:', e.message || e);
  process.exit(1);
});
