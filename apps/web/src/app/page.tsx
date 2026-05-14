import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import BorderGlow from "@/components/BorderGlow";
import FadeContent from "@/components/FadeContent";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

// ── Data ──────────────────────────────────────────────────────────────────────

const CARDS = [
  {
    title: "Post a private RFQ",
    desc: "Define the asset pair, minimum receive, and expiry. Only invited counterparties can see and respond.",
    href: "/rfqs/new",
    cta: "Create RFQ",
  },
  {
    title: "Receive firm quotes",
    desc: "Makers submit sealed quotes without seeing each other's bids. You see all offers — they see none.",
    href: "/rfqs",
    cta: "Browse RFQs",
  },
  {
    title: "Settle with proof",
    desc: "Accept one quote. Both sides fund the escrow contract. Contract ID on-chain — verifiable by anyone.",
    href: "/deals/deal-rfq1",
    cta: "View a deal",
  },
];

const FEATURES = [
  {
    title: "Trade large amounts at your exact price",
    desc: "On public exchanges, a $5M XLM order can move the market against you by 2–4%. Private RFQs lock the rate before any funds move.",
  },
  {
    title: "Firm quotes, not estimates",
    desc: "Makers submit binding quotes. The price you see is the price you get — no last-look, no partial fills, no slippage.",
  },
  {
    title: "Escrow removes counterparty risk",
    desc: "Both sides deposit into a smart contract before settlement. No one sends first blindly.",
  },
  {
    title: "On-chain proof of every trade",
    desc: "Every accepted deal has a contract ID on Stellar Testnet — verifiable by anyone, auditable forever.",
  },
];


// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="flex flex-col pb-28">

      {/* ── 1. HERO ──────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center min-h-[88vh] bg-white -mt-8 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden px-4">

        {/* Grey halftone dot pattern — dense at edges, fades to clear at center */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #c8cbd0 1.5px, transparent 1.5px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 25%, rgba(0,0,0,0.5) 55%, black 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 25%, rgba(0,0,0,0.5) 55%, black 80%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-7 max-w-4xl w-full">
          <span className="inline-flex items-center gap-2 text-[11px] text-gray-500 border border-gray-200 bg-white/80 px-3 py-1.5 rounded-full tracking-wide font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 lp-pulse inline-block" />
            Boundless × Trustless Work Hackathon
          </span>

          <h1
            className={`${playfair.className} text-5xl sm:text-6xl lg:text-7xl text-gray-900 leading-[1.05] tracking-tight max-w-3xl`}
          >
            Private OTC settlement<br />
            without sending first.
          </h1>

          <p className="text-gray-500 text-xl max-w-xl leading-relaxed">
            Post a private RFQ. Receive firm quotes from invited counterparties.
            Accept one — the deal locks into escrow with on-chain proof.
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center mt-2">
            <Link
              href="/rfqs"
              className="bg-gray-900 hover:bg-gray-700 text-white font-semibold px-7 py-3 rounded-lg transition-colors text-sm"
            >
              Browse RFQs
            </Link>
            <Link
              href="/rfqs/new"
              className="border border-gray-300 hover:border-gray-400 bg-white text-gray-700 hover:text-gray-900 px-7 py-3 rounded-lg font-medium transition-colors text-sm"
            >
              Create RFQ
            </Link>
          </div>
        </div>

      </section>

      {/* ── 2. DARK CARDS ────────────────────────────────────────────────── */}
      <section
        className="bg-gray-800 py-24 px-6"
        style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-5">
            {CARDS.map(({ title, desc, href, cta }, i) => (
              <FadeContent key={title} blur duration={700} delay={i * 120} threshold={0.15}>
                <BorderGlow
                  backgroundColor="#1f2937"
                  borderRadius={12}
                  glowColor="174 60 60"
                  colors={["#2dd4bf", "#f59e0b", "#38bdf8"]}
                  glowIntensity={2}
                  glowRadius={55}
                  coneSpread={8}
                  animated
                >
                  <div className="p-10 flex flex-col gap-6 h-full">
                    <h3 className={`${playfair.className} text-white text-[1.35rem] font-bold leading-snug`}>
                      {title}
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed flex-1">{desc}</p>
                    <Link
                      href={href}
                      className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors flex items-center gap-1"
                    >
                      → {cta}
                    </Link>
                  </div>
                </BorderGlow>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. SLIPPAGE SECTION ──────────────────────────────────────────── */}
      <section className="mt-32">
        <div className="grid md:grid-cols-2 gap-16 items-center">

          {/* Left: wireframe globe visual */}
          <div className="flex items-center justify-center select-none">
            <svg viewBox="0 0 420 420" className="w-full max-w-sm" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Concentric background rings */}
              <circle cx="210" cy="210" r="205" stroke="#f3f4f6" strokeWidth="1" />
              <circle cx="210" cy="210" r="178" stroke="#e5e7eb" strokeWidth="1" />
              <circle cx="210" cy="210" r="151" stroke="#e5e7eb" strokeWidth="1" />
              <circle cx="210" cy="210" r="124" stroke="#d1d5db" strokeWidth="1" />
              <circle cx="210" cy="210" r="97"  stroke="#d1d5db" strokeWidth="1" />

              {/* Globe outline */}
              <circle cx="210" cy="210" r="88" stroke="#374151" strokeWidth="1.2" />

              {/* Meridian curves */}
              <ellipse cx="210" cy="210" rx="22"  ry="88" stroke="#374151" strokeWidth="0.9" />
              <ellipse cx="210" cy="210" rx="50"  ry="88" stroke="#374151" strokeWidth="0.9" />
              <ellipse cx="210" cy="210" rx="74"  ry="88" stroke="#374151" strokeWidth="0.9" />

              {/* Latitude line (equator) */}
              <ellipse cx="210" cy="210" rx="88" ry="22" stroke="#374151" strokeWidth="0.9" />

              {/* Intersection dots */}
              <circle cx="210" cy="122" r="3.5" fill="#111827" />
              <circle cx="160" cy="155" r="2.5" fill="#111827" />
              <circle cx="258" cy="200" r="2.5" fill="#111827" />
              <circle cx="210" cy="298" r="3.5" fill="#111827" />
              <circle cx="175" cy="240" r="2"   fill="#6b7280" />
              <circle cx="248" cy="168" r="2"   fill="#6b7280" />
            </svg>
          </div>

          {/* Right: headline + feature list */}
          <div className="flex flex-col gap-3">
            <FadeContent blur duration={700} threshold={0.15}>
              <BorderGlow
                backgroundColor="#ffffff"
                borderRadius={12}
                glowColor="174 50 45"
                colors={["#0d9488", "#3b82f6", "#8b5cf6"]}
                glowIntensity={1}
                glowRadius={35}
                coneSpread={8}
                edgeSensitivity={20}
              >
                <div className="px-6 py-6">
                  <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight">
                    Stop losing value to slippage.<br />
                    Start trading at your price.
                  </h2>
                </div>
              </BorderGlow>
            </FadeContent>

            <div className="flex flex-col gap-3">
              {FEATURES.map(({ title, desc }, i) => (
                <FadeContent key={title} blur duration={700} delay={i * 100} threshold={0.15}>
                  <BorderGlow
                    backgroundColor="#ffffff"
                    borderRadius={12}
                    glowColor="174 50 45"
                    colors={["#0d9488", "#3b82f6", "#8b5cf6"]}
                    glowIntensity={1}
                    glowRadius={35}
                    coneSpread={8}
                    edgeSensitivity={20}
                  >
                    <div className="px-5 py-4 flex gap-4 items-start">
                      <span className="w-2 h-2 rounded-full bg-gray-900 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-gray-900 font-semibold text-sm leading-snug">{title}</p>
                        <p className="text-gray-500 text-sm mt-1 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  </BorderGlow>
                </FadeContent>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── 4. LIVE DEAL PREVIEW ─────────────────────────────────────────── */}
      <section className="mt-24">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-8">
          Live escrow state
        </p>
        <FadeContent blur duration={700} threshold={0.1}>
        <BorderGlow
          backgroundColor="#ffffff"
          borderRadius={12}
          glowColor="174 50 45"
          colors={["#0d9488", "#3b82f6", "#8b5cf6"]}
          glowIntensity={1}
          glowRadius={35}
          coneSpread={8}
          edgeSensitivity={20}
        >
        <div className="overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row md:items-center gap-6">
            {/* Trade terms */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 font-mono">deal-rfq1</span>
                <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">
                  Escrow funded
                </span>
              </div>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Buyer sends</p>
                  <p className="text-gray-900 font-bold text-xl">250,000 XLM</p>
                </div>
                <span className="text-gray-300 text-xl">→</span>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Seller sends</p>
                  <p className="text-gray-900 font-bold text-xl">51,200 USDC</p>
                </div>
              </div>
            </div>

            {/* Escrow state + proof */}
            <div className="flex-1 flex flex-col gap-3 md:border-l md:border-gray-200 md:pl-6">
              <p className="text-xs text-gray-500">Next required action</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 lp-pulse shrink-0 inline-block" />
                <span className="text-blue-600 text-sm font-medium">
                  Seller must mark settlement sent
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Contract ID:</span>
                <span className="text-teal-600 font-mono text-xs font-semibold">TRFQ-8F2A</span>
              </div>
              <span className="text-xs text-teal-600/80 hover:text-teal-500 w-fit cursor-pointer transition-colors">
                View in Escrow Viewer →
              </span>
            </div>
          </div>

          <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">Stellar Testnet · Demo</span>
            <Link
              href="/deals/deal-rfq1"
              className="text-sm text-teal-600 hover:text-teal-500 font-medium transition-colors"
            >
              View full deal →
            </Link>
          </div>
        </div>
        </BorderGlow>
        </FadeContent>
      </section>

      {/* ── 5. FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="mt-24 text-center flex flex-col items-center gap-5">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-[1.05]">
          Start with a private RFQ.
        </h2>
        <p className="text-gray-500 text-lg max-w-sm leading-relaxed">
          Define the terms, invite your counterparty, and let escrow handle the trust problem.
        </p>
        <Link
          href="/rfqs/new"
          className="bg-gray-900 hover:bg-gray-700 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors text-sm"
        >
          Create RFQ
        </Link>
      </section>

    </div>
  );
}
