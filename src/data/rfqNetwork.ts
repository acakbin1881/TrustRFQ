// ---------------------------------------------------------------------------
// The ONE RFQ network module — free simulated registry reads, the discovery
// intersection call site (TAKER-01), and the JSON-RPC 2.0 fan-out to maker
// servers (TAKER-02). Mirrors src/core/fill.ts's isolation rule applied to
// the data layer: src/core/rfq/* never talks to the network directly.
//
// No cache (D-05): every "Refresh quotes" is a deliberate, uncached network
// hit — a deliberate departure from useFairPrice.ts's cache Map, so a slow
// or rate-limited maker cannot be papered over by stale data.

import { Account, Address, Contract, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PASSPHRASE, RFQ_REGISTRY_ID, RPC_URL } from '../config';
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

/** Fan out getMakerSideOrder to every discovered maker URL; only successes survive. */
export async function fanOutMakerSideOrder(
  urls: string[],
  params: GetMakerSideOrderParams,
): Promise<MakerSideOrderResult[]> {
  const settled = await Promise.allSettled(urls.map((u) => getMakerSideOrder(u, params)));
  const out: MakerSideOrderResult[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value !== null) out.push(r.value);
  }
  return out;
}
