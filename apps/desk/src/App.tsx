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

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Copy, LogOut, PenLine, Radio, Wallet } from 'lucide-react';
import { MarkedPhrase } from './ui/MarkedPhrase';
import { TrustBot } from './ui/TrustBot';
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

/**
 * Everything about the connected wallet, behind one control.
 *
 * The bar used to print the address, both balances and a Disconnect button in
 * a row: four things competing with the panel that is the actual work. One
 * disc opens all of it instead, which is the shape every wallet-bearing app
 * has converged on because identity is reference material, not a task.
 *
 * Closed is a STYLE, not an unmount (see .tr-pop): an unmounted popover cannot
 * animate out, and half a transition reads worse than none.
 */
function WalletMenu({ address, balances, loading, onDisconnect }: {
  address: string;
  balances: BalanceMap | null;
  loading: boolean;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  // Close on an outside click or Escape. Both listeners are only attached
  // while open — a page-wide keydown handler that lives forever is how a panel
  // starts eating other components' shortcuts.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    });
  }, [address]);

  const rows = [
    { code: 'XLM', Mark: TokenXLM, amount: balances?.XLM, accent: false },
    { code: 'USDC', Mark: TokenUSDC, amount: balances?.USDC, accent: true },
  ];

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-haspopup="dialog" aria-label="Wallet"
        className={`flex items-center gap-2.5 rounded-pill border py-1.5 pl-2 pr-3.5
          transition-colors duration-500 ease-glide
          ${open ? 'border-lime/30 bg-carbon-hi' : 'border-carbon-line bg-carbon-card/60 hover:bg-carbon-hi'}`}>
        {/* the disc is the identity: a steady lime dot, not an avatar we would
            have to invent for an address that has no picture */}
        <span className="flex size-7 items-center justify-center rounded-full bg-carbon-deep">
          <span className="size-2 rounded-full bg-lime" aria-hidden="true" />
        </span>
        <span className="font-mono text-[13px] text-ash">{trunc(address)}</span>
      </button>

      <div data-open={open} role="dialog" aria-label="Wallet details"
        aria-busy={loading || !balances}
        className="tr-pop absolute right-0 top-[calc(100%+10px)] z-50 w-72 rounded-card
          border border-carbon-line bg-carbon-card/90 p-4 backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-3">
          <span className="font-grotesk text-[13px] text-slate">Connected</span>
          <span className="flex items-center gap-1.5 font-grotesk text-[12px] text-lime">
            <span className="size-1 rounded-full bg-lime" aria-hidden="true" />
            Testnet
          </span>
        </div>

        <button type="button" onClick={copy}
          className="group mt-3 flex w-full items-center justify-between gap-3 rounded-well
            border border-carbon-line bg-carbon-deep/60 px-3.5 py-3 text-left transition-colors
            duration-500 ease-glide hover:bg-carbon-deep">
          <span className="truncate font-mono text-[13px] text-snow">{trunc(address)}</span>
          <span className="text-slate transition-colors duration-500 ease-glide
            group-hover:text-lime">
            {copied
              ? <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
              : <Copy className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
          </span>
        </button>

        <div className="mt-4 flex flex-col gap-2.5">
          {rows.map(({ code, Mark, amount, accent }) => (
            <div key={code} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-carbon-deep">
                  <Mark size={13} variant="mono" className={accent ? 'text-lime' : 'text-snow'} />
                </span>
                <span className="font-grotesk text-[13px] text-ash">{code}</span>
              </span>
              {/* a bar of the figure's own width, so the row does not jump
                  when Horizon answers */}
              {loading || !balances ? (
                <span className="tr-skeleton block h-3 w-20 rounded-pill" aria-hidden="true" />
              ) : (
                <span className="font-grotesk text-[13px] tabular-nums text-snow">
                  {amount ?? '—'}
                </span>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={() => { setOpen(false); onDisconnect(); }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-well border
            border-carbon-line py-2.5 font-grotesk text-[13px] text-ash transition-colors
            duration-500 ease-glide hover:border-bad/30 hover:text-bad">
          <LogOut className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Disconnect
        </button>
      </div>
    </div>
  );
}

/** Brand on the left, wallet on the right, nothing between them. The network
 *  badge moved inside the wallet popover: it qualifies the connection, and it
 *  was the third pill in a bar that only has two jobs. */
function DeskNav({ address, balances, loading, onDisconnect }: {
  address: string | null;
  balances: BalanceMap | null;
  loading: boolean;
  onDisconnect: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-carbon-line bg-carbon/70 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
        <Link to="/" className="flex items-center gap-2 font-grotesk text-[16px]
          font-semibold text-snow">
          <BrandMark className="text-lime" />
          TrustRFQ
        </Link>

        <span className="ml-auto">
          {address
            ? <WalletMenu address={address} balances={balances} loading={loading}
                onDisconnect={onDisconnect} />
            : null}
        </span>
      </div>
    </header>
  );
}

/**
 * TrustBot: help, one field away.
 *
 * Shaped like a search field because that is the affordance people already
 * know for "type a question here" — the mark on the left says whose answer it
 * is, the same way Uniswap's magnifier says what its field does.
 *
 * It opens a dialog over the desk rather than navigating: the question is
 * about the page you are on, mid-trade, and a route would throw away the
 * context that makes it askable.
 */
function TrustBotBar({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="tr-orbit group mx-auto flex w-full max-w-md items-center gap-3 rounded-pill
        border border-carbon-line bg-carbon-card/50 py-2.5 pl-2.5 pr-4 backdrop-blur-xl
        transition-colors duration-500 ease-glide hover:bg-carbon-hi/60">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-carbon-deep">
        <BrandMark size={15} className="text-lime" />
      </span>
      <span className="flex-1 text-left font-grotesk text-[14px] text-slate transition-colors
        duration-500 ease-glide group-hover:text-ash">
        Something off? Ask TrustBot
      </span>
      <ArrowRight className="size-4 shrink-0 text-slate transition-all duration-500 ease-glide
        group-hover:translate-x-0.5 group-hover:text-lime" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

/** The wallet gate, in the desk's own language. src/ui/Gate.tsx is left alone:
 *  RfqDemo ships it against the old stylesheet. */
function DeskGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="tr-panel-in mx-auto flex max-w-lg flex-col items-center text-center">
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
  const [botOpen, setBotOpen] = useState(false);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (e) {
      toast(errMsg(e, 'Wallet connection cancelled.'), 'err');
    }
  }, [connect, toast]);

  return (
    <div className="flex min-h-screen flex-col bg-carbon font-grotesk antialiased">
      <DeskNav address={address} balances={balances} loading={loading} onDisconnect={disconnect} />

      {/* The work sits in the middle of the page, not at the top of it. A
          single panel pinned under the bar leaves a column of dead carbon
          below it; centred, the page reads as one composition at any height.
          flex-1 rather than a min-h calc: with a footer now under it, the
          leftover space is what the browser works out, not what we predict. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-10">
        <div className="w-full">
          {address ? (
            <>
              <div className="tr-panel-in mb-7">
                <TrustBotBar onOpen={() => setBotOpen(true)} />
              </div>

              {/* What the page does, in one line, above the work — the
                  landing's marked-word device at body scale. Two marks, ranked:
                  the signature is the claim (one wallet prompt settles it), the
                  fan-out is how it gets there. */}
              <MarkedPhrase
                style={{ '--tr-lag': '70ms' } as React.CSSProperties}
                className="tr-panel-in mx-auto mb-14 max-w-3xl text-center font-grotesk
                  text-[clamp(1.35rem,2.8vw,1.9rem)] leading-[1.35] tracking-[-0.015em] text-ash"
                text="Ask every maker at once, settle in one signature."
                marks={[
                  { word: 'every maker', icon: Radio, rank: 'quiet' },
                  { word: 'one signature', icon: PenLine, rank: 'loud' },
                ]} />

              <RfqPanel address={address} balances={balances} />
            </>
          ) : (
            <DeskGate onConnect={() => void handleConnect()} />
          )}
        </div>
      </main>

      <DeskFooter />

      {/* mounted always, open/closed by style — see .tr-bot in theme.css */}
      <TrustBot open={botOpen} onClose={() => setBotOpen(false)} />
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
 * The desk's footer.
 *
 * Quieter than the landing's, and carrying one thing the landing does not have
 * to: this is Testnet and the money is not real. Someone who arrived straight
 * at /desk — a saved link, the RFQ demo, a teammate's message — has passed no
 * page that says so, and the nav badge moved into the wallet popover.
 *
 * The links point back into the landing's sections rather than anywhere in the
 * desk, because the desk is one page now and there is nothing else here.
 */
function DeskFooter() {
  const links = [
    { to: '/#why', label: 'Why OTC' },
    { to: '/#how', label: 'How it works' },
    { to: '/#security', label: 'Security' },
    { to: '/#evidence', label: 'Evidence' },
  ];

  return (
    <footer className="border-t border-carbon-line px-6 py-7">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-center
        sm:justify-between">
        <Link to="/" className="flex items-center gap-2 font-grotesk text-[14px]
          font-medium text-ash transition-colors duration-500 ease-glide hover:text-snow">
          <BrandMark size={16} className="text-lime" />
          TrustRFQ
        </Link>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 font-grotesk text-[13px]">
          {links.map((l) => (
            <Link key={l.to} to={l.to}
              className="text-slate transition-colors duration-500 ease-glide hover:text-lime">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="mx-auto mt-5 max-w-5xl font-grotesk text-[12px] text-slate">
        Built on Stellar · Soroban settlement · Testnet MVP — no real funds involved.
      </p>
    </footer>
  );
}

/**
 * Nothing at this address.
 *
 * It says which two places DO exist and links both, because the useful part of
 * a 404 is the way out, not the number. It also names the likely cause: this
 * desk had four section URLs until recently, and someone's saved link to
 * /desk/incoming is exactly the kind of thing that lands here. Those still
 * redirect (see the routes); anything further out arrives at this page.
 */
function NotFound() {
  useDeskCanvas();

  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon px-6
      font-grotesk antialiased">
      <div className="tr-panel-in w-full max-w-lg text-center">
        <Link to="/" aria-label="TrustRFQ home"
          className="inline-flex size-12 items-center justify-center rounded-full
            border border-carbon-line bg-carbon-card transition-colors duration-500
            ease-glide hover:border-lime/25 hover:bg-carbon-hi">
          <BrandMark size={20} className="text-lime" />
        </Link>

        <p className="mt-8 font-mono text-[13px] tracking-[0.2em] text-slate">404</p>

        <h1 className="mt-4 font-grotesk text-[clamp(1.8rem,4vw,2.5rem)] font-medium
          tracking-[-0.025em] text-snow">
          Nothing at this address.
        </h1>

        <p className="mx-auto mt-4 max-w-sm font-grotesk text-[15px] leading-relaxed text-ash">
          The page you asked for does not exist. If you saved a link to one of the
          desk&apos;s old sections, the desk is a single panel now.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/desk"
            className="group inline-flex items-center gap-2.5 rounded-pill bg-lime px-6 py-3
              font-grotesk text-[15px] font-semibold text-carbon transition-colors
              duration-500 ease-glide hover:bg-lime-soft">
            Open the desk
            <ArrowRight className="size-4 transition-transform duration-500 ease-glide
              group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
          </Link>

          <Link to="/"
            className="group inline-flex items-center gap-2 rounded-pill border
              border-carbon-line bg-carbon-card/50 px-6 py-3 font-grotesk text-[15px]
              font-medium text-snow transition-colors duration-500 ease-glide
              hover:bg-carbon-hi">
            <ArrowLeft className="size-4 text-slate transition-all duration-500 ease-glide
              group-hover:-translate-x-0.5 group-hover:text-lime" strokeWidth={1.5}
              aria-hidden="true" />
            Back to the landing
          </Link>
        </div>
      </div>
    </div>
  );
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
            {/* the four section URLs are gone, but people saved them: send
                anything under /desk/* to the one panel rather than 404ing a
                link that worked last week */}
            <Route path="/desk/*" element={<Navigate to={DESK} replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </WalletProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
