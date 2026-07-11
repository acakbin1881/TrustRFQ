// The desk shell: topbar + wallet gate + tabs (create / incoming / sent).
// Structure and classes mirror otc.html/otc.js so styles.css applies unchanged.
// All three panels stay mounted with .is-active toggling (vanilla parity —
// keeps form state across tab switches; CSS hides inactive panels).

import { useCallback, useState } from 'react';
import { isExpired, orderTokensKnown, trunc } from './core/tokens';
import type { Order } from './core/types';
import { updateOrder } from './data/orders';
import { useOrders } from './data/useOrders';
import { walletSign } from './wallet/kit';
import { useWallet, WalletProvider } from './wallet/WalletContext';
import { Gate } from './ui/Gate';
import { OrderCard } from './ui/OrderCard';
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
          <path d="M20 21 C26 13.5, 38 13.5, 44 21" stroke="#E5B567" strokeWidth="4" strokeLinecap="round" />
          <path d="M44 43 C38 50.5, 26 50.5, 20 43" stroke="#E5B567" strokeWidth="4" strokeLinecap="round" />
          <circle cx="15" cy="32" r="8" fill="#E5B567" />
          <circle cx="49" cy="32" r="8" stroke="#E5B567" strokeWidth="4" />
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

  const tabBtn = (name: TabName, label: string, count?: { id: string; value: number }) => (
    <button className={tab === name ? 'tab is-active' : 'tab'} onClick={() => setTab(name)}>
      {label}{count ? <> <span className="tab__count" id={count.id}>{count.value}</span></> : null}
    </button>
  );

  return (
    <>
      <div className="backdrop starfield" aria-hidden="true" />
      <Topbar address={address} onDisconnect={disconnect} />
      {/* Gate and desk are both mounted, visibility-toggled like vanilla's
          display switches — so a half-typed ticket draft (and the active tab)
          survive disconnect/reconnect. */}
      <main className="wrap">
        <Gate onConnect={() => void handleConnect()} hidden={!!address} />
        <section id="app" style={address ? undefined : { display: 'none' }}>
            <div className="tabs">
              {tabBtn('create', 'New order')}
              {tabBtn('incoming', 'Incoming', { id: 'incCount', value: incomingPending })}
              {tabBtn('sent', 'Sent', { id: 'sentCount', value: sentPending })}
            </div>

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
