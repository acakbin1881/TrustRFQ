// The one compose form. A single field decides everything: type a counterparty
// address and the offer is DIRECTED to that wallet (one orders row, the Phase-1
// path); leave it empty and it is a BROADCAST to every taker watching the pair
// (one broadcasts row, fanned out per subscriber). Nothing else differs — the
// old broadcast form's pair select and direction radios were redundant, because
// orderPairKey derives the canonical pair key from the two legs and the
// direction IS the leg order.
//
// Both legs feed both paths, so the validation runs once, and the balance gate
// and the too-large-amount guard now cover the directed path too (the desk used
// to allow an amount that BigInt cannot parse back at settlement — an order both
// parties could sign but nobody could ever fill).

import { useState, type FormEvent } from 'react';
import { canAfford, type BalanceMap } from '../core/balances';
import { canonicalPayload } from '../core/canonical';
import { amountTooLarge, composeBroadcastPayload } from '../core/negotiation';
import { orderPairKey, pairLabel } from '../core/pairs';
import { ADDR_RE, TOKENS, tokenLabel, validAmount } from '../core/tokens';
import { fanOut, insertBroadcast, updateBroadcastStatus } from '../data/broadcasts';
import { fetchIntentAddresses } from '../data/intents';
import { insertOrder } from '../data/orders';
import { useIntentCount } from '../data/useIntentCount';
import { walletSign } from '../wallet/kit';
import { errMsg, useToast } from './Toast';

const DEFAULT_MAKER_TOKEN = 'XLM';
const DEFAULT_TAKER_TOKEN = TOKENS[1].value; // USDC

// Client-side sanity cap on fan-out (DoS friction, not enforcement); real
// per-maker limits are deferred.
const MAX_FANOUT = 100;

interface TicketProps {
  /** null while disconnected — the ticket stays mounted (hidden) so drafts survive */
  address: string | null;
  /** send gates on a FRESH fetch, never a cached map — the topbar strip shows the standing balance */
  refreshBalances: () => Promise<BalanceMap | null>;
  /** called after a successful send (reload lists + switch section) */
  onSent: () => Promise<void>;
}

export function Ticket({ address, refreshBalances, onSent }: TicketProps) {
  const toast = useToast();
  const [makerAmount, setMakerAmount] = useState('');
  const [takerAmount, setTakerAmount] = useState('');
  const [makerToken, setMakerToken] = useState(DEFAULT_MAKER_TOKEN);
  const [takerToken, setTakerToken] = useState(DEFAULT_TAKER_TOKEN);
  const [takerAddress, setTakerAddress] = useState('');
  const [expValue, setExpValue] = useState('60');
  const [expUnit, setExpUnit] = useState('3600000'); // hours
  const [busy, setBusy] = useState(false);

  // THE discriminator. Everything below reads off these two.
  const directed = takerAddress.trim().length > 0;
  const pairKey = orderPairKey({ maker_token: makerToken, taker_token: takerToken });
  // Both selects are populated from TOKENS, so "unknown token" is unreachable
  // here — a null pair key can only mean the two legs are the same token.
  const sameToken = pairKey === null;

  // Subscriber count, only while it means something. The `address &&` guard is
  // load-bearing: this form stays MOUNTED while disconnected so drafts survive,
  // and without it the page would hold an `intents` realtime channel open with
  // no wallet — something no other hook in the app does.
  const { count } = useIntentCount(address && !directed ? pairKey : null, address ?? undefined);

  // The `!directed &&` guards are explicit rather than leaning on `count`
  // happening to be null in directed mode: on the first keystroke into the
  // address box, `directed` flips during render while useIntentCount's effect
  // has not yet reset `count`, so a stale `count === 0` would disable the button
  // for one frame. `count === null` (still loading) must NOT disable.
  const disabled = busy || (!directed && sameToken) || (!directed && count === 0);

  function reset() {
    setMakerAmount(''); setTakerAmount(''); setTakerAddress('');
    setMakerToken(DEFAULT_MAKER_TOKEN); setTakerToken(DEFAULT_TAKER_TOKEN);
    setExpValue('60'); setExpUnit('3600000');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!address) return; // unreachable while hidden; guards the type

    const maker_amount = makerAmount.trim();
    const taker_amount = takerAmount.trim();
    const taker_address = takerAddress.trim();
    const v = parseInt(expValue, 10);
    const u = parseInt(expUnit, 10);

    // ---- sync phase: no writes, no network -------------------------------
    if (!validAmount(maker_amount)) return toast('Enter a valid "send" amount (max 7 decimals).', 'err');
    if (!validAmount(taker_amount)) return toast('Enter a valid "receive" amount (max 7 decimals).', 'err');
    if (amountTooLarge(maker_amount) || amountTooLarge(taker_amount))
      return toast('Amount too large (max 10,000,000,000,000).', 'err');
    if (directed && !ADDR_RE.test(taker_address))
      return toast('Counterparty address is not a valid Stellar address.', 'err');
    if (directed && taker_address === address)
      return toast('Counterparty cannot be your own address.', 'err');
    if (!directed && sameToken)
      return toast('A broadcast needs two different tokens — pick a different token, or enter a counterparty address to send this as a directed offer.', 'err');
    if (!(v > 0)) return toast('Expiry must be greater than zero.', 'err');

    const expiration = new Date(Date.now() + v * u).toISOString();

    setBusy(true);
    try {
      // Gate on a FRESH balance, never a stale map (canAfford fails closed on
      // null). This now covers the directed path too: a maker proposing terms
      // they cannot honor burns the TAKER's signature and fee when the SAC
      // transfer reverts at settlement — identical in both modes.
      let fresh: BalanceMap | null;
      try {
        fresh = await refreshBalances();
      } catch {
        return toast('Could not check your balance — try again.', 'err');
      }
      if (!canAfford(fresh, makerToken, maker_amount))
        return toast(`Insufficient ${tokenLabel(makerToken)} balance for this ${directed ? 'order' : 'broadcast'}.`, 'err');

      if (directed) {
        // ---- directed: one orders row, unchanged Phase-1 path -------------
        const order = {
          maker_address: address,
          maker_amount, maker_token: makerToken,
          taker_address, taker_amount, taker_token: takerToken,
          expiration,
          nonce: crypto.randomUUID(),
        };
        const signed_payload = canonicalPayload(order);
        const signature = await walletSign(signed_payload, address);
        await insertOrder({ ...order, signature, signed_payload, status: 'pending' });
        toast('Order signed and sent.', 'ok');
      } else {
        // ---- broadcast: one broadcasts row, fanned out per subscriber -----
        // pairKey cannot be null here (the sync guard returned) — narrow for the
        // type checker, and keep it as one more layer for a future refactor.
        if (!pairKey) return;

        // The authoritative fan-out list, fetched BEFORE any DB write: an empty
        // broadcast must never leave a row behind (the live count can lag).
        const takers = await fetchIntentAddresses(pairKey, address);
        if (takers.length === 0)
          return toast('No takers are subscribed to this pair yet — nothing was sent.', 'err');
        if (takers.length > MAX_FANOUT)
          return toast(`Too many subscribed takers (${takers.length}). Fan-out is capped at ${MAX_FANOUT} for now.`, 'err');

        const row = await insertBroadcast({
          maker_address: address,
          pair_key: pairKey,
          maker_amount, maker_token: makerToken,
          taker_amount, taker_token: takerToken,
          expiration,
        });

        let sentCount: number;
        try {
          // Compose from the RETURNED row (String-wrapped: PostgREST hands
          // numerics back as JS numbers) so the signed bytes match the values
          // fanOut copies onto every order row.
          const payload = composeBroadcastPayload({
            broadcast_id: row.id,
            maker_address: row.maker_address,
            pair_key: row.pair_key,
            maker_amount: String(row.maker_amount),
            maker_token: row.maker_token,
            taker_amount: String(row.taker_amount),
            taker_token: row.taker_token,
            expiration: row.expiration,
          });
          const signature = await walletSign(payload, address);
          sentCount = await fanOut(row, takers, payload, signature);
        } catch (err) {
          // The row exists but no fan-out rows do (e.g. the wallet prompt was
          // rejected) — best-effort cleanup of the orphan 'active' broadcast;
          // if this write fails too, the orphan just sits until it expires.
          await updateBroadcastStatus(row.id, 'cancelled', { status: 'active' }).catch(() => {});
          throw err;
        }
        toast(`Broadcast signed and sent to ${sentCount} taker${sentCount === 1 ? '' : 's'}.`, 'ok');
      }

      reset();
      await onSent();
    } catch (err) {
      toast(errMsg(err, directed ? 'Could not send order.' : 'Could not send broadcast.'), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ticket ticket--swap" id="orderForm" autoComplete="off" onSubmit={submit}>
      <div className="ticket__head">
        <h2 className="ticket__title">New offer</h2>
        <p className="ticket__sub">
          Name a counterparty and the offer goes to them alone; leave the address empty and it goes to
          every taker watching the pair. Either way your wallet signs the terms — what you sign is
          exactly what settles.
        </p>
      </div>

      {/* The two legs are the reference's white cards; the swap orb sits in a
          scalloped notch between them (mask CSS on field--card-top/-bottom).
          Each card sits in a .ticket__card-shadow wrapper: the mask clips
          everything its own element paints INCLUDING shadows, so the
          drop-shadow must live one level up to survive (and trace the notch).
          Nothing may change these cards' HEIGHT without moving the notch —
          that is why no per-leg balance hint lives here (the topbar's
          BalanceStrip is the one source of truth). Select comes before the
          input so the visual order (chip left, amount right) matches tab order. */}
      <div className="ticket__card-shadow">
        <div className="field field--card field--card-top">
          <label className="field__label" htmlFor="makerAmount">You send</label>
          <div className="leg">
            <select id="makerToken" aria-label="Token you send" disabled={busy}
              value={makerToken} onChange={(e) => setMakerToken(e.target.value)}>
              {TOKENS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="text" id="makerAmount" className="input--num" inputMode="decimal" placeholder="0.00"
              value={makerAmount} disabled={busy} onChange={(e) => setMakerAmount(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="ticket__swap" aria-hidden="true"><span>⇅</span></div>

      <div className="ticket__card-shadow">
      <div className="field field--card field--card-bottom">
        <label className="field__label" htmlFor="takerAmount">You receive</label>
        <div className="leg">
          <select id="takerToken" aria-label="Token you receive" disabled={busy}
            value={takerToken} onChange={(e) => setTakerToken(e.target.value)}>
            {TOKENS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="text" id="takerAmount" className="input--num" inputMode="decimal" placeholder="0.00"
            value={takerAmount} disabled={busy} onChange={(e) => setTakerAmount(e.target.value)} />
        </div>

        {/* the rest of the terms live INSIDE the notched card unit (user
            decision 2026-07-12): a quiet hairline section, not a fourth card */}
        <div className="field--details">
          <div className="field">
            <label className="field__label" htmlFor="takerAddress">Counterparty wallet address (optional)</label>
            <input type="text" id="takerAddress" className="input--addr" placeholder="G…" spellCheck={false}
              value={takerAddress} disabled={busy} onChange={(e) => setTakerAddress(e.target.value)} />
            <div className="hint">
              {directed
                ? 'This offer goes only to this wallet.'
                : sameToken
                  ? 'Leave empty to broadcast — pick two different tokens first.'
                  : `Leave empty to broadcast to every taker watching ${pairLabel(pairKey)}.`}
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="expValue">Expires in</label>
            <div className="row2">
              <input type="number" id="expValue" className="input--num" min={1} step={1}
                value={expValue} disabled={busy} onChange={(e) => setExpValue(e.target.value)} />
              <select id="expUnit" aria-label="Expiry unit" disabled={busy}
                value={expUnit} onChange={(e) => setExpUnit(e.target.value)}>
                <option value="60000">Minutes</option>
                <option value="3600000">Hours</option>
                <option value="86400000">Days</option>
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Signing as (maker)</span>
            <div className="maker-addr" id="makerAddrBox">{address ?? '—'}</div>
          </div>
        </div>
      </div>
      </div>

      {/* Broadcast mode only: in directed mode "N takers subscribed" would be a
          statistic about the people who will NOT receive this offer. */}
      {!directed ? (
        <div role="status"
          className={sameToken || count === 0 ? 'broadcast-subs broadcast-subs--zero' : 'broadcast-subs'}>
          {sameToken
            ? 'A broadcast needs two different tokens. Pick a different token, or enter a counterparty address to send this as a directed offer.'
            : count === null
              ? 'Checking subscriber count…'
              : count === 0
                ? 'No takers are subscribed to this pair yet — there is no one to send to.'
                : `${count} taker${count === 1 ? '' : 's'} subscribed — each will receive a private offer.`}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="btn btn--gold" id="sendBtn" disabled={disabled}>
          <span className="btn__orb" aria-hidden="true">✓</span>
          {busy ? 'Waiting for signature…' : directed ? 'Sign & send order' : 'Sign & broadcast offer'}
          <span className="btn__chevs" aria-hidden="true">›››</span>
        </button>
        <span className="hint" id="formHint">
          {directed
            ? "You'll be asked to sign the order in your wallet."
            : 'You sign once — the same signed terms go to every subscribed taker.'}
        </span>
      </div>
    </form>
  );
}
