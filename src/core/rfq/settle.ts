// ---------------------------------------------------------------------------
// RFQ settlement — chain operations only (TAKER-04).
// ---------------------------------------------------------------------------
// Mirrors src/core/fill.ts's isolation boundary: the wallet is INJECTED as an
// RfqWalletSigner instead of importing the kit, so this module never touches
// UI state; no off-chain writes, no toasts (D-03 — the RFQ lane persists
// nothing).
//
// The taker is the transaction source, so the taker's ordinary envelope
// signature IS their authorization — this module never asks for a detached
// off-chain-signed authorization. RfqWalletSigner exposes exactly ONE signing
// method so that guarantee is structural, not just a convention.
//
// Load-bearing ordering (RESEARCH.md Pitfall 2): the maker's pre-signed auth
// entry is attached to the `invokeContractFunction` operation BEFORE the
// enforcing-mode `simulateTransaction` call. `assembleTransaction` only
// injects simulation-produced auth onto an operation that carries none, so
// attaching after simulation would silently drop the maker's signature.
// Proven live: tools/rfq-live-swap.mjs's `settle()`, tx 49fa69b2258d5....

import * as Stellar from '@stellar/stellar-sdk';
import { ensureTrustline } from '../fill';
import { orderToScVal, tokenForSac } from './order';
import type { RfqOrder } from './wire';

/** The one-method taker-side signer slice — nothing else can be requested. */
export interface RfqWalletSigner {
  address: string;
  signTransaction(
    xdr: string,
    opts: { address: string; networkPassphrase: string },
  ): Promise<{ signedTxXdr: string }>;
}

export interface RfqChainConfig {
  rpcUrl: string;
  horizonUrl: string;
  passphrase: string;
  /** RFQ_SWAP_CONTRACT_ID */
  contractId: string;
}

const rpcServer = (c: RfqChainConfig) => new Stellar.rpc.Server(c.rpcUrl);

/**
 * The one `swap` invocation, shared by the recording-mode probe and the
 * final enforcing-mode call below — `auth` pre-attached BEFORE simulate is
 * Pitfall 2's whole point: `assembleTransaction` only injects
 * simulation-produced auth onto an operation that carries none, so a signed
 * entry attached after the fact never survives assembly. Omitting `auth`
 * (the probe call) puts the operation in RECORDING mode; passing it puts the
 * operation in ENFORCING mode, validating every entry right there.
 */
function buildSwapOp(config: RfqChainConfig, order: RfqOrder, auth?: Stellar.xdr.SorobanAuthorizationEntry[]) {
  return Stellar.Operation.invokeContractFunction({
    contract: config.contractId,
    function: 'swap',
    args: [orderToScVal(order)],
    auth, // pre-attached BEFORE simulate — Pitfall 2
  });
}

export async function waitForTx(server: Stellar.rpc.Server, hash: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const r = await server.getTransaction(hash);
    if (r.status === Stellar.rpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (r.status === Stellar.rpc.Api.GetTransactionStatus.FAILED) throw new Error('Transaction failed on-chain.');
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('Timed out waiting for confirmation.');
}

/** The decoded `SwapExecuted` event (contracts/rfq_swap/src/lib.rs), string amounts (i128 as string). */
export interface SwapExecutedEvent {
  maker: string;
  taker: string;
  orderId: string;
  makerToken: string;
  makerAmount: string;
  takerToken: string;
  takerAmount: string;
  fee: string;
}

export interface SettleResult {
  hash: string;
  /** null is reported, never silently treated as success */
  event: SwapExecutedEvent | null;
}

/** Poll getEvents for the SwapExecuted event this settlement produced. */
async function readSwapEvent(
  server: Stellar.rpc.Server,
  contractId: string,
  startLedger: number,
): Promise<SwapExecutedEvent | null> {
  const swapTopic = Stellar.xdr.ScVal.scvSymbol('swap').toXDR('base64');
  for (let i = 0; i < 6; i++) {
    const resp = await server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [contractId], topics: [[swapTopic, '*', '*']] }],
      limit: 20,
    });
    if (resp.events.length) {
      const ev = resp.events[resp.events.length - 1];
      const maker = Stellar.Address.fromScVal(ev.topic[1]).toString();
      const taker = Stellar.Address.fromScVal(ev.topic[2]).toString();
      const [orderId, makerToken, makerAmount, takerToken, takerAmount, fee] = Stellar.scValToNative(
        ev.value,
      ) as [bigint, string, bigint, string, bigint, bigint];
      return {
        maker,
        taker,
        orderId: String(orderId),
        makerToken,
        makerAmount: String(makerAmount),
        takerToken,
        takerAmount: String(takerAmount),
        fee: String(fee),
      };
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return null;
}

function isMakerAddressEntry(entry: Stellar.xdr.SorobanAuthorizationEntry, makerAddr: string): boolean {
  try {
    const c = entry.credentials();
    return (
      c.switch().name === 'sorobanCredentialsAddress' &&
      Stellar.Address.fromScAddress(c.address().address()).toString() === makerAddr
    );
  } catch {
    return false;
  }
}

/**
 * Settle a taker-bound quote: front with the D-08 trustline pre-flight,
 * assemble, sign as the taker (the ONE swap prompt), submit, poll, and read
 * back the SwapExecuted event.
 *
 * D-08: before building the swap transaction, ensure the taker can receive
 * `order.makerToken` — the asset they are about to be paid in. Imported
 * UNCHANGED from src/core/fill.ts (T-02-21): the RFQ lane must never grow a
 * second trustline-creation construction site. A no-op for the native asset
 * or an already-held trustline (the common case), so the uncommon case produces
 * the trustline prompt FIRST and the swap prompt SECOND — load-bearing,
 * since the census already found settlement simulation fails on a
 * cross-asset order until the receiving trustline is on chain.
 * `tokenForSac` resolves the wire's SAC id back to the curated token string
 * `ensureTrustline` needs; by the time a quote reaches here it has already
 * passed validateQuote's allow-list check (TAKER-05), so this should never
 * fail, but the module stays fail-closed rather than skip the check silently
 * if it somehow did.
 *
 * Two simulation passes, both against the SAME `swap` call:
 *   1. A RECORDING-mode probe (no auth attached) to learn the FULL entry set
 *      the host needs — this always includes the maker's Address-credential
 *      entry, and per RESEARCH.md's live-verified finding, ALSO a
 *      SourceAccount-credential entry for the taker. Once any auth is
 *      explicitly attached (step 2), the host stops auto-filling missing
 *      entries, so the taker's own entry must travel too even though it
 *      needs no signature.
 *   2. The maker's pre-signed entry substituted into that full set, attached
 *      BEFORE an ENFORCING-mode simulation that actually validates it. A
 *      maker entry whose signature_expiration_ledger has already passed is
 *      rejected RIGHT HERE (verified live: host text "signature has
 *      expired") — before the taker's wallet is ever prompted to sign
 *      anything; src/core/rfq/retry.ts's isExpiredAuthFailure matches this
 *      exact host-level failure.
 */
export async function settleQuote(
  config: RfqChainConfig,
  order: RfqOrder,
  authEntryBase64: string,
  signer: RfqWalletSigner,
): Promise<SettleResult> {
  const makerTokenStr = tokenForSac(order.makerToken, config.passphrase);
  if (!makerTokenStr) throw new Error('Maker token is not on the curated allow-list.');
  await ensureTrustline(config, makerTokenStr, signer);

  const server = rpcServer(config);

  const probeAccount = await server.getAccount(signer.address);
  const probeTx = new Stellar.TransactionBuilder(probeAccount, { fee: Stellar.BASE_FEE, networkPassphrase: config.passphrase })
    .addOperation(buildSwapOp(config, order))
    .setTimeout(180)
    .build();
  const probeSim = await server.simulateTransaction(probeTx); // recording mode
  if (Stellar.rpc.Api.isSimulationError(probeSim)) throw new Error(probeSim.error);
  const entries = probeSim.result?.auth ?? [];

  const makerIdx = entries.findIndex((e) => isMakerAddressEntry(e, order.maker));
  if (makerIdx < 0) throw new Error('Simulation produced no authorization entry for the maker.');

  const signedMaker = Stellar.xdr.SorobanAuthorizationEntry.fromXDR(authEntryBase64, 'base64');
  const auth = entries.map((e, i) => (i === makerIdx ? signedMaker : e));

  const account = await server.getAccount(signer.address);
  const tx = new Stellar.TransactionBuilder(account, { fee: Stellar.BASE_FEE, networkPassphrase: config.passphrase })
    .addOperation(buildSwapOp(config, order, auth))
    .setTimeout(180)
    .build();

  const startLedger = (await server.getLatestLedger()).sequence;

  const sim = await server.simulateTransaction(tx); // enforcing mode: validates the maker sig here
  if (Stellar.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

  const ready = Stellar.rpc.assembleTransaction(tx, sim).build(); // auth already attached, preserved
  const { signedTxXdr } = await signer.signTransaction(ready.toXDR(), {
    address: signer.address,
    networkPassphrase: config.passphrase,
  });
  const sent = await server.sendTransaction(
    Stellar.TransactionBuilder.fromXDR(signedTxXdr, config.passphrase) as Stellar.Transaction,
  );
  if (sent.status === 'ERROR') {
    throw new Error('Submit rejected: ' + JSON.stringify(sent.errorResult ?? sent.status));
  }
  const hash = await waitForTx(server, sent.hash);
  const event = await readSwapEvent(server, config.contractId, startLedger);
  return { hash, event };
}
