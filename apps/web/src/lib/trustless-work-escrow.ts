"use client";

import {
  useApproveMilestone,
  useChangeMilestoneStatus,
  useFundEscrow,
  useInitializeEscrow,
  useReleaseFunds,
  useSendTransaction,
} from "@trustless-work/escrow/hooks";
import type {
  ApproveMilestonePayload,
  ChangeMilestoneStatusPayload,
  FundEscrowPayload,
  InitializeSingleReleaseEscrowPayload,
  InitializeSingleReleaseEscrowResponse,
  SingleReleaseReleaseFundsPayload,
  SendTransactionResponse,
} from "@trustless-work/escrow/types";
import type { AssetCode, Deal } from "./mock-data";
import { recordEscrowEvent, updateDealEscrow, updateDealStatus } from "./rfq-repository";
import { signTransaction } from "./wallet";
import { StrKey } from "@stellar/stellar-sdk";

type TrustlessWorkSendResponse = SendTransactionResponse & {
  txHash?: string;
  hash?: string;
  transactionHash?: string;
  contractId?: string;
};

export interface InitializeTrustlessEscrowResult {
  contractId: string;
  engagementId: string;
  txHash?: string;
}

export interface FundTrustlessEscrowResult {
  contractId: string;
  txHash?: string;
}

export interface ReleaseTrustlessEscrowResult {
  contractId: string;
  txHashes: {
    changeMilestone?: string;
    approveMilestone?: string;
    releaseFunds?: string;
  };
}

function extractTxHash(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;

  const value = response as TrustlessWorkSendResponse;
  return value.txHash ?? value.hash ?? value.transactionHash;
}

function extractContractId(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;

  return (response as TrustlessWorkSendResponse).contractId;
}

function getTrustlineAddress(asset: AssetCode): string {
  if (asset !== "USDC") {
    throw new Error("TrustRFQ MVP escrows USDC only.");
  }

  const issuer = process.env.NEXT_PUBLIC_USDC_ISSUER_ADDRESS;
  const envName = "NEXT_PUBLIC_USDC_ISSUER_ADDRESS";

  if (!issuer) {
    throw new Error(`${envName} is required before initializing a ${asset} escrow.`);
  }

  return issuer;
}

function getPlatformAddress(signer: string): string {
  if (!isValidStellarAddress(signer)) {
    throw new Error("Connected wallet must be a valid Stellar testnet address.");
  }
  return signer;
}

function getPlatformFee(): number {
  const fee = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE ?? "0");
  if (Number.isNaN(fee) || fee < 0) {
    throw new Error("NEXT_PUBLIC_PLATFORM_FEE must be a non-negative number.");
  }
  return fee;
}

function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

function roleOrFallback(address: string, fallback: string): string {
  return isValidStellarAddress(address) ? address : fallback;
}

function getStoredRole(deal: Deal, role: "serviceProvider" | "approver" | "releaseSigner"): string | undefined {
  const payload = deal.twPayload.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  const roles = (payload as { roles?: unknown }).roles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return undefined;

  const value = (roles as Record<string, unknown>)[role];
  return typeof value === "string" && isValidStellarAddress(value) ? value : undefined;
}

function assertConnectedRole(signer: string, requiredAddress: string, label: string) {
  if (signer !== requiredAddress) {
    throw new Error(
      `${label} requires wallet ${requiredAddress}. Connected wallet is ${signer}. Switch Freighter to the wallet that initialized/funded this escrow.`
    );
  }
}

function getTrustlessWorkErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Unknown Trustless Work error.";
  }

  const maybeAxiosError = error as {
    message?: string;
    response?: {
      status?: number;
      data?: {
        message?: string;
        details?: Record<string, string[]>;
      };
    };
  };

  const status = maybeAxiosError.response?.status;
  const data = maybeAxiosError.response?.data;
  const details = data?.details
    ? Object.entries(data.details)
        .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
        .join(" ")
    : "";

  return [
    status ? `Trustless Work ${status}.` : "",
    data?.message ?? maybeAxiosError.message ?? "Request failed.",
    details,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getTrustlessWorkEscrowAsset(deal: Deal): { asset: AssetCode; amount: number; side: "rfq_creator" | "quote_maker" } {
  if (deal.sellAsset !== "XLM" || deal.buyAsset !== "USDC") {
    throw new Error("TrustRFQ MVP only supports XLM/USDC agreements with USDC escrow.");
  }

  return { asset: "USDC", amount: deal.buyAmount, side: "quote_maker" };
}

function buildSingleReleaseEscrowPayload(deal: Deal, signer: string): InitializeSingleReleaseEscrowPayload {
  const engagementId = deal.engagementId ?? `trustrfq-${deal.id}-${Date.now()}`;
  const platformAddress = getPlatformAddress(signer);
  const escrowAsset = getTrustlessWorkEscrowAsset(deal);
  const trustlineAddress = getTrustlineAddress(escrowAsset.asset);
  const rfqCreator = roleOrFallback(deal.takerAddress, signer);
  const quoteMaker = roleOrFallback(deal.makerAddress, platformAddress);

  return {
    signer,
    engagementId,
    title: `TrustRFQ ${deal.rfqId}`,
    description: `Accepted XLM/USDC quote ${deal.quoteId}: ${deal.sellAmount} XLM for ${deal.buyAmount} USDC. TrustRFQ sets the agreement; Trustless Work escrows the USDC settlement leg.`,
    amount: escrowAsset.amount,
    platformFee: getPlatformFee(),
    trustline: {
      address: trustlineAddress,
      symbol: escrowAsset.asset,
    },
    roles: {
      approver: quoteMaker,
      serviceProvider: rfqCreator,
      platformAddress,
      releaseSigner: quoteMaker,
      disputeResolver: platformAddress,
      receiver: rfqCreator,
    },
    milestones: [
      {
        description: "XLM settlement for the accepted RFQ quote has been completed.",
      },
    ],
  };
}

export function useTrustlessWorkEscrow() {
  const { deployEscrow } = useInitializeEscrow();
  const { fundEscrow } = useFundEscrow();
  const { changeMilestoneStatus } = useChangeMilestoneStatus();
  const { approveMilestone } = useApproveMilestone();
  const { releaseFunds } = useReleaseFunds();
  const { sendTransaction } = useSendTransaction();

  async function initializeEscrow(deal: Deal, signer: string): Promise<InitializeTrustlessEscrowResult> {
    await updateDealEscrow(deal.id, { escrowStatus: "initializing" });

    const payload = buildSingleReleaseEscrowPayload(deal, signer);
    let deployResult: InitializeSingleReleaseEscrowResponse;

    try {
      deployResult = (await deployEscrow(
        payload,
        "single-release"
      )) as InitializeSingleReleaseEscrowResponse;
    } catch (error) {
      const message = getTrustlessWorkErrorMessage(error);
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { payload, error: message },
      });
      throw new Error(message);
    }

    if (!deployResult.unsignedTransaction) {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { error: "Unsigned transaction missing from deployEscrow response." },
      });
      throw new Error("Unsigned transaction missing from deployEscrow response.");
    }

    const signedXdr = await signTransaction({
      unsignedTransaction: deployResult.unsignedTransaction,
      address: signer,
    });

    const sendResult = await sendTransaction(signedXdr);

    if (sendResult.status !== "SUCCESS") {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { payload, deployResult, sendResult },
      });
      throw new Error(sendResult.message || "Trustless Work transaction failed.");
    }

    const txHash = extractTxHash(sendResult);
    const contractId = deployResult.contractId ?? extractContractId(sendResult);

    if (!contractId) {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { payload, deployResult, sendResult },
      });
      throw new Error("Contract ID missing from Trustless Work response.");
    }

    const nextHashes = {
      ...deal.transactionHashes,
      ...(txHash ? { initialize: txHash } : {}),
    };

    await updateDealEscrow(deal.id, {
      contractId,
      engagementId: payload.engagementId,
      escrowStatus: "initialized",
      milestoneStatus: "pending",
      trustlineAddress: payload.trustline.address,
      transactionHashes: nextHashes,
      twPayload: { payload, deployResult, sendResult },
    });

    await recordEscrowEvent({
      deal_id: deal.id,
      event_type: "escrow_initialized",
      actor_address: signer,
      tx_hash: txHash,
      metadata: {
        contractId,
        engagementId: payload.engagementId,
        asset: payload.trustline.symbol,
        amount: payload.amount,
      },
    });

    return {
      contractId,
      engagementId: payload.engagementId,
      txHash,
    };
  }

  return {
    initializeEscrow,
    fundInitializedEscrow,
    releaseAfterXlmSettlement,
  };

  async function fundInitializedEscrow(deal: Deal, signer: string): Promise<FundTrustlessEscrowResult> {
    if (!deal.contractId) {
      throw new Error("Contract ID is required before funding escrow.");
    }

    await updateDealEscrow(deal.id, { escrowStatus: "funding" });

    const payload: FundEscrowPayload = {
      contractId: deal.contractId,
      amount: getTrustlessWorkEscrowAsset(deal).amount,
      signer,
    };

    let fundResult: SendTransactionResponse & { unsignedTransaction?: string };

    try {
      fundResult = (await fundEscrow(
        payload,
        "single-release"
      )) as SendTransactionResponse & { unsignedTransaction?: string };
    } catch (error) {
      const message = getTrustlessWorkErrorMessage(error);
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { ...deal.twPayload, fundPayload: payload, fundError: message },
      });
      throw new Error(message);
    }

    if (!fundResult.unsignedTransaction) {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: {
          ...deal.twPayload,
          fundPayload: payload,
          fundResult,
          fundError: "Unsigned transaction missing from fundEscrow response.",
        },
      });
      throw new Error("Unsigned transaction missing from fundEscrow response.");
    }

    const signedXdr = await signTransaction({
      unsignedTransaction: fundResult.unsignedTransaction,
      address: signer,
    });

    const sendResult = await sendTransaction(signedXdr);

    if (sendResult.status !== "SUCCESS") {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { ...deal.twPayload, fundPayload: payload, fundResult, fundSendResult: sendResult },
      });
      throw new Error(sendResult.message || "Trustless Work fund transaction failed.");
    }

    const txHash = extractTxHash(sendResult);
    const nextHashes = {
      ...deal.transactionHashes,
      ...(txHash ? { fund: txHash } : {}),
    };

    await updateDealEscrow(deal.id, {
      escrowStatus: "funded",
      transactionHashes: nextHashes,
      twPayload: { ...deal.twPayload, fundPayload: payload, fundResult, fundSendResult: sendResult },
    });

    await recordEscrowEvent({
      deal_id: deal.id,
      event_type: "escrow_funded",
      actor_address: signer,
      tx_hash: txHash,
      metadata: {
        contractId: deal.contractId,
        asset: getTrustlessWorkEscrowAsset(deal).asset,
        amount: payload.amount,
      },
    });

    return {
      contractId: deal.contractId,
      txHash,
    };
  }

  async function signAndSendEscrowRequest({
    unsignedTransaction,
    signer,
    errorPrefix,
  }: {
    unsignedTransaction?: string;
    signer: string;
    errorPrefix: string;
  }): Promise<SendTransactionResponse> {
    if (!unsignedTransaction) {
      throw new Error(`${errorPrefix}: unsigned transaction missing.`);
    }

    const signedXdr = await signTransaction({
      unsignedTransaction,
      address: signer,
    });
    const sendResult = await sendTransaction(signedXdr);

    if (sendResult.status !== "SUCCESS") {
      throw new Error(sendResult.message || `${errorPrefix}: transaction failed.`);
    }

    return sendResult as SendTransactionResponse;
  }

  async function releaseAfterXlmSettlement(deal: Deal, signer: string): Promise<ReleaseTrustlessEscrowResult> {
    if (!deal.contractId) {
      throw new Error("Contract ID is required before releasing escrow.");
    }

    const serviceProvider =
      getStoredRole(deal, "serviceProvider") ?? roleOrFallback(deal.takerAddress, signer);
    const approver =
      getStoredRole(deal, "approver") ?? roleOrFallback(deal.makerAddress, signer);
    const releaseSigner =
      getStoredRole(deal, "releaseSigner") ?? roleOrFallback(deal.makerAddress, signer);

    assertConnectedRole(signer, serviceProvider, "Changing milestone status");
    assertConnectedRole(signer, approver, "Approving the milestone");
    assertConnectedRole(signer, releaseSigner, "Releasing funds");

    await updateDealEscrow(deal.id, { escrowStatus: "releasing" });

    const txHashes: ReleaseTrustlessEscrowResult["txHashes"] = {};

    const changePayload: ChangeMilestoneStatusPayload = {
      contractId: deal.contractId,
      milestoneIndex: "0",
      newStatus: "completed",
      serviceProvider,
    };

    try {
      const changeResult = await changeMilestoneStatus(changePayload, "single-release");
      const changeSendResult = await signAndSendEscrowRequest({
        unsignedTransaction: changeResult.unsignedTransaction,
        signer,
        errorPrefix: "Change milestone status",
      });
      txHashes.changeMilestone = extractTxHash(changeSendResult);
    } catch (error) {
      const message = getTrustlessWorkErrorMessage(error);
      await updateDealEscrow(deal.id, {
        escrowStatus: "settlement_sent",
        twPayload: { ...deal.twPayload, releaseError: message, changePayload },
      });
      throw new Error(message);
    }

    const approvePayload: ApproveMilestonePayload = {
      contractId: deal.contractId,
      milestoneIndex: "0",
      approver,
    };

    try {
      const approveResult = await approveMilestone(approvePayload, "single-release");
      const approveSendResult = await signAndSendEscrowRequest({
        unsignedTransaction: approveResult.unsignedTransaction,
        signer,
        errorPrefix: "Approve milestone",
      });
      txHashes.approveMilestone = extractTxHash(approveSendResult);
    } catch (error) {
      const message = getTrustlessWorkErrorMessage(error);
      await updateDealEscrow(deal.id, {
        escrowStatus: "settlement_sent",
        twPayload: { ...deal.twPayload, releaseError: message, changePayload, approvePayload },
      });
      throw new Error(message);
    }

    const releasePayload: SingleReleaseReleaseFundsPayload = {
      contractId: deal.contractId,
      releaseSigner,
    };

    try {
      const releaseResult = await releaseFunds(releasePayload, "single-release");
      const releaseSendResult = await signAndSendEscrowRequest({
        unsignedTransaction: releaseResult.unsignedTransaction,
        signer,
        errorPrefix: "Release funds",
      });
      txHashes.releaseFunds = extractTxHash(releaseSendResult);
    } catch (error) {
      const message = getTrustlessWorkErrorMessage(error);
      await updateDealEscrow(deal.id, {
        escrowStatus: "settlement_sent",
        twPayload: {
          ...deal.twPayload,
          releaseError: message,
          changePayload,
          approvePayload,
          releasePayload,
        },
      });
      throw new Error(message);
    }

    await updateDealEscrow(deal.id, {
      escrowStatus: "released",
      milestoneStatus: "approved",
      transactionHashes: {
        ...deal.transactionHashes,
        ...(txHashes.changeMilestone ? { changeMilestone: txHashes.changeMilestone } : {}),
        ...(txHashes.approveMilestone ? { approveMilestone: txHashes.approveMilestone } : {}),
        ...(txHashes.releaseFunds ? { releaseFunds: txHashes.releaseFunds } : {}),
      },
      twPayload: {
        ...deal.twPayload,
        changePayload,
        approvePayload,
        releasePayload,
        txHashes,
      },
    });
    await updateDealStatus(deal.id, "settled");

    await recordEscrowEvent({
      deal_id: deal.id,
      event_type: "funds_released",
      actor_address: signer,
      tx_hash: txHashes.releaseFunds,
      metadata: {
        contractId: deal.contractId,
        changeMilestone: txHashes.changeMilestone,
        approveMilestone: txHashes.approveMilestone,
      },
    });

    return {
      contractId: deal.contractId,
      txHashes,
    };
  }
}
