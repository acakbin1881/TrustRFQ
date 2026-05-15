"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_COLOR, STATUS_LABEL, fmt, type Rfq } from "@/lib/mock-data";
import { deriveRfqStatus, listRfqs } from "@/lib/rfq-repository";
import { connectWallet } from "@/lib/wallet";

function RfqCard({ rfq, walletAddress }: { rfq: Rfq; walletAddress: string }) {
  const isCreator = walletAddress === rfq.creatorAddress;
  const status = deriveRfqStatus(rfq);

  return (
    <div className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">
            {rfq.sellAmount.toLocaleString()} {rfq.sellAsset}
          </span>
          <span className="text-white/40">-&gt;</span>
          <span className="text-white/80 font-semibold text-lg">
            {rfq.buyAmount.toLocaleString()} {rfq.buyAsset}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>Expires {fmt(rfq.expiresAt)}</span>
          <span>·</span>
          <span className="font-mono truncate max-w-[180px]">
            {rfq.creatorAddress.slice(0, 8)}...{rfq.creatorAddress.slice(-4)}
          </span>
          {isCreator && <span className="text-white/60">your RFQ</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <Link
          href={`/rfqs/${rfq.id}`}
          className="bg-[#373232] hover:bg-[#3f3b3b] text-white/80 hover:text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          {!walletAddress
            ? "Open RFQ ->"
            : isCreator
            ? "Review quotes ->"
            : "Submit private quote ->"}
        </Link>
      </div>
    </div>
  );
}

export default function RfqsPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listRfqs().then((data) => {
      if (active) {
        setRfqs(data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <p className="text-white/40 text-center pt-20">Loading RFQs...</p>;
  }

  const open = rfqs.filter((r) => deriveRfqStatus(r) === "open");
  const closed = rfqs.filter((r) => deriveRfqStatus(r) !== "open");

  async function connectRoleWallet() {
    const address = await connectWallet();
    setWalletAddress(address);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">RFQs</h1>
          <p className="text-white/50 text-sm mt-1">
            Open private requests for quotes
          </p>
        </div>
        <Link
          href="/rfqs/new"
          className="bg-white hover:bg-white/90 text-[#1a1a1a] px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + New RFQ
        </Link>
      </div>

      <section className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Wallet role
          </p>
          <p className="text-sm text-white/50 mt-1">
            {walletAddress
              ? `Connected as ${walletAddress}`
              : "Connect your wallet so RFQs open as creator or maker based on address."}
          </p>
        </div>
        <button
          type="button"
          onClick={connectRoleWallet}
          className="bg-[#373232] hover:bg-[#3f3b3b] text-white/80 text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          {walletAddress ? "Change wallet" : "Connect wallet"}
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-white/40 text-sm">No open RFQs.</p>
        ) : (
          open.map((rfq) => <RfqCard key={rfq.id} rfq={rfq} walletAddress={walletAddress} />)
        )}
      </section>

      {closed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Closed / Expired ({closed.length})
          </h2>
          {closed.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} walletAddress={walletAddress} />
          ))}
        </section>
      )}
    </div>
  );
}
