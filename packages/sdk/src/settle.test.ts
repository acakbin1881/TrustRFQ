import { Address, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSwapEvent } from './settle';

const CONTRACT = 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';
const MAKER = 'GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI';
const TAKER = 'GD2FFD7NIOCR22U6IMNBTEENF3CZEWPR24OSLHFXAF6SRLM7OTE76PSP';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function swapEvent(txHash: string, orderId: bigint) {
  return {
    txHash,
    topic: [xdr.ScVal.scvSymbol('swap'), new Address(MAKER).toScVal(), new Address(TAKER).toScVal()],
    value: xdr.ScVal.scvVec([
      nativeToScVal(orderId, { type: 'u64' }),
      new Address(TOKEN).toScVal(),
      nativeToScVal(100n, { type: 'i128' }),
      new Address(TOKEN).toScVal(),
      nativeToScVal(200n, { type: 'i128' }),
      nativeToScVal(1n, { type: 'i128' }),
    ]),
  };
}

describe('readSwapEvent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the event of THIS transaction even when a later swap landed in the same window', async () => {
    vi.spyOn(rpc.Server.prototype, 'getEvents').mockResolvedValue({
      events: [swapEvent('aa'.repeat(32), 7n), swapEvent('bb'.repeat(32), 8n)],
    } as unknown as rpc.Api.GetEventsResponse);
    const ev = await readSwapEvent(new rpc.Server('https://rpc.test'), CONTRACT, 1, 'aa'.repeat(32), { attempts: 1, intervalMs: 0 });
    expect(ev?.orderId).toBe('7');
    expect(ev?.maker).toBe(MAKER);
    expect(ev?.takerAmount).toBe('200');
  });

  it('returns null, never another transaction\'s event, when no event carries the hash', async () => {
    vi.spyOn(rpc.Server.prototype, 'getEvents').mockResolvedValue({
      events: [swapEvent('bb'.repeat(32), 8n)],
    } as unknown as rpc.Api.GetEventsResponse);
    const ev = await readSwapEvent(new rpc.Server('https://rpc.test'), CONTRACT, 1, 'aa'.repeat(32), { attempts: 2, intervalMs: 0 });
    expect(ev).toBeNull();
  });
});
