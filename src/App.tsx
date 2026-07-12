// The desk shell: topbar + wallet gate + sections (create / incoming / sent).
// Structure and classes mirror styles.css. Sections are switched by the
// floating SectionSheet control (the old .tabs bar lives on only on the
// intent page). All three panels stay mounted with .is-active toggling —
// keeps form state across section switches; CSS hides inactive panels.

import { useCallback, useState } from 'react';
import { isExpired, orderTokensKnown, trunc } from './core/tokens';
import type { Order } from './core/types';
import { updateOrder } from './data/orders';
import { useOrders } from './data/useOrders';
import { walletSign } from './wallet/kit';
import { useWallet, WalletProvider } from './wallet/WalletContext';
import { Gate } from './ui/Gate';
import { OrderCard } from './ui/OrderCard';
import { SectionSheet } from './ui/SectionSheet';
import { Ticket } from './ui/Ticket';
import { errMsg, ToastProvider, useToast } from './ui/Toast';
import { useNow } from './ui/useNow';
import { useSettlement } from './ui/useSettlement';

type TabName = 'create' | 'incoming' | 'sent';

function Topbar({ address, onDisconnect }: { address: string | null; onDisconnect: () => void }) {
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
      <div className="topbar__right">
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

function Desk() {
  const { address, connect, disconnect } = useWallet();
  const toast = useToast();
  const onLoadError = useCallback((m: string) => toast(m, 'err'), [toast]);
  const { incoming, sent, loadIncoming, loadSent, refresh } = useOrders(address, onLoadError);
  const { signOrder, settle } = useSettlement({ address, refresh, toast });
  const [tab, setTab] = useState<TabName>('create');
  const now = useNow(60000);

  const incomingPending = incoming.filter((o) => o.status === 'pending' && !isExpired(o, now)).length;
  const sentPending = sent.filter((o) => o.status === 'pending' && !isExpired(o, now)).length;

  const handleConnect = async () => {
    try {
      await connect();
    } catch (e) {
      toast(errMsg(e, 'Wallet connection cancelled.'), 'err');
    }
  };

  const takerAction = async (order: Order, action: 'accept' | 'decline') => {
    if (isExpired(order, Date.now())) return toast('This order has expired.', 'err');
    if (action === 'accept' && !orderTokensKnown(order))
      return toast('Unrecognized asset — verify the issuer before accepting.', 'err');
    try {
      const taker_signature = await walletSign(JSON.stringify({ order_id: order.id, action }), address!);
      const status = action === 'accept' ? 'accepted' : 'declined';
      await updateOrder(order.id, { status, taker_signature }, { status: 'pending' });
      toast(action === 'accept' ? 'Order accepted.' : 'Order declined.', 'ok');
      await loadIncoming();
    } catch (err) {
      toast(errMsg(err, 'Action failed.'), 'err');
    }
  };

  const cancelOrder = async (order: Order) => {
    try {
      await updateOrder(order.id, { status: 'cancelled' }, { status: 'pending' });
      toast('Order cancelled.', 'ok');
      await loadSent();
    } catch (err) {
      toast(errMsg(err, 'Could not cancel order.'), 'err');
    }
  };

  return (
    <>
      <div className="backdrop starfield" aria-hidden="true" />
      <Topbar address={address} onDisconnect={disconnect} />
      {/* Gate and desk are both mounted, visibility-toggled like vanilla's
          display switches — so a half-typed ticket draft (and the active
          section) survive disconnect/reconnect. The SectionSheet sits inside
          #app: position:fixed inside a display:none parent renders nothing,
          so it hides with the gate for free. */}
      <main className="wrap wrap--desk">
        <Gate onConnect={() => void handleConnect()} hidden={!!address} />
        <section id="app" style={address ? undefined : { display: 'none' }}>
            <SectionSheet
              active={tab}
              onSelect={setTab}
              options={[
                { id: 'create', label: 'New order', glyph: '+' },
                { id: 'incoming', label: 'Incoming', glyph: '↓', count: incomingPending },
                { id: 'sent', label: 'Sent', glyph: '↑', count: sentPending },
              ] as const}
            />

            <div className={tab === 'create' ? 'panel is-active' : 'panel'} data-panel="create">
              <Ticket address={address} onSent={async () => { await loadSent(); setTab('sent'); }} />
            </div>

            <div className={tab === 'incoming' ? 'panel is-active' : 'panel'} data-panel="incoming">
              <div id="incomingList">
                {incoming.length === 0
                  ? <div className="empty">No orders addressed to your wallet yet.</div>
                  : incoming.map((o) => (
                      <OrderCard key={o.id} order={o} role="incoming" now={now}
                        onAccept={(ord) => void takerAction(ord, 'accept')}
                        onDecline={(ord) => void takerAction(ord, 'decline')}
                        onSign={(ord, side) => void signOrder(ord, side)}
                        onSettle={(ord) => void settle(ord)} />
                    ))}
              </div>
            </div>

            <div className={tab === 'sent' ? 'panel is-active' : 'panel'} data-panel="sent">
              <div id="sentList">
                {sent.length === 0
                  ? <div className="empty">You haven't sent any orders yet.</div>
                  : sent.map((o) => (
                      <OrderCard key={o.id} order={o} role="sent" now={now}
                        onCancel={(ord) => void cancelOrder(ord)}
                        onSign={(ord, side) => void signOrder(ord, side)}
                        onSettle={(ord) => void settle(ord)} />
                    ))}
              </div>
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
        <Desk />
      </WalletProvider>
    </ToastProvider>
  );
}
