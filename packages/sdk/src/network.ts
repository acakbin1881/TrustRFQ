// The RFQ network module: free simulated registry reads, the discovery
// intersection, the JSON-RPC 2.0 fan-out to maker servers, and the validation
// gate between that fan-out and anything a caller may render.
//
// No cache: every fan-out pass reads `get_config` and the latest ledger fresh.
// The contract is the only source of truth for the current fee, and a cached
// value could validate a quote the contract would then reject.

import { Account, Address, Contract, TransactionBuilder, rpc, scValToNative, xdr, BASE_FEE } from '@stellar/stellar-sdk';
import { intersectUrls } from './discover';
import type { RfqClientConfig } from './settle';
import { validateQuote, type QuoteRejection, type SwapConfig } from './validate';
import type { GetMakerSideOrderParams, MakerSideOrderResult } from './wire';

/** Per-request budget for one maker; a slow maker costs only its own quote. */
export const MAKER_REQUEST_TIMEOUT_MS = 3000;

/** An unfunded account: a read-only simulation needs a source but never a signature or a fee. */
export const SIMULATION_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

type ReadConfig = Pick<RfqClientConfig, 'rpcUrl' | 'passphrase'>;

/** Simulate a read-only contract call and decode its return value. */
export async function simulateRead(cfg: ReadConfig, contractId: string, fnName: string, scValArgs: xdr.ScVal[]): Promise<unknown> {
  const server = new rpc.Server(cfg.rpcUrl);
  const src = new Account(SIMULATION_SOURCE, '0');
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(contract.call(fnName, ...scValArgs))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result!.retval);
}

/** Two free `get_urls_for_token` reads and the client-side intersection. */
export async function discoverMakerUrls(cfg: RfqClientConfig, makerTokenSac: string, takerTokenSac: string): Promise<string[]> {
  const [makerUrls, takerUrls] = (await Promise.all([
    simulateRead(cfg, cfg.registryId, 'get_urls_for_token', [new Address(makerTokenSac).toScVal()]),
    simulateRead(cfg, cfg.registryId, 'get_urls_for_token', [new Address(takerTokenSac).toScVal()]),
  ])) as [string[], string[]];
  return intersectUrls(makerUrls, takerUrls);
}

/**
 * A free simulated `get_config` read on the settlement contract. Errors
 * propagate: a failed read must fail the whole fan-out pass rather than skip
 * the fee and paused checks.
 */
export async function readSwapConfig(cfg: RfqClientConfig): Promise<SwapConfig> {
  return (await simulateRead(cfg, cfg.swapContractId, 'get_config', [])) as SwapConfig;
}

/** Structural check of a maker's JSON-RPC result before any field is used. */
export function isMakerSideOrderResult(x: unknown): x is MakerSideOrderResult {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  const o = r.order;
  if (!o || typeof o !== 'object') return false;
  const order = o as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string';
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
  return (
    str(r.authEntry) &&
    int(r.signatureExpirationLedger) &&
    str(r.network) &&
    str(r.swapContract) &&
    str(order.maker) &&
    str(order.taker) &&
    str(order.makerToken) &&
    str(order.makerAmount) &&
    str(order.takerToken) &&
    str(order.takerAmount) &&
    int(order.expiry) &&
    int(order.orderId) &&
    int(order.feeBps)
  );
}

/** Why a maker's response never reached validation. */
export type WireDrop =
  | { kind: 'unreachable' }
  | { kind: 'http_error'; status: number }
  | { kind: 'unparseable' }
  | { kind: 'malformed' }
  | { kind: 'rpc_error'; code: number; message: string };

export type WireOutcome = { result: MakerSideOrderResult } | { dropped: WireDrop };

/**
 * One JSON-RPC 2.0 `getMakerSideOrder` POST. Every failure mode is reported
 * as a drop, never thrown, so one maker can only ever cost its own quote.
 */
export async function getMakerSideOrder(url: string, params: GetMakerSideOrderParams): Promise<WireOutcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMakerSideOrder', params }),
      signal: AbortSignal.timeout(MAKER_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { dropped: { kind: 'unreachable' } };
  }
  if (!res.ok) return { dropped: { kind: 'http_error', status: res.status } };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { dropped: { kind: 'unparseable' } };
  }
  if (!body || typeof body !== 'object') return { dropped: { kind: 'malformed' } };
  const rpcBody = body as { error?: { code?: unknown; message?: unknown }; result?: unknown };
  if (rpcBody.error) {
    const code = typeof rpcBody.error.code === 'number' ? rpcBody.error.code : 0;
    const message = typeof rpcBody.error.message === 'string' ? rpcBody.error.message : '';
    return { dropped: { kind: 'rpc_error', code, message } };
  }
  if (!isMakerSideOrderResult(rpcBody.result)) return { dropped: { kind: 'malformed' } };
  return { result: rpcBody.result };
}

/** A quote that arrived and failed validation; kept for diagnostics, never rendered. */
export interface FanOutRejection {
  url: string;
  rejection: QuoteRejection;
}

export interface FanOutOutcome {
  /** Only quotes that passed validateQuote: the sole input a caller may render. */
  accepted: MakerSideOrderResult[];
  rejections: FanOutRejection[];
  /** Makers whose response never reached validation. */
  dropped: { url: string; drop: WireDrop }[];
}

/**
 * Fan out getMakerSideOrder to every maker URL, then validate EVERY response
 * before it can reach the caller. `get_config` and the latest ledger are read
 * once per pass alongside the parallel maker requests.
 */
export async function fanOutMakerSideOrder(
  cfg: RfqClientConfig,
  urls: string[],
  params: GetMakerSideOrderParams,
): Promise<FanOutOutcome> {
  const server = new rpc.Server(cfg.rpcUrl);
  const [config, latestLedger, settled] = await Promise.all([
    readSwapConfig(cfg),
    server.getLatestLedger(),
    Promise.allSettled(urls.map(async (url) => ({ url, outcome: await getMakerSideOrder(url, params) }))),
  ]);

  const ctx = {
    request: params,
    config,
    passphrase: cfg.passphrase,
    swapContractId: cfg.swapContractId,
    allowedTokens: cfg.allowedTokens,
    nowUnixSeconds: Math.floor(Date.now() / 1000),
    currentLedgerSeq: latestLedger.sequence,
  };

  const accepted: MakerSideOrderResult[] = [];
  const rejections: FanOutRejection[] = [];
  const dropped: { url: string; drop: WireDrop }[] = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const { url, outcome } = s.value;
    if ('dropped' in outcome) {
      dropped.push({ url, drop: outcome.dropped });
      continue;
    }
    try {
      const verdict = validateQuote(outcome.result, ctx);
      if (verdict.accepted) accepted.push(verdict.quote);
      else rejections.push({ url, rejection: verdict.rejection });
    } catch (e) {
      // Backstop for a throw the pure layer did not classify: one maker's
      // uninterpretable value costs only this quote, never the whole pass.
      rejections.push({ url, rejection: { reason: 'malformed_field', detail: String(e) } });
    }
  }
  return { accepted, rejections, dropped };
}
