// The RFQ desk panel: the fourth section. A minimal reference surface over
// the SDK-shaped taker core in @trustrfq/sdk and the desk's binding in
// src/data/rfq.ts: this component only orchestrates state and composes
// existing primitives (TokenSelect, Toast, the .order/.legbox/.settle/
// .stepper design-system classes), no new persistence, no new wallet flow
// shape.
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

import { useCallback, useMemo, useRef, useState } from 'react';
import { EXPLORER, PASSPHRASE } from '../config';
import type { BalanceMap } from '../core/balances';
import { amountTooLarge } from '../core/negotiation';
import { TOKENS, tokenLabel, trunc, validAmount } from '../core/tokens';
import { discoverMakerUrls, fanOutMakerSideOrder, readMakerConfig, rfqClient, settleQuote } from '../data/rfq';
import {
  bestQuote,
  dropExpired,
  ensureTrustline,
  fmtCountdown,
  needsTrustline,
  quotePrice,
  rankQuotes,
  retryDecision,
  sacIdFor,
  type MakerSideOrderResult,
  type RfqOrder,
  type RfqWalletSigner,
  type SwapExecutedEvent,
} from '@trustrfq/sdk';
import { ArrowRight, Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { TokenUSDC, TokenXLM } from '@web3icons/react';
import { kit } from '../wallet/kit';
import { errMsg, useToast } from './Toast';
import { useNow } from './useNow';

interface RfqPanelProps {
  address: string;
  balances: BalanceMap | null;
}

type Phase = 'idle' | 'discovering' | 'quoting' | 'quoted' | 'empty-makers' | 'empty-quotes' | 'settling' | 'settled';

const MAX_VISIBLE_ROWS = 6;

const signerFor = (address: string): RfqWalletSigner => ({
  address,
  signTransaction: (xdr, opts) => kit.signTransaction(xdr, opts),
});

/**
 * Fetch exactly one fresh quote from the SAME maker whose entry just failed,
 * never a full re-fan-out to every discovered maker (that would be a second
 * uninvited network burst on a path the taker did not ask to refresh). The
 * maker's own URL is looked up by their address via `readMakerConfig` (the
 * registry's `get_maker` read); the re-quote itself still goes through
 * `fanOutMakerSideOrder`'s validation gate: a retry never trusts an
 * unvalidated re-quote either. Every field (token pair, amount) is read off
 * the FAILED order itself rather than live component state, so the re-quote
 * is for the exact trade the taker actually agreed to. Returns null (never
 * throws) on any failure; that is retryDecision's own "no fresh quote" stop
 * condition, not a crash.
 */
async function fetchOneFreshQuote(order: RfqOrder, takerWallet: string): Promise<MakerSideOrderResult | null> {
  try {
    const makerConfig = await readMakerConfig(order.maker);
    const { accepted } = await fanOutMakerSideOrder([makerConfig.url], {
      network: PASSPHRASE,
      swapContract: rfqClient.swapContractId,
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

/** A note under a field: quiet by default, red when it is a refusal. */
function Note({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'quiet' | 'bad' }) {
  return (
    <p className={`mt-4 font-grotesk text-[13px] leading-relaxed
      ${tone === 'bad' ? 'text-bad' : 'text-slate'}`}>
      {children}
    </p>
  );
}

/** The quotes column with nothing in it. Says what would put something there,
 *  because an empty panel that only says "empty" makes the reader guess
 *  whether they did something wrong. */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5 rounded-well border border-dashed border-carbon-line
      bg-carbon-deep/30 px-5 py-8 text-center">
      <div className="font-grotesk text-[15px] font-medium text-ash">{title}</div>
      <p className="mx-auto mt-2 max-w-xs font-grotesk text-[13px] leading-relaxed text-slate">
        {body}
      </p>
    </div>
  );
}

/**
 * The token control, drawn against the carbon palette.
 *
 * Local rather than src/ui/TokenSelect.tsx: that one is shared with RfqDemo,
 * which ships the old stylesheet on purpose, so restyling it in place would
 * repaint a deploy this branch does not own.
 *
 * It stays a real <select>. A custom listbox here would have to re-earn
 * keyboard handling, type-ahead and the platform's own touch picker, and the
 * only thing it would buy is styled option rows in a two-item list.
 */
function TokenPicker({ id, value, label, disabled, onChange }: {
  id: string; value: string; label: string; disabled: boolean; onChange: (v: string) => void;
}) {
  const code = tokenLabel(value);
  const Mark = code === 'USDC' ? TokenUSDC : TokenXLM;

  return (
    <span className="relative flex shrink-0 items-center">
      <span className="pointer-events-none absolute left-3 flex size-5 items-center
        justify-center rounded-full bg-carbon-deep">
        <Mark size={12} variant="mono" className={code === 'USDC' ? 'text-lime' : 'text-snow'} />
      </span>

      <select id={id} aria-label={label} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-pill border border-carbon-line bg-carbon-card py-2.5
          pl-10 pr-9 font-grotesk text-[14px] font-medium text-snow outline-none transition-colors
          duration-500 ease-glide hover:border-lime/25 focus-visible:border-lime/40
          disabled:cursor-not-allowed disabled:opacity-50">
        {TOKENS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      <ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-slate"
        strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
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
      // keeps its own ensureTrustline front-step too (the SDK's settle.ts,
      // unchanged): a harmless no-op in the normal case, and a fail-safe if
      // this step is ever bypassed.
      if (needsTrustline(balances, buyToken)) {
        await ensureTrustline(rfqClient, buyToken, signerFor(address));
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
        swapContract: rfqClient.swapContractId,
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
          const result = await settleQuote(attemptQuote.order, attemptQuote.authEntry, signer);
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* LEFT: what you are asking for. RIGHT: what came back. The panel used
          to be one narrow column with the quotes stacked under the form, which
          pushed the answer below the fold the moment more than two makers
          replied. Side by side, the request stays on screen while the quotes
          arrive — and that is the thing you are comparing them against. */}
      <section className="rounded-card border border-carbon-line bg-carbon-card/50 p-6">
        <h2 className="font-grotesk text-[15px] font-medium text-snow">Request a quote</h2>
        <p className="mt-1.5 font-grotesk text-[13px] text-slate">
          Firm, signed, and yours to accept or leave.
        </p>

        <label htmlFor="rfqAmount" className="mt-7 block font-grotesk text-[12px]
          uppercase tracking-[0.14em] text-slate">You sell</label>
        <div className="mt-2.5 flex items-center gap-2 rounded-well border border-carbon-line
          bg-carbon-deep/70 p-2 focus-within:border-lime/30 transition-colors duration-500 ease-glide">
          <input type="text" id="rfqAmount" inputMode="decimal"
            placeholder={noPair ? 'Choose a pair' : '0.00'}
            value={amount} disabled={fieldsDisabled || noPair}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            /* the ! is load-bearing: public/styles.css styles `input[type="text"]`
               by attribute, which outranks a plain utility class, and without
               it this field renders on the old theme's pale fill */
            className="min-w-0 flex-1 !border-0 !bg-transparent px-3 py-2 font-grotesk
              text-[22px] tabular-nums !text-snow outline-none placeholder:text-slate/60
              disabled:cursor-not-allowed disabled:opacity-50" />
          <TokenPicker id="rfqSellToken" value={sellToken} label="Sell token"
            disabled={fieldsDisabled} onChange={setSellToken} />
        </div>

        <label htmlFor="rfqBuyToken" className="mt-6 block font-grotesk text-[12px]
          uppercase tracking-[0.14em] text-slate">You buy</label>
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-well border
          border-carbon-line bg-carbon-deep/70 p-2">
          <span className="px-3 py-2 font-grotesk text-[15px] text-slate">
            Quoted by the maker
          </span>
          <TokenPicker id="rfqBuyToken" value={buyToken} label="Buy token"
            disabled={fieldsDisabled} onChange={setBuyToken} />
        </div>

        {noPair ? (
          <Note>Choose a pair to see live quotes.</Note>
        ) : overCap ? (
          <Note tone="bad">Amount too large (max 10,000,000,000,000).</Note>
        ) : showTrustlineNote ? (
          <Note>
            You&apos;ll need a trustline for {buyToken.split(':')[0]} to settle this swap —
            makers may decline to quote without one.
          </Note>
        ) : null}

        <button type="button" id="rfqRefreshBtn"
          disabled={!canQuote || fieldsDisabled} onClick={() => void refreshQuotes()}
          className="group mt-7 flex w-full items-center justify-center gap-2.5 rounded-well
            bg-lime py-3.5 font-grotesk text-[15px] font-semibold text-carbon transition-colors
            duration-500 ease-glide hover:bg-lime-soft disabled:cursor-not-allowed
            disabled:bg-carbon-hi disabled:text-slate">
          {busyDiscovering ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden="true" />
              Requesting quotes…
            </>
          ) : (
            <>
              Refresh quotes
              <ArrowRight className="size-4 transition-transform duration-500 ease-glide
                group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
            </>
          )}
        </button>

        {showMakerLine ? (
          <div className="mt-4 flex items-center gap-2 font-grotesk text-[13px] text-slate">
            <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
            {makerCount} maker{makerCount === 1 ? '' : 's'} found
          </div>
        ) : null}
      </section>

      <section className="rounded-card border border-carbon-line bg-carbon-card/50 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-grotesk text-[15px] font-medium text-snow">Quotes</h2>
          {visibleQuotes.length > 0 && !settled ? (
            <span className="font-grotesk text-[12px] uppercase tracking-[0.14em] text-slate">
              Ranked by price
            </span>
          ) : null}
        </div>

        {retryNote ? <Note>{retryNote}</Note> : null}

        {showEmptyMakers ? (
          <Empty title="No makers registered"
            body="No makers are registered for this pair yet on the registry. Try a different pair." />
        ) : null}

        {showEmptyQuotes ? (
          <Empty title="No quotes available"
            body="No registered maker responded in time. Refresh quotes to try again, or pick a different pair." />
        ) : null}

        {visibleQuotes.length === 0 && !settled && !showEmptyMakers && !showEmptyQuotes ? (
          <Empty title="Nothing quoted yet"
            body="Set an amount and request quotes. Every quote you see here is signed by its maker and settles exactly as shown." />
        ) : null}

        {visibleQuotes.length > 0 && !settled ? (
          <>
            <div className="mt-5 flex flex-col gap-2">
              {visibleQuotes.map((q, i) => {
                const countdown = fmtCountdown(q.order.expiry, nowSeconds);
                const expired = countdown === 'Expired';
                const chosen = i === selectedIndex;
                return (
                  <button type="button" key={q.authEntry} onClick={() => setSelectedKey(q.authEntry)}
                    aria-pressed={chosen}
                    className={`flex items-center justify-between gap-4 rounded-well border p-4
                      text-left transition-colors duration-500 ease-glide
                      ${chosen
                        ? 'border-lime/35 bg-carbon-deep'
                        : 'border-carbon-line bg-carbon-deep/40 hover:bg-carbon-deep/70'}`}>
                    <span>
                      <span className="block font-grotesk text-[12px] uppercase
                        tracking-[0.14em] text-slate">You receive</span>
                      <span className="mt-1.5 block font-grotesk text-[20px] font-medium
                        tabular-nums text-snow">
                        {q.order.makerAmount}
                        <span className="ml-2 text-[14px] text-ash">{tokenLabel(buyToken)}</span>
                      </span>
                    </span>

                    <span className="flex items-center gap-2.5">
                      <span className={`font-grotesk text-[12px] tabular-nums
                        ${expired ? 'text-bad' : 'text-slate'}`}>
                        {expired ? 'Expired' : countdown}
                      </span>
                      <span className={`flex size-5 items-center justify-center rounded-full border
                        transition-colors duration-500 ease-glide
                        ${chosen ? 'border-lime bg-lime text-carbon' : 'border-carbon-line text-transparent'}`}>
                        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 font-grotesk text-[13px] text-slate">
              Fee is paid by the maker — you receive the full quoted amount.
            </p>

            <button type="button" id="rfqAcceptBtn"
              disabled={busySettling || visibleQuotes.length === 0} onClick={() => void accept()}
              className="group mt-5 flex w-full items-center justify-center gap-2.5 rounded-well
                bg-lime py-3.5 font-grotesk text-[15px] font-semibold text-carbon transition-colors
                duration-500 ease-glide hover:bg-lime-soft disabled:cursor-not-allowed
                disabled:bg-carbon-hi disabled:text-slate">
              {busySettling ? (
                <>
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                  Settling…
                </>
              ) : (
                <>
                  Accept quote
                  <ArrowRight className="size-4 transition-transform duration-500 ease-glide
                    group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
                </>
              )}
            </button>

            {settleErr ? <Note tone="bad">{settleErr}</Note> : null}
          </>
        ) : null}

        {settled ? (
          <div className="mt-5 rounded-well border border-lime/25 bg-carbon-deep/60 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-lime
                text-carbon">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="font-grotesk text-[15px] font-medium text-snow">
                Settled on-chain
              </span>
            </div>

            <a href={`${EXPLORER}/tx/${settled.hash}`} target="_blank" rel="noopener noreferrer"
              className="group mt-4 inline-flex items-center gap-2 font-mono text-[13px] text-ash
                transition-colors duration-500 ease-glide hover:text-lime">
              {trunc(settled.hash)}
              <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </a>

            {!settled.event ? (
              <Note tone="bad">Settled, but the SwapExecuted event could not be confirmed.</Note>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
