"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MOCK_RFQS,
  MOCK_QUOTES,
  DEAL_ID_FOR_RFQ,
  STATUS_LABEL,
  STATUS_COLOR,
  fmt,
  type Quote,
} from "@/lib/mock-data";

function QuoteRow({
  quote,
  onAccept,
  canAccept,
}: {
  quote: Quote;
  onAccept: (q: Quote) => void;
  canAccept: boolean;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-white font-semibold">
          {quote.quoteAmount.toLocaleString()} USDC
        </span>
        <span className="text-xs text-slate-500 font-mono">
          {quote.takerAddress.slice(0, 8)}…{quote.takerAddress.slice(-4)}
        </span>
        <span className="text-xs text-slate-600">
          Quote expires {fmt(quote.expiresAt)}
        </span>
      </div>
      {canAccept && (
        <button
          onClick={() => onAccept(quote)}
          className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors shrink-0"
        >
          Accept quote
        </button>
      )}
    </div>
  );
}

export default function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const rfq = MOCK_RFQS.find((r) => r.id === id);

  const [quotes, setQuotes] = useState<Quote[]>(MOCK_QUOTES[id] ?? []);
  const [showForm, setShowForm] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ amount: "", address: "" });
  const [accepting, setAccepting] = useState<string | null>(null);

  if (!rfq) {
    return (
      <div className="text-center pt-20">
        <p className="text-slate-400">RFQ not found.</p>
        <Link href="/rfqs" className="text-blue-400 hover:underline text-sm mt-2 block">
          ← Back to RFQs
        </Link>
      </div>
    );
  }

  function submitQuote(e: React.FormEvent) {
    e.preventDefault();
    const newQ: Quote = {
      id: `quote-${Date.now()}`,
      rfqId: id,
      takerAddress: quoteForm.address || "GNEWX7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2ZZ",
      quoteAmount: parseFloat(quoteForm.amount),
      status: "pending",
      expiresAt: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    setQuotes((q) => [...q, newQ]);
    setQuoteForm({ amount: "", address: "" });
    setShowForm(false);
  }

  function acceptQuote(quote: Quote) {
    setAccepting(quote.id);
    const dealId = DEAL_ID_FOR_RFQ[id] ?? `deal-${id}`;
    setTimeout(() => router.push(`/deals/${dealId}`), 600);
  }

  const isOpen = rfq.status === "open";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/rfqs" className="text-slate-500 hover:text-slate-300 text-sm">
          ← Back to RFQs
        </Link>
        <div className="flex items-start justify-between mt-3 gap-4">
          <h1 className="text-2xl font-bold text-white">
            {rfq.sellAmount.toLocaleString()} {rfq.sellAsset} →{" "}
            {rfq.buyAmount.toLocaleString()} {rfq.buyAsset}
          </h1>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-1 ${STATUS_COLOR[rfq.status]}`}
          >
            {STATUS_LABEL[rfq.status]}
          </span>
        </div>
      </div>

      {/* RFQ details */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 text-xs mb-1">Maker</p>
          <p className="text-white font-mono text-xs">
            {rfq.creatorAddress.slice(0, 12)}…{rfq.creatorAddress.slice(-6)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Expires</p>
          <p className="text-white">{fmt(rfq.expiresAt)}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Selling</p>
          <p className="text-white font-semibold">
            {rfq.sellAmount.toLocaleString()} {rfq.sellAsset}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Wants minimum</p>
          <p className="text-white font-semibold">
            {rfq.buyAmount.toLocaleString()} {rfq.buyAsset}
          </p>
        </div>
      </div>

      {/* Quotes */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
            Quotes ({quotes.length})
          </h2>
          {isOpen && (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {showForm ? "Cancel" : "+ Submit quote"}
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={submitQuote}
            className="bg-slate-900 border border-blue-900 rounded-xl p-5 flex flex-col gap-4"
          >
            <h3 className="text-sm font-semibold text-white">Your quote</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Amount you will pay ({rfq.buyAsset})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                placeholder={`Min ${rfq.buyAmount}`}
                value={quoteForm.amount}
                onChange={(e) =>
                  setQuoteForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Your address <span className="text-slate-600">(mock)</span>
              </label>
              <input
                type="text"
                placeholder="G…"
                value={quoteForm.address}
                onChange={(e) =>
                  setQuoteForm((f) => ({ ...f, address: e.target.value }))
                }
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600 font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors text-sm"
            >
              Submit quote
            </button>
          </form>
        )}

        {quotes.length === 0 && (
          <p className="text-slate-500 text-sm">
            No quotes yet.{" "}
            {isOpen && (
              <button
                onClick={() => setShowForm(true)}
                className="text-blue-400 hover:underline"
              >
                Be the first.
              </button>
            )}
          </p>
        )}

        {quotes.map((q) => (
          <QuoteRow
            key={q.id}
            quote={q}
            canAccept={isOpen && accepting === null}
            onAccept={acceptQuote}
          />
        ))}

        {accepting && (
          <p className="text-green-400 text-sm text-center">
            Quote accepted — creating deal…
          </p>
        )}
      </section>
    </div>
  );
}
