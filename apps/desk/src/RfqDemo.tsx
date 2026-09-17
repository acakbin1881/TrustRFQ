// The RFQ demo shell — ONE page, ONE panel, deployed as its own Vercel
// project (tools/build-rfq-demo.mjs). It is the RFQ lane shown on its own:
// discover a registered maker on-chain, request a firm quote from that
// maker's own server, settle it in one wallet signature.
//
// It is deliberately NOT App.tsx with sections hidden. App.tsx's shell owns
// the OTC/broadcast subscriptions (useOrders, useBroadcasts), and those are
// the only things in this codebase that reach a database client. Rendering
// just RfqPanel from a separate entry is what keeps @supabase/supabase-js
// out of this bundle entirely — which in turn is what lets the demo ship a
// CSP with no Supabase origin at all. The build script asserts both, so this
// is an enforced property, not a hopeful comment.
//
// Shared with the desk, never forked: RfqPanel, Gate, BalanceStrip, Toast,
// WalletContext and every src/core module. The only local markup is the
// topbar (no section nav here — there is nothing to switch to) and the
// panel wrapper.

import { useCallback } from 'react';
import { trunc } from './core/tokens';
import { useBalances } from './data/useBalances';
import { useWallet, WalletProvider } from './wallet/WalletContext';
import { BalanceStrip } from './ui/BalanceStrip';
import { Gate } from './ui/Gate';
import { RfqPanel } from './ui/RfqPanel';
import { errMsg, ToastProvider, useToast } from './ui/Toast';

function Demo() {
  const { address, connect, disconnect } = useWallet();
  const toast = useToast();
  // One balances instance: it feeds the topbar strip AND RfqPanel's trustline
  // note (D-08 reads it straight off this map rather than paying a second
  // network round trip).
  const { balances, loading } = useBalances(address);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (e) {
      toast(errMsg(e, 'Wallet connection cancelled.'), 'err');
    }
  }, [connect, toast]);

  return (
    <>
      <div className="backdrop starfield" aria-hidden="true" />
      <header className="topbar">
        {/* a <span>, not the desk's <a href="hero.html">: this deploy has no
            other page to go to, and .brand's CSS is element-agnostic. */}
        <span className="brand">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path d="M20 21 C26 13.5, 38 13.5, 44 21" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M44 43 C38 50.5, 26 50.5, 20 43" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <circle cx="15" cy="32" r="8" fill="currentColor" />
            <circle cx="49" cy="32" r="8" stroke="currentColor" strokeWidth="4" />
          </svg>
          TrustRFQ
        </span>
        <span className="net-pill">Testnet</span>
        {address ? <BalanceStrip balances={balances} loading={loading} /> : null}
        <div className="topbar__right">
          <div className="wallet-chip" id="walletChip">
            {address ? (
              <>
                <span className="wallet-chip__addr"><span className="wallet-chip__dot" />{trunc(address)}</span>
                <button className="btn btn--ghost btn--sm" id="disconnectBtn" onClick={disconnect}>Disconnect</button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="wrap">
        <Gate
          onConnect={() => void handleConnect()}
          hidden={!!address}
          eyebrow="Request for Quote · Stellar Testnet"
          heading="Ask the market for a price."
          blurb="No sign-up, nothing custodied. Connect a Stellar wallet, and this desk finds a
            registered maker on-chain, asks its quote server for a firm price, and settles the
            swap atomically — one signature, no counterparty risk."
        />
        <section id="app" style={address ? undefined : { display: 'none' }}>
          {/* data-panel="rfq" is load-bearing: every rule that lays this panel
              out lives under [data-panel="rfq"] in public/intent.css. Rename it
              and the demo silently renders unstyled. */}
          <div className="panel is-active" data-panel="rfq">
            {address ? <RfqPanel address={address} balances={balances} /> : null}
          </div>
        </section>
      </main>
    </>
  );
}

export default function RfqDemo() {
  return (
    <ToastProvider>
      <WalletProvider>
        <Demo />
      </WalletProvider>
    </ToastProvider>
  );
}
