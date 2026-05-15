"use client";

import { useState, useMemo } from "react";
import { DM_Mono } from "next/font/google";

const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"] });

// Constant-product AMM: pool 5M XLM / 500k USDC, 0.3% fee
function simulateAMM(usdValue: number): number {
  const reserveBase = 5_000_000;
  const reserveQuote = 500_000;
  const feeRate = 0.003;
  const xlmIn = usdValue / 0.10;
  const effectiveInput = xlmIn * (1 - feeRate);
  return (reserveQuote * effectiveInput) / (reserveBase + effectiveInput);
}

function fmtUSD(v: number): string {
  return "$" + Math.round(v).toLocaleString("en-US");
}

function fmtXLM(usd: number): string {
  return Math.round(usd / 0.10).toLocaleString("en-US") + " XLM";
}

export function SlippageCalculator() {
  const [usd, setUsd] = useState(100_000);

  const actualOut = useMemo(() => simulateAMM(usd), [usd]);
  const loss = Math.max(0, usd - actualOut);
  const pct = (loss / usd) * 100;
  const bps = Math.round(pct * 100);

  const BAR_H = 100;
  const actualBarH = Math.round((actualOut / usd) * BAR_H);

  return (
    <div className="flex flex-col gap-6">
      {/* Slider */}
      <div className="flex items-center gap-4">
        <span className={`${dmMono.className} text-[12px] text-white/40 shrink-0 w-36`}>
          Trade size (USDC)
        </span>
        <input
          type="range"
          min={10_000}
          max={1_000_000}
          step={10_000}
          value={usd}
          onChange={(e) => setUsd(Number(e.target.value))}
          className="flex-1"
          style={{ accentColor: "rgba(255,255,255,0.55)" }}
        />
        <span className={`${dmMono.className} text-[15px] font-medium text-white w-28 text-right`}>
          {fmtUSD(usd)}
        </span>
      </div>

      <div className={`${dmMono.className} text-[12px] text-white/30 -mt-2`}>
        ≈ {fmtXLM(usd)} at $0.10 / XLM
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1a1a1a] rounded px-4 py-3.5">
          <p className="text-[12px] text-white/40 mb-1.5">You intend to get</p>
          <p className={`${dmMono.className} text-[18px] font-medium text-white`}>{fmtUSD(usd)}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded px-4 py-3.5">
          <p className="text-[12px] text-white/40 mb-1.5">DEX pays you</p>
          <p className={`${dmMono.className} text-[18px] font-medium text-red-400`}>{fmtUSD(actualOut)}</p>
        </div>
        <div className="bg-red-950/25 border border-red-900/40 rounded px-4 py-3.5">
          <p className="text-[12px] text-red-400/70 mb-1.5">Slippage loss</p>
          <p className={`${dmMono.className} text-[18px] font-medium text-red-400`}>
            −{fmtUSD(loss)}
          </p>
          <p className={`${dmMono.className} text-[11px] text-red-500/60 mt-0.5`}>
            {pct.toFixed(2)}% · {bps} bps
          </p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end justify-center gap-12 pt-2" style={{ height: `${BAR_H + 32}px` }}>
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-20 bg-white/20 rounded-sm"
            style={{ height: `${BAR_H}px` }}
          />
          <span className="text-[12px] text-white/35">Intended</span>
        </div>
        <div className="flex flex-col items-center gap-2 justify-end" style={{ height: `${BAR_H + 24}px` }}>
          <div
            className="w-20 bg-red-500 rounded-sm transition-all duration-200"
            style={{ height: `${actualBarH}px` }}
          />
          <span className="text-[12px] text-white/35">DEX output</span>
        </div>
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-white/20 leading-relaxed">
        Constant-product AMM · pool depth 5M XLM / 500k USDC · 0.3% fee · Stellar reference price $0.10 / XLM
      </p>
    </div>
  );
}
