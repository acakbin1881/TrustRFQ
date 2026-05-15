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

const inputCls = "w-full bg-[#373232] border border-[#3f3b3b] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5c5151] placeholder:text-white/20";

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
        isValid ? "bg-[#2a2a2a] border-[#373232]" : "bg-[#2a2a2a] border-[#3f3b3b] opacity-60"
      }`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isValid ? "text-white" : "text-white/50"}`}>
            {quote.quoteAmount.toLocaleString()} {rfq.buyAsset}
          </span>
          {belowMinimum && (
            <span className="text-xs bg-[#373232] text-white/50 px-2 py-0.5 rounded-full font-medium border border-[#3f3b3b]">
              Below minimum
            </span>
          )}
          {expired && (
            <span className="text-xs bg-[#373232] text-white/50 px-2 py-0.5 rounded-full font-medium border border-[#3f3b3b]">
              Expired
            </span>
          )}
          {quote.status !== "pending" && (
            <span className="text-xs bg-[#373232] text-white/50 px-2 py-0.5 rounded-full font-medium border border-[#3f3b3b]">
              {quote.status}
            </span>
          )}
        </div>
        <span className="text-xs text-white/40 font-mono">
          {quote.makerAddress.slice(0, 8)}...{quote.makerAddress.slice(-4)}
        </span>
        <span className="text-xs text-white/30">Quote expires {fmt(quote.expiresAt)}</span>
      </div>
      <div className="shrink-0">
        {isValid && canAccept ? (
          <button
            onClick={() => onAccept(quote)}
            className="bg-[#5c5151] hover:bg-[#6a5e5e] text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors"
          >
            Accept quote
          </button>
        ) : !isValid ? (
          <span className="text-white/30 text-xs">Cannot accept</span>
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
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Submitted quotes — RFQ creator view
        </h2>
        <p className="text-xs text-white/30 mt-0.5">Only you can see submitted quotes.</p>
      </div>

      {quotes.length === 0 && <p className="text-white/40 text-sm">No quotes submitted yet.</p>}

      {validQuotes.map((quote) => (
        <QuoteRow key={quote.id} quote={quote} rfq={rfq} canAccept={isOpen && accepting === null} onAccept={onAccept} />
      ))}

      {invalidQuotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-white/30 uppercase tracking-widest">
            Invalid or unavailable — cannot be accepted ({invalidQuotes.length})
          </p>
          {invalidQuotes.map((quote) => (
            <QuoteRow key={quote.id} quote={quote} rfq={rfq} canAccept={false} onAccept={onAccept} />
          ))}
        </div>
      )}

      {accepting && <p className="text-white/70 text-sm text-center">Quote accepted — creating escrow deal...</p>}
      {error && <p className="text-white/80 text-xs bg-[#373232] border border-[#3f3b3b] rounded-lg px-3 py-2">{error}</p>}

      {isOpen && (
        <div className="text-xs text-white/30 border-t border-[#373232] pt-4 space-y-1">
          <p>TrustRFQ only creates the XLM/USDC agreement here.</p>
          <p className="text-white/60">
            Accepting one quote closes this RFQ and hands the USDC settlement leg to Trustless Work escrow.
          </p>
        </div>
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
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">Maker quote view</h2>
          <p className="text-xs text-white/30 mt-0.5">This RFQ is no longer accepting quotes.</p>
        </div>
        <div className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5">
          <p className="text-white/80 text-sm font-medium">Quote submission is closed.</p>
          <p className="text-white/40 text-xs mt-1">Makers cannot submit quotes after an RFQ is closed, cancelled, or expired.</p>
        </div>
      </section>
    );
  }

  if (myQuote) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">Maker quote view</h2>
        <div className="bg-[#2a2a2a] border border-[#5c5151] rounded-xl p-5 flex flex-col gap-2">
          <p className="text-white/70 text-sm font-medium">Quote submitted.</p>
          <p className="text-white font-semibold">{myQuote.quoteAmount.toLocaleString()} {rfq.buyAsset}</p>
          <p className="text-xs text-white/40">Expires {fmt(myQuote.expiresAt)}</p>
          <p className="text-xs text-white/30 mt-1">
            Competing quotes are hidden. Switch back to RFQ Creator to accept this quote.
          </p>
          <p className="text-xs text-white/60">
            Trustless Work escrow starts only after the RFQ Creator accepts one quote.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">Maker quote view</h2>
        <p className="text-xs text-white/30 mt-0.5">Submit the USDC amount you will pay for this XLM RFQ. Competing quotes are hidden.</p>
      </div>

      <form onSubmit={submitQuote} className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Submit a firm quote</h3>
          <p className="text-xs text-white/40 mt-1">This quote is the USDC side of the XLM/USDC agreement. Trustless Work settlement starts only if it is accepted.</p>
        </div>
        <div>
          <label className="text-xs text-white/50 block mb-1">Amount you will deliver ({rfq.buyAsset})</label>
          <input type="number" min="0" step="any" required placeholder={`Minimum ${rfq.buyAmount.toLocaleString()}`} value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormError(""); }} className={inputCls} />
          <p className="text-xs text-white/30 mt-1">Quotes below {rfq.buyAmount.toLocaleString()} {rfq.buyAsset} are below the minimum and cannot be accepted.</p>
        </div>
        <div>
          <label className="text-xs text-white/50 block mb-1">Your address <span className="text-white/30">(mock)</span></label>
          <input type="text" placeholder="G..." value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={`${inputCls} font-mono`} />
        </div>
        {formError && <p className="text-white/80 text-xs bg-[#373232] border border-[#3f3b3b] rounded-lg px-3 py-2">{formError}</p>}
        <button type="submit" disabled={submitting} className="bg-white hover:bg-white/90 disabled:bg-[#373232] disabled:text-white/30 text-[#1a1a1a] font-semibold py-2 rounded-lg transition-colors text-sm">
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
    return <p className="text-white/40 text-center pt-20">Loading RFQ...</p>;
  }

  if (loadError) {
    return <p className="text-white/70 text-center pt-20">{loadError}</p>;
  }

  if (!rfq) {
    return (
      <div className="text-center pt-20">
        <p className="text-white/40">RFQ not found.</p>
        <Link href="/rfqs" className="text-white/60 hover:text-white text-sm mt-2 block transition-colors">Back to RFQs</Link>
      </div>
    );
  }

  const isCreator = rfq.creatorAddress === currentAddress;
  const status = deriveRfqStatus(rfq);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/rfqs" className="text-white/40 hover:text-white/70 text-sm transition-colors">← Back to RFQs</Link>
        <div className="flex items-start justify-between mt-3 gap-4">
          <h1 className="text-2xl font-bold text-white">
            {rfq.sellAmount.toLocaleString()} {rfq.sellAsset} → min {rfq.buyAmount.toLocaleString()} {rfq.buyAsset}
          </h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-1 ${STATUS_COLOR[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-xs text-white/60 mt-2 bg-[#373232] border border-[#3f3b3b] rounded-lg px-3 py-2 inline-block">
          XLM/USDC agreement — quotes are private; accepted quote becomes a Trustless Work USDC escrow
        </p>
      </div>

      <div className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-white/40 text-xs mb-1">RFQ creator</p>
          <p className="text-white font-mono text-xs">{rfq.creatorAddress.slice(0, 12)}...{rfq.creatorAddress.slice(-6)}</p>
        </div>
        <div>
          <p className="text-white/40 text-xs mb-1">Expires</p>
          <p className="text-white">{fmt(rfq.expiresAt)}</p>
        </div>
        <div>
          <p className="text-white/40 text-xs mb-1">Selling</p>
          <p className="text-white font-semibold">{rfq.sellAmount.toLocaleString()} {rfq.sellAsset}</p>
        </div>
        <div>
          <p className="text-white/40 text-xs mb-1">Minimum receive amount</p>
          <p className="text-white font-semibold">{rfq.buyAmount.toLocaleString()} {rfq.buyAsset}</p>
          <p className="text-white/40 text-xs mt-0.5">Hard floor — quotes below this are invalid</p>
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
