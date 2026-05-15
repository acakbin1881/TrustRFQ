"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt, type Deal } from "@/lib/mock-data";
import { listDeals } from "@/lib/rfq-repository";

function dealLabel(deal: Deal): string {
  if (deal.status === "settled") return "Settled";
  if (deal.status === "refunded") return "Refunded";
  if (deal.takerDeposited && deal.makerDeposited) return "Both funded";
  if (deal.takerDeposited) return "Awaiting maker";
  if (deal.makerDeposited) return "Awaiting creator";
  return "Pending deposits";
}

function dealColor(deal: Deal): string {
  if (deal.status === "settled") return "bg-[#373232] text-white/70 border-[#5c5151]";
  if (deal.status === "refunded") return "bg-[#2a2a2a] text-white/40 border-[#373232]";
  if (deal.takerDeposited && deal.makerDeposited) return "bg-[#373232] text-white/60 border-[#3f3b3b]";
  return "bg-[#2a2a2a] text-white/50 border-[#373232]";
}

function DealCard({ deal }: { deal: Deal }) {
  return (
    <div className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold">
            {deal.sellAmount.toLocaleString()} {deal.sellAsset}
          </span>
          <span className="text-white/30 text-sm">→</span>
          <span className="text-white font-semibold">
            {deal.buyAmount.toLocaleString()} {deal.buyAsset}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="font-mono">{deal.id}</span>
          <span>·</span>
          <span>Created {fmt(deal.createdAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${dealColor(deal)}`}>
          {dealLabel(deal)}
        </span>
        <Link
          href={`/deals/${deal.id}`}
          className="bg-[#373232] hover:bg-[#3f3b3b] text-white/80 hover:text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          View deal →
        </Link>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listDeals().then((data) => {
      if (active) {
        setDeals(data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <p className="text-white/40 text-center pt-20">Loading deals...</p>;
  }

  const active = deals.filter((d) => d.status === "pending_deposits");
  const closed = deals.filter((d) => d.status !== "pending_deposits");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Deals</h1>
        <p className="text-white/50 text-sm mt-1">
          Escrow deals created from accepted quotes
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-white/40 text-sm">No active deals.</p>
        ) : (
          active.map((deal) => <DealCard key={deal.id} deal={deal} />)
        )}
      </section>

      {closed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Closed ({closed.length})
          </h2>
          {closed.map((deal) => <DealCard key={deal.id} deal={deal} />)}
        </section>
      )}
    </div>
  );
}
