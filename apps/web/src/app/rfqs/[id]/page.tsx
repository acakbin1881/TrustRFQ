"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  fmt,
  isExpired,
  type Quote,
  type Rfq,
} from "@/lib/mock-data";
import { useCurrentIdentity } from "@/lib/identity";
import {
  acceptQuote as persistAcceptQuote,
  deriveRfqStatus,
  getRfq,
  listQuotesForRfq,
  submitQuote as persistQuote,
} from "@/lib/rfq-repository";

function QuoteRow({
  quote,
  rfq,
  onAccept,
  canAccept,
}: {
  quote: Quote;
  rfq: Rfq;
  onAccept: (q: Quote) => void;
  canAccept: boolean;
}) {
  const belowMinimum = quote.quoteAmount < rfq.buyAmount;
  const expired = isExpired(quote.expiresAt);
  const isValid = !belowMinimum && !expired && quote.status === "pending";

  return (
    <div
      className={`rounded-lg p-4 flex items-center justify-between gap-4 border ${
        isValid ? "bg-slate-800 border-slate-700" : "bg-red-950/30 border-red-900/50"
      }`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isValid ? "text-white" : "text-red-300"}`}>
            {quote.quoteAmount.toLocaleString()} {rfq.buyAsset}
          </span>
          {belowMinimum && (
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-medium">
              Below minimum
            </span>
          )}
          {expired && (
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-medium">
              Expired
            </span>
          )}
          {quote.status !== "pending" && (
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-medium">
              {quote.status}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {quote.makerAddress.slice(0, 8)}...{quote.makerAddress.slice(-4)}
        </span>
        <span className="text-xs text-slate-600">Quote expires {fmt(quote.expiresAt)}</span>
      </div>
      <div className="shrink-0">
        {isValid && canAccept ? (
          <button
            onClick={() => onAccept(quote)}
            className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors"
          >
            Accept quote
          </button>
        ) : !isValid ? (
          <span className="text-red-400 text-xs">Cannot accept</span>
        ) : null}
      </div>
    </div>
  );
}

function CreatorView({
  rfq,
  quotes,
  accepting,
  error,
  onAccept,
}: {
  rfq: Rfq;
  quotes: Quote[];
  accepting: string | null;
  error: string;
  onAccept: (q: Quote) => void;
}) {
  const status = deriveRfqStatus(rfq);
  const isOpen = status === "open";
  const validQuotes = quotes.filter((q) => q.quoteAmount >= rfq.buyAmount && !isExpired(q.expiresAt) && q.status === "pending");
  const invalidQuotes = quotes.filter((q) => q.quoteAmount < rfq.buyAmount || isExpired(q.expiresAt) || q.status !== "pending");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
          Submitted quotes - RFQ creator view
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">Only you can see submitted quotes.</p>
      </div>

      {quotes.length === 0 && <p className="text-slate-500 text-sm">No quotes submitted yet.</p>}

      {validQuotes.map((quote) => (
        <QuoteRow key={quote.id} quote={quote} rfq={rfq} canAccept={isOpen && accepting === null} onAccept={onAccept} />
      ))}

      {invalidQuotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-600 uppercase tracking-widest">
            Invalid or unavailable - cannot be accepted ({invalidQuotes.length})
          </p>
          {invalidQuotes.map((quote) => (
            <QuoteRow key={quote.id} quote={quote} rfq={rfq} canAccept={false} onAccept={onAccept} />
          ))}
        </div>
      )}

      {accepting && <p className="text-green-400 text-sm text-center">Quote accepted - creating escrow deal...</p>}
      {error && <p className="text-red-400 text-xs bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}

      {isOpen && (
        <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
          You manually select one valid quote. The best quote does not automatically win. Accepting a quote closes this RFQ and creates an escrow deal.
        </p>
      )}
    </section>
  );
}

function MakerView({ rfq, currentAddress }: { rfq: Rfq; currentAddress: string }) {
  const [myQuote, setMyQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState({ amount: "", address: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isOpen = deriveRfqStatus(rfq) === "open";

  async function submitQuote(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < rfq.buyAmount) {
      setFormError(
        `Quote must be at least ${rfq.buyAmount.toLocaleString()} ${rfq.buyAsset} (the minimum receive amount). Quotes below the minimum cannot be accepted.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const quote = await persistQuote({
        rfqId: rfq.id,
        makerAddress: form.address.trim() || currentAddress,
        quoteAmount: amount,
        expiresAt: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      });
      setMyQuote(quote);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not submit quote.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Maker quote view</h2>
          <p className="text-xs text-slate-600 mt-0.5">This RFQ is no longer accepting quotes.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-300 text-sm font-medium">Quote submission is closed.</p>
          <p className="text-slate-500 text-xs mt-1">Makers cannot request or submit quotes after an RFQ is closed, cancelled, or expired.</p>
        </div>
      </section>
    );
  }

  if (myQuote) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Maker quote view</h2>
        <div className="bg-slate-900 border border-green-900 rounded-xl p-5 flex flex-col gap-2">
          <p className="text-green-400 text-sm font-medium">Quote submitted.</p>
          <p className="text-white font-semibold">{myQuote.quoteAmount.toLocaleString()} {rfq.buyAsset}</p>
          <p className="text-xs text-slate-500">Expires {fmt(myQuote.expiresAt)}</p>
          <p className="text-xs text-slate-600 mt-1">Competing quotes are hidden. The RFQ creator will notify you if your quote is accepted.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Maker quote view</h2>
        <p className="text-xs text-slate-600 mt-0.5">Submit a firm quote. Competing quotes are not visible to you.</p>
      </div>

      <form onSubmit={submitQuote} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Submit a firm quote</h3>
          <p className="text-xs text-slate-500 mt-1">Makers cannot see competing quotes. Your quote is firm until expiry.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Amount you will deliver ({rfq.buyAsset})</label>
          <input type="number" min="0" step="any" required placeholder={`Minimum ${rfq.buyAmount.toLocaleString()}`} value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormError(""); }} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-600" />
          <p className="text-xs text-slate-600 mt-1">Quotes below {rfq.buyAmount.toLocaleString()} {rfq.buyAsset} are below the minimum and cannot be accepted.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Your address <span className="text-slate-600">(mock)</span></label>
          <input type="text" placeholder="G..." value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-600 font-mono" />
        </div>
        {formError && <p className="text-red-400 text-xs bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">{formError}</p>}
        <button type="submit" disabled={submitting} className="bg-teal-400 hover:bg-teal-300 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-semibold py-2 rounded-lg transition-colors text-sm">
          {submitting ? "Submitting..." : "Submit quote"}
        </button>
      </form>
    </section>
  );
}

export default function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [currentAddress] = useCurrentIdentity();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const loadedRfq = await getRfq(id);
        const loadedQuotes = loadedRfq ? await listQuotesForRfq(id) : [];
        if (!active) return;
        setRfq(loadedRfq);
        setQuotes(loadedQuotes);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Could not load RFQ.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [id]);

  async function acceptQuote(quote: Quote) {
    if (!rfq) return;
    setAccepting(quote.id);
    setAcceptError("");
    try {
      const deal = await persistAcceptQuote(rfq, quote);
      router.push(`/deals/${deal.id}`);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Could not accept quote.");
      setAccepting(null);
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-center pt-20">Loading RFQ...</p>;
  }

  if (loadError) {
    return <p className="text-red-400 text-center pt-20">{loadError}</p>;
  }

  if (!rfq) {
    return (
      <div className="text-center pt-20">
        <p className="text-slate-400">RFQ not found.</p>
        <Link href="/rfqs" className="text-blue-400 hover:underline text-sm mt-2 block">Back to RFQs</Link>
      </div>
    );
  }

  const isCreator = rfq.creatorAddress === currentAddress;
  const status = deriveRfqStatus(rfq);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/rfqs" className="text-slate-500 hover:text-slate-300 text-sm">Back to RFQs</Link>
        <div className="flex items-start justify-between mt-3 gap-4">
          <h1 className="text-2xl font-bold text-white">
            {rfq.sellAmount.toLocaleString()} {rfq.sellAsset} -&gt; min {rfq.buyAmount.toLocaleString()} {rfq.buyAsset}
          </h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-1 ${STATUS_COLOR[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-xs text-amber-400 mt-2 bg-amber-950/40 border border-amber-900/40 rounded-lg px-3 py-2 inline-block">
          Private RFQ - Quotes are visible only to the RFQ creator - Not a public auction
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 text-xs mb-1">RFQ creator</p>
          <p className="text-white font-mono text-xs">{rfq.creatorAddress.slice(0, 12)}...{rfq.creatorAddress.slice(-6)}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Expires</p>
          <p className="text-white">{fmt(rfq.expiresAt)}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Selling</p>
          <p className="text-white font-semibold">{rfq.sellAmount.toLocaleString()} {rfq.sellAsset}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Minimum receive amount</p>
          <p className="text-white font-semibold">{rfq.buyAmount.toLocaleString()} {rfq.buyAsset}</p>
          <p className="text-slate-500 text-xs mt-0.5">Hard floor - quotes below this are invalid</p>
        </div>
      </div>

      {isCreator ? (
        <CreatorView rfq={rfq} quotes={quotes} accepting={accepting} error={acceptError} onAccept={acceptQuote} />
      ) : (
        <MakerView rfq={rfq} currentAddress={currentAddress} />
      )}
    </div>
  );
}