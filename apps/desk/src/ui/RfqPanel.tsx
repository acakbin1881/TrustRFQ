// The RFQ desk panel — the fourth section (D-01). A minimal reference
// surface over the SDK-shaped taker core in src/core/rfq/* and
// src/data/rfqNetwork.ts (UI-D1): this component only orchestrates state and
// composes existing primitives (TokenSelect, Toast, the .order/.legbox/
// .settle/.stepper design-system classes) — no new persistence, no new
// wallet flow shape.
//
// D-03: this module writes to no off-chain store, ever. It never imports a
// database client.
//
// Row order comes from discover.ts's rankQuotes, never an ad-hoc sort here
// (D-04) — the panel is presentation over that pure ranking, not a second
// implementation of the selection rule. Selection is tracked by the quote's
// own authEntry rather than its array index, so a row dropping out from
// under the taker (countdown hitting zero, D-05) can never silently
// re-point the preselected action at a different quote.

import { Address } from '@stellar/stellar-sdk';
import { useCallback, useMemo, useRef, useState } from 'react';
import { EXPLORER, HORIZON_URL, PASSPHRASE, RFQ_REGISTRY_ID, RFQ_SWAP_CONTRACT_ID, RPC_URL } from '../config';
import type { BalanceMap } from '../core/balances';
import { ensureTrustline } from '../core/fill';
import { amountTooLarge } from '../core/negotiation';
import { bestQuote, dropExpired, fmtCountdown, quotePrice, rankQuotes } from '../core/rfq/discover';
import { needsTrustline, retryDecision } from '../core/rfq/retry';
import { settleQuote, type RfqChainConfig, type RfqWalletSigner, type SwapExecutedEvent } from '../core/rfq/settle';
import { TOKENS, tokenLabel, trunc, validAmount } from '../core/tokens';
import { discoverMakerUrls, fanOutMakerSideOrder, simulateRead } from '../data/rfqNetwork';
import { sacIdFor, type MakerSideOrderResult, type RfqOrder } from '@trustrfq/sdk';
import { kit } from '../wallet/kit';
import { TokenSelect } from './TokenSelect';
import { errMsg, useToast } from './Toast';
import { useNow } from './useNow';

interface RfqPanelProps {
  address: string;
  balances: BalanceMap | null;
}

type Phase = 'idle' | 'discovering' | 'quoting' | 'quoted' | 'empty-makers' | 'empty-quotes' | 'settling' | 'settled';

const MAX_VISIBLE_ROWS = 6;

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

/**
 * D-09's "fetch exactly one fresh quote" — from the SAME maker whose entry
 * just failed, never a full re-fan-out to every discovered maker (that would
 * be a second uninvited network burst on a path the taker did not ask to
 * refresh). The maker's own URL is looked up by their address via the
 * registry's `get_maker` read (simulateRead is already exported generically
 * by src/data/rfqNetwork.ts, so this needs no change there); the re-quote
 * itself still goes through `fanOutMakerSideOrder`'s TAKER-03 validation
 * gate — a retry never trusts an unvalidated re-quote either. Every field
 * (token pair, amount) is read off the FAILED order itself rather than
 * live component state, so the re-quote is for the exact trade the taker
 * actually agreed to. Returns null (never throws) on any failure — that is
 * retryDecision's own "no fresh quote" stop condition, not a crash.
 */
async function fetchOneFreshQuote(order: RfqOrder, takerWallet: string): Promise<MakerSideOrderResult | null> {
  try {
    const makerConfig = (await simulateRead(RFQ_REGISTRY_ID, 'get_maker', [
      new Address(order.maker).toScVal(),
    ])) as { url: string };
    const { accepted } = await fanOutMakerSideOrder([makerConfig.url], {
      network: PASSPHRASE,
      swapContract: RFQ_SWAP_CONTRACT_ID,
      makerToken: order.makerToken,
      takerToken: order.takerToken,
      takerAmount: order.takerAmount,
      takerWallet,
      minExpiry: Math.floor(Date.now() / 1000) + 30,
    });
    return accepted[0] ?? null;
  } catch {
    return null;
  }
}

export function RfqPanel({ address, balances }: RfqPanelProps) {
  const toast = useToast();
  const now = useNow(1000);
  const nowSeconds = Math.floor(now / 1000);

  const [sellToken, setSellToken] = useState(TOKENS[0].value);
  const [buyToken, setBuyToken] = useState(TOKENS[1]?.value ?? TOKENS[0].value);
  const [amount, setAmount] = useState('');
  const [makerCount, setMakerCount] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<MakerSideOrderResult[]>([]);
  // The preselected/selected row is tracked by identity (the quote's own
  // authEntry), not array position — an index would silently re-point at a
  // different quote once dropExpired removes an earlier row (D-05).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [settled, setSettled] = useState<{ hash: string; event: SwapExecutedEvent | null } | null>(null);
  const [settleErr, setSettleErr] = useState<string | null>(null);
  // D-09's visible retry/reconfirm note — never silent (an auto-retry) and
  // never blank (a reconfirm), set by the guarded retry loop in accept().
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const busy = useRef(false);
  // guards a slow fan-out pass resolving after the pair/amount changed —
  // mirrors src/data/useFairPrice.ts's pairRef staleness guard.
  const requestRef = useRef('');

  // No pair selected (D-02's starting state): the curated allow-list has
  // exactly two tokens today, so "no pair selected" is the same-token state
  // Ticket.tsx already guards against — there is no third token to pick that
  // would make this state reachable any other way.
  const noPair = sellToken === buyToken;
  const overCap = amount.trim() !== '' && amountTooLarge(amount);
  const canQuote = !noPair && validAmount(amount) && !overCap;
  // D-08: read straight off the balances App.tsx already threaded down — no
  // extra network cost, and a null (not-yet-fetched) map keeps this note
  // suppressed rather than asserting a trustline is missing.
  const showTrustlineNote = needsTrustline(balances, buyToken);

  // D-05: drop expired rows from the visible list; ranking itself is decided
  // once, at fetch time (rankQuotes below) — dropExpired only filters, it
  // never reorders, so an earlier-returned quote keeps its earlier position
  // for as long as it stays live.
  const liveQuotes = useMemo(() => dropExpired(quotes, nowSeconds), [quotes, nowSeconds]);
  // T-02-15: cap what actually renders, not just what scrolls into view — a
  // maker-count flood (bounded on-chain at 100 by max_makers_per_token) must
  // never grow the panel's render cost past 6 rows.
  const visibleQuotes = liveQuotes.slice(0, MAX_VISIBLE_ROWS);
  const selectedIndex = useMemo(() => {
    const idx = visibleQuotes.findIndex((q) => q.authEntry === selectedKey);
    return idx >= 0 ? idx : 0;
  }, [visibleQuotes, selectedKey]);

  const refreshQuotes = useCallback(async () => {
    if (!canQuote || busy.current) return;
    const requestKey = `${sellToken}|${buyToken}|${amount}`;
    requestRef.current = requestKey;
    setPhase('discovering');
    setSettled(null);
    setSettleErr(null);
    setRetryNote(null);
    try {
      // D-08 (continuation-session correction, verified live 2026-09-11
      // against the deployed rfq_swap): a maker's signed quote comes from a
      // RECORDING-mode simulation of the REAL `swap` call, which actually
      // executes the maker -> taker SAC transfer — so a maker CANNOT produce
      // a quote for a taker who lacks the buyToken trustline at all; the
      // simulation hard-fails with "trustline entry is missing for account"
      // (Error(Contract, #13)) and the taker never sees a row, no matter how
      // many times they refresh. The plan's original design (trustline
      // established at ACCEPT, after a quote already exists) is therefore
      // unreachable: there is no quote to accept until the trustline exists.
      // Moving the SAME `ensureTrustline` call (still imported unchanged
      // from src/core/fill.ts, still zero cost once the trustline is live)
      // to fire here, before the fan-out, keeps D-08's "in-flow, gated
      // behind an explicit taker action" principle intact — Refresh quotes
      // is still the taker's own click, not a background prompt — while
      // actually letting a first-time taker get a quote at all. settleQuote
      // keeps its own ensureTrustline front-step too (src/core/rfq/settle.ts,
      // Task 2, unchanged): a harmless no-op in the normal case, and a
      // fail-safe if this step is ever bypassed.
      if (needsTrustline(balances, buyToken)) {
        await ensureTrustline(rfqChain, buyToken, signerFor(address));
      }
      const sellSac = sacIdFor(sellToken, PASSPHRASE);
      const buySac = sacIdFor(buyToken, PASSPHRASE);
      // discovery: this desk sells `sellToken`, so it needs a maker who sells
      // `buyToken` (makerToken) and accepts `sellToken` (takerToken).
      const urls = await discoverMakerUrls(buySac, sellSac);
      if (requestRef.current !== requestKey) return; // a newer pass superseded this one
      setMakerCount(urls.length);
      if (urls.length === 0) {
        setQuotes([]);
        setSelectedKey(null);
        setPhase('empty-makers');
        return;
      }
      setPhase('quoting');
      // Every returned response is validated before it can reach this panel
      // (TAKER-03) — rejections never become rows, they only reach the dev
      // console so a doctored quote's drop can be proven, not just observed
      // as absent.
      const { accepted, rejections } = await fanOutMakerSideOrder(urls, {
        network: PASSPHRASE,
        swapContract: RFQ_SWAP_CONTRACT_ID,
        makerToken: buySac,
        takerToken: sellSac,
        takerAmount: amount,
        takerWallet: address,
        minExpiry: Math.floor(Date.now() / 1000) + 30,
      });
      if (requestRef.current !== requestKey) return; // a newer pass superseded this one
      if (rejections.length) {
        // JSON-stringified (not passed as a raw object) so an E2E console
        // listener (tools/e2e/rfq-driver.mjs's D-12 scenarios) can read the
        // rejection reason directly out of the message text — a raw object
        // arg would only serialize to a JSHandle placeholder there.
        // eslint-disable-next-line no-console
        console.debug(
          '[rfq] dropped quotes',
          JSON.stringify(rejections.map((r) => ({ url: r.url, reason: r.rejection.reason, detail: r.rejection.detail }))),
        );
      }
      const ranked = rankQuotes(accepted); // D-04: best price first, best preselected
      setQuotes(ranked);
      setSelectedKey(bestQuote(ranked)?.authEntry ?? null);
      setPhase(ranked.length ? 'quoted' : 'empty-quotes');
    } catch (e) {
      if (requestRef.current !== requestKey) return; // a newer pass superseded this one
      // A failed refresh leaves whatever rows were already on screen alone —
      // `quotes`/`selectedKey` are deliberately untouched here.
      toast(errMsg(e, "Couldn't refresh quotes — try again."), 'err');
      setPhase('idle');
    }
  }, [canQuote, sellToken, buyToken, amount, address, toast]);

  const accept = useCallback(async () => {
    if (busy.current) return;
    const quote = visibleQuotes[selectedIndex] ?? visibleQuotes[0];
    if (!quote) return;
    busy.current = true;
    setPhase('settling');
    setSettleErr(null);
    setRetryNote(null);
    // D-09: the price the taker actually saw and agreed to when they clicked
    // Accept — fixed for the whole sequence below, even across the one
    // permitted retry, because that is the price consent was given for.
    const seenPrice = quotePrice(quote);
    try {
      const signer = signerFor(address);
      let attemptQuote = quote;
      let attempts = 0;
      // D-08's changeTrust prompt now happens IN settleQuote itself (fronted
      // there, imported from src/core/fill.ts) — a no-op if the trustline
      // already exists. At most one automatic retry, ever (D-09) — a plain
      // loop rather than recursion so that bound stays visible right here.
      for (;;) {
        try {
          toast('Submitting settlement — check your wallet…');
          const result = await settleQuote(rfqChain, attemptQuote.order, attemptQuote.authEntry, signer);
          setSettled({ hash: result.hash, event: result.event });
          setPhase('settled');
          toast('Settled on-chain 🎉', 'ok');
          return;
        } catch (settleFailure) {
          const fresh = await fetchOneFreshQuote(attemptQuote.order, address);
          const decision = retryDecision({
            failure: settleFailure, seenPrice, freshQuote: fresh, attemptsAlready: attempts,
          });
          if (decision.action === 'auto_retry' && fresh) {
            attempts += 1;
            attemptQuote = fresh;
            setQuotes((qs) => rankQuotes(qs.map((q) => (q.authEntry === quote.authEntry ? fresh : q))));
            setSelectedKey(fresh.authEntry);
            setRetryNote('Quote refreshed at the same or better price — retrying automatically.');
            continue; // the ONE automatic retry — attemptsAlready now blocks a second
          }
          if (decision.action === 'reconfirm' && fresh) {
            // Stop. Replace the row with the fresh (worse) price so it is on
            // screen, and open no wallet prompt until the taker acts again —
            // never sign at a price they have not seen.
            setQuotes((qs) => rankQuotes(qs.map((q) => (q.authEntry === quote.authEntry ? fresh : q))));
            setSelectedKey(fresh.authEntry);
            setRetryNote('Price changed — review the new quote before continuing.');
            setPhase('quoted');
            return;
          }
          throw settleFailure; // stop — surface the raw settlement error, unchanged
        }
      }
    } catch (e) {
      setSettleErr(errMsg(e, 'Settlement failed.'));
      setPhase('quoted');
      toast(errMsg(e, 'Settlement failed.'), 'err');
    } finally {
      busy.current = false;
    }
  }, [visibleQuotes, selectedIndex, address, toast]);

  const busyDiscovering = phase === 'discovering' || phase === 'quoting';
  const busySettling = phase === 'settling';
  const fieldsDisabled = busyDiscovering || busySettling;
  const showMakerLine = makerCount !== null && makerCount > 0;
  const showEmptyMakers = phase === 'empty-makers';
  const showEmptyQuotes = phase === 'empty-quotes' || (phase === 'quoted' && visibleQuotes.length === 0);

  return (
    <div className="rfq-panel">
      <div className="field">
        <label className="field__label" htmlFor="rfqSellToken">Sell</label>
        <div className="rfq-sell-row">
          <input type="text" id="rfqAmount" inputMode="decimal"
            placeholder={noPair ? 'Choose a pair to see live quotes.' : '0.00'}
            value={amount} disabled={fieldsDisabled || noPair}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <TokenSelect id="rfqSellToken" value={sellToken} options={TOKENS} label="Sell token"
            disabled={fieldsDisabled} onChange={setSellToken} />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rfqBuyToken">Buy</label>
        <TokenSelect id="rfqBuyToken" value={buyToken} options={TOKENS} label="Buy token"
          disabled={fieldsDisabled} onChange={setBuyToken} />
      </div>

      {noPair ? (
        <div className="hint">Choose a pair to see live quotes.</div>
      ) : overCap ? (
        <div className="hint is-err">Amount too large (max 10,000,000,000,000).</div>
      ) : showTrustlineNote ? (
        <div className="hint">You'll need a trustline for {buyToken.split(':')[0]} to settle this swap — makers may decline to quote without one.</div>
      ) : null}

      <div className="order__actions">
        <button type="button" id="rfqRefreshBtn" className={busyDiscovering ? 'btn btn--gold is-busy' : 'btn btn--gold'}
          disabled={!canQuote || fieldsDisabled} onClick={() => void refreshQuotes()}>
          {busyDiscovering ? <span className="btn__orb" aria-hidden="true"><span className="spin" /></span> : 'Refresh quotes'}
        </button>
      </div>

      {showMakerLine ? (
        <div className="hint rfq-indicator">{makerCount} maker{makerCount === 1 ? '' : 's'} found</div>
      ) : null}

      {retryNote ? <div className="hint">{retryNote}</div> : null}

      {showEmptyMakers ? (
        <div className="empty">
          <div>No makers registered</div>
          <div className="hint">No makers are registered for this pair yet on the registry. Try a different pair.</div>
        </div>
      ) : null}

      {showEmptyQuotes ? (
        <div className="empty">
          <div>No quotes available</div>
          <div className="hint">No registered maker responded in time. Refresh quotes to try again, or pick a different pair.</div>
        </div>
      ) : null}

      {visibleQuotes.length > 0 && !settled ? (
        <div className="rfq-quotes">
          {visibleQuotes.map((q, i) => {
            const countdown = fmtCountdown(q.order.expiry, nowSeconds);
            const expired = countdown === 'Expired';
            const label = expired ? 'Expired' : `Expires in ${countdown}`;
            return (
              <div key={q.authEntry}
                className={i === selectedIndex ? 'order rfq-row is-selected' : 'order rfq-row'}
                onClick={() => setSelectedKey(q.authEntry)}>
                <div className="legbox">
                  <div className="legbox__k">You receive</div>
                  <div className="legbox__v">{q.order.makerAmount} <span className="legbox__t">{tokenLabel(buyToken)}</span></div>
                </div>
                <div className="order__meta">
                  <span className={expired ? 'sig rfq-countdown is-expired' : 'sig rfq-countdown'}>{label}</span>
                </div>
              </div>
            );
          })}
          <div className="hint">Fee is paid by the maker — you receive the full quoted amount.</div>
          <div className="order__actions">
            <button type="button" id="rfqAcceptBtn" className={busySettling ? 'btn btn--gold is-busy' : 'btn btn--gold'}
              disabled={busySettling || visibleQuotes.length === 0} onClick={() => void accept()}>
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
