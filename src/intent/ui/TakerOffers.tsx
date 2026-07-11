// Taker-side list of private offers (fan-out orders carrying a broadcast_id).
// `offers` arrives pre-filtered by the page shell; each card is a compact
// summary row that expands into the shared ThreadView — one thread open at a
// time keeps the per-thread rounds realtime channels lean.

import { useState } from 'react';
import type { BalanceMap } from '../../core/balances';
import { orderPairKey, pairLabel } from '../../core/pairs';
import { fmtRemaining, isExpired, trunc } from '../../core/tokens';
import type { Order } from '../../core/types';
import { TokenBadge } from '../../ui/TokenBadge';
import { ThreadStatusBadge, ThreadView } from './ThreadView';

export interface TakerOffersProps {
  address: string;
  offers: Order[];
  now: number;
  balances: BalanceMap | null;
  refreshBalances: () => Promise<BalanceMap | null>;
  onChanged: () => Promise<void>;
}

export function TakerOffers({ address, offers, now, balances, refreshBalances, onChanged }: TakerOffersProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (offers.length === 0) {
    return <div className="empty">No private offers yet — toggle a pair below to be discoverable.</div>;
  }

  return (
    <div className="intent-offers">
      {offers.map((o) => {
        const expanded = selectedId === o.id;
        const pk = orderPairKey(o);
        const open = o.status === 'pending' || o.status === 'countered';
        return (
          <div key={o.id} className="order thread-card">
            <button type="button" className="thread-card__toggle" aria-expanded={expanded}
              onClick={() => setSelectedId(expanded ? null : o.id)}>
              <span className="thread-card__pair">
                {pk ? pairLabel(pk) : <><TokenBadge value={o.maker_token} /> / <TokenBadge value={o.taker_token} /></>}
              </span>
              <span className="thread-card__party">from <b>{trunc(o.maker_address)}</b></span>
              <ThreadStatusBadge order={o} now={now} />
              {open ? (
                <span className="thread-card__expiry">
                  {isExpired(o, now) ? 'Expired' : `Expires in ${fmtRemaining(o.expiration, now)}`}
                </span>
              ) : null}
              <span className="thread-card__chev" aria-hidden="true">▾</span>
            </button>
            {expanded ? (
              <ThreadView order={o} side="taker" address={address} balances={balances}
                refreshBalances={refreshBalances} now={now} onChanged={onChanged} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
