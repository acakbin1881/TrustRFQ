"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ASSETS = ["XLM", "USDC", "EURC"] as const;
const EXPIRIES = [
  { label: "1 hour", value: "1h" },
  { label: "4 hours", value: "4h" },
  { label: "24 hours", value: "24h" },
  { label: "48 hours", value: "48h" },
] as const;

export default function NewRfqPage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    sellAsset: "XLM",
    sellAmount: "",
    buyAsset: "USDC",
    buyAmount: "",
    expiry: "24h",
    counterparty: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => router.push("/rfqs"), 1500);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <div className="w-12 h-12 bg-green-900 rounded-full flex items-center justify-center text-green-400 text-2xl">
          ✓
        </div>
        <h2 className="text-xl font-bold text-white">RFQ created</h2>
        <p className="text-slate-400 text-sm">Redirecting to RFQ list…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-8">
      <div>
        <Link href="/rfqs" className="text-slate-500 hover:text-slate-300 text-sm">
          ← Back to RFQs
        </Link>
        <h1 className="text-2xl font-bold text-white mt-3">New RFQ</h1>
        <p className="text-slate-400 text-sm mt-1">
          Post a private request for quote. Selected makers submit firm quotes. Quotes are visible only to you.
        </p>
        <p className="text-xs text-amber-400 mt-2 bg-amber-950/40 border border-amber-900/40 rounded-lg px-3 py-2 inline-block">
          Private RFQ · This is not a public auction · Makers cannot see competing quotes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Sell side */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            You are selling
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Asset</label>
              <select
                value={form.sellAsset}
                onChange={(e) => set("sellAsset", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {ASSETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="any"
                required
                placeholder="0"
                value={form.sellAmount}
                onChange={(e) => set("sellAmount", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>

        {/* Buy side */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            You want to receive
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Asset</label>
              <select
                value={form.buyAsset}
                onChange={(e) => set("buyAsset", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {ASSETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">
                Minimum receive amount
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                placeholder="0"
                value={form.buyAmount}
                onChange={(e) => set("buyAmount", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
              <p className="text-xs text-slate-600 mt-1">Hard floor — quotes below this amount are invalid.</p>
            </div>
          </div>
        </div>

        {/* Expiry + optional counterparty */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Settings
          </h2>
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              RFQ expires in
            </label>
            <select
              value={form.expiry}
              onChange={(e) => set("expiry", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {EXPIRIES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Invited maker address{" "}
              <span className="text-slate-600">(optional — leave blank to allow any maker)</span>
            </label>
            <input
              type="text"
              placeholder="G…"
              value={form.counterparty}
              onChange={(e) => set("counterparty", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600 font-mono"
            />
            <p className="text-xs text-slate-600 mt-1">Invited makers submit private firm quotes. They cannot see each other&apos;s quotes.</p>
          </div>
        </div>

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Post RFQ
        </button>
      </form>
    </div>
  );
}
