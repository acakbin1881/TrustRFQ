"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { fmt, type AssetCode, type Deal, type DealStatus } from "@/lib/mock-data";
import { getDeal, updateDealDeposit, updateDealEscrow, updateDealStatus } from "@/lib/rfq-repository";
import { getTrustlessWorkEscrowAsset, useTrustlessWorkEscrow } from "@/lib/trustless-work-escrow";
import { useCurrentIdentity } from "@/lib/identity";
import {
  addAssetTrustline,
  connectWallet,
  isValidStellarPublicKey,
  sendNativePayment,
  verifyNativePayment,
} from "@/lib/wallet";

type StepStatus = "done" | "active" | "pending";

function StepDot({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="w-5 h-5 rounded-full bg-[#2a2a2a] border border-[#5c5151] flex items-center justify-center shrink-0 text-white text-[10px] font-bold">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="w-5 h-5 rounded-full bg-[#373232] border border-[#5c5151] flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-white/60 lp-pulse inline-block" />
      </span>
    );
  }
  return <span className="w-5 h-5 rounded-full border border-[#3f3b3b] shrink-0" />;
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
    status === "done" ? "text-white/80" :
    status === "active" ? "text-white" :
    "text-white/40";

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <StepDot status={status} />
        <div className="w-px flex-1 bg-[#373232] mt-1 min-h-[24px]" />
      </div>
      <div className="flex-1 pb-5">
        <p className={`font-medium text-sm ${labelColor}`}>{label}</p>
        {sub && <p className="text-white/40 text-xs mt-0.5 leading-snug">{sub}</p>}
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
    variant === "success" ? "bg-[#5c5151] hover:bg-[#6a5e5e] text-white" :
    variant === "warning" ? "bg-[#3f3b3b] hover:bg-[#5c5151] text-white" :
    "bg-white hover:bg-white/90 text-[#1a1a1a]";
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

function NextActionCallout({
  deal,
  currentAddress,
}: {
  deal: Deal;
  currentAddress: string;
}) {
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const dealExpired = new Date(deal.expiresAt) < new Date();
  const bothFunded = deal.takerDeposited && deal.makerDeposited;
  const escrowAsset = getTrustlessWorkEscrowAsset(deal);
  const isQuoteMaker = currentAddress === deal.makerAddress;

  if (isSettled || isRefunded) return null;

  let message: string;
  let color: string;

  if (deal.escrowStatus === "funded") {
    message = isQuoteMaker
      ? `USDC escrow funded with ${escrowAsset.amount.toLocaleString()} USDC. Next: send ${deal.sellAmount.toLocaleString()} XLM to complete the settlement condition.`
      : `USDC escrow funded with ${escrowAsset.amount.toLocaleString()} USDC. Waiting for quote maker to send ${deal.sellAmount.toLocaleString()} XLM.`;
    color = "border-[#5c5151] bg-[#2a2a2a] text-white/70";
  } else if (deal.escrowStatus === "settlement_sent") {
    message = `${deal.sellAmount.toLocaleString()} XLM settlement marked sent. Next: approve/release the escrowed USDC through Trustless Work.`;
    color = "border-[#5c5151] bg-[#2a2a2a] text-white/70";
  } else if (deal.escrowStatus === "funding") {
    message = `Funding the USDC escrow with ${escrowAsset.amount.toLocaleString()} USDC.`;
    color = "border-[#3f3b3b] bg-[#2a2a2a] text-white/60";
  } else if (deal.escrowStatus === "initialized") {
    message = `Trustless Work escrow initialized. Next: fund ${escrowAsset.amount.toLocaleString()} USDC.`;
    color = "border-[#3f3b3b] bg-[#2a2a2a] text-white/60";
  } else if (deal.escrowStatus === "failed") {
    message = "Trustless Work escrow action failed. Fix the wallet/asset requirement and retry.";
    color = "border-[#5c5151] bg-[#373232] text-white/70";
  } else if (dealExpired) {
    message = "Escrow expired — trigger a refund to return deposited funds.";
    color = "border-[#3f3b3b] bg-[#373232] text-white/60";
  } else if (bothFunded) {
    message = "Agreement funded. Continue through the Trustless Work release or dispute flow.";
    color = "border-[#5c5151] bg-[#2a2a2a] text-white/70";
  } else if (!deal.takerDeposited) {
    message = `Waiting on RFQ creator — must deposit ${deal.sellAmount.toLocaleString()} ${deal.sellAsset} into escrow.`;
    color = "border-[#3f3b3b] bg-[#2a2a2a] text-white/60";
  } else {
    message = `Waiting on quote maker — must deposit ${deal.buyAmount.toLocaleString()} ${deal.buyAsset} into escrow.`;
    color = "border-[#3f3b3b] bg-[#2a2a2a] text-white/60";
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

function getAssetIssuer(asset: AssetCode): string | undefined {
  if (asset === "USDC") return process.env.NEXT_PUBLIC_USDC_ISSUER_ADDRESS;
  return undefined;
}

export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [currentAddress] = useCurrentIdentity();
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
  const { fundInitializedEscrow, initializeEscrow, releaseAfterXlmSettlement } = useTrustlessWorkEscrow();

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
      setXlmDestination((current) => current || address);
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

  async function addEscrowAssetTrustline() {
    if (!deal) return;
    setError("");
    setAddingUsdcTrustline(true);

    try {
      const address = walletAddress || await connectTestnetWallet();
      const escrowAsset = getTrustlessWorkEscrowAsset(deal);
      const issuer = getAssetIssuer(escrowAsset.asset);
      if (!issuer) {
        throw new Error(`${escrowAsset.asset} does not require an issued-asset trustline in this UI.`);
      }

      const result = await addAssetTrustline({
        address,
        assetCode: escrowAsset.asset,
        issuer,
      });

      setError(
        result === "already-exists"
          ? `${escrowAsset.asset} trustline already exists. You can initialize the escrow now.`
          : `${escrowAsset.asset} trustline added. Transaction: ${result}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add escrow asset trustline.");
    } finally {
      setAddingUsdcTrustline(false);
    }
  }

  async function fundTrustlessWorkEscrow() {
    if (!deal) return;
    setError("");
    setFundingEscrow(true);

    try {
      const signer = walletAddress || await connectTestnetWallet();
      await fundInitializedEscrow(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fund Trustless Work escrow.");
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
      const from = walletAddress || await connectTestnetWallet();
      const to = xlmDestination.trim();

      if (!isValidStellarPublicKey(to)) {
        throw new Error("Enter a valid Stellar testnet destination address for the XLM settlement.");
      }

      const txHash = await sendNativePayment({
        from,
        to,
        amount: deal.sellAmount,
        memo: `TRFQ ${deal.id}`,
      });
      const verified = await verifyNativePayment({
        txHash,
        from,
        to,
        amount: deal.sellAmount,
      });

      if (!verified) {
        throw new Error("XLM payment was submitted, but Horizon verification did not match the expected amount/destination.");
      }

      const nextHashes = {
        ...deal.transactionHashes,
        xlmSettlement: txHash,
      };
      const updated = await updateDealEscrow(deal.id, {
        escrowStatus: "settlement_sent",
        milestoneStatus: "pending_approval",
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

  async function releaseEscrowedUsdc() {
    if (!deal) return;
    setError("");
    setReleasingEscrow(true);

    try {
      const signer = walletAddress || await connectTestnetWallet();
      await releaseAfterXlmSettlement(deal, signer);
      const updated = await getDeal(deal.id);
      if (updated) setDeal(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not release escrowed USDC.");
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
        <Link href="/deals" className="text-white/60 hover:text-white text-sm mt-2 block transition-colors">
          ← Back to Deals
        </Link>
      </div>
    );
  }

  const rfqCreatorDeposited = deal.takerDeposited;
  const quoteMakerDeposited = deal.makerDeposited;
  const isSettled = deal.status === "settled";
  const isRefunded = deal.status === "refunded";
  const dealExpired = new Date(deal.expiresAt) < new Date();
  const contractId = deal.contractId ?? mockContractId(deal.id);
  const escrowAsset = getTrustlessWorkEscrowAsset(deal);
  const isTrustlessWorkDeal = Boolean(deal.contractId);
  const escrowSideLabel = "USDC settlement leg";
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
  const isRfqCreator = currentAddress === deal.takerAddress;
  const isQuoteMaker = currentAddress === deal.makerAddress;

  const s1: StepStatus = "done";
  const s2: StepStatus = rfqCreatorDeposited ? "done" : isSettled || isRefunded ? "pending" : "active";
  const s3: StepStatus = quoteMakerDeposited ? "done" : rfqCreatorDeposited && !isSettled && !isRefunded ? "active" : "pending";
  const s5: StepStatus = isSettled || isRefunded ? "done" : "pending";

  return (
    <div className="flex flex-col gap-6">

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

      {/* ── Trustless Work escrow panel ─────────────────────────────────────── */}
      <section className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
              Trustless Work escrow
            </p>
            <p className="text-sm text-white/50">
              {deal.contractId
                ? "USDC settlement escrow initialized on Trustless Work testnet."
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
            <p className="text-white/40 mb-1">Trustless Work escrow locks</p>
            <p className="text-white font-semibold">
              {escrowAsset.amount.toLocaleString()} {escrowAsset.asset}
            </p>
            <p className="text-white/30 mt-0.5">{escrowSideLabel}</p>
          </div>
          <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-2">
            <p className="text-white/40 mb-1">Accepted XLM/USDC agreement</p>
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
              {addingUsdcTrustline ? `Adding ${escrowAsset.asset} trustline...` : `Add ${escrowAsset.asset} trustline`}
            </ActionBtn>
          )}
          {!deal.contractId && (
            <ActionBtn onClick={initializeTrustlessWorkEscrow}>
              {initializingEscrow ? "Initializing..." : "Initialize Trustless Work escrow"}
            </ActionBtn>
          )}
          {deal.contractId && !escrowAlreadyFunded && (
            <ActionBtn onClick={fundTrustlessWorkEscrow} variant="success">
              {fundingEscrow ? "Funding escrow..." : "Fund escrow"}
            </ActionBtn>
          )}
        </div>
      </section>

      <NextActionCallout deal={deal} currentAddress={currentAddress} />

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
                  ? `Send ${deal.sellAmount.toLocaleString()} XLM`
                  : "Waiting for quote maker"}
              </h2>
              <p className="text-sm text-white/50 mt-1">
                {xlmSettlementSent
                  ? "TrustRFQ verified the XLM payment on Stellar. The USDC escrow can now move to release."
                  : isQuoteMaker
                  ? "The USDC side is funded in Trustless Work. Send the XLM leg from your wallet; TrustRFQ verifies the payment on Stellar before moving to release."
                  : "The USDC side is funded in Trustless Work. The quote maker must send the XLM leg before release can continue."}
              </p>
            </div>
            <span className="text-[10px] bg-[#373232] text-white/60 border border-[#3f3b3b] px-2 py-1 rounded-full shrink-0">
              {xlmSettlementSent ? "XLM sent" : "Waiting for XLM"}
            </span>
          </div>

          {(isQuoteMaker || xlmSettlementSent) ? (
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
                    Maker A is a mock identity. Paste the real Stellar testnet address that should receive XLM.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-[#373232] bg-[#1a1a1a]/50 px-3 py-3 text-sm text-white/50">
              You are viewing this deal as the RFQ creator. The next action belongs to the quote maker.
            </div>
          )}

          {xlmSettlementError && (
            <p className="text-xs text-white/80 bg-[#373232] border border-[#5c5151] rounded-lg px-3 py-2">
              {xlmSettlementError}
            </p>
          )}

          {!xlmSettlementSent && isQuoteMaker ? (
            <ActionBtn onClick={sendXlmSettlement} variant="success">
              {sendingXlm ? "Sending XLM..." : "Send XLM"}
            </ActionBtn>
          ) : !xlmSettlementSent && isRfqCreator ? (
            <p className="text-sm text-white/50">
              Waiting for quote maker to send {deal.sellAmount.toLocaleString()} XLM.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-white/60">
                XLM payment verified on Stellar. Release the escrowed USDC through Trustless Work.
              </p>
              {deal.escrowStatus !== "released" && (
                <ActionBtn onClick={releaseEscrowedUsdc} variant="success">
                  {releasingEscrow ? "Releasing USDC..." : "Release escrowed USDC"}
                </ActionBtn>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Deal info grid ──────────────────────────────────────────────────── */}
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
          <p className="text-white/40 text-xs mb-1">RFQ creator sends</p>
          <p className="text-white font-semibold">
            {deal.sellAmount.toLocaleString()} {deal.sellAsset}
          </p>
        </div>
        <div>
          <p className="text-white/40 text-xs mb-1">Quote maker sends</p>
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

      {/* ── Escrow Viewer CTA ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-xs text-white/30">Trustless Work</span>
        <span className="text-white/60 font-mono text-xs">{contractId}</span>
        <span className="text-white/20">·</span>
        <span className="text-xs text-white/40 hover:text-white/70 cursor-pointer transition-colors font-medium">
          View in Escrow Viewer →
        </span>
      </div>

      {/* ── Escrow timeline ─────────────────────────────────────────────────── */}
      <section className="bg-[#2a2a2a] border border-[#373232] rounded-xl p-6">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-6">
          Escrow timeline
        </h2>
        <div>
          <Step
            label="Quote accepted"
            sub="XLM/USDC agreement locked from the accepted quote."
            status={s1}
          />
          <Step
            label={isTrustlessWorkDeal ? "Trustless Work escrow initialized" : "RFQ creator deposits"}
            sub={
              isTrustlessWorkDeal
                ? `${contractId} created on Stellar Testnet`
                : `${deal.sellAmount.toLocaleString()} ${deal.sellAsset} locked in escrow`
            }
            status={isTrustlessWorkDeal ? "done" : s2}
            action={
              isTrustlessWorkDeal ? (
                <span className="text-white/60 text-xs font-medium">Initialized ✓</span>
              ) : !rfqCreatorDeposited && !isSettled && !isRefunded ? (
                <ActionBtn onClick={markRfqCreatorFunded}>
                  Mark RFQ creator funded (mock)
                </ActionBtn>
              ) : rfqCreatorDeposited ? (
                <span className="text-white/60 text-xs font-medium">Funds locked ✓</span>
              ) : null
            }
          />
          <Step
            label={isTrustlessWorkDeal ? "Fund USDC escrow" : "Quote maker funds USDC escrow"}
            sub={
              isTrustlessWorkDeal
                ? `${escrowAsset.amount.toLocaleString()} USDC required for this accepted quote`
                : `${deal.buyAmount.toLocaleString()} USDC locked in escrow`
            }
            status={isTrustlessWorkDeal ? (escrowAlreadyFunded ? "done" : "active") : s3}
            action={
              isTrustlessWorkDeal ? (
                escrowAlreadyFunded ? (
                  <span className="text-white/60 text-xs font-medium">Funded ✓</span>
                ) : (
                  <span className="text-white/50 text-xs font-medium">Use the Fund escrow button above</span>
                )
              ) : !quoteMakerDeposited && !isSettled && !isRefunded ? (
                <ActionBtn onClick={markQuoteMakerFunded}>
                  Mark quote maker funded (mock)
                </ActionBtn>
              ) : quoteMakerDeposited ? (
                <span className="text-white/60 text-xs font-medium">Funds locked ✓</span>
              ) : null
            }
          />
          <Step
            label="Settlement condition"
            sub={`${deal.sellAmount.toLocaleString()} XLM is sent to the counterparty, then Trustless Work can release the escrowed USDC.`}
            status={xlmSettlementSent ? "done" : escrowAlreadyFunded ? "active" : "pending"}
            action={
              escrowAlreadyFunded && !xlmSettlementSent && !isSettled && !isRefunded ? (
                <ActionBtn onClick={sendXlmSettlement} variant="success">
                  {sendingXlm ? "Sending XLM..." : "Send XLM"}
                </ActionBtn>
              ) : xlmSettlementSent && deal.escrowStatus !== "released" ? (
                <ActionBtn onClick={releaseEscrowedUsdc} variant="success">
                  {releasingEscrow ? "Releasing USDC..." : "Release USDC"}
                </ActionBtn>
              ) : xlmSettlementSent ? (
                <span className="text-white/60 text-xs font-medium">USDC released ✓</span>
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
              "Release or dispute according to the Trustless Work escrow flow."
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
        <div className="bg-[#2a2a2a] border border-[#5c5151] rounded-xl p-5 text-center">
          <p className="text-white/80 font-semibold">
            Settlement complete. RFQ creator received {deal.buyAmount.toLocaleString()}{" "}
            USDC through Trustless Work escrow for the accepted XLM/USDC agreement.
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
  );
}
