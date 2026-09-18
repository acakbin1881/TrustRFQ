// rfq-registry-live.mjs: TESTNET-ONLY live proof of the complete rfq_registry
// stake/discovery model (full entry-point surface: Plans 01-01 through 01-03).
//
// This script exists to answer what unit tests structurally cannot: does the
// full register -> discover-by-token -> TTL-bump-on-write -> eject cycle move
// exact native-XLM balance deltas against the real host, including the
// `eject` refund leg where the contract itself (not a G-account) is the
// `from` of the SAC transfer (RESEARCH.md Assumption A1). Mocked auth in
// contracts/rfq_registry/src/test.rs bypasses the host's real storage-rent
// and signature machinery entirely, so it can prove argument binding and the
// arithmetic but never a live SAC balance, a live TTL read, or a live RPC
// simulation resource cost. Those are proven here.
//
// D-12, in full this time -- and a corrected finding, not the one this file's
// own first draft assumed. Testnet's own `STATE_ARCHIVAL` config floors a
// freshly-written persistent entry's `liveUntilLedgerSeq` at the network's
// `minPersistentTTL` (120_960 ledgers, confirmed live in Plan 01-01) --
// already above this contract's `PERSISTENT_TTL_THRESHOLD` (17_280). Because
// that floor is set ONCE at entry creation and is not recomputed from the
// current ledger on every later write, a SECOND write (e.g. `add_tokens`
// immediately after `set_url`) leaves `liveUntilLedgerSeq` EXACTLY unchanged:
// `bump_maker`'s `extend_ttl(threshold, extend_to)` call only actually moves
// the value once the entry's remaining TTL has decayed below `threshold`
// (17_280 ledgers, ~24h at Testnet's ~5s ledger close), and getting there
// from a fresh 120_960-ledger floor needs ~103_680 ledgers (~144h) to elapse
// -- not achievable inside one script run. This was verified empirically
// this session (two writes ~2 ledgers apart: `liveUntilLedgerSeq` identical
// both times) after this file's first draft asserted a strict increase and
// failed. The corrected live assertion below proves what IS observable live:
// a write on an already-current entry is a correct no-op (unchanged, never
// decreased) and the entry stays safely above the archival threshold. The
// `extend_to` branch actually firing is Plan 01-03's unit-test proof
// (`ttl_bumps_on_maker_write_after_ledger_advance`, using
// `env.ledger().with_mut()` to fast-forward past the threshold), which
// remains the sole owner of that half of REG-02 -- exactly as that plan's own
// SUMMARY already flagged live Testnet could not do it.
//
// The TTL key (RESEARCH.md Assumption A3, now resolved): rather than
// hand-encoding `DataKey::Maker(Address)`'s XDR, the maker's persistent
// ledger key is pulled straight out of a `get_maker` simulation's own
// Soroban resource footprint (`transactionData.build().resources()
// .footprint().readOnly()`), then fed to `getLedgerEntries`. Confirmed
// working live this session (footprint route). `makerKeyScVal` + `Durability`
// stay in the file as the documented fallback the plan calls for, used only
// if the footprint ever fails to expose the key.
//
// It creates its own throwaway maker actors via Friendbot, so it depends on
// no gitignored key file and can be re-run from scratch at any time.
//
//   RFQ_REGISTRY_ID=C... node tools/rfq-registry-live.mjs
//
// Exits non-zero on any failed assertion.

import {
  Keypair, Networks, Contract, Address, TransactionBuilder, Account, rpc, Horizon, xdr, Asset,
} from '@stellar/stellar-sdk';

const { Server, Api, assembleTransaction, Durability } = rpc;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const FEE = '2000000';
const TIMEOUT = 120;

const RFQ_REGISTRY_ID =
  process.env.RFQ_REGISTRY_ID || 'CBEFE7JY3PT5XF6CT3BMWF5RGPNUBGHKWPUDD3KLFZBLXFE3RPIDRLL3';

// Must match the deployed instance's D-01/D-02 deploy parameters.
const BASE_COST = 1_000_000_000n; // 100 XLM
const PER_TOKEN_COST = 100_000_000n; // 10 XLM

// Two real Testnet token addresses for the token-discovery leg: the native
// XLM SAC, and the demo USDC SAC this repo already mints against (see
// CLAUDE.md Status / tools/mint-usdc.mjs). Neither needs a trustline or
// balance here -- add_tokens only stores the Address, it never calls a
// function on the listed token contract.
const NATIVE_SAC = Asset.native().contractId(NETWORK);
const USDC_SAC = new Asset('USDC', 'GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26').contractId(NETWORK);

// Read-cost measurement leg: how many throwaway makers to pile onto one
// shared token before logging get_urls_for_token's simulated resource usage.
const READ_COST_PROBE_MAKERS = 5;

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
/// `get_config`, `get_urls_for_token`, or the native SAC's `balance`) needs no
/// funded account. Also returns the raw simulation so callers that need the
/// resource footprint (the TTL read) or resource usage (the read-cost
/// measurement) can inspect it.
async function simulateRead(contract, fnName, scValArgs) {
  const src = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call(fnName, ...scValArgs))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) return { error: sim.error, sim };
  const { scValToNative } = await import('@stellar/stellar-sdk');
  return { value: scValToNative(sim.result.retval), sim };
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
  _nativeSac = new Contract(NATIVE_SAC);
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
/// Confirmed by reading a live entry against the deployed instance in Plan
/// 01-01 (RESEARCH.md Assumption A3 -- no longer an assumption). Kept as the
/// documented FALLBACK for `makerLiveUntil` below; the footprint route is
/// preferred and used first.
function makerKeyScVal(maker) {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Maker'), new Address(maker).toScVal()]);
}

/// Assumption A3, resolved: pull the `Maker(Address)` persistent ledger key
/// straight out of a `get_maker` simulation's own resource footprint, rather
/// than hand-encoding the enum-variant XDR. The footprint for a `get_maker`
/// call contains exactly the entry's own persistent `Maker(Address)` key plus
/// the contract's instance-singleton key and its wasm code key; filtering out
/// the instance-singleton and code entries leaves the one we want.
async function makerFootprintKey(maker) {
  const gm = await simulateRead(registry, 'get_maker', [new Address(maker).toScVal()]);
  if (gm.error) return null;
  const readOnly = gm.sim.transactionData.build().resources().footprint().readOnly();
  return (
    readOnly.find(
      (k) =>
        k.switch().name === 'contractData' &&
        k.contractData().durability().name === 'persistent' &&
        k.contractData().key().switch().name !== 'scvLedgerKeyContractInstance',
    ) ?? null
  );
}

/// D-12: read `liveUntilLedgerSeq` for the maker's persistent entry. Returns
/// `{ value, route }` so the caller (and the SUMMARY) can record which route
/// actually worked this run.
async function makerLiveUntil(maker) {
  const key = await makerFootprintKey(maker);
  if (key) {
    const res = await server.getLedgerEntries(key);
    if (res.entries.length) {
      return { value: res.entries[0].liveUntilLedgerSeq, route: 'footprint' };
    }
  }
  const entry = await server.getContractData(RFQ_REGISTRY_ID, makerKeyScVal(maker), Durability.Persistent);
  return { value: entry.liveUntilLedgerSeq, route: 'getContractData (fallback)' };
}

// --- the run ------------------------------------------------------------

async function main() {
  log(`registry ${RFQ_REGISTRY_ID}`);
  log(`native SAC ${NATIVE_SAC}`);
  log(`usdc SAC   ${USDC_SAC}`);

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

  // 2. D-12 (part 1): on the very write that creates a persistent entry,
  // Testnet's own STATE_ARCHIVAL config floors its `liveUntilLedgerSeq` at
  // the network's `minPersistentTTL` (120_960 ledgers this session),
  // regardless of the contract's own `extend_ttl(threshold, extend_to)`
  // request -- this contract's `PERSISTENT_TTL_THRESHOLD` (17_280) is already
  // smaller than that floor, so `bump_maker`'s call is a correct, harmless
  // no-op on creation. What this DOES prove live: the entry survives with
  // real, host-enforced, rent-bearing TTL rather than an ad hoc or zero
  // lifetime.
  const MIN_PERSISTENT_TTL = 120_960;
  const seqAtRegister = (await server.getLatestLedger()).sequence;
  const ttlAtRegister = await makerLiveUntil(maker.publicKey());
  const ttlDeltaAtRegister = ttlAtRegister.value - seqAtRegister;
  log(`TTL read route: ${ttlAtRegister.route}`);
  check(
    'fresh write persists the entry at the network-floor TTL (D-12 part 1)',
    ttlDeltaAtRegister >= MIN_PERSISTENT_TTL - 10 && ttlDeltaAtRegister <= MIN_PERSISTENT_TTL + 10,
    `liveUntil=${ttlAtRegister.value} currentSeq=${seqAtRegister} delta=${ttlDeltaAtRegister} (expected ~${MIN_PERSISTENT_TTL})`,
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

  // 5. add_tokens: two real Testnet token addresses in one call. The second
  // arg is a Vec<Address>, so it must be an explicit ScVec -- a bare JS array
  // is not auto-converted by contract.call.
  const r3 = await invoke(maker, 'add_tokens', [
    new Address(maker.publicKey()).toScVal(),
    xdr.ScVal.scvVec([new Address(NATIVE_SAC).toScVal(), new Address(USDC_SAC).toScVal()]),
  ]);
  if (!r3.hash) throw new Error('add_tokens failed');
  totalFees += r3.feeCharged;
  log(`add_tokens tx ${r3.hash}`);

  const contractAfterAddTokens = await contractXlmBalance(RFQ_REGISTRY_ID);
  const twoTokenCost = PER_TOKEN_COST * 2n;
  check(
    'contract XLM rose by exactly 2 * per_token_cost',
    contractAfterAddTokens - contractAfterUpdate === twoTokenCost,
    `${contractAfterAddTokens - contractAfterUpdate} vs ${twoTokenCost}`,
  );

  // 6. D-12 (part 2): a second write, made while the entry's remaining TTL
  // still exceeds PERSISTENT_TTL_THRESHOLD, is a correct no-op -- see the
  // header comment for why "strictly increases" is not achievable live
  // inside one script run (that branch is Plan 01-03's unit-test proof).
  // What IS provable live: `liveUntilLedgerSeq` is unchanged (never
  // decreased -- the write did not corrupt or shorten the entry's rent) and
  // the entry remains comfortably above the archival threshold.
  const seqAtAddTokens = (await server.getLatestLedger()).sequence;
  const ttlAtAddTokens = await makerLiveUntil(maker.publicKey());
  const remainingAtAddTokens = ttlAtAddTokens.value - seqAtAddTokens;
  const PERSISTENT_TTL_THRESHOLD = 17_280;
  check(
    'a write while remaining TTL exceeds the threshold is a correct no-op: liveUntilLedgerSeq unchanged (D-12 part 2)',
    ttlAtAddTokens.value === ttlAtRegister.value,
    `before=${ttlAtRegister.value} after=${ttlAtAddTokens.value}`,
  );
  check(
    'the entry stays well above the archival threshold after the second write',
    remainingAtAddTokens > PERSISTENT_TTL_THRESHOLD,
    `remaining=${remainingAtAddTokens} threshold=${PERSISTENT_TTL_THRESHOLD}`,
  );

  // 7. get_urls_for_token: the maker is discoverable under both tokens.
  const urlsNativeBefore = await simulateRead(registry, 'get_urls_for_token', [new Address(NATIVE_SAC).toScVal()]);
  const urlsUsdcBefore = await simulateRead(registry, 'get_urls_for_token', [new Address(USDC_SAC).toScVal()]);
  check('native-token discovery list contains the maker\'s url',
    Array.isArray(urlsNativeBefore.value) && urlsNativeBefore.value.includes('https://maker.trustrfq-demo.example/live-check-v2'),
    JSON.stringify(urlsNativeBefore.value));
  check('usdc-token discovery list contains the maker\'s url',
    Array.isArray(urlsUsdcBefore.value) && urlsUsdcBefore.value.includes('https://maker.trustrfq-demo.example/live-check-v2'),
    JSON.stringify(urlsUsdcBefore.value));

  // 8. get_maker: reflects both tokens and the combined stake.
  const gm3 = await simulateRead(registry, 'get_maker', [new Address(maker.publicKey()).toScVal()]);
  const expectedStaked = BASE_COST + twoTokenCost;
  check('get_maker reports staked == base_cost + 2 * per_token_cost',
    BigInt(gm3.value.staked) === expectedStaked, `${gm3.value.staked} vs ${expectedStaked}`);
  check('get_maker reports two tokens', Array.isArray(gm3.value.tokens) && gm3.value.tokens.length === 2,
    gm3.value.tokens?.length);

  // 9. eject: full refund, entry removed, and the maker is delisted from
  // every token it was on.
  const r4 = await invoke(maker, 'eject', [new Address(maker.publicKey()).toScVal()]);
  if (!r4.hash) throw new Error('eject failed');
  totalFees += r4.feeCharged;
  log(`eject tx ${r4.hash}`);

  const contractAfterEject = await contractXlmBalance(RFQ_REGISTRY_ID);
  check('contract XLM returned to exactly its pre-registration value',
    contractAfterEject === contractBefore, `${contractAfterEject} vs ${contractBefore}`);

  const makerAfterEject = await balances(maker.publicKey());
  check('maker net XLM loss is exactly the sum of feeCharged (full stake refunded)',
    makerBefore.XLM - makerAfterEject.XLM === totalFees,
    `${makerBefore.XLM - makerAfterEject.XLM} vs total fees ${totalFees}`);

  // 10. get_maker again: must error, not return a stale config.
  const gm4 = await simulateRead(registry, 'get_maker', [new Address(maker.publicKey()).toScVal()]);
  check('get_maker errors after eject rather than returning a config', !!gm4.error,
    gm4.error ? String(gm4.error).slice(0, 80) : 'returned a value');

  // 11. get_urls_for_token again: the maker's url is gone from both lists.
  const urlsNativeAfter = await simulateRead(registry, 'get_urls_for_token', [new Address(NATIVE_SAC).toScVal()]);
  const urlsUsdcAfter = await simulateRead(registry, 'get_urls_for_token', [new Address(USDC_SAC).toScVal()]);
  check('native-token discovery list no longer contains the maker\'s url',
    Array.isArray(urlsNativeAfter.value) && !urlsNativeAfter.value.includes('https://maker.trustrfq-demo.example/live-check-v2'),
    JSON.stringify(urlsNativeAfter.value));
  check('usdc-token discovery list no longer contains the maker\'s url',
    Array.isArray(urlsUsdcAfter.value) && !urlsUsdcAfter.value.includes('https://maker.trustrfq-demo.example/live-check-v2'),
    JSON.stringify(urlsUsdcAfter.value));

  console.log('');
  console.log('=== register -> discover -> TTL bump -> eject: complete ===');
  console.log(`register tx:   ${r1.hash}`);
  console.log(`update tx:     ${r2.hash}`);
  console.log(`add_tokens tx: ${r3.hash}`);
  console.log(`eject tx:      ${r4.hash}`);

  // 12. Flagged-assumption measurement: the get_urls_for_token read ceiling.
  // Registers READ_COST_PROBE_MAKERS throwaway makers on the (now-empty)
  // native-token list, then logs the simulated resource usage of resolving
  // that list. Not asserted against a threshold -- logged for the SUMMARY's
  // extrapolation to max_makers_per_token = 100, and cleaned up afterward.
  console.log('');
  console.log(`=== read-cost probe: ${READ_COST_PROBE_MAKERS} makers on one shared token ===`);

  const probeMakers = [];
  for (let i = 0; i < READ_COST_PROBE_MAKERS; i++) {
    const pm = Keypair.random();
    probeMakers.push(pm);
    await friendbot(pm.publicKey());
    const purl = nativeToScVal(`https://probe-${i}.trustrfq-demo.example/`, { type: 'string' });
    const rReg = await invoke(pm, 'set_url', [new Address(pm.publicKey()).toScVal(), purl]);
    if (!rReg.hash) throw new Error(`probe maker ${i} set_url failed`);
    const rTok = await invoke(pm, 'add_tokens', [
      new Address(pm.publicKey()).toScVal(),
      xdr.ScVal.scvVec([new Address(NATIVE_SAC).toScVal()]),
    ]);
    if (!rTok.hash) throw new Error(`probe maker ${i} add_tokens failed`);
    log(`probe maker ${i} registered and added to the shared token`);
  }

  const probeRead = await simulateRead(registry, 'get_urls_for_token', [new Address(NATIVE_SAC).toScVal()]);
  if (probeRead.error) throw new Error(`probe get_urls_for_token failed: ${probeRead.error}`);
  check(`get_urls_for_token resolves all ${READ_COST_PROBE_MAKERS} probe makers`,
    Array.isArray(probeRead.value) && probeRead.value.length === READ_COST_PROBE_MAKERS,
    probeRead.value?.length);

  const resources = probeRead.sim.transactionData.build().resources();
  const instructions = resources.instructions();
  const diskReadBytes = resources.diskReadBytes();
  const minResourceFee = probeRead.sim.minResourceFee;
  console.log(`  at ${READ_COST_PROBE_MAKERS} makers: instructions=${instructions} diskReadBytes=${diskReadBytes} minResourceFee=${minResourceFee}`);
  console.log(`  per-maker average: instructions=${Math.round(Number(instructions) / READ_COST_PROBE_MAKERS)} diskReadBytes=${Math.round(Number(diskReadBytes) / READ_COST_PROBE_MAKERS)}`);
  console.log('  (extrapolation to max_makers_per_token = 100 recorded in the plan SUMMARY)');

  // Clean up: eject every probe maker so the deployment is left clean.
  for (let i = 0; i < probeMakers.length; i++) {
    const pm = probeMakers[i];
    const rEj = await invoke(pm, 'eject', [new Address(pm.publicKey()).toScVal()]);
    if (!rEj.hash) throw new Error(`probe maker ${i} eject failed`);
    log(`probe maker ${i} ejected`);
  }

  const contractAfterProbeCleanup = await contractXlmBalance(RFQ_REGISTRY_ID);
  check('contract XLM back to its pre-probe value after cleanup',
    contractAfterProbeCleanup === contractAfterEject,
    `${contractAfterProbeCleanup} vs ${contractAfterEject}`);

  console.log('');
  if (failures) {
    console.log(`${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('all checks passed');
}

main().catch((e) => {
  console.error('\nERROR:', e.message || e);
  process.exit(1);
});
