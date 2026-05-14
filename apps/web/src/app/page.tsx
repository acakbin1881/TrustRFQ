import Link from "next/link";

// ── Data ──────────────────────────────────────────────────────────────────────

const BEFORE = [
  "DMs, screenshots, and verbal agreements",
  "Someone has to send first and hope",
  "No verifiable record of agreed terms",
  "Counterparty risk is just accepted",
];

const AFTER = [
  "Private RFQ with locked, agreed terms",
  "Accepted quote becomes an escrow deal",
  "Both sides fund before any settlement",
  "On-chain contract ID — verifiable proof",
];

const STEPS = [
  {
    n: "01",
    title: "Create a private RFQ",
    desc: "Specify the asset pair, minimum receive, and expiry. Visible only to invited counterparties.",
  },
  {
    n: "02",
    title: "Receive private quotes",
    desc: "Makers submit firm quotes without seeing each other's bids. Only you see the full list.",
  },
  {
    n: "03",
    title: "Accept one quote",
    desc: "Select the quote that meets your terms. Acceptance closes the RFQ and creates an escrow deal automatically.",
  },
  {
    n: "04",
    title: "Lock and prove settlement",
    desc: "Both sides fund the escrow contract. Contract ID and escrow state are visible on-chain.",
  },
];

const GRID_CELLS = [
  { top: "11%", left: "7%",  cls: "lp-cell-1" },
  { top: "11%", left: "14%", cls: "lp-cell-4" },
  { top: "58%", left: "3%",  cls: "lp-cell-3" },
  { top: "22%", left: "80%", cls: "lp-cell-2" },
  { top: "46%", left: "87%", cls: "lp-cell-5" },
  { top: "68%", left: "73%", cls: "lp-cell-6" },
  { top: "78%", left: "43%", cls: "lp-cell-1" },
];

// ── Hero product visual ───────────────────────────────────────────────────────

function HeroVisual() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-slate-800 shadow-2xl mt-10"
      style={{ minHeight: 460, background: "linear-gradient(155deg, #0a1628 0%, #020617 65%)" }}
    >
      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* Animated grid cells */}
      {GRID_CELLS.map((c, i) => (
        <div
          key={i}
          className={`absolute w-14 h-14 rounded-sm border border-teal-400/20 bg-teal-400/8 ${c.cls}`}
          style={{ top: c.top, left: c.left }}
        />
      ))}

      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-teal-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Three-panel cards */}
      <div className="relative p-6 sm:p-10 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

        {/* Left: RFQ + Contract ID */}
        <div className="flex flex-col gap-4 lp-float-a">
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-slate-500 font-mono">RFQ-7F4C</span>
              <span className="text-[10px] bg-teal-950 text-teal-300 border border-teal-800/50 px-2 py-0.5 rounded-full">
                Open
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Selling</p>
                <p className="text-white font-semibold text-sm">250,000 XLM</p>
              </div>
              <span className="text-slate-700 text-xs shrink-0">→</span>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 mb-0.5">Min. receive</p>
                <p className="text-white font-semibold text-sm">50,000 USDC</p>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-400/70">Private · 3 invited makers</span>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-teal-800/30 rounded-xl p-4 shadow-lg">
            <p className="text-[10px] text-slate-500 mb-1.5">Contract ID</p>
            <p className="text-teal-300 font-mono text-sm font-semibold">TRFQ-8F2A</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-teal-500 lp-pulse inline-block" />
              <span className="text-[10px] text-slate-500">Stellar Testnet</span>
            </div>
            <p className="mt-3 pt-2 text-[10px] text-teal-400/70 hover:text-teal-300 border-t border-slate-800/60 cursor-pointer transition-colors">
              View in Escrow Viewer →
            </p>
          </div>
        </div>

        {/* Center: Escrow state */}
        <div className="sm:pt-6">
          <div className="bg-slate-900/80 border border-blue-900/40 rounded-xl p-5 shadow-xl backdrop-blur-sm">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-4">Escrow state</p>
            <div className="flex flex-col gap-3">
              {[
                { dot: "bg-green-400",  text: "Quote accepted · terms locked",     active: false, done: true  },
                { dot: "bg-green-400",  text: "Buyer deposited 250,000 XLM",        active: false, done: true  },
                { dot: "bg-blue-400",   text: "Escrow funded · Waiting for seller", active: true,  done: false },
                { dot: "bg-slate-700",  text: "Settlement pending",                 active: false, done: false },
              ].map(({ dot, text, active, done }, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${active ? "lp-pulse" : ""}`} />
                  <span className={`text-[11px] leading-snug ${
                    !done && !active ? "text-slate-600" :
                    active           ? "text-blue-300 font-medium" :
                                       "text-slate-400"
                  }`}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Accepted quote */}
        <div className="sm:pt-12 lp-float-c">
          <div className="bg-slate-900/80 border border-green-800/40 rounded-xl p-4 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-500">Accepted quote</span>
              <span className="text-[10px] bg-green-950 text-green-300 border border-green-800/40 px-2 py-0.5 rounded-full">
                Accepted
              </span>
            </div>
            <p className="text-white font-bold text-2xl leading-tight mb-1">51,200 USDC</p>
            <p className="text-[10px] text-slate-500 font-mono">GBYYY...2EF</p>
            <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <span className="text-[10px] text-green-400/80">Escrow deal created</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="flex flex-col gap-16 pb-20">

      {/* ── 1. HERO ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center gap-6 pt-8">
        <span className="inline-flex items-center gap-2 text-xs text-teal-300/70 border border-teal-800/50 bg-teal-950/40 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 lp-pulse inline-block" />
          Built for Boundless × Trustless Work Hackathon
        </span>

        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-[1.08] tracking-tight max-w-2xl">
          Private OTC settlement<br />
          <span className="text-teal-300">without sending first.</span>
        </h1>

        <p className="text-slate-400 text-lg max-w-lg leading-relaxed">
          Create a private RFQ. Receive quotes from invited counterparties. Accept one.
          The deal locks into escrow — on-chain proof, no blind trust.
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Link
            href="/rfqs/new"
            className="bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Create RFQ
          </Link>
          <Link
            href="/rfqs"
            className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-6 py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            My RFQs
          </Link>
        </div>

        <HeroVisual />
      </section>

      {/* ── 2. BEFORE / AFTER ────────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-6">
          The trust problem
        </p>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-slate-900 border border-red-900/25 rounded-xl p-6">
            <p className="text-[10px] text-red-400/60 uppercase tracking-widest font-semibold mb-5">
              Before
            </p>
            {BEFORE.map((s) => (
              <div key={s} className="flex items-start gap-3 mb-3 last:mb-0">
                <span className="text-red-700 text-sm mt-0.5 shrink-0">✕</span>
                <span className="text-slate-400 text-sm leading-snug">{s}</span>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-teal-900/35 rounded-xl p-6">
            <p className="text-[10px] text-teal-400/60 uppercase tracking-widest font-semibold mb-5">
              With TrustRFQ
            </p>
            {AFTER.map((s) => (
              <div key={s} className="flex items-start gap-3 mb-3 last:mb-0">
                <span className="text-teal-400 text-sm mt-0.5 shrink-0">✓</span>
                <span className="text-slate-300 text-sm leading-snug">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ──────────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-6">
          How it works
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ n, title, desc }) => (
            <div key={n} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-teal-500/50 font-mono text-[11px] mb-3 block">{n}</span>
              <p className="text-white font-semibold text-sm mb-2 leading-snug">{title}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. LIVE DEAL PREVIEW ─────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-6">
          Live escrow state
        </p>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row md:items-center gap-6">
            {/* Trade terms */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-mono">deal-rfq1</span>
                <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800/40 px-2 py-0.5 rounded-full">
                  Escrow funded
                </span>
              </div>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Buyer sends</p>
                  <p className="text-white font-bold text-xl">250,000 XLM</p>
                </div>
                <span className="text-slate-700 text-xl">→</span>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Seller sends</p>
                  <p className="text-white font-bold text-xl">51,200 USDC</p>
                </div>
              </div>
            </div>

            {/* Escrow state + proof */}
            <div className="flex-1 flex flex-col gap-3 md:border-l md:border-slate-800 md:pl-6">
              <p className="text-xs text-slate-500">Next required action</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 lp-pulse shrink-0 inline-block" />
                <span className="text-blue-300 text-sm font-medium">
                  Seller must mark settlement sent
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Contract ID:</span>
                <span className="text-teal-300 font-mono text-xs font-semibold">TRFQ-8F2A</span>
              </div>
              <span className="text-xs text-teal-400/70 hover:text-teal-300 w-fit cursor-pointer transition-colors">
                View in Escrow Viewer →
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800 px-6 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-600">Stellar Testnet · Demo</span>
            <Link
              href="/deals/deal-rfq1"
              className="text-sm text-teal-400 hover:text-teal-300 font-medium transition-colors"
            >
              View full deal →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 5. FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="text-center flex flex-col items-center gap-5">
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Start with a private RFQ.
        </h2>
        <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
          Define the terms, invite your counterparty, and let escrow handle the trust problem.
        </p>
        <Link
          href="/rfqs/new"
          className="bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold px-8 py-3 rounded-lg transition-colors text-sm"
        >
          Create RFQ
        </Link>
      </section>

    </div>
  );
}
