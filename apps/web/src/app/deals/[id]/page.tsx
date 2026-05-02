"use client";

import { use, useState } from "react";
import Link from "next/link";
import { MOCK_DEALS, fmt, type Deal, type DealStatus } from "@/lib/mock-data";

type StepStatus = "done" | "active" | "pending";

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
  const icon =
    status === "done"
      ? "done"
      : status === "active"
        ? "active"
        : "pending";
  const iconColor =
    status === "done"
      ? "text-green-400"
      : status === "active"
        ? "text-blue-400"
        : "text-slate-600";
  const labelColor =
    status === "done"
      ? "text-green-300"
      : status === "active"
        ? "text-white"
        : "text-slate-500";

  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <span className={`text-lg font-bold ${iconColor}`}>{icon}</span>
        <div className="w-px flex-1 bg-slate-800 mt-1 min-h-[24px]" />
      </div>
      <div className="flex-1 pb-5">
        <p className={`font-medium ${labelColor}`}>{label}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
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
    variant === "success"
      ? "bg-green-700 hover:bg-green-600"
      : variant === "warning"
        ? "bg-amber-700 hover:bg-amber-600"
        : "bg-blue-600 hover:bg-blue-500";
  return (
    <button
      onClick={onClick}
      className={`${cls} text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors`}
    >
      {children}
    </button>
  );
}

export default function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const initial = MOCK_DEALS[id];
  const [deal, setDeal] = useState<Deal | null>(initial ?? null);

  if (!deal) {
    return (
      <div className="text-center pt-20">
        <p className="text-slate-400">Deal not found.</p>
        <Link
          href="/rfqs"
          className="text-blue-400 hover:underline text-sm mt-2 block"
        >
          Back to RFQs
        </Link>
      </div>
    );
  }

  function markRfqCreatorFunded() {
    setDeal((d) => d && { ...d, takerDeposited: true });
  }

  function markQuoteMakerFunded() {
    setDeal((d) => d && { ...d, makerDeposited: true });
  }

  function settle() {
    setDeal((d) =>
      d
        ? {
            ...d,
            status: "settled" as DealStatus,
            settledAt: new Date().toISOString(),
          }
        : d
    );
  }

  function refund() {
    setDeal((d) => d && { ...d, status: "refunded" as DealStatus });
  }

  const rfqCreatorDeposited = deal.takerDeposited;
  const quoteMakerDeposited = deal.makerDeposited;
  const bothFunded = rfqCreatorDeposited && quoteMakerDeposited;
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const isExpired = new Date(deal.expiresAt) < new Date();

  // derive step statuses
  const s1: StepStatus = "done"; // quote accepted = always done on deal page
  const s2: StepStatus = rfqCreatorDeposited ? "done" : isSettled || isRefunded ? "pending" : "active";
  const s3: StepStatus = quoteMakerDeposited ? "done" : rfqCreatorDeposited && !isSettled && !isRefunded ? "active" : "pending";
  const s4: StepStatus = isSettled ? "done" : bothFunded && !isRefunded ? "active" : "pending";
  const s5: StepStatus = isSettled ? "done" : isRefunded ? "done" : "pending";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/rfqs" className="text-slate-500 hover:text-slate-300 text-sm">
          Back to RFQs
        </Link>
        <div className="flex items-center justify-between mt-3 gap-4">
          <h1 className="text-2xl font-bold text-white">
            Deal{" "}
            <span className="text-slate-500 font-mono text-base">{deal.id}</span>
          </h1>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
              isSettled
                ? "bg-green-900 text-green-300"
                : isRefunded
                  ? "bg-slate-700 text-slate-300"
                  : "bg-blue-900 text-blue-300"
            }`}
          >
            {isSettled ? "Settled" : isRefunded ? "Refunded" : "Pending"}
          </span>
        </div>
      </div>

      {/* Deal terms */}
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
          <p className="text-slate-500 text-xs mb-1">Escrow expires</p>
          <p className={isExpired && !isSettled ? "text-red-400" : "text-white"}>
            {fmt(deal.expiresAt)}
            {isExpired && !isSettled && " (expired)"}
          </p>
        </div>
        {deal.settledAt && (
          <div>
            <p className="text-slate-500 text-xs mb-1">Settled at</p>
            <p className="text-green-300">{fmt(deal.settledAt)}</p>
          </div>
        )}
      </div>

      {/* Escrow timeline */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-6">
          Escrow status
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
                <span className="text-green-400 text-xs">Funds locked</span>
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
                <span className="text-green-400 text-xs">Funds locked</span>
              ) : null
            }
          />
          <Step
            label="Ready to settle"
            sub="Both sides funded. Atomic settlement available."
            status={s4}
            action={
              bothFunded && !isSettled && !isRefunded ? (
                <ActionBtn onClick={settle} variant="success">
                  Settle deal (mock)
                </ActionBtn>
              ) : null
            }
          />
          <Step
            label={
              isSettled
                ? "Settled"
                : isRefunded
                  ? "Refunded"
                  : isExpired
                    ? "Refund available"
                    : "Settlement / Refund"
            }
            sub={
              isSettled
                ? "Assets exchanged atomically. Done."
                : isRefunded
                  ? "Deposits returned to each party."
                  : isExpired
                    ? "Expiry passed. Refund is available."
                    : "Settle once both funded, or refund after expiry."
            }
            status={s5}
            action={
              isExpired && !isSettled && !isRefunded ? (
                <ActionBtn onClick={refund} variant="warning">
                  Trigger refund (mock)
                </ActionBtn>
              ) : null
            }
          />
        </div>
      </section>

      {isSettled && (
        <div className="bg-green-900/30 border border-green-800 rounded-xl p-5 text-center">
          <p className="text-green-300 font-semibold">
            Settlement complete. RFQ creator received {deal.buyAmount.toLocaleString()}{" "}
            {deal.buyAsset}. Quote maker received {deal.sellAmount.toLocaleString()}{" "}
            {deal.sellAsset}.
          </p>
        </div>
      )}

      {isRefunded && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
          <p className="text-slate-300 font-semibold">
            Deal expired. All deposited funds have been returned.
          </p>
        </div>
      )}
    </div>
  );
}
