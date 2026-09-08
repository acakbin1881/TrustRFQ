// ---------------------------------------------------------------------------
// The ONE RFQ network module — free simulated registry reads, the discovery
// intersection call site (TAKER-01), the JSON-RPC 2.0 fan-out to maker
// servers (TAKER-02), and the validation gate (TAKER-03) that stands
// between that fan-out and anything the panel can render. Mirrors
// src/core/fill.ts's isolation rule applied to the data layer: src/core/rfq/*
// never talks to the network directly.
//
// No cache (D-05): every "Refresh quotes" is a deliberate, uncached network
// hit — a deliberate departure from useFairPrice.ts's cache Map, so a slow
// or rate-limited maker cannot be papered over by stale data. get_config is
// no exception: it is read fresh once PER FAN-OUT PASS, never cached across
// passes, because the contract itself is the only source of truth for the
// current fee and caching risks validating against a stale value the
// contract would then reject.

import { Account, Address, Contract, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PASSPHRASE, RFQ_REGISTRY_ID, RFQ_SWAP_CONTRACT_ID, RPC_URL } from '../config';
import type { SwapConfig, QuoteRejection } from '../core/rfq/validate';
import { validateQuote } from '../core/rfq/validate';
import type { GetMakerSideOrderParams, MakerSideOrderResult } from '../core/rfq/wire';

const { Server, Api } = rpc;
const server = new Server(RPC_URL);

// Zero-balance source account: the free read-only-simulation trick — no
// signing, no fee, no network write. Mirrored from tools/rfq-registry-live.mjs.
const ZERO_BALANCE_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Simulate a read-only contract call with a throwaway, unfunded source account. */
export async function simulateRead(contractId: string, fnName: string, scValArgs: xdr.ScVal[]): Promise<unknown> {
  const src = new Account(ZERO_BALANCE_SOURCE, '0');
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: PASSPHRASE })
    .addOperation(contract.call(fnName, ...scValArgs))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result!.retval);
}

/** Two free `get_urls_for_token` reads + the client-side intersection (TAKER-01). */
export async function discoverMakerUrls(makerTokenSac: string, takerTokenSac: string): Promise<string[]> {
  const [makerUrls, takerUrls] = (await Promise.all([
    simulateRead(RFQ_REGISTRY_ID, 'get_urls_for_token', [new Address(makerTokenSac).toScVal()]),
    simulateRead(RFQ_REGISTRY_ID, 'get_urls_for_token', [new Address(takerTokenSac).toScVal()]),
  ])) as [string[], string[]];
  const takerSet = new Set(takerUrls);
  return makerUrls.filter((u) => takerSet.has(u));
}

/**
 * A free simulated `get_config` read on RFQ_SWAP_CONTRACT_ID — the live
 * reference `validateQuote`'s fee/paused checks are measured against
 * (TAKER-03). Errors propagate to the caller rather than defaulting to a
 * permissive value: a failed read must fail the whole fan-out pass, never
 * silently skip the fee/paused gate.
 */
export async function readSwapConfig(): Promise<SwapConfig> {
  return (await simulateRead(RFQ_SWAP_CONTRACT_ID, 'get_config', [])) as SwapConfig;
}

/**
 * One JSON-RPC 2.0 `getMakerSideOrder` POST, dropped (returns null) on
 * unreachable, non-2xx, unparseable body, a JSON-RPC `error` member, or a
 * result missing `order`/`authEntry` (TAKER-02 drop semantics).
 */
export async function getMakerSideOrder(
  url: string,
  params: GetMakerSideOrderParams,
): Promise<MakerSideOrderResult | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMakerSideOrder', params }),
      signal: AbortSignal.timeout(3000), // 2-3s per TAKER-02, per-request (not a fan-out budget)
    });
  } catch {
    return null; // unreachable / timed out / aborted
  }
  if (!res.ok) return null;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null; // unparseable body
  }
  if (!body || typeof body !== 'object' || 'error' in body) return null;
  const result = (body as { result?: unknown }).result as MakerSideOrderResult | undefined;
  if (!result?.order || !result?.authEntry) return null; // malformed
  return result;
}

/** One dropped-or-rejected quote, kept for the developer console / E2E driver
 *  report — never rendered to the taker as a row (TAKER-03). */
export interface FanOutRejection {
  url: string;
  rejection: QuoteRejection;
}

export interface FanOutOutcome {
  /** Only quotes that passed validateQuote — the sole input the panel may render. */
  accepted: MakerSideOrderResult[];
  rejections: FanOutRejection[];
}

/**
 * Fan out getMakerSideOrder to every discovered maker URL, then validate
 * EVERY response before it can reach the caller (TAKER-03): a validated
 * fan-out is the only fan-out this module can perform. `get_config` and the
 * current ledger sequence are read once for the whole pass, alongside the
 * parallel maker requests, never per-quote and never cached across passes.
 */
export async function fanOutMakerSideOrder(
  urls: string[],
  params: GetMakerSideOrderParams,
): Promise<FanOutOutcome> {
  const [config, latestLedger, settled] = await Promise.all([
    readSwapConfig(),
    server.getLatestLedger(),
    Promise.allSettled(urls.map(async (url) => ({ url, result: await getMakerSideOrder(url, params) }))),
  ]);

  const ctx = {
    request: params,
    config,
    passphrase: PASSPHRASE,
    swapContractId: RFQ_SWAP_CONTRACT_ID,
    nowUnixSeconds: Math.floor(Date.now() / 1000),
    currentLedgerSeq: latestLedger.sequence,
  };

  const accepted: MakerSideOrderResult[] = [];
  const rejections: FanOutRejection[] = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled' || s.value.result === null) continue; // dropped at the wire layer (TAKER-02)
    const verdict = validateQuote(s.value.result, ctx);
    if (verdict.accepted) accepted.push(verdict.quote);
    else rejections.push({ url: s.value.url, rejection: verdict.rejection });
  }
  return { accepted, rejections };
}
