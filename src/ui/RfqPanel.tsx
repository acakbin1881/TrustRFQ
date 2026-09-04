// The RFQ desk panel — the fourth section (D-01). A minimal reference
// surface over the SDK-shaped taker core in src/core/rfq/* and
// src/data/rfqNetwork.ts (UI-D1): this component only orchestrates state and
// composes existing primitives (TokenSelect, Toast, the .order/.legbox/
// .settle/.stepper design-system classes) — no new persistence, no new
// wallet flow shape.
//
// D-03: this module writes to no off-chain store, ever. It never imports a
// database client.

import { useCallback, useMemo, useRef, useState } from 'react';
import { EXPLORER, HORIZON_URL, PASSPHRASE, RFQ_SWAP_CONTRACT_ID, RPC_URL } from '../config';
import type { BalanceMap } from '../core/balances';
import { balanceOf } from '../core/balances';
import { sacIdFor } from '../core/rfq/order';
import { ensureRfqTrustline, settleQuote, type RfqChainConfig, type RfqWalletSigner, type SwapExecutedEvent } from '../core/rfq/settle';
import type { MakerSideOrderResult } from '../core/rfq/wire';
import { TOKENS, fmtRemaining, isExpired, trunc, validAmount } from '../core/tokens';
import { discoverMakerUrls, fanOutMakerSideOrder } from '../data/rfqNetwork';
import { kit } from '../wallet/kit';
import { TokenSelect } from './TokenSelect';
import { errMsg, useToast } from './Toast';
import { useNow } from './useNow';

interface RfqPanelProps {
  address: string;
  balances: BalanceMap | null;
}

type Phase = 'idle' | 'discovering' | 'quoting' | 'quoted' | 'empty-makers' | 'empty-quotes' | 'settling' | 'settled';

const rfqChain: RfqChainConfig = {
  rpcUrl: RPC_URL,
  horizonUrl: HORIZON_URL,
  passphrase: PASSPHRASE,
  contractId: RFQ_SWAP_CONTRACT_ID,
};

const signerFor = (address: string): RfqWalletSigner => ({
  address,
  signTransaction: (xdr, opts) => kit.signTransaction(xdr, opts),
});

/** A quote's price, receive-per-sell — higher is better for the taker. */
const priceOf = (q: MakerSideOrderResult) => Number(q.order.makerAmount) / Number(q.order.takerAmount);

export function RfqPanel({ address, balances }: RfqPanelProps) {
  const toast = useToast();
  const now = useNow(1000);

  const [sellToken, setSellToken] = useState(TOKENS[0].value);
  const [buyToken, setBuyToken] = useState(TOKENS[1]?.value ?? TOKENS[0].value);
  const [amount, setAmount] = useState('');
  const [makerCount, setMakerCount] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<MakerSideOrderResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [settled, setSettled] = useState<{ hash: string; event: SwapExecutedEvent | null } | null>(null);
  const [settleErr, setSettleErr] = useState<string | null>(null);
  const busy = useRef(false);

  const sameToken = sellToken === buyToken;
  const canQuote = !sameToken && validAmount(amount);
  const hasBuyTrustline = buyToken === 'XLM' || balanceOf(balances, buyToken) !== '0' || balances?.[buyToken] !== undefined;

  // D-05: drop expired rows from the visible list (no auto re-fan-out).
  const liveQuotes = useMemo(
    () => quotes.filter((q) => !isExpired({ expiration: new Date(q.order.expiry * 1000).toISOString() }, now)),
    [quotes, now],
  );

  const refreshQuotes = useCallback(async () => {
    if (!canQuote || busy.current) return;
    setPhase('discovering');
    setQuotes([]);
    setSettled(null);
    setSettleErr(null);
    try {
      const sellSac = sacIdFor(sellToken, PASSPHRASE);
      const buySac = sacIdFor(buyToken, PASSPHRASE);
      // discovery: this desk sells `sellToken`, so it needs a maker who sells
      // `buyToken` (makerToken) and accepts `sellToken` (takerToken).
      const urls = await discoverMakerUrls(buySac, sellSac);
      setMakerCount(urls.length);
      if (urls.length === 0) {
        setPhase('empty-makers');
        return;
      }
      setPhase('quoting');
      const results = await fanOutMakerSideOrder(urls, {
        network: PASSPHRASE,
        swapContract: RFQ_SWAP_CONTRACT_ID,
        makerToken: buySac,
        takerToken: sellSac,
        takerAmount: amount,
        takerWallet: address,
        minExpiry: Math.floor(Date.now() / 1000) + 30,
      });
      const ranked = [...results].sort((a, b) => priceOf(b) - priceOf(a)); // D-04: best first
      setQuotes(ranked);
      setSelected(0);
      setPhase(ranked.length ? 'quoted' : 'empty-quotes');
    } catch (e) {
      toast(errMsg(e, "Couldn't refresh quotes — try again."), 'err');
      setPhase('idle');
    }
  }, [canQuote, sellToken, buyToken, amount, address, toast]);

  const accept = useCallback(async () => {
    if (busy.current) return;
    const quote = liveQuotes[selected] ?? liveQuotes[0];
    if (!quote) return;
    busy.current = true;
    setPhase('settling');
    setSettleErr(null);
    try {
      const signer = signerFor(address);
      // D-08: the changeTrust prompt happens in-flow, right here — a no-op if
      // the trustline already exists.
      await ensureRfqTrustline(rfqChain, buyToken, signer);
      toast('Submitting settlement — check your wallet…');
      const result = await settleQuote(rfqChain, quote.order, quote.authEntry, signer);
      setSettled({ hash: result.hash, event: result.event });
      setPhase('settled');
      toast('Settled on-chain 🎉', 'ok');
    } catch (e) {
      setSettleErr(errMsg(e, 'Settlement failed.'));
      setPhase('quoted');
      toast(errMsg(e, 'Settlement failed.'), 'err');
    } finally {
      busy.current = false;
    }
  }, [liveQuotes, selected, buyToken, address, toast]);

  const busyDiscovering = phase === 'discovering' || phase === 'quoting';
  const busySettling = phase === 'settling';

  return (
    <div className="rfq-panel">
      <div className="field">
        <label className="field__label" htmlFor="rfqSellToken">Sell</label>
        <div className="rfq-row" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="text" id="rfqAmount" inputMode="decimal" placeholder="0.00" value={amount}
            disabled={busyDiscovering || busySettling}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <TokenSelect id="rfqSellToken" value={sellToken} options={TOKENS} label="Sell token"
            disabled={busyDiscovering || busySettling} onChange={setSellToken} />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rfqBuyToken">Buy</label>
        <TokenSelect id="rfqBuyToken" value={buyToken} options={TOKENS} label="Buy token"
          disabled={busyDiscovering || busySettling} onChange={setBuyToken} />
      </div>

      {!hasBuyTrustline && buyToken !== 'XLM' ? (
        <div className="hint">You'll need a trustline for {buyToken.split(':')[0]} to settle this swap — makers may decline to quote without one.</div>
      ) : null}

      <div className="order__actions">
        <button type="button" id="rfqRefreshBtn" className={busyDiscovering ? 'btn btn--gold is-busy' : 'btn btn--gold'}
          disabled={!canQuote || busyDiscovering || busySettling} onClick={() => void refreshQuotes()}>
          {busyDiscovering ? <span className="btn__orb" aria-hidden="true"><span className="spin" /></span> : 'Refresh quotes'}
        </button>
      </div>

      {makerCount !== null && phase !== 'idle' ? (
        <div className="hint">{makerCount} maker{makerCount === 1 ? '' : 's'} found</div>
      ) : null}

      {phase === 'empty-makers' ? (
        <div className="empty">
          <div>No makers registered</div>
          <div className="hint">No makers are registered for this pair yet on the registry. Try a different pair.</div>
        </div>
      ) : null}

      {phase === 'empty-quotes' || (phase === 'quoted' && liveQuotes.length === 0) ? (
        <div className="empty">
          <div>No quotes available</div>
          <div className="hint">No registered maker responded in time. Refresh quotes to try again, or pick a different pair.</div>
        </div>
      ) : null}

      {liveQuotes.length > 0 && !settled ? (
        <div className="rfq-quotes">
          {liveQuotes.slice(0, 6).map((q, i) => {
            const remainingMs = q.order.expiry * 1000 - now;
            const label = remainingMs <= 0 ? 'Expired' : `Expires in ${fmtRemaining(new Date(q.order.expiry * 1000).toISOString(), now)}`;
            return (
              <div key={`${q.authEntry.slice(0, 24)}-${i}`}
                className={i === selected ? 'order legbox--in' : 'order'}
                onClick={() => setSelected(i)}>
                <div className="legbox">
                  <div className="legbox__k">You receive</div>
                  <div className="legbox__v">{q.order.makerAmount} <span className="legbox__t">{buyToken.split(':')[0]}</span></div>
                </div>
                <div className="order__meta">
                  <span className="sig">{label}</span>
                </div>
              </div>
            );
          })}
          <div className="hint">Fee is paid by the maker — you receive the full quoted amount.</div>
          <div className="order__actions">
            <button type="button" id="rfqAcceptBtn" className={busySettling ? 'btn btn--gold is-busy' : 'btn btn--gold'}
              disabled={busySettling || liveQuotes.length === 0} onClick={() => void accept()}>
              {busySettling ? <span className="btn__orb" aria-hidden="true"><span className="spin" /></span> : 'Accept quote'}
            </button>
          </div>
          {settleErr ? <div className="settle__err">{settleErr}</div> : null}
        </div>
      ) : null}

      {settled ? (
        <div className="settle">
          <div className="settle__title">On-chain settlement</div>
          <div className="stepper">
            <div className="stepper__step is-done is-final">
              <span className="stepper__dot">✓</span>
              <span className="stepper__label">Settled</span>
            </div>
          </div>
          <div className="settle__msg">
            <a href={`${EXPLORER}/tx/${settled.hash}`} target="_blank" rel="noopener noreferrer">
              View transaction ({trunc(settled.hash)}) ↗
            </a>
          </div>
          {!settled.event ? (
            <div className="settle__err">Settled, but the SwapExecuted event could not be confirmed.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
