// New-RFQ ticket. Controlled port of the otc.html form + otc.js submitOrder:
// same ids, classes, validation order, and toast copy. The maker signs
// canonicalPayload(order) via the wallet, and the signed payload + signature
// are stored with the row.

import { useState, type FormEvent } from 'react';
import { canonicalPayload } from '../core/canonical';
import { ADDR_RE, TOKENS, validAmount } from '../core/tokens';
import { insertOrder } from '../data/orders';
import { walletSign } from '../wallet/kit';
import { errMsg, useToast } from './Toast';

const DEFAULT_MAKER_TOKEN = 'XLM';
const DEFAULT_TAKER_TOKEN = TOKENS[1].value; // USDC

interface TicketProps {
  /** null while disconnected — the ticket stays mounted (hidden) so drafts survive */
  address: string | null;
  /** called after a successful send (reload sent list + switch tab) */
  onSent: () => Promise<void>;
}

export function Ticket({ address, onSent }: TicketProps) {
  const toast = useToast();
  const [makerAmount, setMakerAmount] = useState('');
  const [takerAmount, setTakerAmount] = useState('');
  const [makerToken, setMakerToken] = useState(DEFAULT_MAKER_TOKEN);
  const [takerToken, setTakerToken] = useState(DEFAULT_TAKER_TOKEN);
  const [takerAddress, setTakerAddress] = useState('');
  const [expValue, setExpValue] = useState('60');
  const [expUnit, setExpUnit] = useState('3600000'); // hours
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!address) return; // unreachable while hidden; guards the type
    const maker_amount = makerAmount.trim();
    const taker_amount = takerAmount.trim();
    const taker_address = takerAddress.trim();
    const v = parseInt(expValue, 10);
    const u = parseInt(expUnit, 10);

    if (!validAmount(maker_amount)) return toast('Enter a valid "send" amount (max 7 decimals).', 'err');
    if (!validAmount(taker_amount)) return toast('Enter a valid "receive" amount (max 7 decimals).', 'err');
    if (!ADDR_RE.test(taker_address)) return toast('Counterparty address is not a valid Stellar address.', 'err');
    if (taker_address === address) return toast('Counterparty cannot be your own address.', 'err');
    if (!(v > 0)) return toast('Expiry must be greater than zero.', 'err');

    const order = {
      maker_address: address,
      maker_amount, maker_token: makerToken,
      taker_address, taker_amount, taker_token: takerToken,
      expiration: new Date(Date.now() + v * u).toISOString(),
      nonce: crypto.randomUUID(),
    };

    setBusy(true);
    try {
      const signed_payload = canonicalPayload(order);
      const signature = await walletSign(signed_payload, address);
      await insertOrder({ ...order, signature, signed_payload, status: 'pending' });

      setMakerAmount(''); setTakerAmount(''); setTakerAddress('');
      setMakerToken(DEFAULT_MAKER_TOKEN); setTakerToken(DEFAULT_TAKER_TOKEN);
      setExpValue('60'); setExpUnit('3600000');
      toast('Order signed and sent.', 'ok');
      await onSent();
    } catch (err) {
      toast(errMsg(err, 'Could not send order.'), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ticket" id="orderForm" autoComplete="off" onSubmit={submit}>
      <div className="ticket__head">
        <h2 className="ticket__title">New RFQ ticket</h2>
        <p className="ticket__sub">Terms are signed by your wallet — what you sign is exactly what settles.</p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="makerAmount">You send</label>
        <div className="leg">
          <input type="text" id="makerAmount" className="input--num" inputMode="decimal" placeholder="0.00"
            value={makerAmount} onChange={(e) => setMakerAmount(e.target.value)} />
          <select id="makerToken" aria-label="Token you send"
            value={makerToken} onChange={(e) => setMakerToken(e.target.value)}>
            {TOKENS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="ticket__swap" aria-hidden="true"><span>⇅</span></div>

      <div className="field">
        <label className="field__label" htmlFor="takerAmount">You receive</label>
        <div className="leg">
          <input type="text" id="takerAmount" className="input--num" inputMode="decimal" placeholder="0.00"
            value={takerAmount} onChange={(e) => setTakerAmount(e.target.value)} />
          <select id="takerToken" aria-label="Token you receive"
            value={takerToken} onChange={(e) => setTakerToken(e.target.value)}>
            {TOKENS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="takerAddress">Counterparty wallet address</label>
        <input type="text" id="takerAddress" className="input--addr" placeholder="G…" spellCheck={false}
          value={takerAddress} onChange={(e) => setTakerAddress(e.target.value)} />
        <div className="hint">The taker who has agreed to this trade off-platform.</div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="expValue">Expires in</label>
        <div className="row2">
          <input type="number" id="expValue" className="input--num" min={1} step={1}
            value={expValue} onChange={(e) => setExpValue(e.target.value)} />
          <select id="expUnit" aria-label="Expiry unit"
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

      <div className="form-actions">
        <button type="submit" className="btn btn--gold" id="sendBtn" disabled={busy}>
          {busy ? 'Waiting for signature…' : 'Sign & send order'}
        </button>
        <span className="hint" id="formHint">You'll be asked to sign the order in your wallet.</span>
      </div>
    </form>
  );
}
