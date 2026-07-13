// Pairs panel (spec §4.1): the taker's manual pair-interest toggles. One row
// per allow-listed pair; toggle on = discoverable for private offers on that
// pair (both directions), toggle off = row deleted. Load/toggle failures are
// toasted by useIntents through onError.

import { useCallback } from 'react';
import { ALL_PAIRS } from '../core/pairs';
import { useIntents } from '../data/useIntents';
import { useToast } from './Toast';

export interface PairsPanelProps {
  address: string;
}

export function PairsPanel({ address }: PairsPanelProps) {
  const toast = useToast();
  const onError = useCallback((m: string) => toast(m, 'err'), [toast]);
  const { has, toggle, busyKey } = useIntents(address, onError);

  return (
    <section className="pairs-panel">
      <div className="pairs-panel__head">
        <h2 className="pairs-panel__title">Pairs you're watching</h2>
        <p className="pairs-panel__sub">
          Toggle a pair on to become discoverable — makers can send you private offers on it, in both directions.
        </p>
      </div>
      {ALL_PAIRS.map((p) => {
        const on = has(p.key);
        return (
          <div key={p.key} className="pairs-row">
            <span className="pairs-row__label">{p.label}</span>
            <button type="button" role="switch" aria-checked={on}
              aria-label={`Discoverable for ${p.label}`}
              className={on ? 'pairs-toggle is-on' : 'pairs-toggle'}
              disabled={busyKey === p.key}
              onClick={() => void toggle(p.key)}>
              <span className="pairs-toggle__thumb" />
            </button>
          </div>
        );
      })}
    </section>
  );
}
