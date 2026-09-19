// stub-maker.mjs: a FAITHFUL local Stellar RFQ v1 maker quote server (D-12),
// standing in for the separate-repo maker server this milestone depends on
// (Phase 3). It produces its `authEntry` exactly the way a real maker server
// must: build the would-be `swap` transaction with a throwaway source,
// `simulateTransaction` in RECORDING mode, take the maker's entry out of
// `sim.result.auth`, and sign it with `authorizeEntry` — the same sequence
// `tools/rfq-live-swap.mjs` already proved live on Testnet. No shortcuts: a
// hand-assembled entry here would let this harness pass while a real maker
// server's structurally different entry fails the taker's validation
// (RESEARCH.md Assumption A2).
//
// D-10: registers itself on the LIVE Testnet registry with a real stake
// (`set_url` + `add_tokens`) on startup, and `eject`s for a full refund on
// shutdown — so the desk finds it through the normal registry read path with
// ZERO test-only code in `src/`.
//
// Fresh Keypair.random() + Friendbot per run (D-10, matches
// tools/rfq-registry-live.mjs / tools/rfq-live-swap.mjs) — no gitignored key
// file for the maker's OWN signing key. It reuses the repo's existing demo
// USDC issuer (the same one src/core/tokens.ts's TOKENS allow-list points
// at) so it can actually hold and sell USDC — see CLAUDE.md Status for the
// "temporary, demo only" note on that issuer.
//
//   STUB_MAKER_PORT=4174 node tools/e2e/stub-maker.mjs
//
// Prints "STUB_MAKER_READY url=... pubkey=..." to stdout once registered and
// serving. SIGINT/SIGTERM triggers eject then exit.
//
// CAPTURE_AUTH_TREE=1 (Task 2 only): on the FIRST quote signed, writes
// fixtures/rfq-auth-tree.json with the real decoded invocation tree — the
// empirical answer to RESEARCH.md Assumption A1.
//
// D-12 failure knobs (02-02-PLAN.md Task 3): the driver selects a
// per-request mode via the `x-e2e-mode` header, so one running server
// instance serves every mode in a single pass. Exactly five, no more: SLOW,
// MALFORMED, REFUSE, DRIFTED, WRONG_FEE (see handleModedRequest below).
// DRIFTED and WRONG_FEE are still REALLY SIGNED — a fabricated entry would
// let the taker's decoder reject them for the wrong reason
// (undecodable_entry) and prove nothing about TAKER-03's actual comparisons.
//
// 02-03-PLAN.md Task 3 addition, same mode-header mechanism: SHORT_TTL (a
// genuinely signed quote with a much shorter business-layer expiry, proving
// D-05's expiry-drop path). STUB_MAKER_RATE overrides the fixed demo rate
// so a second instance can quote a genuinely different price for
// MULTI_QUOTE. ZERO_MAKERS does NOT use a maker-side knob at all — see
// tools/e2e/rfq-driver.mjs's header comment for why (a permanently
// unremovable stray registry entry makes a true on-chain zero unreachable
// for this pair; ZERO_MAKERS instead patches the registry's own RPC read).

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  Account, Address, Asset, Contract, Keypair, Networks, Operation,
  TransactionBuilder, authorizeEntry, buildInvocationTree, nativeToScVal,
  rpc, Horizon, xdr,
} from '@stellar/stellar-sdk';
import { REPO_ROOT } from './lib.mjs';

const { Server, Api } = rpc;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const FEE = '2000000';
const TIMEOUT = 120;

const PORT = Number(process.env.STUB_MAKER_PORT || 4174);
const RFQ_SWAP_CONTRACT_ID = process.env.RFQ_SWAP_CONTRACT_ID || 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';
const RFQ_REGISTRY_ID = process.env.RFQ_REGISTRY_ID || 'CBEFE7JY3PT5XF6CT3BMWF5RGPNUBGHKWPUDD3KLFZBLXFE3RPIDRLL3';
const CAPTURE_AUTH_TREE = !!process.env.CAPTURE_AUTH_TREE;
const CAPTURE_PATH = path.join(REPO_ROOT, 'fixtures', 'rfq-auth-tree.json');

// Fixed demo rate: 2 USDC per 1 XLM. A stub, not a market price. Overridable
// (Task 3's MULTI_QUOTE scenario spawns a second instance at a different
// rate so the driver can prove best-price-first ranking against two
// genuinely different, genuinely signed quotes.)
const RATE = BigInt(process.env.STUB_MAKER_RATE || '2');
const QUOTE_TTL_SEC = 90;
// Task 3's EXPIRY_DROP mode signs a genuinely valid quote with a much
// shorter business-layer expiry so the panel's own countdown clock (not a
// click) drops the row within the driver's wait window. 30s: the
// discovery+fan-out round trip is normally ~1-2s, but Testnet RPC latency
// was observed to spike into the tens of SECONDS deep into this driver's
// long combined run (two shorter TTLs, 6s and 12s, both arrived
// already-expired and were rejected by validateQuote's own `expired` check
// before any row ever rendered — see 02-03-SUMMARY.md). 30s trades scenario
// speed for robustness against that documented Testnet flakiness
// (CLAUDE.md/prior SUMMARYs: "transient Testnet RPC latency, not a code
// defect").
const SHORT_TTL_SEC = 30;
const MAKER_USDC_FUNDING = '1000'; // decimal, whole USDC
const TRUST_LIMIT = '100000000';

const server = new Server(RPC_URL);
const horizon = new Horizon.Server(HORIZON_URL);
const registry = new Contract(RFQ_REGISTRY_ID);
const log = (...a) => console.log(`[stub-maker ${new Date().toISOString().slice(11, 19)}]`, ...a);

const makerKp = Keypair.random();
// `localhost`, not the `127.0.0.1` dotted-quad the design doc sketches: Vite's
// preview server (and Node's plain http.createServer with no explicit host)
// bind the IPv6 loopback (::1) first on this stack, which `localhost`
// resolves to but a literal `127.0.0.1` (IPv4-only) does not reach. Same
// loopback, same D-12 guarantees — only the literal string differs.
const url = `http://localhost:${PORT}`;

// Reuse the repo's existing demo USDC issuer (src/core/tokens.ts's temporary
// allow-list entry) so the stub maker sells the SAME asset the desk knows.
const keys = JSON.parse(readFileSync(path.join(REPO_ROOT, 'demo-keys.json'), 'utf8'));
const issuerKp = Keypair.fromSecret(keys.issuer_secret);
const USDC = new Asset('USDC', issuerKp.publicKey());
const NATIVE_SAC = Asset.native().contractId(NETWORK);
const USDC_SAC = USDC.contractId(NETWORK);

let feeBps = 10;
let orderCounter = Date.now() % 1_000_000;
let capturedOnce = false;
let httpServer;
let latestLedgerSeq = 0;
let ledgerRefreshTimer;
// EXPIRED_ENTRY (Task 3): armed on the FIRST request after the mode
// transitions from something else INTO 'EXPIRED_ENTRY' — that one request
// gets the deep-past signature; every later request while the mode stays
// applied (e.g. the desk's own D-09 retry re-querying this same maker) gets
// a genuinely fresh, currently-valid entry, matching how a real maker
// server always signs fresh at issuance time.
//
// `lastRequote` (continuation-session fix): RETRY_EQUAL and RETRY_WORSE run
// back-to-back on the SAME running maker, both under the SAME base mode
// 'EXPIRED_ENTRY' (only the ':EQUAL'/':WORSE' suffix differs) — the base-
// mode-only transition check below never re-fires for RETRY_WORSE's own
// first request, because the immediately preceding request (RETRY_EQUAL's
// own successful retry re-fetch) already left `lastBaseMode` at
// 'EXPIRED_ENTRY'. Caught live in this continuation session: RETRY_WORSE's
// "doomed" quote was silently issued genuinely valid (never armed), so
// Accept settled it immediately with no failure, no retry, and no
// reconfirm note — rather than the intended doomed-then-reconfirm sequence.
// Re-arming on a REQUOTE change too (not just a base-mode change) fixes it:
// EQUAL's own two calls (doomed, then its retry) share requote 'EQUAL' and
// must NOT re-arm each other; WORSE's first call changes requote from
// 'EQUAL' to 'WORSE' and MUST re-arm.
let expiredEntryArmed = false;
let lastBaseMode = null;
let lastRequote = null;

async function refreshLedgerSeq() {
  try {
    latestLedgerSeq = (await server.getLatestLedger()).sequence;
  } catch (e) {
    log(`ledger seq refresh failed (non-fatal): ${e?.message || e}`);
  }
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

async function submitClassic(kp, ops) {
  const account = await horizon.loadAccount(kp.publicKey());
  const b = new TransactionBuilder(account, { fee: '10000', networkPassphrase: NETWORK });
  for (const op of ops) b.addOperation(op);
  const tx = b.setTimeout(TIMEOUT).build();
  tx.sign(kp);
  return horizon.submitTransaction(tx);
}

async function invokeRegistry(kp, fnName, args) {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(registry.call(fnName, ...args))
    .setTimeout(TIMEOUT)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(`${fnName} failed: ${sim.error}`);
  const ready = rpc.assembleTransaction(tx, sim).build();
  ready.sign(kp);
  const sent = await server.sendTransaction(ready);
  if (sent.status !== 'PENDING') throw new Error(`${fnName} send failed: ${JSON.stringify(sent)}`);
  const final = await server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
  if (final.status !== 'SUCCESS') throw new Error(`${fnName} tx ${final.status}: ${JSON.stringify(final.resultXdr ?? '')}`);
  return sent.hash;
}

async function readFeeBps() {
  const src = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const contract = new Contract(RFQ_SWAP_CONTRACT_ID);
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call('get_config'))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(`get_config failed: ${sim.error}`);
  const { scValToNative } = await import('@stellar/stellar-sdk');
  return scValToNative(sim.result.retval).fee_bps;
}

/** decimal string (up to 7dp) -> atomic i128, mirrors src/core/rfq/order.ts's toAtomic */
function toAtomic(s) {
  const [whole, frac = ''] = String(s).split('.');
  return BigInt(whole || '0') * 10000000n + BigInt((frac + '0000000').slice(0, 7));
}

/** atomic i128 -> decimal string, no floating point */
function atomicToDecimal(atomic) {
  const neg = atomic < 0n;
  const abs = neg ? -atomic : atomic;
  const whole = abs / 10000000n;
  const frac = (abs % 10000000n).toString().padStart(7, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? `.${frac}` : '');
}

/** the exact ScVal encoding src/core/rfq/order.ts's orderToScVal produces */
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

function toContractOrder(order) {
  return {
    maker: order.maker,
    taker: order.taker,
    maker_token: order.makerToken,
    maker_amount: toAtomic(order.makerAmount),
    taker_token: order.takerToken,
    taker_amount: toAtomic(order.takerAmount),
    expiry: BigInt(order.expiry),
    order_id: BigInt(order.orderId),
    fee_bps: order.feeBps,
  };
}

/**
 * Build the would-be swap tx with a throwaway source, RECORDING-mode sim,
 * sign. `expired` (02-04-PLAN.md Task 3, D-09) signs with a
 * signature_expiration_ledger already DEEP IN THE PAST (currentLedger minus
 * a large offset), not merely a short TTL — verified live against the
 * deployed rfq_swap (2026-09-09): the host rejects such an entry during the
 * taker's ENFORCING-mode simulate with the diagnostic text
 * "signature has expired" (HostError: Error(Auth, InvalidInput)), and this
 * happens UNCONDITIONALLY the instant it is checked. A short-but-nonzero TTL
 * would instead be racy against Testnet's ~5s ledger-close timing — exactly
 * the failure class 02-03-SUMMARY.md's SHORT_TTL history already
 * documents — so EXPIRED_ENTRY deliberately does not reuse that pattern.
 * Signing itself is a pure client-side XDR + ed25519 operation and does not
 * validate the ledger number against anything network-side, so an
 * already-past `validUntil` still produces a genuinely signed entry (never a
 * fabricated one).
 */
async function signQuote(order, { expired = false } = {}) {
  const contract = new Contract(RFQ_SWAP_CONTRACT_ID);
  const contractOrder = toContractOrder(order);
  // Throwaway: the probe's source sequence doesn't matter for the auth entry
  // the maker signs (Address-credential entries are keyed by address, not by
  // the probe tx's own envelope) — only the pubkey (the real taker) matters,
  // so `require_auth` for the taker's SourceAccount credential resolves.
  //
  // The sequence value, however, is NOT arbitrary in practice (continuation-
  // session fix): a literal constant '0' here previously fed the SAME
  // (source, sequence) pair into every RECORDING-mode probe this maker ever
  // ran, and the RPC's recording-mode auto-assigns the maker's own
  // Address-credential nonce from inputs that include that pair — caught
  // live in this continuation session as `HostError: Error(Auth,
  // ExistingValue)` / "nonce already exists for address" on a genuinely
  // FRESH quote (RETRY_WORSE's doomed entry), rejected before it could even
  // reach the failure this scenario needed, because an EARLIER quote's
  // maker entry (from this same running maker, same constant probe tuple)
  // had already been submitted and consumed that identical nonce on-chain
  // minutes earlier. `order.orderId` (a monotonic `orderCounter++`, already
  // assigned above, unique for the life of this process) makes each probe's
  // (source, sequence) pair unique too, so this class of collision cannot
  // recur — the probe's OWN sequence still never appears in the signed
  // entry itself (only the pubkey does), so this changes no on-chain
  // semantics, only which throwaway numbers two DIFFERENT probes happen to
  // share.
  const probeSource = new Account(order.taker, String(order.orderId));
  const probe = new TransactionBuilder(probeSource, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call('swap', orderScVal(contractOrder)))
    .setTimeout(TIMEOUT)
    .build();

  const sim = await server.simulateTransaction(probe); // recording mode: op carries no auth yet
  if (Api.isSimulationError(sim)) throw new Error(`recording sim failed: ${sim.error}`);

  const entries = sim.result?.auth ?? [];
  const makerIdx = entries.findIndex((e) => isAddressCredential(e, makerKp.publicKey()));
  if (makerIdx < 0) throw new Error('simulation produced no maker auth entry');

  // Cached, background-refreshed ledger sequence (see refreshLedgerSeq) rather
  // than a per-request getLatestLedger call — this is the dominant latency
  // saving that keeps quote generation comfortably under TAKER-02's 2-3s
  // client-side fetch timeout. The larger +180 buffer (vs. rfq-live-swap.mjs's
  // +60) absorbs the cache's staleness window.
  const validUntil = expired ? Math.max(1, latestLedgerSeq - 2000) : latestLedgerSeq + 180;
  const signedMaker = await authorizeEntry(entries[makerIdx], makerKp, validUntil, NETWORK);
  return { authEntry: signedMaker.toXDR('base64'), signatureExpirationLedger: validUntil, entries, makerIdx };
}

/** RE_QUOTE_PRICE (Task 3): the rate a re-quote applies RELATIVE TO the base
 *  RATE — "better"/"equal"/"worse" for the taker, one atomic-unit step so
 *  the direction is unambiguous regardless of RATE's own magnitude. Clamped
 *  at 1n so WORSE can never produce a non-positive (invalid) rate. */
function rateForRequote(requote) {
  if (requote === 'BETTER') return RATE + 1n;
  if (requote === 'WORSE') return RATE > 1n ? RATE - 1n : RATE;
  return RATE; // 'EQUAL' or unset
}

async function handleGetMakerSideOrder(params, ttlSec = QUOTE_TTL_SEC, { expired = false, rate = RATE } = {}) {
  const takerAtomic = toAtomic(params.takerAmount);
  const makerAtomic = takerAtomic * rate;
  const order = {
    maker: makerKp.publicKey(),
    taker: params.takerWallet,
    makerToken: params.makerToken,
    makerAmount: atomicToDecimal(makerAtomic),
    takerToken: params.takerToken,
    takerAmount: params.takerAmount,
    expiry: Math.floor(Date.now() / 1000) + ttlSec,
    orderId: orderCounter++,
    feeBps,
  };

  const { authEntry, signatureExpirationLedger, entries, makerIdx } = await signQuote(order, { expired });

  if (CAPTURE_AUTH_TREE && !capturedOnce) {
    capturedOnce = true;
    const tree = buildInvocationTree(entries[makerIdx].rootInvocation());
    const capture = {
      tree,
      order,
      authEntry,
      rootFunction: tree.args.function,
      rootArgCount: tree.args.args.length,
      subInvocationCount: tree.invocations.length,
    };
    // buildInvocationTree's natively-typed args include BigInt (i128/u64
    // amounts), which JSON.stringify cannot serialize on its own — stringify
    // every BigInt rather than dropping precision through Number.
    const replacer = (_key, value) => (typeof value === 'bigint' ? value.toString() : value);
    writeFileSync(CAPTURE_PATH, JSON.stringify(capture, replacer, 2));
    log(`captured auth-entry tree -> ${CAPTURE_PATH}`);
  }

  return { order, authEntry, signatureExpirationLedger, network: NETWORK, swapContract: RFQ_SWAP_CONTRACT_ID };
}

// --- HTTP JSON-RPC 2.0 server ------------------------------------------------

// A real maker server is a peer-to-peer HTTPS endpoint the taker's BROWSER
// fetches directly (no TrustRFQ-owned backend in between, per the adopted
// spec), so it must answer CORS preflights and carry an allow-origin header
// on every response — otherwise every browser taker is blocked before the
// wire protocol even runs. Wide-open '*' matches a real maker server, which
// has no way to know every taker origin in advance.
const MODE_HEADER = 'x-e2e-mode';
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': `content-type, ${MODE_HEADER}`,
};

// The desk's per-request fan-out timeout (src/data/rfqNetwork.ts's
// AbortSignal.timeout(3000)) — SLOW must delay comfortably past this so the
// taker's own drop, not a coincidence, is what removes the quote.
const FAN_OUT_TIMEOUT_MS = 3000;
const SLOW_DELAY_MS = FAN_OUT_TIMEOUT_MS + 1500;

function writeJson(res, body) {
  // SLOW replies after the client's own AbortSignal.timeout(3000) has almost
  // certainly already fired (SLOW_DELAY_MS is 1.5s past it), so the socket
  // may already be closed by the time this runs. Writing to a destroyed
  // response must not crash the server — an unhandled 'error' on `res` would
  // otherwise take down the whole stub-maker process mid-driver-run.
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch {
    // client already gone — nothing to do.
  }
}

/**
 * The D-12 failure-knob dispatch (five modes, no more — the indicative-
 * pricing method, the buy-fixed direction method, and a websocket transport
 * are all deliberately unimplemented, see the grep acceptance criteria in
 * 02-02-PLAN.md Task 3) plus SHORT_TTL (02-03-PLAN.md Task 3) and
 * EXPIRED_ENTRY (02-04-PLAN.md Task 3, D-09), both reusing the exact same
 * per-request mode-header mechanism to prove a real path against a
 * genuinely signed quote rather than a fabricated one.
 *
 * EXPIRED_ENTRY's mode value may carry an optional RE_QUOTE_PRICE suffix —
 * "EXPIRED_ENTRY:BETTER" / ":EQUAL" / ":WORSE" — controlling the rate the
 * SECOND (genuinely valid, retry) quote applies relative to the first
 * (doomed) one; see rateForRequote and signQuote's header comment.
 */
async function handleModedRequest(modeRaw, msg, res) {
  const [mode, requote] = String(modeRaw || '').split(':');
  const modeJustApplied =
    mode === 'EXPIRED_ENTRY' && (lastBaseMode !== 'EXPIRED_ENTRY' || lastRequote !== (requote ?? null));
  if (modeJustApplied) expiredEntryArmed = true;
  if (mode !== 'EXPIRED_ENTRY') expiredEntryArmed = false;
  lastBaseMode = mode || null;
  lastRequote = mode === 'EXPIRED_ENTRY' ? (requote ?? null) : null;

  if (mode === 'EXPIRED_ENTRY') {
    const isFirstCallThisApplication = expiredEntryArmed;
    expiredEntryArmed = false; // only ONE doomed entry per application of the mode
    const rate = isFirstCallThisApplication ? RATE : rateForRequote(requote);
    const result = await handleGetMakerSideOrder(msg.params, QUOTE_TTL_SEC, {
      expired: isFirstCallThisApplication, rate,
    });
    writeJson(res, { jsonrpc: '2.0', id: msg.id, result });
    return;
  }
  if (mode === 'SHORT_TTL') {
    const result = await handleGetMakerSideOrder(msg.params, SHORT_TTL_SEC);
    writeJson(res, { jsonrpc: '2.0', id: msg.id, result });
    return;
  }
  if (mode === 'SLOW') {
    await new Promise((resolve) => setTimeout(resolve, SLOW_DELAY_MS));
    const result = await handleGetMakerSideOrder(msg.params);
    writeJson(res, { jsonrpc: '2.0', id: msg.id, result });
    return;
  }
  if (mode === 'MALFORMED') {
    // A body that is not valid JSON — the driver's MALFORMED scenario;
    // rfqNetwork.test.ts's unit suite separately covers the well-formed-
    // but-missing-authEntry malformed variant.
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
        res.end('not valid json{{{');
      } catch {
        // client already gone — nothing to do.
      }
    }
    return;
  }
  if (mode === 'REFUSE') {
    writeJson(res, { jsonrpc: '2.0', id: msg.id, error: { code: -33700, message: 'taker trustline missing' } });
    return;
  }
  if (mode === 'DRIFTED') {
    // Really signed for the TRUE terms, then the JSON response's claimed
    // makerAmount is silently reduced by one atomic unit relative to what
    // the signed tree actually says — validateQuote's tree comparison, not
    // its economics check, is what must catch this.
    const result = await handleGetMakerSideOrder(msg.params);
    const driftedAmount = atomicToDecimal(toAtomic(result.order.makerAmount) - 1n);
    const drifted = { ...result, order: { ...result.order, makerAmount: driftedAmount } };
    writeJson(res, { jsonrpc: '2.0', id: msg.id, result: drifted });
    return;
  }
  if (mode === 'WRONG_FEE') {
    // Really signed for the TRUE live fee — swap()'s own FeeMismatch check
    // runs INSIDE the recording-mode simulation this maker signs against, so
    // simulating (let alone signing) a call with an already-wrong fee_bps
    // fails outright and never produces an entry at all. Instead: sign
    // genuinely for the correct fee, then claim a DIFFERENT feeBps in the
    // JSON response — validateQuote's fee_bps-vs-get_config check catches
    // this before it ever reaches the tree decode (where the entry's own
    // embedded fee_bps would in fact still match the live value).
    const result = await handleGetMakerSideOrder(msg.params);
    const wrongFee = { ...result, order: { ...result.order, feeBps: result.order.feeBps + 1 } };
    writeJson(res, { jsonrpc: '2.0', id: msg.id, result: wrongFee });
    return;
  }
  // No mode (or an unrecognised one): the faithful happy path.
  const result = await handleGetMakerSideOrder(msg.params);
  writeJson(res, { jsonrpc: '2.0', id: msg.id, result });
}

function startHttp() {
  httpServer = createServer((req, res) => {
    // SLOW's delayed reply can land after the client has already aborted
    // (past its own AbortSignal.timeout) and torn down the socket — an
    // unhandled 'error' on `res` would otherwise crash this whole process
    // mid-driver-run. No-op: writeJson/the MALFORMED branch already check
    // writableEnded/destroyed before writing.
    res.on('error', () => {});
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404, CORS_HEADERS);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }
      if (msg.method !== 'getMakerSideOrder') {
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32601, message: 'Method not found' } }));
        return;
      }
      try {
        await handleModedRequest(req.headers[MODE_HEADER], msg, res);
      } catch (e) {
        log(`getMakerSideOrder failed: ${e?.message || e}`);
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0', id: msg.id ?? null,
          error: { code: -33600, message: String(e?.message || e) },
        }));
      }
    });
  });
  // Bind to `localhost` (not a literal '127.0.0.1' host) so the listener
  // resolves the same way the client's `url` above does — see the comment on
  // `url` for why the two loopback spellings aren't interchangeable here.
  return new Promise((resolve) => httpServer.listen(PORT, 'localhost', resolve));
}

// --- setup / teardown ---------------------------------------------------------

async function setup() {
  log(`maker ${makerKp.publicKey()}`);
  log('funding maker via friendbot...');
  await friendbot(makerKp.publicKey());

  log('reading rfq_swap fee_bps...');
  feeBps = await readFeeBps();
  log(`fee_bps = ${feeBps}`);

  log('opening USDC trustline + minting demo balance...');
  const acct = await horizon.loadAccount(makerKp.publicKey());
  const hasTrustline = acct.balances.some((b) => b.asset_code === 'USDC' && b.asset_issuer === issuerKp.publicKey());
  if (!hasTrustline) {
    await submitClassic(makerKp, [Operation.changeTrust({ asset: USDC, limit: TRUST_LIMIT })]);
  }
  await submitClassic(issuerKp, [Operation.payment({ destination: makerKp.publicKey(), asset: USDC, amount: MAKER_USDC_FUNDING })]);

  log(`registering on the registry (${RFQ_REGISTRY_ID})...`);
  await invokeRegistry(makerKp, 'set_url', [
    new Address(makerKp.publicKey()).toScVal(),
    nativeToScVal(url, { type: 'string' }),
  ]);
  await invokeRegistry(makerKp, 'add_tokens', [
    new Address(makerKp.publicKey()).toScVal(),
    xdr.ScVal.scvVec([new Address(NATIVE_SAC).toScVal(), new Address(USDC_SAC).toScVal()]),
  ]);
  log('registered.');

  await refreshLedgerSeq();
  ledgerRefreshTimer = setInterval(refreshLedgerSeq, 5000);
  ledgerRefreshTimer.unref?.();

  await startHttp();
  console.log(`STUB_MAKER_READY url=${url} pubkey=${makerKp.publicKey()}`);
}

let tornDown = false;
async function teardown() {
  if (tornDown) return;
  tornDown = true;
  clearInterval(ledgerRefreshTimer);
  log('ejecting from the registry (full stake refund)...');
  try {
    await invokeRegistry(makerKp, 'eject', [new Address(makerKp.publicKey()).toScVal()]);
    log('ejected.');
  } catch (e) {
    log(`eject failed (non-fatal): ${e?.message || e}`);
  }
  await new Promise((resolve) => (httpServer ? httpServer.close(resolve) : resolve()));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await teardown();
    process.exit(0);
  });
}

setup().catch((e) => {
  console.error('\nFATAL:', e?.message || e);
  process.exit(1);
});
