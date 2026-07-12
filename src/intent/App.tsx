// The intent-layer shell: topbar (+ balance strip) + wallet gate + two tabs
// (private offers / broadcast). Mirrors src/App.tsx: same provider nesting,
// same .tabs/.tab/.panel + .is-active pattern, panels stay MOUNTED and are
// visibility-toggled so a broadcast draft and the settled-banner dismissals
// survive tab switches. The shell owns every data subscription (orders,
// broadcasts, balances) and hands pre-filtered props down — the intent
// components never subscribe to lists themselves.

import { useCallback, useState } from 'react';
import { isExpired, trunc } from '../core/tokens';
import { useBalances } from '../data/useBalances';
import { useBroadcasts } from '../data/useBroadcasts';
import { useOrders } from '../data/useOrders';
import { useWallet, WalletProvider } from '../wallet/WalletContext';
import { Gate } from '../ui/Gate';
import { errMsg, ToastProvider, useToast } from '../ui/Toast';
import { useNow } from '../ui/useNow';
import { BalanceStrip } from './ui/BalanceStrip';
import { BroadcastList } from './ui/BroadcastList';
import { BroadcastTicket } from './ui/BroadcastTicket';
import { PairsPanel } from './ui/PairsPanel';
import { TakerOffers } from './ui/TakerOffers';
import type { BalanceMap } from '../core/balances';

type TabName = 'offers' | 'broadcast';

// Duplicated from src/App.tsx's Topbar (plus the Desk link and balance strip)
// the same way otc.html and hero.html deliberately duplicate their shared
// shell — an accepted non-change from the migration spec's "deliberate
// non-changes": two small copies beat a premature shared-shell abstraction.
function Topbar({ address, balances, funded, loading, onDisconnect }: {
  address: string | null;
  balances: BalanceMap | null;
  funded: boolean;
  loading: boolean;
  onDisconnect: () => void;
}) {
  return (
    <header className="topbar">
      <a className="brand" href="hero.html">
        <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path d="M20 21 C26 13.5, 38 13.5, 44 21" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M44 43 C38 50.5, 26 50.5, 20 43" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="15" cy="32" r="8" fill="currentColor" />
          <circle cx="49" cy="32" r="8" stroke="currentColor" strokeWidth="4" />
        </svg>
        TrustRFQ
      </a>
      <span className="net-pill">Testnet</span>
      <a className="btn btn--ghost btn--sm topbar__desk-link" href="otc.html">Desk</a>
      <div className="topbar__right">
        {address ? <BalanceStrip balances={balances} funded={funded} loading={loading} /> : null}
        <div className="wallet-chip" id="walletChip">
          {address ? (
            <>
              <span className="wallet-chip__addr"><span className="wallet-chip__dot" />{trunc(address)}</span>
              <button className="btn btn--ghost btn--sm" id="disconnectBtn" onClick={onDisconnect}>Disconnect</button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function IntentPage() {
  const { address, connect, disconnect } = useWallet();
  const toast = useToast();
  const onError = useCallback((m: string) => toast(m, 'err'), [toast]);

  // The shell owns ALL subscriptions; components get pre-filtered props.
  const { incoming, sent, refresh } = useOrders(address, onError);
  const { broadcasts, refresh: refreshBroadcasts } = useBroadcasts(address, onError);
  // ONE shared balances instance feeds the strip, the ticket, and both lists.
  const { balances, funded, loading, refresh: refreshBalances } = useBalances(address);
  const now = useNow(60000);
  const [tab, setTab] = useState<TabName>('offers');

  // fan-out rows only — direct Phase-1 orders stay on the desk
  const offers = incoming.filter((o) => o.broadcast_id);
  const broadcastOrders = sent.filter((o) => o.broadcast_id);

  const openOffers = offers.filter(
    (o) => (o.status === 'pending' || o.status === 'countered') && !isExpired(o, now),
  ).length;
  const activeBroadcasts = broadcasts.filter(
    (b) => b.status === 'active' && !isExpired(b, now),
  ).length;

  const handleConnect = async () => {
    try {
      await connect();
    } catch (e) {
      toast(errMsg(e, 'Wallet connection cancelled.'), 'err');
    }
  };

  // any thread/broadcast change → refetch both sides (also drives the
  // settlement refresh inside ThreadView)
  const onChanged = useCallback(async () => {
    await Promise.all([refresh(), refreshBroadcasts()]);
  }, [refresh, refreshBroadcasts]);

  const onSent = useCallback(async () => {
    await Promise.all([refreshBroadcasts(), refresh()]);
    setTab('broadcast');
  }, [refresh, refreshBroadcasts]);

  const tabBtn = (name: TabName, label: string, count: { id: string; value: number }) => (
    <button className={tab === name ? 'tab is-active' : 'tab'} onClick={() => setTab(name)}>
      {label} <span className="tab__count" id={count.id}>{count.value}</span>
    </button>
  );

  return (
    <>
      <div className="backdrop starfield" aria-hidden="true" />
      <Topbar address={address} balances={balances} funded={funded} loading={loading}
        onDisconnect={disconnect} />
      {/* Gate and app are both mounted, visibility-toggled like src/App.tsx —
          the active tab (and everything inside the hidden panels) survives
          disconnect/reconnect. */}
      <main className="wrap">
        <Gate onConnect={() => void handleConnect()} hidden={!!address} />
        <section id="app" style={address ? undefined : { display: 'none' }}>
          <div className="tabs">
            {tabBtn('offers', 'Private offers', { id: 'offersCount', value: openOffers })}
            {tabBtn('broadcast', 'Broadcast', { id: 'broadcastCount', value: activeBroadcasts })}
          </div>

          {/* Panels stay mounted (.is-active toggles visibility, desk pattern).
              The components inside require a non-null address, so they mount
              only while connected — in particular exactly ONE BroadcastTicket
              ever exists (useIntentCount assumes one consumer per pair). */}
          <div className={tab === 'offers' ? 'panel is-active' : 'panel'} data-panel="offers">
            {address ? (
              <>
                <TakerOffers address={address} offers={offers} now={now} balances={balances}
                  refreshBalances={refreshBalances} onChanged={onChanged} />
                <PairsPanel address={address} />
              </>
            ) : null}
          </div>

          <div className={tab === 'broadcast' ? 'panel is-active' : 'panel'} data-panel="broadcast">
            {address ? (
              <>
                <BroadcastTicket address={address} balances={balances}
                  refreshBalances={refreshBalances} onSent={onSent} />
                <BroadcastList address={address} broadcasts={broadcasts} orders={broadcastOrders}
                  now={now} balances={balances} refreshBalances={refreshBalances}
                  onChanged={onChanged} />
              </>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <IntentPage />
      </WalletProvider>
    </ToastProvider>
  );
}
