"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { fmt, type AssetCode, type Deal, type DealStatus } from "@/lib/mock-data";
import { getDeal, updateDealEscrow, updateDealStatus } from "@/lib/rfq-repository";
import { getTrustlessWorkEscrowAsset, useTrustlessWorkEscrow } from "@/lib/trustless-work-escrow";
import {
  addAssetTrustline,
  connectWallet,
  isValidStellarPublicKey,
  sendNativePayment,
  verifyNativePayment,
} from "@/lib/wallet";

type StepStatus = "done" | "active" | "pending";

function TimelineStep({
  label,
  sub,
  status,
  isLast = false,
}: {
  label: string;
  sub?: string;
  status: StepStatus;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
            status === "done"
              ? "border-[#5c5151] bg-[#2a2a2a]"
              : status === "active"
              ? "border-[#5c5151] bg-[#373232]"
              : "border-[#3f3b3b] bg-transparent"
          }`}
        >
          {status === "done" && (
            <span className="text-white/70 text-[8px] font-bold leading-none">✓</span>
          )}
          {status === "active" && (
            <span className="w-1.5 h-1.5 rounded-full bg-white/60 lp-pulse inline-block" />
          )}
        </span>
        {!isLast && (
          <div className="w-px flex-1 bg-[#2a2a2a] mt-1 min-h-[32px]" />
        )}
      </div>
      <div className={`flex flex-col gap-0.5 ${isLast ? "pb-0" : "pb-5"}`}>
        <p
          className={`text-xs font-semibold leading-snug ${
            status === "done"
              ? "text-white/65"
              : status === "active"
              ? "text-white"
              : "text-white/30"
          }`}
        >
          {label}
        </p>
        {sub && (
          <p className="text-white/30 text-[11px] leading-snug">{sub}</p>
        )}
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
      ? "bg-[#5c5151] hover:bg-[#6a5e5e] text-white"
      : variant === "warning"
      ? "bg-[#3f3b3b] hover:bg-[#5c5151] text-white"
      : "bg-white hover:bg-white/90 text-[#1a1a1a]";
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
  let h = 0x9a3f;
  for (const c of dealId) h = ((h << 5) - h + c.charCodeAt(0)) & 0xffff;
  return `TRFQ-${h.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isXlmSettlementMarkedComplete(deal: Deal): boolean {
  return Boolean(
      deal.transactionHashes.changeMilestone ||
      deal.twPayload.changePayload ||
      deal.milestoneStatus === "approved" ||
      deal.escrowStatus === "approved" ||
      deal.escrowStatus === "released"
  );
}

function getTrustlessWorkRole(
  deal: Deal,
  role: "serviceProvider" | "approver" | "releaseSigner"
): string | undefined {
  const payload = deal.twPayload.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  const roles = (payload as { roles?: unknown }).roles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return undefined;

  const value = (roles as Record<string, unknown>)[role];
  return typeof value === "string" ? value : undefined;
}

function NextActionCallout({
  deal,
  walletAddress,
}: {
  deal: Deal;
  walletAddress: string;
}) {
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const dealExpired = new Date(deal.expiresAt) < new Date();
  const bothFunded = deal.takerDeposited && deal.makerDeposited;
  const escrowAsset = getTrustlessWorkEscrowAsset(deal);
  const isQuoteMaker = walletAddress === deal.makerAddress;

  if (isSettled || isRefunded) return null;

  let message: string;

  if (deal.escrowStatus === "funded") {
    message = isQuoteMaker
      ? `USDC escrow funded with ${escrowAsset.amount.toLocaleString()} USDC. Waiting for RFQ creator to send ${deal.sellAmount.toLocaleString()} XLM.`
      : `USDC escrow funded with ${escrowAsset.amount.toLocaleString()} USDC. Next: send ${deal.sellAmount.toLocaleString()} XLM to complete the settlement condition.`;
  } else if (deal.escrowStatus === "settlement_sent") {
    if (isXlmSettlementMarkedComplete(deal)) {
      message = isQuoteMaker
        ? `${deal.sellAmount.toLocaleString()} XLM condition marked complete. Next: approve the escrowed USDC release to the RFQ creator.`
        : `${deal.sellAmount.toLocaleString()} XLM condition marked complete. Waiting for quote maker to approve the USDC release.`;
    } else {
      message = isQuoteMaker
        ? `${deal.sellAmount.toLocaleString()} XLM payment recorded. Waiting for RFQ creator to mark the Trustless Work condition complete.`
        : `${deal.sellAmount.toLocaleString()} XLM payment recorded. Next: mark the settlement condition complete through Trustless Work.`;
    }
  } else if (deal.escrowStatus === "funding") {
    message = `Funding the USDC escrow with ${escrowAsset.amount.toLocaleString()} USDC.`;
  } else if (deal.escrowStatus === "initialized") {
    message = `Trustless Work escrow initialized. Next: fund ${escrowAsset.amount.toLocaleString()} USDC.`;
  } else if (deal.escrowStatus === "failed") {
    message = "Trustless Work escrow action failed. Fix the wallet/asset requirement and retry.";
  } else if (dealExpired) {
    message = "Escrow expired — trigger a refund to return deposited funds.";
  } else if (bothFunded) {
    message = "Agreement funded. Continue through the Trustless Work release or dispute flow.";
  } else if (!deal.takerDeposited) {
    message = `Waiting on RFQ creator — must deposit ${deal.sellAmount.toLocaleString()} ${deal.sellAsset} into escrow.`;
  } else {
    message = `Waiting on quote maker — must send ${deal.buyAmount.toLocaleString()} ${deal.buyAsset} to the RFQ creator.`;
  }

  return (
    <div className="rounded-xl border border-[#3f3b3b] bg-[#2a2a2a] px-4 py-3 flex items-start gap-3">
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0 mt-1.5 lp-pulse inline-block" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5 text-white/30">
          Next required action
        </p>
        <p className="text-sm font-medium text-white/70">{message}</p>
      </div>
    </div>
  );
}

function getAssetIssuer(asset: AssetCode): string | undefined {
  if (asset === "USDC") return process.env.NEXT_PUBLIC_USDC_ISSUER_ADDRESS;
  return undefined;
}

export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [initializingEscrow, setInitializingEscrow] = useState(false);
  const [addingUsdcTrustline, setAddingUsdcTrustline] = useState(false);
  const [fundingEscrow, setFundingEscrow] = useState(false);
  const [sendingXlm, setSendingXlm] = useState(false);
  const [releasingEscrow, setReleasingEscrow] = useState(false);
  const [xlmDestination, setXlmDestination] = useState("");
  const [xlmSettlementError, setXlmSettlementError] = useState("");
  const {
    approveAndReleaseAfterXlmSettlement,
    fundInitializedEscrow,
    initializeEscrow,
    markXlmSettlementComplete,
  } =
    useTrustlessWorkEscrow();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const loadedDeal = await getDeal(id);
        if (active) {
          setDeal(loadedDeal);
          if (loadedDeal) {
            setXlmDestination(
              isValidStellarPublicKey(loadedDeal.makerAddress)
                ? loadedDeal.makerAddress
                : ""
            );
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load deal.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [id]);

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
      const signer = walletAddress || (await connectTestnetWallet());
      await initializeEscrow(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not initialize Trustless Work escrow."
      );
    } finally {
      setInitializingEscrow(false);
    }
  }

  async function addEscrowAssetTrustline() {
    if (!deal) return;
    setError("");
    setAddingUsdcTrustline(true);
    try {
      const address = walletAddress || (await connectTestnetWallet());
      const escrowAsset = getTrustlessWorkEscrowAsset(deal);
      const issuer = getAssetIssuer(escrowAsset.asset);
      if (!issuer) {
        throw new Error(
          `${escrowAsset.asset} does not require an issued-asset trustline in this UI.`
        );
      }
      const result = await addAssetTrustline({ address, assetCode: escrowAsset.asset, issuer });
      setError(
        result === "already-exists"
          ? `${escrowAsset.asset} trustline already exists. You can initialize the escrow now.`
          : `${escrowAsset.asset} trustline added. Transaction: ${result}`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add escrow asset trustline."
      );
    } finally {
      setAddingUsdcTrustline(false);
    }
  }

  async function fundTrustlessWorkEscrow() {
    if (!deal) return;
    setError("");
    setFundingEscrow(true);
    try {
      const signer = walletAddress || (await connectTestnetWallet());
      await fundInitializedEscrow(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not fund Trustless Work escrow."
      );
    } finally {
      setFundingEscrow(false);
    }
  }

  async function sendXlmSettlement() {
    if (!deal) return;
    setError("");
    setXlmSettlementError("");
    setSendingXlm(true);
    try {
      const from = walletAddress || (await connectTestnetWallet());
      const to = xlmDestination.trim();
      if (!isValidStellarPublicKey(to)) {
        throw new Error(
          "Enter a valid Stellar testnet destination address for the XLM settlement."
        );
      }
      const txHash = await sendNativePayment({
        from,
        to,
        amount: deal.sellAmount,
        memo: `TRFQ ${deal.id}`,
      });
      const verified = await verifyNativePayment({ txHash, from, to, amount: deal.sellAmount });
      if (!verified) {
        throw new Error(
          "XLM payment was submitted, but Horizon verification did not match the expected amount/destination."
        );
      }
      const nextHashes = { ...deal.transactionHashes, xlmSettlement: txHash };
      const updated = await updateDealEscrow(deal.id, {
        escrowStatus: "settlement_sent",
        milestoneStatus: "pending",
        transactionHashes: nextHashes,
        twPayload: {
          ...deal.twPayload,
          xlmSettlement: {
            amount: deal.sellAmount,
            asset: deal.sellAsset,
            from,
            to,
            txHash,
            verified,
            markedAt: new Date().toISOString(),
            mode: "stellar-payment",
          },
        },
      });
      setDeal(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send XLM settlement.";
      setError(message);
      setXlmSettlementError(message);
    } finally {
      setSendingXlm(false);
    }
  }

  async function markSettlementComplete() {
    if (!deal) return;
    setError("");
    setReleasingEscrow(true);
    try {
      const signer = walletAddress || (await connectTestnetWallet());
      await markXlmSettlementComplete(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark XLM settlement complete."
      );
    } finally {
      setReleasingEscrow(false);
    }
  }

  async function releaseEscrowedUsdc() {
    if (!deal) return;
    setError("");
    setReleasingEscrow(true);
    try {
      const signer = walletAddress || (await connectTestnetWallet());
      await approveAndReleaseAfterXlmSettlement(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not release escrowed USDC."
      );
    } finally {
      setReleasingEscrow(false);
    }
  }

  if (loading) {
    return <p className="text-white/40 text-center pt-20">Loading deal...</p>;
  }

  if (!deal) {
    return (
      <div className="text-center pt-20">
        <p className="text-white/40">Deal not found.</p>
        <Link
          href="/deals"
          className="text-white/60 hover:text-white text-sm mt-2 block transition-colors"
        >
          ← Back to Deals
        </Link>
      </div>
    );
  }

  const rfqCreatorDeposited = deal.takerDeposited;
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const dealExpired = new Date(deal.expiresAt) < new Date();
  const contractId = deal.contractId ?? mockContractId(deal.id);
  const escrowAsset = getTrustlessWorkEscrowAsset(deal);
  const isTrustlessWorkDeal = Boolean(deal.contractId);
  const escrowSideLabel = "Locked by quote maker, released to RFQ creator after XLM is verified";
  const canAddEscrowAssetTrustline = escrowAsset.asset !== "XLM";
  const escrowAlreadyFunded =
    deal.escrowStatus === "funded" ||
    deal.escrowStatus === "settlement_sent" ||
    deal.escrowStatus === "approved" ||
    deal.escrowStatus === "releasing" ||
    deal.escrowStatus === "released";
  const xlmSettlementSent =
    deal.escrowStatus === "settlement_sent" ||
    deal.escrowStatus === "approved" ||
    deal.escrowStatus === "releasing" ||
    deal.escrowStatus === "released";
  const isRfqCreator = walletAddress === deal.takerAddress;
  const isQuoteMaker = walletAddress === deal.makerAddress;
  const xlmConditionMarkedComplete = isXlmSettlementMarkedComplete(deal);
  const serviceProviderAddress =
    getTrustlessWorkRole(deal, "serviceProvider") ?? deal.takerAddress;
  const approverAddress = getTrustlessWorkRole(deal, "approver") ?? deal.makerAddress;
  const releaseSignerAddress =
    getTrustlessWorkRole(deal, "releaseSigner") ?? deal.makerAddress;
  const canMarkSettlementComplete = walletAddress === serviceProviderAddress;
  const canApproveAndRelease =
    walletAddress === approverAddress && walletAddress === releaseSignerAddress;

  // Timeline step statuses
  const t1: StepStatus = "done";
  const t2: StepStatus = isTrustlessWorkDeal
    ? "done"
    : rfqCreatorDeposited
    ? "done"
    : isSettled || isRefunded
    ? "pending"
    : "active";
  const t3: StepStatus = escrowAlreadyFunded
    ? "done"
    : isTrustlessWorkDeal && deal.contractId
    ? "active"
    : rfqCreatorDeposited && !isSettled && !isRefunded
    ? "active"
    : "pending";
  const t4: StepStatus = xlmSettlementSent
    ? "done"
    : escrowAlreadyFunded && !isSettled && !isRefunded
    ? "active"
    : "pending";
  const t5: StepStatus = isSettled || isRefunded ? "done" : "pending";

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <Link href="/deals" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ← Deals
        </Link>
        <div className="flex items-center justify-between mt-3 gap-4">
          <h1 className="text-2xl font-bold text-white">
            Deal{" "}
            <span className="text-white/40 font-mono text-base">{deal.id}</span>
          </h1>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 border ${
              isSettled
                ? "bg-[#373232] text-white/70 border-[#5c5151]"
                : isRefunded
                ? "bg-[#2a2a2a] text-white/40 border-[#373232]"
                : "bg-[#2a2a2a] text-white/50 border-[#373232]"
            }`}
          >
            {isSettled ? "Settled" : isRefunded ? "Refunded" : "Pending deposits"}
          </span>
        </div>
      </div>

      {error && (
        <p className="text-white/80 text-xs bg-[#373232] border border-[#3f3b3b] rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* ── Two-column layout ──────────────────────────────────────────────── */}
      <div className="flex gap-8 items-start">

        {/* ── LEFT: Vertical timeline ────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 pt-1">
          <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-5">
            Escrow timeline
          </p>

          <TimelineStep
            label="Quote accepted"
            sub="Agreement locked from accepted quote"
            status={t1}
          />
          <TimelineStep
            label={isTrustlessWorkDeal ? "USDC escrow initialized" : "Quote maker locks USDC"}
            sub={
              isTrustlessWorkDeal
                ? `Contract ID: ${contractId}`
                : `${deal.buyAmount.toLocaleString()} ${deal.buyAsset}`
            }
            status={t2}
          />
          <TimelineStep
            label="USDC escrow funded"
            sub={`${escrowAsset.amount.toLocaleString()} USDC locked`}
            status={t3}
          />
          <TimelineStep
            label="Settlement condition"
            sub={`${deal.sellAmount.toLocaleString()} XLM sent to quote maker`}
            status={t4}
          />
          <TimelineStep
            label={isSettled ? "Settled" : isRefunded ? "Refunded" : "Settlement / Refund"}
            sub={
              isSettled
                ? "Assets released on-chain"
                : isRefunded
                ? "Deposits returned"
                : "Pending completion"
            }
            status={t5}
            isLast
          />
        </aside>

        {/* ── RIGHT: Content + actions ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Trustless Work escrow panel */}
          <section className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                  Trustless Work escrow
                </p>
                <p className="text-sm text-white/50">
                  {deal.contractId
                    ? "USDC escrow initialized on Trustless Work testnet."
                    : "Initialize a Trustless Work escrow from this accepted XLM/USDC agreement."}
                </p>
              </div>
              <span className="text-[10px] bg-[#373232] text-white/60 border border-[#3f3b3b] px-2 py-1 rounded-full shrink-0">
                {deal.escrowStatus.replaceAll("_", " ")}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
                <p className="text-white/40 mb-1">Wallet</p>
                <p className="text-white/70 font-mono break-all">
                  {walletAddress || "Not connected"}
                </p>
              </div>
              <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
                <p className="text-white/40 mb-1">Contract ID</p>
                <p className="text-white/70 font-mono break-all">
                  {deal.contractId ?? "Not initialized"}
                </p>
              </div>
              <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
                <p className="text-white/40 mb-1">USDC locked in Trustless Work escrow</p>
                <p className="text-white font-semibold">
                  {escrowAsset.amount.toLocaleString()} {escrowAsset.asset}
                </p>
                <p className="text-white/30 mt-0.5">{escrowSideLabel}</p>
              </div>
              <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
                <p className="text-white/40 mb-1">Accepted quote terms</p>
                <p className="text-white/70">
                  {deal.sellAmount.toLocaleString()} {deal.sellAsset} for{" "}
                  {deal.buyAmount.toLocaleString()} {deal.buyAsset}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {!walletAddress && (
                <ActionBtn onClick={connectTestnetWallet}>
                  Connect testnet wallet
                </ActionBtn>
              )}
              {walletAddress && !deal.contractId && canAddEscrowAssetTrustline && (
                <ActionBtn onClick={addEscrowAssetTrustline} variant="warning">
                  {addingUsdcTrustline
                    ? `Adding ${escrowAsset.asset} trustline...`
                    : `Add ${escrowAsset.asset} trustline`}
                </ActionBtn>
              )}
              {!deal.contractId && (
                <ActionBtn onClick={initializeTrustlessWorkEscrow}>
                  {initializingEscrow ? "Initializing..." : "Initialize Trustless Work escrow"}
                </ActionBtn>
              )}
              {deal.contractId && !escrowAlreadyFunded && (
                <ActionBtn onClick={fundTrustlessWorkEscrow} variant="success">
                  {fundingEscrow ? "Funding USDC escrow..." : "Fund USDC escrow"}
                </ActionBtn>
              )}
            </div>
          </section>

          {/* Next action callout */}
          <NextActionCallout deal={deal} walletAddress={walletAddress} />

          {/* XLM settlement condition */}
          {escrowAlreadyFunded && !isSettled && !isRefunded && (
            <section className="bg-[#2a2a2a] border border-[#5c5151] rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                    XLM settlement condition
                  </p>
                  <h2 className="text-xl font-bold text-white">
                    {xlmSettlementSent
                      ? "XLM settlement verified"
                      : isQuoteMaker
                      ? "Waiting for RFQ creator"
                      : `Send ${deal.sellAmount.toLocaleString()} XLM`}
                  </h2>
                  <p className="text-sm text-white/50 mt-1">
                    {xlmSettlementSent
                      ? "TrustRFQ verified the XLM payment on Stellar. The USDC escrow can now move to release."
                      : isQuoteMaker
                      ? "Your USDC is funded in Trustless Work. The RFQ creator must send the XLM leg before release can continue."
                      : "The USDC side is funded in Trustless Work. Send the XLM leg from your wallet; TrustRFQ verifies the payment on Stellar before moving to release."}
                  </p>
                </div>
                <span className="text-[10px] bg-[#373232] text-white/60 border border-[#3f3b3b] px-2 py-1 rounded-full shrink-0">
                  {xlmSettlementSent ? "XLM sent" : "Waiting for XLM"}
                </span>
              </div>

              {!walletAddress ? (
                <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-3 text-sm text-white/50">
                  Connect your wallet so TrustRFQ can determine whether this action belongs to
                  the RFQ creator or quote maker.
                </div>
              ) : isRfqCreator || xlmSettlementSent ? (
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
                    <p className="text-white/40 mb-1">Amount to send</p>
                    <p className="text-white font-semibold">
                      {deal.sellAmount.toLocaleString()} XLM
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
                    <p className="text-white/40 mb-1">Send to counterparty</p>
                    <input
                      value={xlmDestination}
                      onChange={(event) => setXlmDestination(event.target.value)}
                      disabled={xlmSettlementSent || sendingXlm}
                      placeholder="G..."
                      className="w-full bg-transparent text-white/70 font-mono text-xs break-all outline-none placeholder:text-white/20 disabled:text-white/40"
                    />
                    {!xlmDestination && (
                      <p className="text-white/30 mt-1">
                        Connect the quote maker wallet first so TrustRFQ can prefill the XLM
                        destination address.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-3 text-sm text-white/50">
                  You are viewing this deal as the quote maker. The next action belongs to the
                  RFQ creator.
                </div>
              )}

              {xlmSettlementError && (
                <p className="text-xs text-white/80 bg-[#373232] border border-[#5c5151] rounded-lg px-3 py-2">
                  {xlmSettlementError}
                </p>
              )}

              {!walletAddress ? (
                <p className="text-sm text-white/50">
                  Wallet connection required before continuing settlement.
                </p>
              ) : !xlmSettlementSent && isRfqCreator ? (
                <ActionBtn onClick={sendXlmSettlement} variant="success">
                  {sendingXlm ? "Sending XLM..." : "Send XLM"}
                </ActionBtn>
              ) : !xlmSettlementSent && isQuoteMaker ? (
                <p className="text-sm text-white/50">
                  Waiting for RFQ creator to send {deal.sellAmount.toLocaleString()} XLM.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-white/60">
                    {xlmConditionMarkedComplete
                    ? "Trustless Work condition is marked complete. The quote maker can approve the USDC release to the RFQ creator."
                      : "XLM payment verified on Stellar. Mark the Trustless Work settlement condition complete before release."}
                  </p>
                  {deal.escrowStatus !== "released" && !xlmConditionMarkedComplete && canMarkSettlementComplete ? (
                    <ActionBtn onClick={markSettlementComplete} variant="success">
                      {releasingEscrow ? "Marking complete..." : "Mark settlement complete"}
                    </ActionBtn>
                  ) : deal.escrowStatus !== "released" && !xlmConditionMarkedComplete ? (
                    <p className="text-sm text-white/50">
                      Connect the Trustless Work service provider wallet to mark the condition
                      complete: {serviceProviderAddress.slice(0, 10)}...
                      {serviceProviderAddress.slice(-4)}.
                    </p>
                  ) : deal.escrowStatus !== "released" && canApproveAndRelease ? (
                    <ActionBtn onClick={releaseEscrowedUsdc} variant="success">
                      {releasingEscrow ? "Releasing USDC..." : "Approve USDC release"}
                    </ActionBtn>
                  ) : deal.escrowStatus !== "released" ? (
                    <p className="text-sm text-white/50">
                      Connect the Trustless Work release signer wallet to approve and release:
                      {" "}
                      {releaseSignerAddress.slice(0, 10)}...
                      {releaseSignerAddress.slice(-4)}.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          )}

          {/* Deal info grid */}
          <div className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-white/40 text-xs mb-1">RFQ creator</p>
              <p className="text-white font-mono text-xs">
                {deal.takerAddress.slice(0, 10)}...{deal.takerAddress.slice(-4)}
              </p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Quote maker</p>
              <p className="text-white font-mono text-xs">
                {deal.makerAddress.slice(0, 10)}...{deal.makerAddress.slice(-4)}
              </p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">RFQ creator requests to sell</p>
              <p className="text-white font-semibold">
                {deal.sellAmount.toLocaleString()} {deal.sellAsset}
              </p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Quote maker offers</p>
              <p className="text-white font-semibold">
                {deal.buyAmount.toLocaleString()} {deal.buyAsset}
              </p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Contract ID</p>
              <p className="text-white/70 font-mono text-xs font-semibold">{contractId}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Network</p>
              <p className="text-white text-xs">Stellar Testnet</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Escrow expires</p>
              <p className={dealExpired && !isSettled ? "text-white/50" : "text-white"}>
                {fmt(deal.expiresAt)}
                {dealExpired && !isSettled && " (expired)"}
              </p>
            </div>
            {deal.settledAt && (
              <div>
                <p className="text-white/40 text-xs mb-1">Settled at</p>
                <p className="text-white/80">{fmt(deal.settledAt)}</p>
              </div>
            )}
          </div>

          {/* Refund action */}
          {dealExpired && !isSettled && !isRefunded && (
            <div className="flex">
              <ActionBtn onClick={() => setStatus("refunded")} variant="warning">
                Trigger refund (mock)
              </ActionBtn>
            </div>
          )}

          {/* Escrow Viewer CTA */}
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs text-white/30">Trustless Work</span>
            <span className="text-white/60 font-mono text-xs">{contractId}</span>
            <span className="text-white/20">·</span>
            <span className="text-xs text-white/40 hover:text-white/70 cursor-pointer transition-colors font-medium">
              View in Escrow Viewer →
            </span>
          </div>

          {/* Outcome banners */}
          {isSettled && (
            <div className="bg-[#2a2a2a] border border-[#5c5151] rounded-xl p-5 text-center">
              <p className="text-white/80 font-semibold">
                Settlement complete. RFQ creator received {deal.buyAmount.toLocaleString()} USDC
                through Trustless Work escrow, and quote maker received{" "}
                {deal.sellAmount.toLocaleString()} XLM.
              </p>
            </div>
          )}

          {isRefunded && (
            <div className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 text-center">
              <p className="text-white/60 font-semibold">
                Deal expired. All deposited funds have been returned.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
