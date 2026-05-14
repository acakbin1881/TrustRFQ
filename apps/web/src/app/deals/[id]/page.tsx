"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { fmt, type Deal, type DealStatus } from "@/lib/mock-data";
import { getDeal, updateDealDeposit, updateDealStatus } from "@/lib/rfq-repository";
import { useTrustlessWorkEscrow } from "@/lib/trustless-work-escrow";
import { connectWallet } from "@/lib/wallet";

type StepStatus = "done" | "active" | "pending";

function StepDot({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="w-5 h-5 rounded-full bg-green-950 border border-green-700/60 flex items-center justify-center shrink-0 text-green-400 text-[10px] font-bold">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="w-5 h-5 rounded-full bg-blue-950/80 border border-blue-600/50 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-blue-400 lp-pulse inline-block" />
      </span>
    );
  }
  return <span className="w-5 h-5 rounded-full border border-slate-700 shrink-0" />;
}

function Step({
  label,
  sub,
  status,
  action,
}: {
  label: string;
  sub?: string;
  status: StepStatus;
  action?: React.ReactNode;
}) {
  const labelColor =
    status === "done" ? "text-green-300" :
    status === "active" ? "text-white" :
    "text-slate-500";

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <StepDot status={status} />
        <div className="w-px flex-1 bg-slate-800 mt-1 min-h-[24px]" />
      </div>
      <div className="flex-1 pb-5">
        <p className={`font-medium text-sm ${labelColor}`}>{label}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5 leading-snug">{sub}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

function ActionBtn({
  onClick,
  children,
  variant = "primary",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "success" | "warning";
}) {
  const cls =
    variant === "success" ? "bg-green-700 hover:bg-green-600 text-white" :
    variant === "warning" ? "bg-amber-700 hover:bg-amber-600 text-white" :
    "bg-teal-400 hover:bg-teal-300 text-slate-950";
  return (
    <button
      onClick={onClick}
      className={`${cls} text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors`}
    >
      {children}
    </button>
  );
}

function mockContractId(dealId: string): string {
  let h = 0x9A3F;
  for (const c of dealId) h = ((h << 5) - h + c.charCodeAt(0)) & 0xFFFF;
  return `TRFQ-${h.toString(16).toUpperCase().padStart(4, "0")}`;
}

function NextActionCallout({ deal }: { deal: Deal }) {
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const dealExpired = new Date(deal.expiresAt) < new Date();
  const bothFunded = deal.takerDeposited && deal.makerDeposited;

  if (isSettled || isRefunded) return null;

  let message: string;
  let color: string;

  if (dealExpired) {
    message = "Escrow expired — trigger a refund to return deposited funds.";
    color = "border-amber-800/50 bg-amber-950/30 text-amber-300";
  } else if (bothFunded) {
    message = "Both sides funded. Ready to settle — release funds atomically.";
    color = "border-green-800/50 bg-green-950/30 text-green-300";
  } else if (!deal.takerDeposited) {
    message = `Waiting on RFQ creator — must deposit ${deal.sellAmount.toLocaleString()} ${deal.sellAsset} into escrow.`;
    color = "border-blue-800/50 bg-blue-950/30 text-blue-300";
  } else {
    message = `Waiting on quote maker — must deposit ${deal.buyAmount.toLocaleString()} ${deal.buyAsset} into escrow.`;
    color = "border-blue-800/50 bg-blue-950/30 text-blue-300";
  }

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 mt-1.5 lp-pulse inline-block" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5 opacity-60">
          Next required action
        </p>
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [initializingEscrow, setInitializingEscrow] = useState(false);
  const { initializeEscrow } = useTrustlessWorkEscrow();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const loadedDeal = await getDeal(id);
        if (active) setDeal(loadedDeal);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load deal.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  async function markRfqCreatorFunded() {
    if (!deal) return;
    setError("");
    try {
      const updated = await updateDealDeposit(deal.id, "rfq_creator");
      setDeal((current) => current && { ...current, ...updated, takerDeposited: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark RFQ creator funded.");
    }
  }

  async function markQuoteMakerFunded() {
    if (!deal) return;
    setError("");
    try {
      const updated = await updateDealDeposit(deal.id, "quote_maker");
      setDeal((current) => current && { ...current, ...updated, makerDeposited: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark quote maker funded.");
    }
  }

  async function setStatus(status: DealStatus) {
    if (!deal) return;
    setError("");
    try {
      const updated = await updateDealStatus(deal.id, status);
      setDeal((current) =>
        current && {
          ...current,
          ...updated,
          status,
          settledAt: status === "settled" ? new Date().toISOString() : current.settledAt,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update deal status.");
    }
  }

  async function connectTestnetWallet() {
    setError("");
    try {
      const address = await connectWallet();
      setWalletAddress(address);
      return address;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect wallet.";
      setError(message);
      throw new Error(message);
    }
  }

  async function initializeTrustlessWorkEscrow() {
    if (!deal) return;
    setError("");
    setInitializingEscrow(true);

    try {
      const signer = walletAddress || await connectTestnetWallet();
      await initializeEscrow(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not initialize Trustless Work escrow.");
    } finally {
      setInitializingEscrow(false);
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-center pt-20">Loading deal...</p>;
  }

  if (!deal) {
    return (
      <div className="text-center pt-20">
        <p className="text-slate-400">Deal not found.</p>
        <Link href="/deals" className="text-teal-400 hover:underline text-sm mt-2 block">
          Back to Deals
        </Link>
      </div>
    );
  }

  const rfqCreatorDeposited = deal.takerDeposited;
  const quoteMakerDeposited = deal.makerDeposited;
  const bothFunded = rfqCreatorDeposited && quoteMakerDeposited;
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const dealExpired = new Date(deal.expiresAt) < new Date();
  const contractId = deal.contractId ?? mockContractId(deal.id);

  const s1: StepStatus = "done";
  const s2: StepStatus = rfqCreatorDeposited ? "done" : isSettled || isRefunded ? "pending" : "active";
  const s3: StepStatus = quoteMakerDeposited ? "done" : rfqCreatorDeposited && !isSettled && !isRefunded ? "active" : "pending";
  const s4: StepStatus = isSettled ? "done" : bothFunded && !isRefunded ? "active" : "pending";
  const s5: StepStatus = isSettled || isRefunded ? "done" : "pending";

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <Link href="/deals" className="text-slate-500 hover:text-slate-300 text-sm">
          ← Deals
        </Link>
        <div className="flex items-center justify-between mt-3 gap-4">
          <h1 className="text-2xl font-bold text-white">
            Deal{" "}
            <span className="text-slate-500 font-mono text-base">{deal.id}</span>
          </h1>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 border ${
              isSettled
                ? "bg-green-900/50 text-green-300 border-green-800/40"
                : isRefunded
                ? "bg-slate-700/60 text-slate-300 border-slate-600/40"
                : "bg-blue-900/50 text-blue-300 border-blue-800/40"
            }`}
          >
            {isSettled ? "Settled" : isRefunded ? "Refunded" : "Pending deposits"}
          </span>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-xs bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* ── Next required action ────────────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Trustless Work escrow
            </p>
            <p className="text-sm text-slate-400">
              {deal.contractId
                ? "Escrow initialized on Trustless Work testnet."
                : "Initialize a single-release testnet escrow for this accepted quote."}
            </p>
          </div>
          <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800/40 px-2 py-1 rounded-full shrink-0">
            {deal.escrowStatus.replaceAll("_", " ")}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-slate-500 mb-1">Wallet</p>
            <p className="text-slate-300 font-mono break-all">
              {walletAddress || "Not connected"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-slate-500 mb-1">Contract ID</p>
            <p className="text-teal-300 font-mono break-all">
              {deal.contractId ?? "Not initialized"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {!walletAddress && (
            <ActionBtn onClick={connectTestnetWallet}>
              Connect testnet wallet
            </ActionBtn>
          )}
          {!deal.contractId && (
            <ActionBtn onClick={initializeTrustlessWorkEscrow}>
              {initializingEscrow ? "Initializing..." : "Initialize Trustless Work escrow"}
            </ActionBtn>
          )}
        </div>
      </section>

      <NextActionCallout deal={deal} />

      {/* ── Deal info grid ──────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 text-xs mb-1">RFQ creator</p>
          <p className="text-white font-mono text-xs">
            {deal.takerAddress.slice(0, 10)}...{deal.takerAddress.slice(-4)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Quote maker</p>
          <p className="text-white font-mono text-xs">
            {deal.makerAddress.slice(0, 10)}...{deal.makerAddress.slice(-4)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">RFQ creator sends</p>
          <p className="text-white font-semibold">
            {deal.sellAmount.toLocaleString()} {deal.sellAsset}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Quote maker sends</p>
          <p className="text-white font-semibold">
            {deal.buyAmount.toLocaleString()} {deal.buyAsset}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Contract ID</p>
          <p className="text-teal-300 font-mono text-xs font-semibold">{contractId}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Network</p>
          <p className="text-white text-xs">Stellar Testnet</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs mb-1">Escrow expires</p>
          <p
            className={
              dealExpired && !isSettled ? "text-red-400" : "text-white"
            }
          >
            {fmt(deal.expiresAt)}
            {dealExpired && !isSettled && " (expired)"}
          </p>
        </div>
        {deal.settledAt && (
          <div>
            <p className="text-slate-500 text-xs mb-1">Settled at</p>
            <p className="text-green-300">{fmt(deal.settledAt)}</p>
          </div>
        )}
      </div>

      {/* ── Escrow Viewer CTA ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-xs text-slate-500">Trustless Work</span>
        <span className="text-teal-300 font-mono text-xs">{contractId}</span>
        <span className="text-slate-700">·</span>
        <span className="text-xs text-teal-400/70 hover:text-teal-300 cursor-pointer transition-colors font-medium">
          View in Escrow Viewer →
        </span>
      </div>

      {/* ── Escrow timeline ─────────────────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-6">
          Escrow timeline
        </h2>
        <div>
          <Step
            label="Quote accepted"
            sub="Deal terms locked. Both parties committed."
            status={s1}
          />
          <Step
            label="RFQ creator deposits"
            sub={`${deal.sellAmount.toLocaleString()} ${deal.sellAsset} locked in escrow`}
            status={s2}
            action={
              !rfqCreatorDeposited && !isSettled && !isRefunded ? (
                <ActionBtn onClick={markRfqCreatorFunded}>
                  Mark RFQ creator funded (mock)
                </ActionBtn>
              ) : rfqCreatorDeposited ? (
                <span className="text-green-400 text-xs font-medium">Funds locked ✓</span>
              ) : null
            }
          />
          <Step
            label="Quote maker deposits"
            sub={`${deal.buyAmount.toLocaleString()} ${deal.buyAsset} locked in escrow`}
            status={s3}
            action={
              !quoteMakerDeposited && !isSettled && !isRefunded ? (
                <ActionBtn onClick={markQuoteMakerFunded}>
                  Mark quote maker funded (mock)
                </ActionBtn>
              ) : quoteMakerDeposited ? (
                <span className="text-green-400 text-xs font-medium">Funds locked ✓</span>
              ) : null
            }
          />
          <Step
            label="Ready to settle"
            sub="Both sides funded. Atomic final release available."
            status={s4}
            action={
              bothFunded && !isSettled && !isRefunded ? (
                <ActionBtn onClick={() => setStatus("settled")} variant="success">
                  Settle deal (mock)
                </ActionBtn>
              ) : null
            }
          />
          <Step
            label={
              isSettled ? "Settled" :
              isRefunded ? "Refunded" :
              dealExpired ? "Refund available" :
              "Settlement / Refund"
            }
            sub={
              isSettled ? "Assets released according to the locked deal terms." :
              isRefunded ? "Deposits returned to each party." :
              dealExpired ? "Expiry passed. Refund is available." :
              "Settle once both funded, or refund after expiry."
            }
            status={s5}
            action={
              dealExpired && !isSettled && !isRefunded ? (
                <ActionBtn onClick={() => setStatus("refunded")} variant="warning">
                  Trigger refund (mock)
                </ActionBtn>
              ) : null
            }
          />
        </div>
      </section>

      {/* ── Outcome banners ─────────────────────────────────────────────────── */}
      {isSettled && (
        <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-5 text-center">
          <p className="text-green-300 font-semibold">
            Settlement complete. RFQ creator received {deal.buyAmount.toLocaleString()}{" "}
            {deal.buyAsset}. Quote maker received {deal.sellAmount.toLocaleString()}{" "}
            {deal.sellAsset}.
          </p>
        </div>
      )}

      {isRefunded && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 text-center">
          <p className="text-slate-300 font-semibold">
            Deal expired. All deposited funds have been returned.
          </p>
        </div>
      )}

    </div>
  );
}
