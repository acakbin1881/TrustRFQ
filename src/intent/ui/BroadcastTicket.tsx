// Broadcast ticket (spec §4.2): the maker-side "one click to every subscribed
// taker" compose form. Mirrors Ticket.tsx's look, validation order, and toast
// conventions, but the counterparty address is replaced by a pair + direction
// choice and a live subscriber count (useIntentCount). Send is balance-gated
// on the give leg against a FRESH Horizon fetch (client-side friction, not
// enforcement — spec §4.5/§5) and blocked with ZERO DB writes while nobody is
// subscribed. The signed payload contains the broadcast id, so the sequence is
// forced: insert row → compose payload from the RETURNED row → one wallet
// prompt → fan out. A rejected prompt leaves an orphan 'active' row, which the
// catch path best-effort cancels.

import { useState, type FormEvent } from 'react';
import { balanceOf, canAfford, fmtBalance } from '../../core/balances';
import type { BalanceMap } from '../../core/balances';
import { amountTooLarge, composeBroadcastPayload } from '../../core/negotiation';
import { ALL_PAIRS } from '../../core/pairs';
import { tokenLabel, validAmount } from '../../core/tokens';
import { fanOut, insertBroadcast, updateBroadcastStatus } from '../../data/broadcasts';
import { fetchIntentAddresses } from '../../data/intents';
import { useIntentCount } from '../../data/useIntentCount';
import { errMsg, useToast } from '../../ui/Toast';
import { walletSign } from '../../wallet/kit';

export interface BroadcastTicketProps {
  address: string;
  balances: BalanceMap | null;
  refreshBalances: () => Promise<BalanceMap | null>;
  /** called after a successful send (refetch broadcasts+orders, switch view) */
  onSent: () => Promise<void>;
}

const DEFAULT_PAIR = ALL_PAIRS[0];

export function BroadcastTicket({ address, balances, refreshBalances, onSent }: BroadcastTicketProps) {
  const toast = useToast();
  const [pairKeySel, setPairKeySel] = useState(DEFAULT_PAIR.key);
  // direction = which of the pair's two (canonically ordered) tokens I give
  const [giveIdx, setGiveIdx] = useState<0 | 1>(0);
  const [giveAmount, setGiveAmount] = useState('');
  const [askAmount, setAskAmount] = useState('');
  const [expValue, setExpValue] = useState('60');
  const [expUnit, setExpUnit] = useState('3600000'); // hours
  const [busy, setBusy] = useState(false);

  const pair = ALL_PAIRS.find((p) => p.key === pairKeySel) ?? DEFAULT_PAIR;
  const giveToken = pair.tokens[giveIdx];
  const askToken = pair.tokens[giveIdx === 0 ? 1 : 0];
  const { count } = useIntentCount(pair.key, address);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const give = giveAmount.trim();
    const ask = askAmount.trim();
    const v = parseInt(expValue, 10);
    const u = parseInt(expUnit, 10);

    if (!validAmount(give)) return toast('Enter a valid "give" amount (max 7 decimals).', 'err');
    if (!validAmount(ask)) return toast('Enter a valid "ask" amount (max 7 decimals).', 'err');
    if (amountTooLarge(give) || amountTooLarge(ask))
      return toast('Amount too large (max 10,000,000,000,000).', 'err');
    if (!(v > 0)) return toast('Expiry must be greater than zero.', 'err');

    setBusy(true);
    try {
      // gate on a fresh balance, never a stale map (canAfford fails closed on null)
      let fresh: BalanceMap | null;
      try {
        fresh = await refreshBalances();
      } catch {
        return toast('Could not check your balance — try again.', 'err');
      }
      if (!canAfford(fresh, giveToken, give))
        return toast(`Insufficient ${tokenLabel(giveToken)} balance for this broadcast.`, 'err');

      // the authoritative fan-out list, fetched BEFORE any DB write — an empty
      // broadcast must never leave a row behind (the live count can lag)
      const takers = await fetchIntentAddresses(pair.key, address);
      if (takers.length === 0)
        return toast('No takers are subscribed to this pair yet — nothing was sent.', 'err');

      // client-side sanity cap on fan-out (DoS friction, not enforcement);
      // real per-maker limits are deferred — spec §7 "per-maker limits —
      // decided later"
      const MAX_FANOUT = 100;
      if (takers.length > MAX_FANOUT)
        return toast(`Too many subscribed takers (${takers.length}). Fan-out is capped at ${MAX_FANOUT} for now.`, 'err');

      const row = await insertBroadcast({
        maker_address: address,
        pair_key: pair.key,
        maker_amount: give,
        maker_token: giveToken,
        taker_amount: ask,
        taker_token: askToken,
        expiration: new Date(Date.now() + v * u).toISOString(),
      });

      let sentCount: number;
      try {
        // compose from the RETURNED row (String-wrapped: PostgREST hands
        // numerics back as JS numbers) so the signed bytes match the values
        // fanOut copies onto every order row
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
        // the row exists but no fan-out rows do (e.g. the wallet prompt was
        // rejected) — best-effort cleanup of the orphan 'active' broadcast;
        // if this write fails too, the orphan just sits until it expires
        await updateBroadcastStatus(row.id, 'cancelled', { status: 'active' }).catch(() => {});
        throw err;
      }

      setGiveAmount(''); setAskAmount('');
      setPairKeySel(DEFAULT_PAIR.key); setGiveIdx(0);
      setExpValue('60'); setExpUnit('3600000');
      toast(`Broadcast signed and sent to ${sentCount} taker${sentCount === 1 ? '' : 's'}.`, 'ok');
      await onSent();
    } catch (err) {
      toast(errMsg(err, 'Could not send broadcast.'), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ticket" id="broadcastForm" autoComplete="off" onSubmit={submit}>
      <div className="ticket__head">
        <h2 className="ticket__title">Broadcast a private offer</h2>
        <p className="ticket__sub">
          Every subscribed taker receives a private, isolated copy — takers never see each other.
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="bcPair">Pair</label>
        <select id="bcPair" aria-label="Pair" value={pair.key} disabled={busy}
          onChange={(e) => { setPairKeySel(e.target.value); setGiveIdx(0); }}>
          {ALL_PAIRS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      <div className="field">
        <span className="field__label">Direction</span>
        <div className="broadcast-dir" role="radiogroup" aria-label="Which token you give">
          {([0, 1] as const).map((i) => (
            <button key={pair.tokens[i]} type="button" role="radio" aria-checked={giveIdx === i}
              className={giveIdx === i ? 'broadcast-dir__opt is-active' : 'broadcast-dir__opt'}
              disabled={busy} onClick={() => setGiveIdx(i)}>
              Give {tokenLabel(pair.tokens[i])} → get {tokenLabel(pair.tokens[i === 0 ? 1 : 0])}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="bcGive">You give</label>
        <div className="leg">
          <input type="text" id="bcGive" className="input--num" inputMode="decimal" placeholder="0.00"
            value={giveAmount} disabled={busy} onChange={(e) => setGiveAmount(e.target.value)} />
          <span className="counter-token">{tokenLabel(giveToken)}</span>
        </div>
        <div className="hint">
          Spendable: {balances ? `${fmtBalance(balanceOf(balances, giveToken))} ${tokenLabel(giveToken)}` : 'unknown'}
        </div>
      </div>

      <div className="ticket__swap" aria-hidden="true"><span>⇅</span></div>

      <div className="field">
        <label className="field__label" htmlFor="bcAsk">You ask</label>
        <div className="leg">
          <input type="text" id="bcAsk" className="input--num" inputMode="decimal" placeholder="0.00"
            value={askAmount} disabled={busy} onChange={(e) => setAskAmount(e.target.value)} />
          <span className="counter-token">{tokenLabel(askToken)}</span>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="bcExpValue">Expires in</label>
        <div className="row2">
          <input type="number" id="bcExpValue" className="input--num" min={1} step={1}
            value={expValue} disabled={busy} onChange={(e) => setExpValue(e.target.value)} />
          <select id="bcExpUnit" aria-label="Expiry unit" value={expUnit} disabled={busy}
            onChange={(e) => setExpUnit(e.target.value)}>
            <option value="60000">Minutes</option>
            <option value="3600000">Hours</option>
            <option value="86400000">Days</option>
          </select>
        </div>
        <div className="hint">Every thread of this broadcast expires with it — counters don't extend it.</div>
      </div>

      <div className="field">
        <span className="field__label">Signing as (maker)</span>
        <div className="maker-addr">{address}</div>
      </div>

      <div role="status"
        className={count === 0 ? 'broadcast-subs broadcast-subs--zero' : 'broadcast-subs'}>
        {count === null
          ? 'Checking subscriber count…'
          : count === 0
            ? 'No takers are subscribed to this pair yet — there is no one to send to.'
            : `${count} taker${count === 1 ? '' : 's'} subscribed — each will receive a private offer.`}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn--gold" disabled={busy || count === 0}>
          {busy ? 'Waiting for signature…' : 'Sign & broadcast offer'}
        </button>
        <span className="hint">You sign once — the same signed terms go to every subscribed taker.</span>
      </div>
    </form>
  );
}
