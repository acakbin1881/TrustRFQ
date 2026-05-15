import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import BorderGlow from "@/components/BorderGlow";
import FadeContent from "@/components/FadeContent";
import Grainient from "@/components/Grainient";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

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

export default function Home() {
  return (
    <div className="relative flex flex-col">

      {/* ── PAGE BACKGROUND ──────────────────────────────────────────────── */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <Grainient
          color1="#fcfcfc"
          color2="#535353"
          color3="#aaaaaa"
          timeSpeed={0.75}
          colorBalance={0.34}
          warpStrength={0}
          warpFrequency={5.9}
          warpSpeed={2.7}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      {/* ── SLIDE 1: HERO ────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center justify-center text-center -mt-8 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden px-4"
        style={{ height: "100vh", scrollSnapAlign: "start" }}
      >
        <div className="relative z-10 flex flex-col items-center gap-7 max-w-4xl w-full">
          <span className="inline-flex items-center rounded-full bg-[#1a1a1a]/70 border border-[#3f3b3b] overflow-hidden text-[11px]">
            <span className="bg-[#2a2a2a] text-white px-3 py-1.5 font-bold tracking-widest text-[10px]">NEW</span>
            <span className="text-white/60 px-3 py-1.5 font-medium">Boundless × Trustless Work Hackathon</span>
          </span>

          <h1 className={`${playfair.className} text-5xl sm:text-6xl lg:text-7xl text-white font-bold leading-[1.05] tracking-tight max-w-3xl text-stroke`}>
            Private OTC settlement<br />
            without sending first.
          </h1>

          <p className="text-white/70 text-xl max-w-xl leading-relaxed text-stroke">
            Post a private RFQ. Receive firm quotes from invited counterparties.
            Accept one — the deal locks into escrow with on-chain proof.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center mt-2">
            <Link href="/rfqs" className="bg-white hover:bg-white/90 text-[#1a1a1a] font-bold px-8 py-3 rounded-full transition-colors text-sm">
              Browse RFQs
            </Link>
            <Link href="/rfqs/new" className="bg-[#2a2a2a]/70 hover:bg-[#373232] border border-[#3f3b3b] text-white/80 px-8 py-3 rounded-full font-medium transition-colors text-sm backdrop-blur-sm">
              Create RFQ
            </Link>
          </div>
        </div>
      </section>

      {/* ── SLIDE 2: DARK CARDS ──────────────────────────────────────────── */}
      <section
        className="bg-[#1a1a1a] flex items-center px-6"
        style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", height: "100vh", scrollSnapAlign: "start" }}
      >
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid md:grid-cols-3 gap-5">
            {CARDS.map(({ title, desc, href, cta }, i) => (
              <FadeContent key={title} blur duration={700} delay={i * 120} threshold={0.15}>
                <BorderGlow
                  backgroundColor="#2a2a2a"
                  borderRadius={12}
                  glowColor="20 10 50"
                  colors={["#5c5151", "#3f3b3b", "#5c5151"]}
                  glowIntensity={2}
                  glowRadius={55}
                  coneSpread={8}
                  animated
                >
                  <div className="p-10 flex flex-col gap-6 h-full">
                    <h3 className={`${playfair.className} text-white text-[1.35rem] font-bold leading-snug`}>
                      {title}
                    </h3>
                    <p className="text-white/50 text-sm leading-relaxed flex-1">{desc}</p>
                    <Link href={href} className="text-white/70 hover:text-white text-sm font-medium transition-colors flex items-center gap-1">
                      → {cta}
                    </Link>
                  </div>
                </BorderGlow>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── SLIDE 3: SLIPPAGE + TW LOGO ─────────────────────────────────── */}
      <section
        className="flex items-center overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
        style={{ height: "100vh", scrollSnapAlign: "start" }}
      >
        <div className="grid md:grid-cols-2 gap-12 items-center w-full max-w-4xl mx-auto">

          <div className="flex items-center justify-center select-none">
            <svg width="0" height="0" style={{ position: "absolute" }}>
              <defs>
                <filter id="logo-outline" x="-5%" y="-5%" width="110%" height="110%">
                  <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="expanded" />
                  <feFlood floodColor="#000000" result="color" />
                  <feComposite in="color" in2="expanded" operator="in" result="outline" />
                  <feMerge>
                    <feMergeNode in="outline" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WT-M-0ce6EAJIaOeA18BjA9WqyfLWpgbybP.png"
              alt="Trustless Work"
              className="w-56 sm:w-72"
              style={{ filter: "url(#logo-outline)" }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <FadeContent blur duration={700} threshold={0.15}>
              <BorderGlow
                backgroundColor="#2a2a2a"
                borderRadius={12}
                glowColor="20 10 50"
                colors={["#5c5151", "#3f3b3b", "#5c5151"]}
                glowIntensity={1}
                glowRadius={35}
                coneSpread={8}
                edgeSensitivity={20}
              >
                <div className="px-5 py-5">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white leading-[1.15] tracking-tight">
                    Stop losing value to slippage.<br />
                    Start trading at your price.
                  </h2>
                </div>
              </BorderGlow>
            </FadeContent>

            <div className="flex flex-col gap-2">
              {FEATURES.map(({ title, desc }, i) => (
                <FadeContent key={title} blur duration={700} delay={i * 100} threshold={0.15}>
                  <BorderGlow
                    backgroundColor="#2a2a2a"
                    borderRadius={12}
                    glowColor="20 10 50"
                    colors={["#5c5151", "#3f3b3b", "#5c5151"]}
                    glowIntensity={1}
                    glowRadius={35}
                    coneSpread={8}
                    edgeSensitivity={20}
                  >
                    <div className="px-4 py-3 flex gap-3 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-white font-semibold text-sm leading-snug">{title}</p>
                        <p className="text-white/50 text-xs mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  </BorderGlow>
                </FadeContent>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── SLIDE 4: LIVE DEAL + CTA ─────────────────────────────────────── */}
      <section
        className="flex flex-col items-center justify-center overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 gap-8"
        style={{ height: "100vh", scrollSnapAlign: "start" }}
      >
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
          <p className="text-xs text-white/30 uppercase tracking-widest font-semibold">
            Live escrow state
          </p>
          <FadeContent blur duration={700} threshold={0.1}>
            <BorderGlow
              backgroundColor="#2a2a2a"
              borderRadius={12}
              glowColor="20 10 50"
              colors={["#5c5151", "#3f3b3b", "#5c5151"]}
              glowIntensity={1}
              glowRadius={35}
              coneSpread={8}
              edgeSensitivity={20}
            >
              <div className="p-6 flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/40 font-mono">deal-rfq1</span>
                    <span className="text-[10px] bg-[#373232] text-white/70 border border-[#3f3b3b] px-2 py-0.5 rounded-full">
                      Escrow funded
                    </span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Buyer sends</p>
                      <p className="text-white font-bold text-xl">250,000 XLM</p>
                    </div>
                    <span className="text-white/20 text-xl">→</span>
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">Seller sends</p>
                      <p className="text-white font-bold text-xl">51,200 USDC</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-3 md:border-l md:border-[#373232] md:pl-6">
                  <p className="text-xs text-white/40">Next required action</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white/60 lp-pulse shrink-0 inline-block" />
                    <span className="text-white/80 text-sm font-medium">
                      Seller must mark settlement sent
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Contract ID:</span>
                    <span className="text-white/70 font-mono text-xs font-semibold">TRFQ-8F2A</span>
                  </div>
                  <span className="text-xs text-white/50 hover:text-white/80 w-fit cursor-pointer transition-colors">
                    View in Escrow Viewer →
                  </span>
                </div>
              </div>

              <div className="border-t border-[#373232] px-6 py-3 flex items-center justify-between">
                <span className="text-xs text-white/30">Stellar Testnet · Demo</span>
                <Link href="/deals/deal-rfq1" className="text-sm text-white/60 hover:text-white font-medium transition-colors">
                  View full deal →
                </Link>
              </div>
            </BorderGlow>
          </FadeContent>
        </div>

        <div className="text-center flex flex-col items-center gap-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-[1.05]">
            Start with a private RFQ.
          </h2>
          <p className="text-white/50 text-lg max-w-sm leading-relaxed">
            Define the terms, invite your counterparty, and let escrow handle the trust problem.
          </p>
          <Link href="/rfqs/new" className="bg-white hover:bg-white/90 text-[#1a1a1a] font-bold px-8 py-3.5 rounded-full transition-colors text-sm">
            Create RFQ
          </Link>
        </div>
      </section>

    </div>
  );
}
