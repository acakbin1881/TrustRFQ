"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type AssetCode } from "@/lib/mock-data";
import { createRfq } from "@/lib/rfq-repository";
import { connectWallet } from "@/lib/wallet";

const COINGECKO_IDS: Record<"XLM" | "USDC", string> = {
  XLM: "stellar",
  USDC: "usd-coin",
};

type PriceMap = Record<"XLM" | "USDC", number>;

async function fetchPrices(): Promise<PriceMap> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { next: { revalidate: 60 } }
  );
  const data = await res.json();
  return {
    XLM:  data["stellar"]?.usd   ?? 0,
    USDC: data["usd-coin"]?.usd  ?? 1,
  };
}

const EXPIRIES = [
  { label: "1 hour", value: "1h", hours: 1 },
  { label: "4 hours", value: "4h", hours: 4 },
  { label: "24 hours", value: "24h", hours: 24 },
  { label: "48 hours", value: "48h", hours: 48 },
] as const;

function expiryDate(value: string) {
  const selected = EXPIRIES.find((expiry) => expiry.value === value) ?? EXPIRIES[2];
  return new Date(Date.now() + selected.hours * 3_600_000).toISOString();
}

const inputCls = "w-full bg-[#373232] border border-[#3f3b3b] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5c5151] placeholder:text-white/20";
const labelCls = "text-xs text-white/50 block mb-1";
const cardCls = "bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 flex flex-col gap-4";
const sectionTitleCls = "text-xs font-semibold text-white/40 uppercase tracking-widest";

export default function NewRfqPage() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState<PriceMap | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);

  useEffect(() => {
    fetchPrices()
      .then(setPrices)
      .catch(() => {})
      .finally(() => setPriceLoading(false));
  }, []);

  const [form, setForm] = useState({
    sellAsset: "XLM" as AssetCode,
    sellAmount: "",
    buyAsset: "USDC" as AssetCode,
    buyAmount: "",
    expiry: "24h",
    counterparty: "",
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function connectCreatorWallet() {
    setError("");
    const address = await connectWallet();
    setWalletAddress(address);
    return address;
  }

  const oracleSuggestion = useMemo(() => {
    if (!prices) return null;
    const sellAmt = Number(form.sellAmount);
    if (!sellAmt || sellAmt <= 0) return null;
    const sellUsd = prices.XLM;
    const buyUsd = prices.USDC;
    if (!sellUsd || !buyUsd) return null;
    const raw = (sellAmt * sellUsd) / buyUsd;
    return raw.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }, [prices, form.sellAmount]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const sellAmount = Number(form.sellAmount);
    const minBuyAmount = Number(form.buyAmount);
    if (!Number.isFinite(sellAmount) || sellAmount <= 0 || !Number.isFinite(minBuyAmount) || minBuyAmount <= 0) {
      setError("Amounts must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const creatorAddress = walletAddress || await connectCreatorWallet();
      await createRfq({
        creatorAddress,
        sellAsset: "XLM",
        sellAmount,
        buyAsset: "USDC",
        minBuyAmount,
        expiresAt: expiryDate(form.expiry),
        invitedMakerAddress: form.counterparty.trim() || null,
      });
      setSubmitted(true);
      router.push("/rfqs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create RFQ.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <div className="w-12 h-12 bg-[#2a2a2a] border border-[#5c5151] rounded-full flex items-center justify-center text-white text-xl font-bold">
          ✓
        </div>
        <h2 className="text-xl font-bold text-white">RFQ created</h2>
        <p className="text-white/50 text-sm">Redirecting to RFQ list...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-8">
      <div>
        <Link href="/rfqs" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ← Back to RFQs
        </Link>
        <h1 className="text-2xl font-bold text-white mt-3">New RFQ</h1>
        <p className="text-white/50 text-sm mt-1">
          Create a private XLM/USDC agreement request. Makers quote how much USDC they will pay for your XLM.
        </p>
        <p className="text-xs text-white/60 mt-2 bg-[#373232] border border-[#3f3b3b] rounded-lg px-3 py-2 inline-block">
          XLM/USDC only - TrustRFQ sets the agreement, quote maker funds the Trustless Work USDC escrow
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className={cardCls}>
          <h2 className={sectionTitleCls}>Creator wallet</h2>
          <p className="text-sm text-white/50">
            This wallet becomes the RFQ creator for the accepted deal and receives USDC after the XLM settlement is verified.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
            <span className="text-xs text-white/60 font-mono break-all">
              {walletAddress || "No wallet connected"}
            </span>
            <button
              type="button"
              onClick={connectCreatorWallet}
              className="shrink-0 bg-[#373232] hover:bg-[#3f3b3b] text-white/80 text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              {walletAddress ? "Change" : "Connect"}
            </button>
          </div>
        </div>

        <div className={cardCls}>
          <h2 className={sectionTitleCls}>You are selling</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Asset</label>
              <div className={`${inputCls} flex items-center`}>XLM</div>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Amount</label>
              <input type="number" min="0" step="any" required placeholder="0" value={form.sellAmount} onChange={(e) => set("sellAmount", e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <h2 className={sectionTitleCls}>You want to receive</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Asset</label>
              <div className={`${inputCls} flex items-center`}>USDC</div>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Minimum receive amount</label>
              <input type="number" min="0" step="any" required placeholder="0" value={form.buyAmount} onChange={(e) => set("buyAmount", e.target.value)} className={inputCls} />
              {priceLoading && (
                <p className="text-xs text-white/30 mt-1 animate-pulse">Fetching market price…</p>
              )}
              {!priceLoading && oracleSuggestion && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-white/40">
                    Market rate: <span className="text-white/70 font-medium">~{oracleSuggestion} USDC</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => set("buyAmount", oracleSuggestion.replace(/,/g, ""))}
                    className="text-[11px] text-white/60 hover:text-white border border-[#5c5151] hover:border-[#5c5151] rounded px-1.5 py-0.5 transition-colors"
                  >
                    Use
                  </button>
                </div>
              )}
              {!priceLoading && !oracleSuggestion && (
                <p className="text-xs text-white/30 mt-1">Hard floor — quotes below this amount are invalid.</p>
              )}
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <h2 className={sectionTitleCls}>Settings</h2>
          <div>
            <label className={labelCls}>RFQ expires in</label>
            <select value={form.expiry} onChange={(e) => set("expiry", e.target.value)} className={inputCls}>
              {EXPIRIES.map((expiry) => <option key={expiry.value} value={expiry.value}>{expiry.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Invited maker address <span className="text-white/30">(optional — leave blank to allow any maker)</span>
            </label>
            <input type="text" placeholder="G..." value={form.counterparty} onChange={(e) => set("counterparty", e.target.value)} className={`${inputCls} font-mono`} />
            <p className="text-xs text-white/30 mt-1">Invited makers submit private firm quotes. They cannot see each other&apos;s quotes.</p>
          </div>
        </div>

        {error && <p className="text-white/80 text-xs bg-[#373232] border border-[#3f3b3b] rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={submitting} className="bg-white hover:bg-white/90 disabled:bg-[#373232] disabled:text-white/30 text-[#1a1a1a] font-semibold py-3 rounded-xl transition-colors">
          {submitting ? "Posting RFQ..." : "Post RFQ"}
        </button>
      </form>
    </div>
  );
}
