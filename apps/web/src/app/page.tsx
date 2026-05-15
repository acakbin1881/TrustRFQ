"use client";

import Link from "next/link";
import { Playfair_Display, DM_Mono } from "next/font/google";
import { IdentitySelector } from "@/components/IdentitySelector";
import { SlippageCalculator } from "@/components/SlippageCalculator";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["700", "900"] });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"] });

const STEPS = [
  {
    n: "01 / POST",
    title: "Create a private RFQ",
    desc: "Define the asset pair, trade size, minimum receive amount, expiry, and invited counterparties. Instead of hitting a liquidity pool immediately, start with private price discovery.",
    href: "/rfqs/new",
    cta: "Create RFQ",
  },
  {
    n: "02 / QUOTE",
    title: "Receive maker quotes",
    desc: "Makers submit private offers for your requested trade. You compare fixed quotes before committing, instead of accepting unpredictable AMM price impact.",
    href: "/rfqs",
    cta: "Browse RFQs",
  },
  {
    n: "03 / ACCEPT",
    title: "Accept the best offer",
    desc: "Review incoming quotes and accept the one that meets your terms. The accepted quote becomes the settlement reference — price and conditions are locked.",
    href: "/rfqs",
    cta: "View RFQs",
  },
  {
    n: "04 / SETTLE",
    title: "Settle through escrow",
    desc: "The trade moves into an escrow-protected settlement flow powered by Trustless Work on Stellar. No blind sending. No informal middleman.",
    href: "/deals/deal-rfq1",
    cta: "View a deal",
  },
];

const WHY = [
  {
    code: "// QUOTES",
    title: "Private quotes before execution",
    desc: "TrustRFQ lets takers request prices from makers before funds move. The accepted quote becomes the trade reference, giving both sides clearer terms than a pool-based estimate.",
  },
  {
    code: "// OTC",
    title: "Designed for OTC-style trades",
    desc: "For high-value swaps, teams and traders often need negotiation, privacy, and predictable settlement. TrustRFQ brings that OTC workflow into a structured on-chain experience.",
  },
  {
    code: "// ESCROW",
    title: "Escrow-protected settlement",
    desc: "Trustless Work escrow adds a neutral settlement layer after both sides agree. Funds are governed by predefined roles and release logic instead of informal trust.",
  },
  {
    code: "// STELLAR",
    title: "Built for Stellar's early DeFi gap",
    desc: "Stellar has fast, low-cost settlement and strong payment rails, but OTC-style DeFi tooling is still early. TrustRFQ targets that missing layer: private RFQs plus verifiable escrow settlement.",
  },
];

const STATS = [
  { val: "RFQ", label: "Private price discovery before execution" },
  { val: "1", label: "Escrow contract per accepted deal" },
  { val: "Private", label: "Quote visibility — taker only" },
  { val: "On-chain", label: "Settlement state and proof" },
];

export default function Home() {
  return (
    <div className="flex flex-col -mt-8 -mb-8">

      {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section
        className="relative flex flex-col justify-center py-28 lg:py-36 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-hidden"
        style={{ minHeight: "88vh" }}
      >
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 70% at 75% 50%, rgba(92,81,81,0.14) 0%, transparent 65%)",
          }}
        />

        <div className="max-w-5xl w-full mx-auto grid lg:grid-cols-2 gap-12 items-center">

          {/* â”€â”€ Left: text â”€â”€ */}
          <div className="flex flex-col gap-7">
            {/* Eyebrow */}
            <div className={`flex items-center gap-3 text-white/30 ${dmMono.className}`}>
              <span className="w-8 h-px bg-white/15" />
              <span className="text-[11px] uppercase tracking-[0.14em]">Built on Stellar Testnet · Trustless Work</span>
            </div>

            {/* H1 */}
            <h1
              className={`${playfair.className} text-5xl sm:text-6xl lg:text-[4.5rem] font-black leading-[1.04] tracking-tight`}
            >
              <span className="text-white">Private RFQ settlement</span>
              <br />
              <span className="text-white">for large Stellar trades.</span>
              <br />
              <span className="italic text-white/65">No blind sending.</span>
            </h1>

            {/* Sub */}
            <p className="text-white/50 text-lg max-w-lg leading-relaxed font-light">
              Create an RFQ, get maker quotes, and settle through Trustless Work escrow.
            </p>

            {/* CTAs */}
            <div className="flex items-center gap-5 mt-1">
              <Link
                href="/rfqs/new"
                className="bg-white hover:bg-white/90 text-[#1a1a1a] font-semibold px-7 py-3 rounded text-[14px] transition-colors"
              >
                Create RFQ
              </Link>
              <Link
                href="/rfqs"
                className={`text-white/45 hover:text-white text-[14px] flex items-center gap-1.5 transition-colors group ${dmMono.className}`}
              >
                Browse RFQs
                <span className="group-hover:translate-x-0.5 transition-transform inline-block">â†’</span>
              </Link>
            </div>

            {/* Built with Trustless Work */}
            <div className="flex items-center gap-3 pt-7 mt-3 border-t border-[#2a2a2a]">
              <span className={`${dmMono.className} text-[10px] uppercase tracking-widest text-white/25`}>
                Powered by
              </span>
              <div className="flex items-center gap-2 bg-[#2a2a2a] border border-[#373232] px-3 py-1.5 rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WT-M-0ce6EAJIaOeA18BjA9WqyfLWpgbybP.png"
                  alt="Trustless Work"
                  className="h-4"
                />
                <span className={`${dmMono.className} text-[11px] text-white/50`}>Trustless Work</span>
              </div>
              <span className={`${dmMono.className} text-[10px] text-white/25`}>escrow infrastructure</span>
            </div>
          </div>

        </div>
      </section>

      {/* â”€â”€ STATS BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-[#2a2a2a] border-t border-b border-[#373232]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STATS.map(({ val, label }) => (
            <div key={val} className="text-center">
              <p className={`${dmMono.className} text-xl font-medium text-white`}>{val}</p>
              <p className="text-[12px] text-white/40 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ SLIPPAGE CALCULATOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-24 border-b border-[#2a2a2a]">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-start">

          {/* Copy */}
          <div className="flex flex-col gap-5">
            <p className={`${dmMono.className} text-[11px] text-white/30 uppercase tracking-widest`}>
              The DEX problem
            </p>
            <h2 className={`${playfair.className} text-3xl font-bold text-white leading-snug`}>
              Large trades should not be forced through shallow liquidity.
            </h2>
            <p className="text-white/45 text-[14px] leading-relaxed">
              On AMM-style DEXs, large trades can move the pool price and create slippage. The bigger the trade is relative to available liquidity, the more value the trader can lose before settlement even happens.
            </p>
            <p className="text-white/45 text-[14px] leading-relaxed">
              TrustRFQ replaces immediate pool execution with a private RFQ flow. The accepted quote becomes the trade reference, giving both sides clearer terms than a pool-based estimate.
            </p>
            <div className="flex items-center gap-3 mt-1 bg-[#2a2a2a] border border-[#373232] rounded px-4 py-3">
              <span className={`${dmMono.className} text-[13px] text-white font-medium`}>TrustRFQ</span>
              <span className="text-white/25">â†’</span>
              <span className={`${dmMono.className} text-[13px] text-white/70`}>private quotes · agreed price · escrow-protected settlement</span>
            </div>
          </div>

          {/* Calculator */}
          <div className="bg-[#2a2a2a] border border-[#373232] rounded-lg p-6">
            <p className={`${dmMono.className} text-[11px] text-white/30 uppercase tracking-widest mb-5`}>
              DEX slippage simulator
            </p>
            <SlippageCalculator />
          </div>

        </div>
      </section>

      {/* â”€â”€ HOW IT WORKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section
        id="how-it-works"
        className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-24 border-b border-[#2a2a2a]"
      >
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <p className={`${dmMono.className} text-[11px] text-white/30 uppercase tracking-widest mb-3`}>
              How it works
            </p>
            <h2 className={`${playfair.className} text-3xl sm:text-[2.5rem] text-white font-bold leading-tight`}>
              From RFQ to settled deal
            </h2>
          </div>

          {/* 4-col grid with gap-as-border technique */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#2a2a2a]">
            {STEPS.map(({ n, title, desc, href, cta }) => (
              <div key={n} className="bg-[#1a1a1a] p-8 lg:p-10 flex flex-col gap-5">
                <p className={`${dmMono.className} text-[11px] text-white/25 uppercase tracking-widest`}>
                  {n}
                </p>
                <div className="flex flex-col gap-2 flex-1">
                  <h3 className="text-white font-semibold text-[15px] leading-snug">{title}</h3>
                  <p className="text-white/40 text-[13px] leading-relaxed">{desc}</p>
                </div>
                <Link
                  href={href}
                  className={`${dmMono.className} text-[12px] text-white/35 hover:text-white transition-colors`}
                >
                  {cta} â†’
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ LIVE ESCROW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-[#2a2a2a] border-b border-[#373232]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid md:grid-cols-2 gap-16 items-center">

          {/* Copy */}
          <div className="flex flex-col gap-5">
            <p className={`${dmMono.className} text-[11px] text-white/30 uppercase tracking-widest`}>
              Escrow status
            </p>
            <h2 className={`${playfair.className} text-3xl font-bold text-white leading-snug`}>
              Both sides agree on terms.<br />Escrow handles the settlement trust.
            </h2>
            <p className="text-white/45 text-[14px] leading-relaxed">
              Once a quote is accepted, the trade moves into an escrow-protected settlement flow powered by Trustless Work on Stellar. Funds are governed by predefined roles and release logic.
            </p>
            <p className="text-white/45 text-[14px] leading-relaxed">
              Neither side has to blindly trust the other or rely on an informal middleman. The escrow contract holds the settlement state on-chain, verifiable by anyone.

            </p>
            <Link
              href="/deals/deal-rfq1"
              className={`${dmMono.className} text-[12px] text-white/35 hover:text-white transition-colors mt-1`}
            >
              View full deal â†’
            </Link>
          </div>

          {/* Escrow widget */}
          <div className="bg-[#1a1a1a] border border-[#373232] rounded-lg overflow-hidden">
            {/* Widget header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#373232]">
              <span className={`${dmMono.className} text-[12px] text-white/50`}>deal-rfq1</span>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white/50 lp-pulse inline-block" />
                <span className={`${dmMono.className} text-[11px] text-white/50`}>Awaiting escrow funding</span>
              </div>
            </div>

            {/* Trade */}
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center gap-3 bg-[#2a2a2a] rounded px-4 py-3.5">
                <div className="flex-1 text-center">
                  <p className={`${dmMono.className} text-[15px] font-medium text-white`}>250,000</p>
                  <p className="text-[11px] text-white/40 mt-0.5">XLM · Taker wants to sell</p>
                </div>
                <span className="text-white/20 text-base">â†’</span>
                <div className="flex-1 text-center">
                  <p className={`${dmMono.className} text-[15px] font-medium text-white`}>51,200</p>
                  <p className="text-[11px] text-white/40 mt-0.5">USDC · Maker offers</p>
                </div>
              </div>
            </div>

            {/* Pending action */}
            <div className="mx-5 mb-4 bg-[#2a2a2a] border-l-2 border-[#5c5151] rounded-r px-3 py-2.5">
              <p className="text-[10px] text-white/30 mb-0.5">Pending action</p>
              <p className="text-[13px] text-white/65">Next action: fund escrow</p>
            </div>

            {/* Rows */}
            <div className="border-t border-[#373232]">
              {[
                ["Contract ID", "TRFQ-8F2A"],
                ["Network", "Stellar Testnet"],
                ["Escrow by", "Trustless Work"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a2a] last:border-b-0"
                >
                  <span className="text-[12px] text-white/40">{k}</span>
                  <span className={`${dmMono.className} text-[12px] text-white/65`}>{v}</span>
                </div>
              ))}
            </div>

            {/* Widget footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#373232] bg-[#2a2a2a]/50">
              <span className={`${dmMono.className} text-[10px] text-white/25`}>TRFQ-8F2A Â· Stellar Testnet</span>
              <Link
                href="/deals/deal-rfq1"
                className={`${dmMono.className} text-[11px] text-white/40 hover:text-white transition-colors`}
              >
                View escrow proof â†’
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ WHY TRUSTERFQ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-24 border-b border-[#2a2a2a]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <p className={`${dmMono.className} text-[11px] text-white/30 uppercase tracking-widest mb-3`}>
              Why TrustRFQ
            </p>
            <h2 className={`${playfair.className} text-3xl sm:text-[2.5rem] text-white font-bold leading-tight`}>
              Built for large, high-value Stellar trades.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-px bg-[#2a2a2a]">
            {WHY.map(({ code, title, desc }) => (
              <div key={code} className="bg-[#1a1a1a] p-8 flex flex-col gap-3">
                <p className={`${dmMono.className} text-[11px] text-white/25 tracking-wider`}>{code}</p>
                <h3 className="text-white font-semibold text-[15px] leading-snug">{title}</h3>
                <p className="text-white/40 text-[13px] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* â”€â”€ DEMO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="py-20 border-b border-[#2a2a2a]">
        <div className="flex flex-col gap-8 max-w-5xl mx-auto">
          <div>
            <p className={`${dmMono.className} text-[11px] text-white/30 uppercase tracking-widest mb-3`}>
              Interactive demo
            </p>
            <h2 className={`${playfair.className} text-3xl text-white font-bold`}>
              See the full settlement flow
            </h2>
            <p className="text-white/45 text-[14px] mt-3 max-w-lg leading-relaxed">
              Switch identities to walk through each role. Creator posts the RFQ and accepts a quote;
              maker funds USDC into escrow; creator sends XLM; escrow releases on confirmation.
            </p>
          </div>

          <div className="bg-[#2a2a2a] border border-[#373232] rounded-lg p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className={`${dmMono.className} text-[10px] text-white/30 uppercase tracking-widest`}>
                Active identity
              </p>
              <IdentitySelector />
            </div>

            <div className="border-t border-[#373232] pt-5 grid sm:grid-cols-3 gap-px bg-[#373232]">
              {[
                {
                  label: "RFQ Creator view",
                  desc: "Posts a private RFQ, reviews maker quotes, accepts the best offer, then follows the escrow-protected settlement flow.",
                  href: "/rfqs",
                },
                {
                  label: "Maker view",
                  desc: "Submits a firm USDC quote against the private RFQ, funds the Trustless Work escrow, and approves release once XLM is received.",
                  href: "/rfqs",
                },
                {
                  label: "Deal / escrow view",
                  desc: "Shows the live escrow deal: funds locked, contract ID, settlement state, and the Trustless Work escrow proof.",
                  href: "/deals/deal-rfq1",
                },
              ].map(({ label, desc, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="bg-[#2a2a2a] hover:bg-[#373232] px-5 py-4 flex flex-col gap-1.5 transition-colors"
                >
                  <p className="text-white font-semibold text-[13px]">{label}</p>
                  <p className="text-white/35 text-[12px] leading-relaxed">{desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* â”€â”€ CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-[#2a2a2a] border-t border-[#373232]">
        <div className="text-center py-24 px-4 flex flex-col items-center gap-5 max-w-xl mx-auto">
          <h2 className={`${playfair.className} text-3xl sm:text-[2.5rem] font-bold text-white leading-snug`}>
            Start with a private RFQ. Settle with escrow.
          </h2>
          <p className="text-white/45 text-base leading-relaxed">
            Define the trade, collect maker quotes, accept the best offer, and let Trustless Work handle the settlement trust problem.
          </p>
          <div className="flex items-center gap-5 mt-1">
            <Link
              href="/rfqs/new"
              className="bg-white hover:bg-white/90 text-[#1a1a1a] font-semibold px-7 py-3 rounded text-[14px] transition-colors"
            >
              Create RFQ
            </Link>
            <Link
              href="/rfqs"
              className={`${dmMono.className} text-white/40 hover:text-white text-[13px] flex items-center gap-1.5 transition-colors group`}
            >
              Browse RFQs
              <span className="group-hover:translate-x-0.5 transition-transform inline-block">â†’</span>
            </Link>
          </div>
        </div>
      </div>

      {/* MVP scope */}
      <div className="py-8 border-t border-[#2a2a2a]">
        <p className={`${dmMono.className} text-[11px] text-white/20 text-center leading-relaxed max-w-2xl mx-auto`}>
          TrustRFQ is a hackathon demo running on Stellar Testnet · No real funds · No mainnet · No fiat · No KYC
        </p>
      </div>

    </div>
  );
}

