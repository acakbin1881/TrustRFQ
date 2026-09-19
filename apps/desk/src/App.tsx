// The app shell: the landing at "/", the desk at "/desk".
//
// ONE PANEL. The desk used to switch between four sections — compose,
// incoming, sent, RFQ — through a capsule in the bar. Everything except the
// RFQ lane is gone from this shell: the protocol is the product, and a nav
// that offers three other rooms says otherwise. The components those sections
// used (Ticket, OfferList, BroadcastList, PairsPanel) are still in src/ui and
// still compile; nothing here imports them, so they tree-shake out. Deleting
// them is a separate decision from stopping showing them.
//
// Dropping them also drops this shell's Supabase subscriptions (useOrders,
// useBroadcasts). Note the bundle still carries @supabase/supabase-js through
// RfqPanel's own imports — RfqDemo.tsx is the entry that keeps it out
// entirely, and tools/build-rfq-demo.mjs asserts that. This is not that.
//
// The chrome is written in the carbon/lime language (tuneay/01-KARARLAR.md),
// locally rather than through src/ui/Gate.tsx and BalanceStrip.tsx: those two
// are shared with RfqDemo, which ships the old stylesheet on purpose, so
// restyling them in place would repaint a deploy this branch does not own.

import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { ArrowRight, LogOut, Wallet } from 'lucide-react';
import { TokenUSDC, TokenXLM } from '@web3icons/react';
import type { BalanceMap } from './core/balances';
import { trunc } from './core/tokens';
import { useBalances } from './data/useBalances';
import { BrandMark } from './brand/mark';
import { RfqPanel } from './ui/RfqPanel';
import { errMsg, ToastProvider, useToast } from './ui/Toast';
import { useWallet, WalletProvider } from './wallet/WalletContext';

// Lazy on purpose, and not for size: the landing re-declares the document's
// base through its own scope class, so splitting it means someone who opens
// /desk never downloads those rules at all.
const Landing = lazy(() => import('./landing/Landing'));

const DESK = '/desk';

/* ---------------------------------------------------------------- chrome */

/** Balances, as the bar shows them: the mark, then the figure. Local to this
 *  shell — src/ui/BalanceStrip.tsx stays on the old stylesheet for RfqDemo. */
function Balances({ balances, loading }: { balances: BalanceMap | null; loading: boolean }) {
  if (loading || !balances) {
    return (
      <span className="font-grotesk text-[13px] text-slate" aria-live="polite">
        Loading balances…
      </span>
    );
  }

  const rows = [
    { code: 'XLM', Mark: TokenXLM, amount: balances.XLM },
    { code: 'USDC', Mark: TokenUSDC, amount: balances.USDC },
  ];

  return (
    <span className="flex items-center gap-4">
      {rows.map(({ code, Mark, amount }) => (
        <span key={code} className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-carbon-card">
            <Mark size={12} variant="mono" className="text-snow" />
          </span>
          <span className="font-grotesk text-[13px] tabular-nums text-ash">
            {amount ?? '—'}
          </span>
          <span className="font-grotesk text-[12px] text-slate">{code}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * The connected identity, and the one control that ends it.
 *
 * Disconnect is an icon button beside the address rather than a labelled
 * button after it: it acts ON the address, so it belongs to it. It keeps an
 * accessible name and a tooltip, and it is the only red-adjacent affordance in
 * the bar — hover is where it declares itself, so a mis-click is unlikely and
 * a deliberate one is one move.
 */
function WalletChip({ address, onDisconnect }: { address: string; onDisconnect: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-pill border border-carbon-line
      bg-carbon-card/60 py-1.5 pl-3.5 pr-1.5">
      <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
      <span className="ml-1.5 font-mono text-[13px] text-ash">{trunc(address)}</span>
      <button type="button" onClick={onDisconnect} title="Disconnect wallet"
        aria-label="Disconnect wallet"
        className="ml-1.5 flex size-7 items-center justify-center rounded-full text-slate
          transition-colors duration-500 ease-glide hover:bg-carbon-hi hover:text-bad">
        <LogOut className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </span>
  );
}

function DeskNav({ address, balances, loading, onDisconnect }: {
  address: string | null;
  balances: BalanceMap | null;
  loading: boolean;
  onDisconnect: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-carbon-line bg-carbon/80 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-6">
        <Link to="/" className="flex items-center gap-2 font-grotesk text-[16px]
          font-semibold text-snow">
          <BrandMark className="text-lime" />
          TrustRFQ
        </Link>

        <span className="flex items-center gap-1.5 rounded-pill border border-carbon-line
          px-2.5 py-1 font-grotesk text-[11px] uppercase tracking-[0.12em] text-lime">
          <span className="size-1 rounded-full bg-lime" aria-hidden="true" />
          Testnet
        </span>

        {/* balances sit with the network label: both say WHERE you are trading */}
        {address ? <span className="hidden md:block"><Balances balances={balances} loading={loading} /></span> : null}

        <span className="ml-auto">
          {address ? <WalletChip address={address} onDisconnect={onDisconnect} /> : null}
        </span>
      </div>
    </header>
  );
}

/** The wallet gate, in the desk's own language. src/ui/Gate.tsx is left alone:
 *  RfqDemo ships it against the old stylesheet. */
function DeskGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-well border
        border-carbon-line bg-carbon-card text-lime">
        <Wallet className="size-6" strokeWidth={1.4} aria-hidden="true" />
      </span>

      <h1 className="mt-8 font-grotesk text-[clamp(1.8rem,4vw,2.4rem)] font-medium
        tracking-[-0.025em] text-snow">
        Your wallet is your desk.
      </h1>
      <p className="mt-4 font-grotesk text-[15px] leading-relaxed text-ash">
        No sign-up, nothing custodied. Connect a Stellar wallet to request a firm quote
        from a registered maker and settle it in one signature.
      </p>

      <button type="button" onClick={onConnect}
        className="group mt-9 inline-flex items-center gap-2.5 rounded-pill bg-lime px-6 py-3
          font-grotesk text-[15px] font-semibold text-carbon transition-colors duration-500
          ease-glide hover:bg-lime-soft">
        Connect wallet
        <ArrowRight className="size-4 transition-transform duration-500 ease-glide
          group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
      </button>

      <div className="mt-10 flex flex-wrap justify-center gap-2">
        {['Non-custodial', 'Wallet-signed terms', 'Atomic settlement'].map((t) => (
          <span key={t} className="rounded-pill border border-carbon-line px-3 py-1.5
            font-grotesk text-[12px] text-slate">{t}</span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ desk */

function Desk() {
  const { address, connect, disconnect } = useWallet();
  const toast = useToast();
  const { balances, loading } = useBalances(address);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (e) {
      toast(errMsg(e, 'Wallet connection cancelled.'), 'err');
    }
  }, [connect, toast]);

  return (
    <div className="min-h-screen bg-carbon font-grotesk antialiased">
      <DeskNav address={address} balances={balances} loading={loading} onDisconnect={disconnect} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {address
          ? <RfqPanel address={address} balances={balances} />
          : <DeskGate onConnect={() => void handleConnect()} />}
      </main>
    </div>
  );
}

/**
 * The desk owns <body> while it is mounted, the same way the landing does.
 *
 * public/styles.css is linked from the HTML and always loaded, so <body>
 * arrives wearing the old pale canvas. A container background cannot cover
 * scroll bounce or the strip past the last section; the body's can. Taken off
 * on unmount so the landing gets its own.
 */
function useDeskCanvas() {
  useEffect(() => {
    document.body.classList.add('tr-dark');
    return () => { document.body.classList.remove('tr-dark'); };
  }, []);
}

function DeskRoute() {
  useDeskCanvas();
  return <Desk />;
}

/**
 * Scroll to the top when the PAGE changes.
 *
 * The browser only restores scroll on a real document load, so without this
 * someone who followed "Open the desk" from the landing's footer arrives at
 * the desk already scrolled past it.
 */
function ScrollToTopOnPageChange() {
  const { pathname } = useLocation();
  const page = pathname.split('/')[1] ?? '';
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current !== null && previous.current !== page) window.scrollTo(0, 0);
    previous.current = page;
  }, [page]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTopOnPageChange />
      <ToastProvider>
        <WalletProvider>
          <Routes>
            {/* no visible fallback: the chunk is small and local, and a spinner
                that flashes for 30ms reads as a glitch */}
            <Route path="/" element={<Suspense fallback={null}><Landing /></Suspense>} />
            <Route path="/desk" element={<DeskRoute />} />
            {/* the four-section URLs are gone; anything under /desk/* lands on
                the one panel rather than 404ing a link somebody saved */}
            <Route path="*" element={<Navigate to={DESK} replace />} />
          </Routes>
        </WalletProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
